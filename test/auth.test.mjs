import { test } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAuthChecker, SESSION_PATH, SESSION_MAX_BYTES, COMPONENTS_MAX, COMPONENT_ID_MAX_LENGTH, COMPONENT_ID } from '../server/auth.mjs';

const GOOD = 'wordpress_logged_in_abc=admin%7C123%7Ctoken%7Chmac';

const SESSION = { user: { id: 1, name: 'Admin', avatar: '' }, nonce: 'n', components: [ 'core/options-general' ] };
const body = ( value ) => ( { status: 200, body: JSON.stringify( value ) } );

/**
 * A stub upstream: records every call and answers with `answer( call )`: a status (200 carries
 * SESSION), { status, body }, a promise of either, or a throw.
 */
function stub( answer = () => 200 ) {
	const calls = [];
	const upstreamRequest = async ( call ) => {
		calls.push( call );
		const value = await answer( call );
		if ( value && typeof value === 'object' ) {
			return value;
		}
		return value === 200 ? body( SESSION ) : { status: value, body: '{"code":"rest_not_logged_in"}' };
	};
	return { calls, upstreamRequest };
}

/** Whether a check says authenticated: the old boolean, for the tests that are only about that. */
const ok = async ( auth, headers, forwarded ) => ( await auth.check( headers, forwarded ) ).authenticated;

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
	assert.equal( await ok( auth, {} ), false );
	assert.equal( await ok( auth, { cookie: '' } ), false );
	assert.equal( await ok( auth, undefined ), false );
	assert.equal( calls.length, 0 );
} );

test( '200 is authenticated and cached until the TTL passes', async () => {
	const { calls, upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, ttlMs: 30_000, now } );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
	assert.equal( calls.length, 1 );
	assert.equal( calls[ 0 ].method, 'GET' );
	assert.equal( calls[ 0 ].path, SESSION_PATH );
	assert.equal( SESSION_PATH, '/wp-json/wp-admin/v1/session' );
	now.advance( 29_999 );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
	assert.equal( calls.length, 1 );
	now.advance( 1 );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
	assert.equal( calls.length, 2 );
} );

test( 'the default TTL is 30 seconds', async () => {
	const { calls, upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, now } );
	await ok( auth, { cookie: GOOD } );
	now.advance( 29_000 );
	await ok( auth, { cookie: GOOD } );
	assert.equal( calls.length, 1 );
	now.advance( 1_000 );
	await ok( auth, { cookie: GOOD } );
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
		assert.equal( await ok( auth, { cookie: GOOD } ), false );
		assert.equal( await ok( auth, { cookie: GOOD } ), false );
		assert.equal( calls.length, 2 );
		assert.deepEqual( auth.inspect().cached, [] );
	} );
}

test( 'an upstreamRequest that throws synchronously is not authenticated', async () => {
	const auth = createAuthChecker( { upstreamRequest: () => {
		throw new Error( 'boom' );
	} } );
	assert.equal( await ok( auth, { cookie: GOOD } ), false );
} );

test( 'concurrent checks for the same cookie share one upstream call', async () => {
	let release;
	const gate = new Promise( ( r ) => ( release = r ) );
	const { calls, upstreamRequest } = stub( () => gate.then( () => 200 ) );
	const auth = createAuthChecker( { upstreamRequest } );
	const pending = Array.from( { length: 5 }, () => ok( auth, { cookie: GOOD } ) );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( calls.length, 1 );
	release();
	assert.deepEqual( await Promise.all( pending ), [ true, true, true, true, true ] );
	assert.equal( calls.length, 1 );
} );

test( 'forget() drops the cached answer', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	await ok( auth, { cookie: GOOD } );
	auth.forget( { cookie: GOOD } );
	assert.deepEqual( auth.inspect().cached, [] );
	await ok( auth, { cookie: GOOD } );
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
	const pending = ok( auth, { cookie: GOOD } );
	await new Promise( ( r ) => setImmediate( r ) );
	auth.forget( { cookie: GOOD } );
	// A check that starts after the sign-out does not join the stale one.
	const after = ok( auth, { cookie: GOOD } );
	release();
	assert.equal( await pending, true );
	assert.equal( await after, false );
	assert.equal( calls.length, 2 );
	assert.deepEqual( auth.inspect().cached, [] );
	assert.equal( await ok( auth, { cookie: GOOD } ), false );
	assert.equal( calls.length, 3 );
} );

test( 'different cookies are checked and cached separately', async () => {
	const { calls, upstreamRequest } = stub( ( call ) => ( call.headers.cookie === GOOD ? 200 : 401 ) );
	const auth = createAuthChecker( { upstreamRequest } );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
	assert.equal( await ok( auth, { cookie: GOOD + 'x' } ), false );
	assert.equal( await ok( auth, { cookie: 'x' + GOOD } ), false );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
	assert.equal( calls.length, 3 );
	auth.forget( { cookie: GOOD + 'x' } );
	assert.equal( await ok( auth, { cookie: GOOD } ), true );
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
	await ok( auth, client, { 'x-forwarded-host': 'admin.test', 'x-forwarded-proto': 'http', 'x-forwarded-for': '127.0.0.1' } );
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
	await ok( auth, { cookie: GOOD }, { cookie: 'other=1', origin: 'http://x', 'x-wp-nonce': 'n', 'x-forwarded-host': 'admin.test' } );
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
	const pending = ok( auth, { cookie: GOOD } );
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
		await ok( auth, { cookie: `c=${ n }` } );
	}
	assert.equal( auth.inspect().cached.length, 3 );
	// c=1 was evicted, c=4 is still cached.
	await ok( auth, { cookie: 'c=4' } );
	assert.equal( calls.length, 4 );
	await ok( auth, { cookie: 'c=1' } );
	assert.equal( calls.length, 5 );
} );

test( 'the default cap is 5000 entries', async () => {
	const { upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	for ( let n = 0; n < 5002; n++ ) {
		await ok( auth, { cookie: `c=${ n }` } );
	}
	assert.equal( auth.inspect().cached.length, 5000 );
} );

test( 'expired entries are pruned when new ones are added', async () => {
	const { upstreamRequest } = stub();
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, ttlMs: 100, now } );
	await ok( auth, { cookie: 'c=1' } );
	await ok( auth, { cookie: 'c=2' } );
	now.advance( 150 );
	await ok( auth, { cookie: 'c=3' } );
	assert.equal( auth.inspect().cached.length, 1 );
} );

test( 'an array of Cookie values (duplicate headers) is checked as the joined value WordPress would see', async () => {
	const { calls, upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	await ok( auth, { cookie: [ 'a=1', 'b=2' ] } );
	assert.equal( calls[ 0 ].headers.cookie, 'a=1; b=2' );
} );

// --- The session answer's body: who is signed in and which page components they may load. ---

test( 'check() returns the flag and the component set of a valid session answer', async () => {
	const { upstreamRequest } = stub();
	const auth = createAuthChecker( { upstreamRequest } );
	const result = await auth.check( { cookie: GOOD } );
	assert.equal( result.authenticated, true );
	assert.ok( result.components instanceof Set );
	assert.deepEqual( [ ...result.components ], [ 'core/options-general' ] );
} );

test( 'no cookie: not authenticated, with an empty set', async () => {
	const auth = createAuthChecker( { upstreamRequest: stub().upstreamRequest } );
	const result = await auth.check( {} );
	assert.deepEqual( { ...result, components: [ ...result.components ] }, { authenticated: false, components: [] } );
} );

test( 'the set is cached with the positive answer and dropped with it', async () => {
	let components = [ 'core/options-general' ];
	const { calls, upstreamRequest } = stub( () => body( { ...SESSION, components } ) );
	const now = clock();
	const auth = createAuthChecker( { upstreamRequest, ttlMs: 30_000, now } );
	assert.deepEqual( [ ...( await auth.check( { cookie: GOOD } ) ).components ], [ 'core/options-general' ] );
	components = [];
	// Within the TTL: the cached set, no new call.
	now.advance( 29_999 );
	assert.deepEqual( [ ...( await auth.check( { cookie: GOOD } ) ).components ], [ 'core/options-general' ] );
	assert.equal( calls.length, 1 );
	// After it: asked again, and the new (empty) set replaces the old one.
	now.advance( 1 );
	assert.deepEqual( [ ...( await auth.check( { cookie: GOOD } ) ).components ], [] );
	assert.equal( calls.length, 2 );
	// forget() drops the set together with the flag.
	components = [ 'core/options-general' ];
	auth.forget( { cookie: GOOD } );
	assert.deepEqual( [ ...( await auth.check( { cookie: GOOD } ) ).components ], [ 'core/options-general' ] );
	assert.equal( calls.length, 3 );
} );

for ( const [ name, answer ] of [
	[ 'a body that is not JSON', { status: 200, body: '<html>OK</html>' } ],
	[ 'an empty body', { status: 200, body: '' } ],
	[ 'no body at all', { status: 200 } ],
	[ 'JSON null', { status: 200, body: 'null' } ],
	[ 'a JSON array', { status: 200, body: '[{"user":{"id":1}}]' } ],
	[ 'JSON without a user', body( { nonce: 'n', components: [ 'core/options-general' ] } ) ],
	[ 'a user without an id', body( { user: { name: 'x' }, components: [] } ) ],
	[ 'user.id 0', body( { user: { id: 0 }, components: [ 'core/options-general' ] } ) ],
	[ 'a negative user.id', body( { user: { id: -3 }, components: [] } ) ],
	[ 'a fractional user.id', body( { user: { id: 1.5 }, components: [] } ) ],
	[ 'user.id as a string', body( { user: { id: '1' }, components: [ 'core/options-general' ] } ) ],
	[ 'user as a string', body( { user: '1', components: [] } ) ],
] ) {
	test( `a 200 with ${ name } is not authenticated and not cached`, async () => {
		const { calls, upstreamRequest } = stub( () => answer );
		const auth = createAuthChecker( { upstreamRequest } );
		const result = await auth.check( { cookie: GOOD } );
		assert.equal( result.authenticated, false );
		assert.deepEqual( [ ...result.components ], [] );
		await auth.check( { cookie: GOOD } );
		assert.equal( calls.length, 2 );
		assert.deepEqual( auth.inspect().cached, [] );
	} );
}

test( 'a body larger than the cap is not authenticated', async () => {
	const huge = JSON.stringify( { ...SESSION, padding: 'x'.repeat( 300 * 1024 ) } );
	const { upstreamRequest } = stub( () => ( { status: 200, body: huge } ) );
	const auth = createAuthChecker( { upstreamRequest } );
	assert.equal( ( await auth.check( { cookie: GOOD } ) ).authenticated, false );
	assert.ok( SESSION_MAX_BYTES < huge.length );
	// A Buffer body is measured the same way.
	const asBuffer = createAuthChecker( { upstreamRequest: stub( () => ( { status: 200, body: Buffer.from( huge ) } ) ).upstreamRequest } );
	assert.equal( ( await asBuffer.check( { cookie: GOOD } ) ).authenticated, false );
	const small = createAuthChecker( { upstreamRequest: stub( () => ( { status: 200, body: Buffer.from( JSON.stringify( SESSION ) ) } ) ).upstreamRequest } );
	assert.equal( ( await small.check( { cookie: GOOD } ) ).authenticated, true );
} );

for ( const [ name, components ] of [
	[ 'missing', undefined ],
	[ 'null', null ],
	[ 'a string', 'core/options-general' ],
	[ 'an object', { 0: 'core/options-general' } ],
	[ 'an array with a non-string', [ 'core/options-general', 7 ] ],
	[ 'an array with null', [ null, 'core/options-general' ] ],
	[ 'an array with a nested array', [ [ 'core/options-general' ] ] ],
	[ 'longer than the cap', Array.from( { length: COMPONENTS_MAX + 1 }, ( _, i ) => 'core/page-' + i ) ],
] ) {
	test( `a valid user with components ${ name } is authenticated with an empty set`, async () => {
		const session = { ...SESSION };
		if ( components === undefined ) {
			delete session.components;
		} else {
			session.components = components;
		}
		const { upstreamRequest } = stub( () => body( session ) );
		const auth = createAuthChecker( { upstreamRequest } );
		const result = await auth.check( { cookie: GOOD } );
		assert.equal( result.authenticated, true );
		assert.deepEqual( [ ...result.components ], [] );
		// Cached like any positive answer: shared files keep working without a round trip each.
		assert.equal( auth.inspect().cached.length, 1 );
	} );
}

test( 'component ids that do not follow the contract id grammar are dropped', async () => {
	const ids = [
		'core/options-general', 'acme/settings-page', 'a1/b2',
		// Exactly two segments: a nested id could otherwise claim another page's helper files.
		'acme/a/b', 'core/options-general/timezone', 'core/options-general/timezone/x',
		'core', 'Core/options-general', 'core/Options', 'core/options_general', 'core/options-general.js', 'core/../kit/index',
		'core/', '/core/x', 'core//x', '-core/x', 'core/-x', 'core/x/', 'core/x y', 'core/x\u0000', 'core/é', '', ' core/x',
		'core/' + 'a'.repeat( COMPONENT_ID_MAX_LENGTH ),
	];
	const { upstreamRequest } = stub( () => body( { ...SESSION, components: ids } ) );
	const auth = createAuthChecker( { upstreamRequest } );
	const result = await auth.check( { cookie: GOOD } );
	assert.equal( result.authenticated, true );
	assert.deepEqual( [ ...result.components ].sort(), [ 'a1/b2', 'acme/settings-page', 'core/options-general' ] );
	assert.equal( COMPONENT_ID.test( 'core/options-general' ), true );
	assert.equal( COMPONENT_ID.test( 'core/options-general/' ), false );
	assert.equal( COMPONENT_ID.test( 'core/options-general/timezone' ), false );
} );

test( 'the check gives up after a total timeout and fails closed, aborting the request', async () => {
	const timers = [];
	const cleared = [];
	const setTimer = ( fn, ms ) => {
		timers.push( { fn, ms } );
		return timers.length;
	};
	const clearTimer = ( id ) => cleared.push( id );
	let signal = null;
	let release;
	const upstreamRequest = ( call ) => {
		signal = call.signal;
		// Never answers by itself (an upstream that trickles or stalls).
		return new Promise( ( resolve ) => ( release = resolve ) );
	};
	const auth = createAuthChecker( { upstreamRequest, timeoutMs: 5000, setTimer, clearTimer } );
	const pending = auth.check( { cookie: GOOD } );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( timers.length, 1 );
	assert.equal( timers[ 0 ].ms, 5000 );
	assert.ok( signal instanceof AbortSignal );
	assert.equal( signal.aborted, false );
	timers[ 0 ].fn();
	const result = await pending;
	assert.equal( result.authenticated, false );
	assert.equal( signal.aborted, true );
	assert.deepEqual( auth.inspect(), { cached: [], inflight: [] } );
	// A late answer changes nothing.
	release( body( SESSION ) );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.deepEqual( auth.inspect().cached, [] );
} );

test( 'the default total timeout is 5 seconds, and the timer is cleared once answered', async () => {
	const timers = [];
	const cleared = [];
	const auth = createAuthChecker( {
		upstreamRequest: stub().upstreamRequest,
		setTimer: ( fn, ms ) => {
			timers.push( ms );
			return 'id';
		},
		clearTimer: ( id ) => cleared.push( id ),
	} );
	assert.equal( ( await auth.check( { cookie: GOOD } ) ).authenticated, true );
	assert.deepEqual( timers, [ 5000 ] );
	assert.deepEqual( cleared, [ 'id' ] );
} );

test( 'forget() during a check prevents caching of both the flag and the set', async () => {
	let release;
	const gate = new Promise( ( r ) => ( release = r ) );
	let first = true;
	const { upstreamRequest } = stub( () => {
		if ( first ) {
			first = false;
			return gate.then( () => body( SESSION ) );
		}
		return body( { ...SESSION, components: [] } );
	} );
	const auth = createAuthChecker( { upstreamRequest } );
	const pending = auth.check( { cookie: GOOD } );
	await new Promise( ( r ) => setImmediate( r ) );
	auth.forget( { cookie: GOOD } );
	release();
	assert.deepEqual( [ ...( await pending ).components ], [ 'core/options-general' ] );
	assert.deepEqual( auth.inspect().cached, [] );
	// The next check asks again and gets the new set, not the one of the forgotten check.
	assert.deepEqual( [ ...( await auth.check( { cookie: GOOD } ) ).components ], [] );
} );

test( 'two cookies checked at the same time each get their own set', async () => {
	const sets = { 'c=a': [ 'core/options-general' ], 'c=b': [] };
	let releases = [];
	const { upstreamRequest } = stub( ( call ) => new Promise( ( r ) => releases.push( () => r( body( { ...SESSION, components: sets[ call.headers.cookie ] } ) ) ) ) );
	const auth = createAuthChecker( { upstreamRequest } );
	const a = auth.check( { cookie: 'c=a' } );
	const b = auth.check( { cookie: 'c=b' } );
	await new Promise( ( r ) => setImmediate( r ) );
	// Answered in the opposite order.
	releases[ 1 ]();
	releases[ 0 ]();
	assert.deepEqual( [ ...( await a ).components ], [ 'core/options-general' ] );
	assert.deepEqual( [ ...( await b ).components ], [] );
	assert.deepEqual( [ ...( await auth.check( { cookie: 'c=b' } ) ).components ], [] );
	assert.deepEqual( [ ...( await auth.check( { cookie: 'c=a' } ) ).components ], [ 'core/options-general' ] );
	releases = null;
} );
