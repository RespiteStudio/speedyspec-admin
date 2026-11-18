/**
 * REST client for the WordPress endpoints, via the same-origin proxy.
 * No document/window access; `fetch` is injected.
 */

const SESSION_ROUTE = /^wp-admin\/v1\/session\/?$/;

/** Route without query/hash and dot segments, lower-cased, for comparisons. */
function normaliseRoute( route ) {
	let path = String( route ).split( /[?#]/ )[ 0 ];
	try {
		path = decodeURIComponent( path );
	} catch {
		// Keep the raw path.
	}
	const out = [];
	for ( const segment of path.split( '/' ) ) {
		if ( segment === '..' ) {
			out.pop();
		} else if ( segment !== '' && segment !== '.' ) {
			out.push( segment );
		}
	}
	return out.join( '/' ).toLowerCase();
}
const UNREACHABLE = 'admin_upstream_unreachable';

/**
 * A failed request: `status` (0 when WordPress could not be reached), `code` and `message`
 * of the WordPress error, and its `data` (e.g. `params` of `rest_invalid_param`), or null.
 */
export class ApiError extends Error {
	constructor( { status, code, message, data = null } ) {
		super( message );
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.data = data;
	}
}

export function createApi( { fetch, base: initialBase = '/wp-json/' } ) {
	let base = initialBase;
	let nonce = null;
	let unauthorizedCallback = null;
	let unauthorizedFired = false;
	let probing = null; // The session probe in flight, shared by concurrent callers.

	function fireUnauthorized( error ) {
		if ( ! unauthorizedFired ) {
			unauthorizedFired = true;
			unauthorizedCallback?.( error );
		}
	}

	/**
	 * GET session on the root site, without a nonce: resolves the session (adopting its nonce)
	 * or rejects; a 401 has already been reported as an ended session by then.
	 */
	function probeSession() {
		if ( ! probing ) {
			probing = send( 'GET', 'wp-admin/v1/session', { base: initialBase } ).then( ( session ) => {
				if ( typeof session?.nonce === 'string' && session.nonce !== '' ) {
					nonce = session.nonce;
				}
				return session;
			} ).finally( () => {
				probing = null;
			} );
		}
		return probing;
	}

	async function send( method, route, { params, body, base: requestBase = base, retried = false } = {} ) {
		const path = String( route ).replace( /^\/+/, '' );
		const isSession = SESSION_ROUTE.test( normaliseRoute( path ) );
		let url = requestBase + path;
		if ( params && Object.keys( params ).length > 0 ) {
			url += '?' + new URLSearchParams( params ).toString();
		}

		const headers = { Accept: 'application/json' };
		// The session login/probe must go out without a nonce: a stale one makes
		// WordPress answer 403 before the handler runs.
		const sentNonce = nonce && ! ( isSession && method !== 'DELETE' ) ? nonce : null;
		if ( sentNonce ) {
			headers[ 'X-WP-Nonce' ] = sentNonce;
		}
		const init = { method, credentials: 'same-origin', headers };
		if ( body !== undefined ) {
			headers[ 'Content-Type' ] = 'application/json';
			init.body = JSON.stringify( body );
		}

		let response;
		try {
			response = await fetch( url, init );
		} catch {
			throw new ApiError( { status: 0, code: UNREACHABLE, message: UNREACHABLE } );
		}

		// WordPress sends a renewed nonce when the one used is in its second half-life.
		const renewed = response.headers?.get?.( 'X-WP-Nonce' );
		if ( typeof renewed === 'string' && renewed !== '' && nonce !== null && nonce === sentNonce ) {
			nonce = renewed;
		}

		const text = await response.text();
		let data = null;
		let invalid = false;
		if ( text !== '' ) {
			try {
				data = JSON.parse( text );
			} catch {
				invalid = true;
			}
		}

		if ( response.ok ) {
			if ( invalid && response.status !== 204 ) {
				throw new ApiError( { status: response.status, code: 'admin_invalid_response', message: 'admin_invalid_response' } );
			}
			return data;
		}

		let code = typeof data?.code === 'string' ? data.code : 'http_' + response.status;
		if ( response.status === 502 || response.status === 504 ) {
			code = typeof data?.code === 'string' ? data.code : UNREACHABLE;
		}
		const error = new ApiError( {
			status: response.status,
			code,
			message: typeof data?.message === 'string' ? data.message : code,
			data: data?.data && typeof data.data === 'object' ? data.data : null,
		} );

		// A stale nonce (a tab left open, or a new sign-in elsewhere): fetch a fresh one and retry once.
		if ( response.status === 403 && code === 'rest_cookie_invalid_nonce' && sentNonce && ! retried ) {
			try {
				await probeSession();
			} catch ( probeError ) {
				throw probeError?.status === 401 ? probeError : error;
			}
			return send( method, route, { params, body, base: requestBase, retried: true } );
		}

		// A wrong password on login is the caller's business, not a lapsed session.
		if ( response.status === 401 && ! ( isSession && method === 'POST' ) && ! unauthorizedFired ) {
			if ( isSession || code === 'rest_not_logged_in' ) {
				fireUnauthorized( error );
			} else {
				// Another route's own 401 (a plugin's, say) ends the session only if WordPress confirms it.
				try {
					await probeSession();
				} catch {
					// A 401 from the probe has reported the ended session; anything else changes nothing.
				}
			}
		}
		throw error;
	}

	const request = ( method, route, options ) => send( method, route, options );

	return {
		get: ( route, params ) => request( 'GET', route, { params } ),
		post: ( route, body ) => request( 'POST', route, { body: body ?? {} } ),
		del: ( route ) => request( 'DELETE', route ),
		setNonce( value ) {
			nonce = value || null;
			unauthorizedFired = false;
		},
		setBase( value ) {
			base = value || initialBase;
		},
		onUnauthorized( callback ) {
			unauthorizedCallback = callback;
		},
	};
}
