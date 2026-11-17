import crypto from 'node:crypto';

/** WordPress's session route: 200 for a valid login cookie, 401 otherwise. */
export const SESSION_PATH = '/wp-json/wp-admin/v1/session';

const hash = ( value ) => crypto.createHash( 'sha256' ).update( value ).digest( 'hex' );

function cookieOf( headers ) {
	const value = headers?.cookie;
	const joined = Array.isArray( value ) ? value.join( '; ' ) : value;
	return typeof joined === 'string' && joined !== '' ? joined : null;
}

/**
 * Asks WordPress whether a request's login cookie is valid.
 *
 * Only the client's Cookie is sent: never its Origin, Referer, Sec-Fetch-*, nonce or Authorization,
 * which would make WordPress judge the check cross-origin or authenticate it some other way.
 * Only positive answers are cached, by a SHA-256 hash of the Cookie header (never the cookie itself),
 * for `ttlMs`; concurrent checks for one cookie share one upstream call.
 *
 * @param {{upstreamRequest: (request: {method: string, path: string, headers: object}) => Promise<{status: number|null}>,
 *          ttlMs?: number, now?: () => number, maxEntries?: number}} options
 *        `upstreamRequest` resolves to the response status (null for a timeout), or rejects on an error.
 */
export function createAuthChecker( { upstreamRequest, ttlMs = 30000, now = Date.now, maxEntries = 5000 } ) {
	const cache = new Map(); // hash -> expiry time, oldest first
	const inflight = new Map(); // hash -> { promise }

	function prune() {
		const t = now();
		for ( const [ key, expires ] of cache ) {
			if ( expires > t ) {
				break;
			}
			cache.delete( key );
		}
		while ( cache.size > maxEntries ) {
			cache.delete( cache.keys().next().value );
		}
	}

	function remember( key ) {
		cache.delete( key );
		cache.set( key, now() + ttlMs );
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
		return Promise.resolve()
			.then( () => upstreamRequest( { method: 'GET', path: SESSION_PATH, headers } ) )
			.then( ( response ) => response?.status === 200, () => false );
	}

	return {
		/**
		 * @param {object} headers Request headers; only `cookie` is read.
		 * @param {object} [forwarded] The X-Forwarded-* headers the proxy sets on upstream requests.
		 * @returns {Promise<boolean>}
		 */
		isAuthenticated( headers, forwarded ) {
			const cookie = cookieOf( headers );
			if ( cookie === null ) {
				return Promise.resolve( false );
			}
			const key = hash( cookie );
			const expires = cache.get( key );
			if ( expires !== undefined ) {
				if ( expires > now() ) {
					return Promise.resolve( true );
				}
				cache.delete( key );
			}
			let flight = inflight.get( key );
			if ( ! flight ) {
				flight = {};
				const mine = flight;
				flight.promise = verify( cookie, forwarded ).then( ( ok ) => {
					// A check that was forgotten while in flight (a sign-out) is answered but never cached.
					if ( inflight.get( key ) === mine ) {
						inflight.delete( key );
						if ( ok ) {
							remember( key );
						}
					}
					return ok;
				} );
				inflight.set( key, flight );
			}
			return flight.promise;
		},

		/** Drops what is known about this request's cookie, including a check in flight. */
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
