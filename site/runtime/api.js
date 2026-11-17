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

export class ApiError extends Error {
	constructor( { status, code, message } ) {
		super( message );
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

export function createApi( { fetch, base: initialBase = '/wp-json/' } ) {
	let base = initialBase;
	let nonce = null;
	let unauthorizedCallback = null;
	let unauthorizedFired = false;

	async function request( method, route, { params, body } = {} ) {
		const path = String( route ).replace( /^\/+/, '' );
		const isSession = SESSION_ROUTE.test( normaliseRoute( path ) );
		let url = base + path;
		if ( params && Object.keys( params ).length > 0 ) {
			url += '?' + new URLSearchParams( params ).toString();
		}

		const headers = { Accept: 'application/json' };
		// The session login/probe must go out without a nonce: a stale one makes
		// WordPress answer 403 before the handler runs.
		if ( nonce && ! ( isSession && method !== 'DELETE' ) ) {
			headers[ 'X-WP-Nonce' ] = nonce;
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
		} );

		// A wrong password on login is the caller's business, not a lapsed session.
		if ( response.status === 401 && ! ( isSession && method === 'POST' ) && ! unauthorizedFired ) {
			unauthorizedFired = true;
			unauthorizedCallback?.( error );
		}
		throw error;
	}

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
