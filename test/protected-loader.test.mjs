import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtectedLoader, PROTECTED_ENTRY } from '../site/runtime/protected-loader.js';

function setup( { imports, statuses } ) {
	const urls = [];
	const probes = [];
	const installed = [];
	const loader = createProtectedLoader( {
		importModule: async ( url ) => {
			urls.push( url );
			const next = imports.shift();
			if ( next instanceof Error ) {
				throw next;
			}
			return next;
		},
		probe: async ( url ) => {
			probes.push( url );
			const next = statuses.shift();
			if ( next instanceof Error ) {
				throw next;
			}
			return next;
		},
		install: async ( module ) => {
			installed.push( module );
		},
	} );
	return { loader, urls, probes, installed };
}

test( 'a failed import whose probe answers 401 is an ended session', async () => {
	const { loader, probes } = setup( { imports: [ new TypeError( 'Failed to fetch' ) ], statuses: [ 401 ] } );
	await assert.rejects( loader.load(), ( e ) => e.status === 401 && e.code === 'admin_not_authenticated' );
	assert.deepEqual( probes, [ PROTECTED_ENTRY ] );
} );

test( 'any other failure (403, 404, 200 with a syntax error, a failed probe) is an error to retry, not a sign-in', async () => {
	for ( const status of [ 403, 404, 200, 500, null, new TypeError( 'offline' ) ] ) {
		const { loader } = setup( { imports: [ new SyntaxError( 'Unexpected token' ) ], statuses: [ status ] } );
		await assert.rejects( loader.load(), ( e ) => e.status !== 401 && e.code === 'admin_unavailable', String( status ) );
	}
} );

test( 'a retry asks for a fresh URL and, once loaded, the module is installed once and kept', async () => {
	const module = { install() {} };
	const { loader, urls, installed } = setup( { imports: [ new TypeError( 'x' ), module ], statuses: [ 403 ] } );
	await assert.rejects( loader.load() );
	assert.equal( await loader.load(), module );
	assert.equal( await loader.load(), module );
	assert.deepEqual( urls, [ PROTECTED_ENTRY, PROTECTED_ENTRY + '?attempt=1' ] );
	assert.deepEqual( installed, [ module ] );
	assert.equal( loader.loaded(), module );
} );

test( 'concurrent loads share one import', async () => {
	const module = {};
	const { loader, urls } = setup( { imports: [ module ], statuses: [] } );
	const [ a, b ] = await Promise.all( [ loader.load(), loader.load() ] );
	assert.equal( a, module );
	assert.equal( b, module );
	assert.equal( urls.length, 1 );
} );
