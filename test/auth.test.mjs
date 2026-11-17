import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAuthChecker, SESSION_PATH } from '../server/auth.mjs';

const GOOD = 'wordpress_logged_in_abc=admin%7C123%7Ctoken%7Chmac';

/** A stub upstream: records every call and answers with `answer( call )` (a status, a promise of one, or a throw). */
function stub( answer = () => 200 ) {
	const calls = [];
	const upstreamRequest = async ( call ) => {
		calls.push( call );
		const status = await answer( call );
		return { status };
	};
	return { calls, upstreamRequest };
}

function clock( start = 1_000_000 ) {
	let t = start;
	const now = () => t;
	now.advance = ( ms ) => {
		t += ms;
	};
	return now;
}

test( 'no Cookie header is not authenticated and makes no upstream call', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	assert.equal( await auth.isAuthenticated( {} ), false );
	assert.equal( await auth.isAuthenticated( { cookie: '' } ), false );
	assert.equal( await auth.isAuthenticated( undefined ), false );
	assert.equal( calls.length, 0 );
} );

test( '200 is authenticated and cached until the TTL passes', async () => {
	const { calls, upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, ttlMs: 30_000, now } );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( calls.length, 1 );
	assert.equal( calls[ 0 ].method, 'GET' );
	assert.equal( calls[ 0 ].path, SESSION_PATH );
	assert.equal( SESSION_PATH, '/wp-json/wp-admin/v1/session' );
	now.advance( 29_999 );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( calls.length, 1 );
	now.advance( 1 );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( calls.length, 2 );
} );

test( 'the default TTL is 30 seconds', async () => {
	const { calls, upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, now } );
	await auth.isAuthenticated( { cookie: GOOD } );
	now.advance( 29_000 );
	await auth.isAuthenticated( { cookie: GOOD } );
	assert.equal( calls.length, 1 );
	now.advance( 1_000 );
	await auth.isAuthenticated( { cookie: GOOD } );
	assert.equal( calls.length, 2 );
} );

for ( const [ name, answer ] of [
	[ '401', () => 401 ],
	[ '403', () => 403 ],
	[ '500', () => 500 ],
	[ '204', () => 204 ],
	[ 'a timeout (null status)', () => null ],
	[ 'a thrown error', () => {
		throw new Error( 'ECONNREFUSED' );
	} ],
	[ 'a rejected promise', () => Promise.reject( new Error( 'reset' ) ) ],
] ) {
	test( `${ name } is not authenticated and not cached`, async () => {
		const { calls, upstreamRequest } = stub( answer );
		const auth = createAuthChecker( { upstreamRequest } );
		assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), false );
		assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), false );
		assert.equal( calls.length, 2 );
		assert.deepEqual( auth.inspect().cached, [] );
	} );
}

test( 'an upstreamRequest that throws synchronously is not authenticated', async () => {
	const auth = createAuthChecker( { upstreamRequest: () => {
		throw new Error( 'boom' );
	} } );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), false );
} );

test( 'concurrent checks for the same cookie share one upstream call', async () => {
	let release;
	const gate = new Promise( ( r ) => ( release = r ) );
	const { calls, upstreamRequest } = stub( () => gate.then( () => 200 ) );
	const auth = createAuthChecker( { upstreamRequest } );
	const pending = Array.from( { length: 5 }, () => auth.isAuthenticated( { cookie: GOOD } ) );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( calls.length, 1 );
	release();
	assert.deepEqual( await Promise.all( pending ), [ true, true, true, true, true ] );
	assert.equal( calls.length, 1 );
} );

test( 'forget() drops the cached answer', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	await auth.isAuthenticated( { cookie: GOOD } );
	auth.forget( { cookie: GOOD } );
	assert.deepEqual( auth.inspect().cached, [] );
	await auth.isAuthenticated( { cookie: GOOD } );
	assert.equal( calls.length, 2 );
	// Forgetting without a cookie, or an unknown one, is harmless.
	auth.forget( {} );
	auth.forget( { cookie: 'other=1' } );
} );

test( 'a check in flight when the cookie is forgotten is not cached', async () => {
	let release;
	const gate = new Promise( ( r ) => ( release = r ) );
	let first = true;
	const { calls, upstreamRequest } = stub( () => {
		if ( first ) {
			first = false;
			return gate.then( () => 200 );
		}
		return 401;
	} );
	const auth = createAuthChecker( { upstreamRequest } );
	const pending = auth.isAuthenticated( { cookie: GOOD } );
	await new Promise( ( r ) => setImmediate( r ) );
	auth.forget( { cookie: GOOD } );
	// A check that starts after the sign-out does not join the stale one.
	const after = auth.isAuthenticated( { cookie: GOOD } );
	release();
	assert.equal( await pending, true );
	assert.equal( await after, false );
	assert.equal( calls.length, 2 );
	assert.deepEqual( auth.inspect().cached, [] );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), false );
	assert.equal( calls.length, 3 );
} );

test( 'different cookies are checked and cached separately', async () => {
	const { calls, upstreamRequest } = stub( ( call ) => ( call.headers.cookie === GOOD ? 200 : 401 ) );
	const auth = createAuthChecker( { upstreamRequest } );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD + 'x' } ), false );
	assert.equal( await auth.isAuthenticated( { cookie: 'x' + GOOD } ), false );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( calls.length, 3 );
	auth.forget( { cookie: GOOD + 'x' } );
	assert.equal( await auth.isAuthenticated( { cookie: GOOD } ), true );
	assert.equal( calls.length, 3 );
} );

test( 'the verification request carries the Cookie and none of the client headers that make it cross-origin', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	const client = {
		cookie: GOOD,
		origin: 'http://evil.example',
		referer: 'http://evil.example/page',
		'sec-fetch-site': 'cross-site',
		'sec-fetch-mode': 'cors',
		'sec-fetch-dest': 'script',
		'x-wp-nonce': 'abc',
		authorization: 'Basic YTpi',
		host: 'admin.test',
		'x-http-method-override': 'DELETE',
	};
	await auth.isAuthenticated( client, { 'x-forwarded-host': 'admin.test', 'x-forwarded-proto': 'http', 'x-forwarded-for': '127.0.0.1' } );
	const sent = calls[ 0 ].headers;
	assert.equal( sent.cookie, GOOD );
	assert.equal( sent[ 'x-wp-detached-admin' ], '1' );
	assert.equal( sent[ 'x-forwarded-host' ], 'admin.test' );
	for ( const name of [ 'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'x-wp-nonce', 'authorization', 'host', 'x-http-method-override' ] ) {
		assert.equal( sent[ name ], undefined, name );
	}
	assert.equal( calls[ 0 ].path.includes( '_jsonp' ), false );
} );

test( 'proxy-set headers cannot smuggle a cookie, an origin or a nonce', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	await auth.isAuthenticated( { cookie: GOOD }, { cookie: 'other=1', origin: 'http://x', 'x-wp-nonce': 'n', 'x-forwarded-host': 'admin.test' } );
	assert.equal( calls[ 0 ].headers.cookie, GOOD );
	assert.equal( calls[ 0 ].headers.origin, undefined );
	assert.equal( calls[ 0 ].headers[ 'x-wp-nonce' ], undefined );
	assert.equal( calls[ 0 ].headers[ 'x-forwarded-host' ], 'admin.test' );
} );

test( 'only SHA-256 hashes of the cookie are kept, never the cookie itself', async () => {
	let release;
	const gate = new Promise( ( r ) => ( release = r ) );
	const { upstreamRequest } = stub( () => gate.then( () => 200 ) );
	const auth = createAuthChecker( { upstreamRequest } );
	const pending = auth.isAuthenticated( { cookie: GOOD } );
	await new Promise( ( r ) => setImmediate( r ) );
	const hash = crypto.createHash( 'sha256' ).update( GOOD ).digest( 'hex' );
	assert.deepEqual( auth.inspect().inflight, [ hash ] );
	release();
	await pending;
	const { cached, inflight } = auth.inspect();
	assert.deepEqual( cached, [ hash ] );
	assert.deepEqual( inflight, [] );
	assert.ok( ! JSON.stringify( auth.inspect() ).includes( 'token' ) );
} );

test( 'the cache is capped: the oldest entries are evicted', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest, maxEntries: 3 } );
	for ( const n of [ 1, 2, 3, 4 ] ) {
		await auth.isAuthenticated( { cookie: `c=${ n }` } );
	}
	assert.equal( auth.inspect().cached.length, 3 );
	// c=1 was evicted, c=4 is still cached.
	await auth.isAuthenticated( { cookie: 'c=4' } );
	assert.equal( calls.length, 4 );
	await auth.isAuthenticated( { cookie: 'c=1' } );
	assert.equal( calls.length, 5 );
} );

test( 'the default cap is 5000 entries', async () => {
	const { upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	for ( let n = 0; n < 5002; n++ ) {
		await auth.isAuthenticated( { cookie: `c=${ n }` } );
	}
	assert.equal( auth.inspect().cached.length, 5000 );
} );

test( 'expired entries are pruned when new ones are added', async () => {
	const { upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, ttlMs: 100, now } );
	await auth.isAuthenticated( { cookie: 'c=1' } );
	await auth.isAuthenticated( { cookie: 'c=2' } );
	now.advance( 150 );
	await auth.isAuthenticated( { cookie: 'c=3' } );
	assert.equal( auth.inspect().cached.length, 1 );
} );

test( 'an array of Cookie values (duplicate headers) is checked as the joined value WordPress would see', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	await auth.isAuthenticated( { cookie: [ 'a=1', 'b=2' ] } );
	assert.equal( calls[ 0 ].headers.cookie, 'a=1; b=2' );
} );
