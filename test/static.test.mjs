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

import os from 'node:os';
import path from 'node:path';
import { staticKey, gate, createPublicFiles } from '../server/static.mjs';

test( 'staticKey normalises a decoded path the way resolveStatic reads it', () => {
	assert.equal( staticKey( '/runtime/app.js' ), '/runtime/app.js' );
	assert.equal( staticKey( '/runtime//app.js/' ), '/runtime/app.js' );
	assert.equal( staticKey( '//runtime/app.js' ), '/runtime/app.js' );
	assert.equal( staticKey( '/' ), '/' );
	assert.equal( staticKey( '/Runtime/App.js' ), '/Runtime/App.js' );
} );

test( 'gate: exact, case-sensitive membership; everything else is protected', () => {
	const list = new Set( [ '/index.html', '/runtime/app.js' ] );
	assert.equal( gate( '/runtime/app.js', list ), 'public' );
	assert.equal( gate( '/index.html', list ), 'public' );
	for ( const key of [ '/runtime/App.js', '/RUNTIME/app.js', '/runtime/app.js.map', '/runtime', '/runtime/', '/kit/index.js', '/', '' ] ) {
		assert.equal( gate( key, list ), 'protected', key );
	}
	assert.equal( gate( '/index.html', new Set() ), 'protected' );
} );

test( 'createPublicFiles reads the list, re-reads it on change and fails closed', () => {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'public-files-' ) );
	const file = path.join( dir, 'public-files.json' );
	const errors = [];
	const files = createPublicFiles( { log: ( e ) => errors.push( e ) } );
	try {
		assert.deepEqual( [ ...files.get( dir ) ], [ '/index.html' ] );
		assert.equal( errors.length, 1 );
		fs.writeFileSync( file, JSON.stringify( { files: [ '/index.html', '/a.js' ] } ) );
		assert.deepEqual( [ ...files.get( dir ) ], [ '/index.html', '/a.js' ] );
		fs.writeFileSync( file, '{"files":["/a.js","/b.js"]}' );
		const later = new Date( Date.now() + 5000 );
		fs.utimesSync( file, later, later );
		// /index.html is the shell: always public, listed or not.
		assert.deepEqual( [ ...files.get( dir ) ].sort(), [ '/a.js', '/b.js', '/index.html' ] );
		fs.writeFileSync( file, '{"files":["/a.js","/x/*.js"]}' );
		const later2 = new Date( Date.now() + 10000 );
		fs.utimesSync( file, later2, later2 );
		assert.deepEqual( [ ...files.get( dir ) ], [ '/index.html' ] );
		assert.equal( errors.length, 2 );
	} finally {
		fs.rmSync( dir, { recursive: true, force: true } );
	}
} );
