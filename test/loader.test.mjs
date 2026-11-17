import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, isModuleFailure } from '../site/runtime/loader.js';

function fakeDocument() {
	const scripts = [];
	return {
		scripts,
		location: { origin: 'http://localhost:8890' },
		createElement: ( tag ) => ( { tag } ),
		head: { appendChild: ( el ) => scripts.push( el ) },
	};
}

function silence( t ) {
	const warnings = [];
	t.mock.method( console, 'warn', ( ...a ) => warnings.push( a.join( ' ' ) ) );
	return warnings;
}

test( 'failed import resolves to ModuleFailure with specifier', async () => {
	const loader = createLoader( { importFn: async () => { throw new Error( 'nope' ); } } );
	const component = await loader.loadComponent( 'plugin/x' );
	assert.equal( isModuleFailure( component ), true );
	assert.equal( component.failedSpecifier, 'plugin/x' );
	assert.equal( component.name, 'ModuleFailure' );
} );

test( 'a module without a default export is a failure', async () => {
	const loader = createLoader( { importFn: async () => ( {} ) } );
	assert.equal( isModuleFailure( await loader.loadComponent( 'p/x' ) ), true );
} );

test( 'loadComponent resolves a top-level specifier through the internal table', async () => {
	const imported = [];
	const Comp = { name: 'Comp' };
	const loader = createLoader( { importFn: async ( u ) => { imported.push( u ); return { default: Comp }; } } );
	loader.applyImportMap( { 'plugin/a': '/wp-content/a.js' } );
	assert.equal( await loader.loadComponent( 'plugin/a' ), Comp );
	assert.deepEqual( imported, [ '/wp-content/a.js' ] );
	await loader.loadComponent( 'plugin/a' );
	assert.equal( imported.length, 1, 'successful loads are cached' );
} );

test( 'applyImportMap appends one importmap script for new specifiers only', () => {
	const document = fakeDocument();
	const loader = createLoader( { importFn: async () => ( {} ), document } );
	loader.applyImportMap( { a: '/a.js', b: 'http://localhost:8890/b.js' } );
	assert.equal( document.scripts.length, 1 );
	assert.equal( document.scripts[ 0 ].type, 'importmap' );
	assert.deepEqual( JSON.parse( document.scripts[ 0 ].textContent ), { imports: { a: '/a.js', b: 'http://localhost:8890/b.js' } } );
	loader.applyImportMap( { a: '/a.js' } );
	assert.equal( document.scripts.length, 1 );
} );

test( 'applyImportMap refuses to remap vue and @wp-admin specifiers', ( t ) => {
	const warnings = silence( t );
	const document = fakeDocument();
	const loader = createLoader( { importFn: async () => ( {} ), document } );
	loader.applyImportMap( { vue: '/evil.js', '@wp-admin/api': '/evil.js', '@wp-admin/new': '/evil.js' } );
	assert.equal( document.scripts.length, 0 );
	assert.equal( warnings.length, 3 );
} );

test( 'applyImportMap refuses cross-origin, protocol-relative and backslash URLs', async ( t ) => {
	const warnings = silence( t );
	const document = fakeDocument();
	const imported = [];
	const loader = createLoader( { importFn: async ( u ) => { imported.push( u ); return { default: {} }; }, document } );
	loader.applyImportMap( {
		x1: 'https://evil.example/x.js',
		x2: '//evil.example/x.js',
		x3: '/\\evil.example/x.js',
		x4: 'relative/x.js',
		x5: 'javascript:alert(1)',
		ok: '/ok.js',
	} );
	assert.equal( warnings.length, 5 );
	assert.deepEqual( JSON.parse( document.scripts[ 0 ].textContent ), { imports: { ok: '/ok.js' } } );
	assert.equal( isModuleFailure( await loader.loadComponent( 'x1' ) ), true );
	assert.deepEqual( imported, [] );
} );

test( 'without a document only root-relative URLs are accepted, and the table still works', async ( t ) => {
	const warnings = silence( t );
	const imported = [];
	const loader = createLoader( { importFn: async ( u ) => { imported.push( u ); return { default: { n: 1 } }; } } );
	loader.applyImportMap( { a: '/a.js', b: 'http://localhost:8890/b.js' } );
	assert.equal( warnings.length, 1 );
	await loader.loadComponent( 'a' );
	assert.deepEqual( imported, [ '/a.js' ] );
} );

test( 'loadModule returns the namespace and rejects on failure', async () => {
	const ns = { default: {}, implementsContract: { id: 'core/x', version: '1' } };
	const loader = createLoader( { importFn: async ( u ) => { if ( u === '/bad.js' ) { throw new Error( 'x' ); } return ns; } } );
	loader.applyImportMap( { good: '/good.js', bad: '/bad.js' } );
	assert.equal( await loader.loadModule( 'good' ), ns );
	await assert.rejects( loader.loadModule( 'bad' ) );
} );
