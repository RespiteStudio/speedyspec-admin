import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../site/runtime/api.js';

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
	const { fetch } = recorder( respond( 401, { code: 'rest_forbidden', message: 'No', data: { status: 401 } } ) );
	const api = createApi( { fetch } );
	let count = 0;
	api.onUnauthorized( () => { count++; } );
	await assert.rejects( api.get( 'wp-admin/v1/router' ), ( e ) => e instanceof ApiError && e.status === 401 && e.code === 'rest_forbidden' && e.message === 'No' );
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
	const { fetch } = recorder( respond( 403, { code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed', data: { status: 403 } } ), respond( 500, '<html>' ) );
	const api = createApi( { fetch } );
	await assert.rejects( api.get( 'x' ), ( e ) => e.status === 403 && e.code === 'rest_cookie_invalid_nonce' );
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
