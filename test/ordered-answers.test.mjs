import test from 'node:test';
import assert from 'node:assert/strict';

const { orderedAnswers } = await import( '../site/components/core/list-table-parts/ordered-answers.js' );

const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise( ( res, rej ) => {
		resolve = res;
		reject = rej;
	} );
	return { promise, resolve, reject };
};
const tick = async () => {
	for ( let i = 0; i < 6; i++ ) {
		await Promise.resolve();
	}
};

test( 'orderedAnswers: answers are applied in the order sent, failures too', async () => {
	const { ordered } = orderedAnswers();
	const seen = [];
	const a = deferred();
	const b = deferred();
	const c = deferred();
	const done = [
		ordered( a.promise, ( value ) => seen.push( 'a:' + value ) ),
		ordered( b.promise, ( value ) => seen.push( 'b:' + value ), ( error ) => seen.push( 'b failed:' + error.message ) ),
		ordered( c.promise, ( value ) => seen.push( 'c:' + value ) ),
	];
	c.resolve( 3 );
	b.reject( new Error( 'no' ) );
	await tick();
	assert.deepEqual( seen, [], 'Nothing before the oldest.' );
	a.resolve( 1 );
	await Promise.all( done );
	assert.deepEqual( seen, [ 'a:1', 'b failed:no', 'c:3' ] );
} );

test( 'orderedAnswers: a throwing callback is reported, the queue goes on, and nothing rejects', async () => {
	const reported = [];
	const { ordered } = orderedAnswers( { report: ( error ) => reported.push( error.message ) } );
	const seen = [];
	const a = deferred();
	const b = deferred();
	const first = ordered( a.promise, () => {
		throw new Error( 'apply failed' );
	} );
	const second = ordered( b.promise, ( value ) => seen.push( value ) );
	b.resolve( 'b' );
	a.resolve( 'a' );
	await assert.doesNotReject( first );
	await second;
	assert.deepEqual( reported, [ 'apply failed' ] );
	assert.deepEqual( seen, [ 'b' ], 'The next answer is applied.' );

	const failing = ordered( Promise.reject( new Error( 'x' ) ), null, () => {
		throw new Error( 'fail failed' );
	} );
	await assert.doesNotReject( failing );
	assert.deepEqual( reported, [ 'apply failed', 'fail failed' ] );
} );

test( 'orderedAnswers: reset drops what is still to come, also an answer waiting for an older one', async () => {
	const { ordered, reset } = orderedAnswers();
	const seen = [];
	const a = deferred();
	const b = deferred();
	const first = ordered( a.promise, () => seen.push( 'a' ), () => seen.push( 'a failed' ) );
	const second = ordered( b.promise, () => seen.push( 'b' ) );
	b.resolve();
	await tick();
	reset();
	await second;
	a.reject( new Error( 'late' ) );
	await first;
	assert.deepEqual( seen, [], 'Neither applied nor failed.' );

	await ordered( Promise.resolve( 'new' ), ( value ) => seen.push( value ) );
	assert.deepEqual( seen, [ 'new' ], 'Requests after the reset start a new queue.' );
} );

test( 'orderedAnswers: with a timeout, a hung request fails and the answers after it are applied', async () => {
	const timers = [];
	const fake = {
		setTimeout: ( fn, ms ) => {
			timers.push( { fn, ms, cleared: false } );
			return timers.length - 1;
		},
		clearTimeout: ( id ) => {
			if ( timers[ id ] ) {
				timers[ id ].cleared = true;
			}
		},
	};
	const { ordered } = orderedAnswers( { timeout: 1000, timeoutError: () => new Error( 'timed out' ), timers: fake } );
	const seen = [];
	const hung = deferred();
	const first = ordered( hung.promise, () => seen.push( 'hung applied' ), ( error ) => seen.push( error.message ) );
	const second = ordered( Promise.resolve( 'b' ), ( value ) => seen.push( value ) );
	await tick();
	assert.deepEqual( seen, [] );
	assert.equal( timers[ 0 ].ms, 1000 );
	timers[ 0 ].fn();
	await Promise.all( [ first, second ] );
	assert.deepEqual( seen, [ 'timed out', 'b' ] );
	assert.equal( timers[ 1 ].cleared, true, 'An answered request clears its timer.' );
	hung.resolve( 'late' );
	await tick();
	assert.deepEqual( seen, [ 'timed out', 'b' ], 'The late answer is dropped.' );
} );
