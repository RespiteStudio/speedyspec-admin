import test from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { notify } from '../site/runtime/notify.js';

test( 'notify uses the injected notices service when present', () => {
	const got = [];
	notify( { add: ( n ) => got.push( n ) }, 'hello' );
	assert.deepEqual( got, [ { type: 'warning', message: 'hello', dismissible: true } ] );
} );

test( 'notify falls back to console.warn when notices is absent', ( t ) => {
	const warnings = [];
	t.mock.method( console, 'warn', ( ...a ) => warnings.push( a.join( ' ' ) ) );
	notify( null, 'hello' );
	assert.deepEqual( warnings, [ 'hello' ] );
} );
