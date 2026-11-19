import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError, ABORTED } from '../site/runtime/api.js';

function respond( status, body, headers = {} ) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: ( k ) => headers[ k.toLowerCase() ] ?? null },
		text: async () => ( body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify( body ) ),
	};
}

function recorder( ...responses ) {
	const calls = [];
	const fetch = async ( url, init ) => {
		calls.push( { url, init } );
		const next = responses.length > 1 ? responses.shift() : responses[ 0 ];
		if ( next instanceof Error ) {
			throw next;
		}
		return next;
	};
	return { fetch, calls };
}

test( 'GET sends nonce, same-origin credentials and encoded params', async () => {
	const { fetch, calls } = recorder( respond( 200, { ok: true } ) );
	const api = createApi( { fetch } );
	api.setNonce( 'abc' );
	const body = await api.get( 'wp-admin/v1/router', { page: 'a b', n: 2 } );
	assert.deepEqual( body, { ok: true } );
	assert.equal( calls[ 0 ].url, '/wp-json/wp-admin/v1/router?page=a+b&n=2' );
	assert.equal( calls[ 0 ].init.method, 'GET' );
	assert.equal( calls[ 0 ].init.credentials, 'same-origin' );
	assert.equal( calls[ 0 ].init.headers[ 'X-WP-Nonce' ], 'abc' );
} );

test( 'POST sends a JSON body and del returns null for 204', async () => {
	const { fetch, calls } = recorder( respond( 200, { id: 1 } ), respond( 204 ) );
	const api = createApi( { fetch } );
	api.setNonce( 'n1' );
	assert.deepEqual( await api.post( 'wp-admin/v1/thing', { a: 1 } ), { id: 1 } );
	assert.equal( calls[ 0 ].init.body, '{"a":1}' );
	assert.equal( calls[ 0 ].init.headers[ 'Content-Type' ], 'application/json' );
	assert.equal( await api.del( 'wp-admin/v1/session' ), null );
	assert.equal( calls[ 1 ].init.method, 'DELETE' );
	assert.equal( calls[ 1 ].init.headers[ 'X-WP-Nonce' ], 'n1' );
} );

test( 'POST session is sent without a nonce header even after setNonce', async () => {
	const { fetch, calls } = recorder( respond( 200, { user: {}, nonce: 'x' } ) );
	const api = createApi( { fetch } );
	api.setNonce( 'stale' );
	await api.post( 'wp-admin/v1/session', { username: 'u', password: 'p', remember: false } );
	assert.equal( 'X-WP-Nonce' in calls[ 0 ].init.headers, false );
} );

test( '401 triggers onUnauthorized once', async () => {
	const { fetch } = recorder( respond( 401, { code: 'rest_not_logged_in', message: 'No', data: { status: 401 } } ) );
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	await assert.rejects( api.get( 'wp-admin/v1/router' ), ( e ) => e instanceof ApiError && e.status === 401 && e.code === 'rest_not_logged_in' && e.message === 'No' );
	await assert.rejects( api.get( 'wp-admin/v1/router' ) );
	assert.equal( count, 1 );
	api.setNonce( 'fresh' );
	await assert.rejects( api.get( 'wp-admin/v1/router' ) );
	assert.equal( count, 2 );
} );

test( 'a failed login (401 on POST session) does not call onUnauthorized', async () => {
	const { fetch } = recorder( respond( 401, { code: 'invalid_login', message: 'Wrong password.' } ) );
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	await assert.rejects( api.post( 'wp-admin/v1/session', {} ), ( e ) => e.code === 'invalid_login' && e.message === 'Wrong password.' );
	assert.equal( count, 0 );
} );

test( 'network failure maps to admin_upstream_unreachable', async () => {
	const { fetch } = recorder( new TypeError( 'fetch failed' ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e instanceof ApiError && e.code === 'admin_upstream_unreachable' && e.status === 0 );
} );

test( '502 and 504 map to unreachable, keeping the proxy code', async () => {
	const { fetch } = recorder(
		respond( 502, { code: 'admin_upstream_unreachable' } ),
		respond( 504, { code: 'admin_upstream_timeout' } ),
		respond( 502, 'Bad Gateway' )
	);
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 502 && e.code === 'admin_upstream_unreachable' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 504 && e.code === 'admin_upstream_timeout' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 502 && e.code === 'admin_upstream_unreachable' );
} );

test( 'other errors carry WordPress code and message; non-JSON bodies still reject', async () => {
	const { fetch } = recorder( respond( 403, { code: 'rest_forbidden', message: 'Sorry', data: { status: 403 } } ), respond( 500, '<html>' ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 403 && e.code === 'rest_forbidden' && e.message === 'Sorry' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 500 && typeof e.code === 'string' );
} );

test( 'session routes are recognised after normalising query, dot segments and case', async () => {
	const { fetch, calls } = recorder( respond( 200, {} ) );
	const api = createApi( { fetch } );
	api.setNonce( 'stale' );
	for ( const route of [ 'wp-admin/v1/session?x=1', 'wp-admin/v1/./session', 'wp-admin/v1/foo/../session', 'WP-Admin/v1/Session/', '/wp-admin/v1/session#h' ] ) {
		await api.post( route, {} );
	}
	assert.equal( calls.length, 5 );
	for ( const call of calls ) {
		assert.equal( 'X-WP-Nonce' in call.init.headers, false, call.url );
	}
	await api.post( 'wp-admin/v1/sessions', {} );
	assert.equal( calls[ 5 ].init.headers[ 'X-WP-Nonce' ], 'stale' );
} );

test( 'a 2xx response with a non-JSON body throws admin_invalid_response, except 204 and empty bodies', async () => {
	const { fetch } = recorder( respond( 200, '<html>oops' ), respond( 204, 'ignored' ), respond( 200 ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e instanceof ApiError && e.code === 'admin_invalid_response' && e.status === 200 );
	assert.equal( await api.get( 'x' ), null );
	assert.equal( await api.get( 'x' ), null );
} );

test( 'an error carries the data of the WordPress error, e.g. the invalid parameters', async () => {
	const { fetch } = recorder( respond( 400, { code: 'rest_invalid_param', message: 'Invalid parameter(s): start_of_week', data: { status: 400, params: { start_of_week: 'Too big.' } } } ), respond( 403, { code: 'rest_forbidden', message: 'No.' } ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.post( 'wp-admin/v1/settings/general', {} ), ( error ) => {
		assert.ok( error instanceof ApiError );
		assert.deepEqual( error.data, { status: 400, params: { start_of_week: 'Too big.' } } );
		return true;
	} );
	await assert.rejects( api.get( 'x' ), ( error ) => error.data === null );
} );

test( 'a stale nonce (403 rest_cookie_invalid_nonce) is refreshed through GET session and the request retried once', async () => {
	const { fetch, calls } = recorder(
		respond( 403, { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } } ),
		respond( 200, { user: { id: 1 }, nonce: 'fresh' } ),
		respond( 200, { saved: true } )
	);
	const api = createApi( { fetch } );
	api.setBase( '/sites/3/wp-json/' );
	api.setNonce( 'stale' );
	assert.deepEqual( await api.post( 'wp-admin/v1/settings/general', { a: 1 } ), { saved: true } );
	assert.equal( calls.length, 3 );
	assert.equal( calls[ 1 ].url, '/wp-json/wp-admin/v1/session' );
	assert.equal( calls[ 1 ].init.method, 'GET' );
	assert.equal( 'X-WP-Nonce' in calls[ 1 ].init.headers, false );
	assert.equal( calls[ 2 ].url, '/sites/3/wp-json/wp-admin/v1/settings/general' );
	assert.equal( calls[ 2 ].init.headers[ 'X-WP-Nonce' ], 'fresh' );
	assert.equal( calls[ 2 ].init.body, '{"a":1}' );
	// Later requests use the refreshed nonce.
	await api.get( 'x' );
	assert.equal( calls[ 3 ].init.headers[ 'X-WP-Nonce' ], 'fresh' );
} );

test( 'a stale nonce is retried only once; a second refusal is thrown as it is', async () => {
	const stale = respond( 403, { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } } );
	const { fetch, calls } = recorder( stale, respond( 200, { user: { id: 1 }, nonce: 'fresh' } ), stale );
	const api = createApi( { fetch } );
	api.setNonce( 'stale' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 403 && e.code === 'rest_cookie_invalid_nonce' );
	assert.equal( calls.length, 3 );
} );

test( 'a stale nonce whose session probe answers 401 is an ended session', async () => {
	const { fetch, calls } = recorder(
		respond( 403, { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed' } ),
		respond( 401, { code: 'rest_not_logged_in', message: 'Signed out' } )
	);
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	api.setNonce( 'stale' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 401 );
	assert.equal( count, 1 );
	assert.equal( calls.length, 2 );
} );

test( 'concurrent stale-nonce refusals share one session probe', async () => {
	const stale = () => respond( 403, { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed' } );
	const calls = [];
	const fetch = async ( url, init ) => {
		calls.push( { url, init } );
		if ( url.endsWith( 'session' ) ) {
			return respond( 200, { user: { id: 1 }, nonce: 'fresh' } );
		}
		return init.headers[ 'X-WP-Nonce' ] === 'fresh' ? respond( 200, { ok: url } ) : stale();
	};
	const api = createApi( { fetch } );
	api.setNonce( 'stale' );
	const [ a, b ] = await Promise.all( [ api.get( 'a' ), api.get( 'b' ) ] );
	assert.deepEqual( [ a, b ], [ { ok: '/wp-json/a' }, { ok: '/wp-json/b' } ] );
	assert.equal( calls.filter( ( c ) => c.url.endsWith( 'session' ) ).length, 1 );
} );

test( 'a refreshed X-WP-Nonce response header is adopted for later requests', async () => {
	const { fetch, calls } = recorder( respond( 200, { ok: 1 }, { 'x-wp-nonce': 'renewed' } ), respond( 200, {} ) );
	const api = createApi( { fetch } );
	api.setNonce( 'old' );
	await api.get( 'x' );
	await api.get( 'y' );
	assert.equal( calls[ 1 ].init.headers[ 'X-WP-Nonce' ], 'renewed' );
} );

test( 'an X-WP-Nonce header on a response is not adopted after sign-out cleared the nonce', async () => {
	const { fetch, calls } = recorder( respond( 200, {}, { 'x-wp-nonce': 'late' } ), respond( 200, {} ) );
	const api = createApi( { fetch } );
	await api.get( 'x' );
	await api.get( 'y' );
	assert.equal( 'X-WP-Nonce' in calls[ 1 ].init.headers, false );
} );

test( 'a 401 with another code ends the session only when a session probe confirms it', async () => {
	let signedIn = true;
	const calls = [];
	const fetch = async ( url, init ) => {
		calls.push( { url, init } );
		if ( url.endsWith( 'wp-admin/v1/session' ) ) {
			return signedIn ? respond( 200, { user: { id: 1 }, nonce: 'n' } ) : respond( 401, { code: 'rest_not_logged_in', message: 'Out' } );
		}
		return respond( 401, { code: 'my_plugin_needs_token', message: 'Token required' } );
	};
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	api.setNonce( 'n' );
	await assert.rejects( api.get( 'my-plugin/v1/thing' ), ( e ) => e.status === 401 && e.code === 'my_plugin_needs_token' );
	assert.equal( count, 0 );
	assert.equal( calls[ 1 ].url, '/wp-json/wp-admin/v1/session' );
	signedIn = false;
	await assert.rejects( api.get( 'my-plugin/v1/thing' ), ( e ) => e.code === 'my_plugin_needs_token' );
	assert.equal( count, 1 );
} );

test( 'a 401 rest_not_logged_in ends the session without a probe', async () => {
	const { fetch, calls } = recorder( respond( 401, { code: 'rest_not_logged_in', message: 'Out' } ) );
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	await assert.rejects( api.get( 'wp-admin/v1/router' ) );
	assert.equal( count, 1 );
	assert.equal( calls.length, 1 );
} );

test( 'an error that is not a WordPress error carries no message, never its code, for the caller to word', async () => {
	const { fetch } = recorder( respond( 500, '<html>Fatal error</html>' ), respond( 200, '<html>' ), respond( 404, { code: 'rest_no_route' } ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e.code === 'http_500' && e.message === '' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.code === 'admin_invalid_response' && e.message === '' );
	await assert.rejects( api.get( 'x' ), ( e ) => e.code === 'rest_no_route' && e.message === '' );
} );

// A fetch that answers only when its signal aborts, as the browser's does for a hung request.
function hanging() {
	const calls = [];
	const fetch = ( url, init ) => new Promise( ( resolve, reject ) => {
		calls.push( { url, init } );
		init.signal?.addEventListener( 'abort', () => reject( new DOMException( 'Aborted', 'AbortError' ) ) );
	} );
	return { fetch, calls };
}

test( 'GET gives up after its timeout: a hung request rejects as aborted', async () => {
	const { fetch, calls } = hanging();
	const api = createApi( { fetch } );
	const started = Date.now();
	await assert.rejects( api.get( 'wp-admin/v1/notices', { path: 'index.php' }, { timeout: 20 } ), ( error ) => error instanceof ApiError && error.status === 0 && error.code === ABORTED );
	assert.ok( Date.now() - started < 1000 );
	assert.ok( calls[ 0 ].init.signal, 'fetch is given a signal' );
} );

test( 'GET is aborted by its signal; without timeout or signal, fetch gets none', async () => {
	const { fetch, calls } = hanging();
	const api = createApi( { fetch } );
	const controller = new AbortController();
	const pending = api.get( 'wp-admin/v1/notices', {}, { signal: controller.signal } );
	controller.abort();
	await assert.rejects( pending, ( error ) => error.code === ABORTED );

	const plain = recorder( respond( 200, { ok: true } ) );
	await createApi( { fetch: plain.fetch } ).get( 'wp-admin/v1/router' );
	assert.equal( 'signal' in plain.calls[ 0 ].init, false );
	assert.equal( calls.length, 1 );
} );

test( 'an unreachable WordPress is not reported as aborted', async () => {
	const { fetch } = recorder( new TypeError( 'Failed to fetch' ) );
	await assert.rejects( createApi( { fetch } ).get( 'wp-admin/v1/notices', {}, { timeout: 1000 } ), ( error ) => error.code === 'admin_upstream_unreachable' );
} );
