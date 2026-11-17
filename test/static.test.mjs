import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveStatic } from '../server/static.mjs';

test('a file removed between realpath and stat is a miss, not an exception', () => {
	const fake = {
		realpathSync: ( p ) => p,
		statSync: () => {
			throw Object.assign( new Error( 'gone' ), { code: 'ENOENT' } );
		},
	};
	assert.equal( resolveStatic( '/site', '/app.js', fake ), null );
	// Sanity: the real fs still resolves an existing file.
	assert.ok( resolveStatic( new URL( '../site', import.meta.url ).pathname, '/index.html', fs ) );
} );
