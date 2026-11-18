import crypto from 'node:crypto';

/** WordPress's session route: 200 and the session for a valid login cookie, 401 otherwise. */
export const SESSION_PATH = '/wp-json/wp-admin/v1/session';

/** Anything larger than this is not a session answer. */
export const SESSION_MAX_BYTES = 256 * 1024;

/** More page components than this in one answer is not trusted: the set is left empty. */
export const COMPONENTS_MAX = 2000;

/** Longest component id kept. */
export const COMPONENT_ID_MAX_LENGTH = 128;

/**
 * A contract id as the admin site names its files: lowercase segments of letters, digits and
 * hyphens (not starting with a hyphen), at least two, joined by `/`. Anything else can never
 * name a page file, so it is dropped.
 */
export const COMPONENT_ID = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/;

const hash = ( value ) => crypto.createHash( 'sha256' ).update( value ).digest( 'hex' );

const denied = () => ( { authenticated: false, components: new Set() } );

function cookieOf( headers ) {
	const value = headers?.cookie;
	const joined = Array.isArray( value ) ? value.join( '; ' ) : value;
	return typeof joined === 'string' && joined !== '' ? joined : null;
}

const isObject = ( value ) => value !== null && typeof value === 'object' && ! Array.isArray( value );

/** The page components of a session answer: every valid id, or none when the list itself is not valid. */
function componentsOf( list ) {
	if ( ! Array.isArray( list ) || list.length > COMPONENTS_MAX || ! list.every( ( id ) => typeof id === 'string' ) ) {
		return new Set();
	}
	return new Set( list.filter( ( id ) => id.length <= COMPONENT_ID_MAX_LENGTH && COMPONENT_ID.test( id ) ) );
}

/**
 * Reads WordPress's answer. Authenticated only for a 200 whose body is a JSON object naming the
 * user by a positive integer id; anything else fails closed. A valid user whose `components` is
 * not a list of strings is authenticated with no page components (page files fail closed).
 */
function readAnswer( response ) {
	if ( response?.status !== 200 ) {
		return denied();
	}
	const raw = response.body;
	if ( typeof raw !== 'string' && ! Buffer.isBuffer( raw ) ) {
		return denied();
	}
	if ( ( typeof raw === 'string' ? Buffer.byteLength( raw ) : raw.length ) > SESSION_MAX_BYTES ) {
		return denied();
	}
	let session;
	try {
		session = JSON.parse( raw.toString() );
	} catch {
		return denied();
	}
	const id = isObject( session ) && isObject( session.user ) ? session.user.id : undefined;
	if ( ! Number.isInteger( id ) || id <= 0 ) {
		return denied();
	}
	return { authenticated: true, components: componentsOf( session.components ) };
}

/**
 * Asks WordPress whether a request's login cookie is valid, and which page components that
 * user may load.
 *
 * Only the client's Cookie is sent: never its Origin, Referer, Sec-Fetch-*, nonce or Authorization,
 * which would make WordPress judge the check cross-origin or authenticate it some other way.
 * Only positive answers are cached, with their component set, by a SHA-256 hash of the whole
 * Cookie header (never the cookie itself), for `ttlMs`; concurrent checks for one cookie share
 * one upstream call. A check that has not been answered within `timeoutMs` in total fails closed
 * and its request is aborted.
 *
 * @param {{upstreamRequest: (request: {method: string, path: string, headers: object, signal: AbortSignal}) => Promise<{status: number|null, body?: string|Buffer}>,
 *          ttlMs?: number, now?: () => number, maxEntries?: number, timeoutMs?: number,
 *          setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void}} options
 *        `upstreamRequest` resolves to the response status (null for a failure) and body, or rejects on an error.
 */
export function createAuthChecker( {
	upstreamRequest,
	ttlMs = 30000,
	now = Date.now,
	maxEntries = 5000,
	timeoutMs = 5000,
	setTimer = ( fn, ms ) => {
		const timer = setTimeout( fn, ms );
		timer.unref?.();
		return timer;
	},
	clearTimer = ( id ) => clearTimeout( id ),
} ) {
	const cache = new Map(); // hash -> { expires, result }, oldest first
	const inflight = new Map(); // hash -> { promise }

	function prune() {
		const t = now();
		for ( const [ key, entry ] of cache ) {
			if ( entry.expires > t ) {
				break;
			}
			cache.delete( key );
		}
		while ( cache.size > maxEntries ) {
			cache.delete( cache.keys().next().value );
		}
	}

	function remember( key, result ) {
		cache.delete( key );
		cache.set( key, { expires: now() + ttlMs, result } );
		prune();
	}

	function verify( cookie, forwarded ) {
		// Proxy-set headers first, so none of them can replace the cookie or add a credential.
		const headers = {};
		for ( const [ name, value ] of Object.entries( forwarded ?? {} ) ) {
			if ( name.toLowerCase().startsWith( 'x-forwarded-' ) ) {
				headers[ name.toLowerCase() ] = value;
			}
		}
		headers.accept = 'application/json';
		headers[ 'x-wp-detached-admin' ] = '1';
		headers.cookie = cookie;
		const controller = new AbortController();
		return new Promise( ( resolve ) => {
			const timer = setTimer( () => {
				controller.abort();
				resolve( denied() );
			}, timeoutMs );
			Promise.resolve()
				.then( () => upstreamRequest( { method: 'GET', path: SESSION_PATH, headers, signal: controller.signal } ) )
				.then( readAnswer, denied )
				.then( ( result ) => {
					clearTimer( timer );
					resolve( controller.signal.aborted ? denied() : result );
				} );
		} );
	}

	return {
		/**
		 * @param {object} headers Request headers; only `cookie` is read.
		 * @param {object} [forwarded] The X-Forwarded-* headers the proxy sets on upstream requests.
		 * @returns {Promise<{authenticated: boolean, components: ReadonlySet<string>}>}
		 */
		check( headers, forwarded ) {
			const cookie = cookieOf( headers );
			if ( cookie === null ) {
				return Promise.resolve( denied() );
			}
			const key = hash( cookie );
			const entry = cache.get( key );
			if ( entry !== undefined ) {
				if ( entry.expires > now() ) {
					return Promise.resolve( entry.result );
				}
				cache.delete( key );
			}
			let flight = inflight.get( key );
			if ( ! flight ) {
				flight = {};
				const mine = flight;
				flight.promise = verify( cookie, forwarded ).then( ( result ) => {
					// A check that was forgotten while in flight (a sign-out, a role change) is answered but never cached.
					if ( inflight.get( key ) === mine ) {
						inflight.delete( key );
						if ( result.authenticated ) {
							remember( key, result );
						}
					}
					return result;
				} );
				inflight.set( key, flight );
			}
			return flight.promise;
		},

		/** Drops what is known about this request's cookie (flag and components), including a check in flight. */
		forget( headers ) {
			const cookie = cookieOf( headers );
			if ( cookie !== null ) {
				const key = hash( cookie );
				cache.delete( key );
				inflight.delete( key );
			}
		},

		/** The stored keys, for tests: hashes only. */
		inspect() {
			return { cached: [ ...cache.keys() ], inflight: [ ...inflight.keys() ] };
		},
	};
}
