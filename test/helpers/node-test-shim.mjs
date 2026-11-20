/**
 * The part of node:test the unit tests use, on Jest, so the files that were written for
 * node:test run under Jest with only their import changed (`from 'node:test'` becomes
 * `from './helpers/node-test-shim.mjs'`). New tests import from `@jest/globals` directly.
 *
 * - `test( name, [options], fn )`: `options.skip` (or `todo`) truthy skips the test. Like node,
 *   a test has no time limit unless `options.timeout` gives one. `fn` gets a context `t`:
 *   - `t.after( fn )` queues a cleanup run after the test, in reverse order;
 *   - `t.diagnostic( message )` does nothing;
 *   - `t.mock.method( object, name, impl? )` is `jest.spyOn`, restored after the test; it
 *     returns a function whose `.mock.calls[ i ].arguments` and `.mock.callCount()` are node's;
 *   - `t.mock.timers.enable( { apis } )` fakes only the named timer APIs (`setTimeout` fakes
 *     `setTimeout` and `clearTimeout`); `t.mock.timers.tick( ms )` advances them. Real timers
 *     come back after the test.
 * - `before`, `after`, `beforeEach`, `afterEach` are Jest's `beforeAll`, `afterAll`,
 *   `beforeEach` and `afterEach`.
 */
import { test as jestTest, beforeAll, afterAll, beforeEach as jestBeforeEach, afterEach as jestAfterEach, jest } from '@jest/globals';

// node:test has no default time limit; setTimeout's largest delay stands for "none".
const NO_TIMEOUT = 2 ** 31 - 1;

// Every API Jest can fake; the timers mock fakes the named ones and leaves the rest real.
const FAKEABLE = [ 'Date', 'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout' ];
const PAIRS = { setTimeout: [ 'setTimeout', 'clearTimeout' ], setInterval: [ 'setInterval', 'clearInterval' ], setImmediate: [ 'setImmediate', 'clearImmediate' ], Date: [ 'Date' ] };

function createContext() {
	const cleanups = [];
	const spies = [];
	let fakeTimers = false;

	const method = ( object, name, impl ) => {
		// jest.spyOn on a method that is already a spy returns that same spy, so an
		// implementation that calls the method it replaced would call itself. node:test wraps the
		// current method in a new mock each time; so does this, then.
		const current = object[ name ];
		let spy;
		if ( jest.isMockFunction( current ) ) {
			spy = jest.fn( function ( ...args ) {
				return current.apply( this, args );
			} );
			spy.mockRestore = () => {
				object[ name ] = current;
			};
			object[ name ] = spy;
		} else {
			spy = jest.spyOn( object, name );
		}
		if ( impl ) {
			spy.mockImplementation( impl );
		}
		spies.push( spy );
		const mock = {
			get calls() {
				return spy.mock.calls.map( ( args, i ) => ( { arguments: args, result: spy.mock.results[ i ]?.value, this: spy.mock.contexts[ i ] } ) );
			},
			callCount: () => spy.mock.calls.length,
			restore: () => spy.mockRestore(),
			resetCalls: () => spy.mockClear(),
			mockImplementation: ( fn ) => spy.mockImplementation( fn ),
		};
		const handle = function ( ...args ) {
			return spy.apply( this, args );
		};
		Object.defineProperty( handle, 'mock', { value: mock } );
		return handle;
	};

	const timers = {
		enable( { apis = [ 'setInterval', 'setTimeout', 'setImmediate', 'Date' ] } = {} ) {
			const faked = new Set( apis.flatMap( ( api ) => PAIRS[ api ] ?? [ api ] ) );
			jest.useFakeTimers( { doNotFake: FAKEABLE.filter( ( api ) => ! faked.has( api ) ) } );
			fakeTimers = true;
		},
		tick( ms ) {
			jest.advanceTimersByTime( ms );
		},
		runAll() {
			jest.runAllTimers();
		},
		reset() {
			jest.useRealTimers();
			fakeTimers = false;
		},
	};

	const t = {
		after: ( fn ) => {
			cleanups.push( fn );
		},
		diagnostic: () => {},
		mock: { method, timers },
	};

	async function finish() {
		try {
			while ( cleanups.length ) {
				await cleanups.pop()( t );
			}
		} finally {
			while ( spies.length ) {
				spies.pop().mockRestore();
			}
			if ( fakeTimers ) {
				jest.useRealTimers();
			}
		}
	}

	return { t, finish };
}

export function test( name, options, fn ) {
	if ( typeof options === 'function' ) {
		fn = options;
		options = {};
	}
	options = options ?? {};
	if ( options.skip || options.todo || typeof fn !== 'function' ) {
		return jestTest.skip( name, () => {} );
	}
	return jestTest( name, async () => {
		const { t, finish } = createContext();
		try {
			await fn( t );
		} finally {
			await finish();
		}
	}, options.timeout ?? NO_TIMEOUT );
}

test.skip = ( name, options, fn ) => test( name, { ...( typeof options === 'object' ? options : {} ), skip: true }, typeof options === 'function' ? options : fn );
test.todo = ( name, options, fn ) => test( name, { ...( typeof options === 'object' ? options : {} ), todo: true }, typeof options === 'function' ? options : fn );

// Hooks get no `done` callback (Jest would wait for one if the function declared a parameter).
export const before = ( fn ) => beforeAll( () => fn() );
export const after = ( fn ) => afterAll( () => fn() );
export const beforeEach = ( fn ) => jestBeforeEach( () => fn() );
export const afterEach = ( fn ) => jestAfterEach( () => fn() );

export default test;
