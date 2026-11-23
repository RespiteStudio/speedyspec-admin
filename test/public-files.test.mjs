import { test } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// What an anonymous visitor can load must be exactly what the sign-in and error screens need.

const SITE = new URL( '../site/', import.meta.url ).pathname;
const PROTECTED_ENTRY = '/runtime/protected.js';
const VENDOR = '/vendor/vue.esm-browser.prod.js';
const read = ( file ) => fs.readFileSync( path.join( SITE, file ), 'utf8' );
const publicList = JSON.parse( read( 'public-files.json' ) ).files;
const isPublic = ( file ) => publicList.includes( file );

const html = read( 'index.html' );
const importMap = JSON.parse( /<script type="importmap">([\s\S]*?)<\/script>/.exec( html )[ 1 ] ).imports;

/** Root-relative URLs the shell document itself makes the browser fetch. */
function documentReferences() {
	const refs = [];
	for ( const [ , src ] of html.matchAll( /<script\b[^>]*\bsrc="([^"]+)"/g ) ) {
		refs.push( src );
	}
	for ( const [ , href ] of html.matchAll( /<link\b[^>]*\bhref="([^"]+)"/g ) ) {
		refs.push( href );
	}
	return refs.filter( ( ref ) => ref.startsWith( '/' ) );
}

/** Static `import … from`, `import '…'` and `export … from` specifiers of a module's source. */
function staticSpecifiers( source ) {
	const specs = [];
	for ( const [ , spec ] of source.matchAll( /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?['"]([^'"\n]+)['"]/g ) ) {
		specs.push( spec );
	}
	return specs;
}

/** The first argument of every dynamic import() in a source, as written. */
function dynamicImports( source ) {
	return [ ...source.matchAll( /\bimport\s*\(\s*([^)]*)\)/g ) ].map( ( m ) => m[ 1 ].trim() );
}

/** Resolves a specifier from `from` (a root-relative file) to a root-relative file path. */
function resolveSpecifier( spec, from ) {
	if ( Object.hasOwn( importMap, spec ) ) {
		return importMap[ spec ];
	}
	assert.ok( spec.startsWith( '/' ) || spec.startsWith( './' ) || spec.startsWith( '../' ), `unmapped bare specifier ${ spec } in ${ from }` );
	return new URL( spec, 'http://site' + from ).pathname;
}

const isModule = ( file ) => file.endsWith( '.js' );

/** Every file reached from the shell document before sign-in, with the static edges between them. */
function walk() {
	const reached = new Set( [ '/index.html' ] );
	const edges = [];
	const queue = [ ...documentReferences() ];
	documentReferences().forEach( ( to ) => edges.push( [ '/index.html', to ] ) );
	while ( queue.length > 0 ) {
		const file = queue.shift();
		if ( reached.has( file ) ) {
			continue;
		}
		reached.add( file );
		assert.ok( fs.existsSync( path.join( SITE, file ) ), `${ file } exists` );
		if ( ! isModule( file ) || file === VENDOR ) {
			continue;
		}
		for ( const spec of staticSpecifiers( read( file ) ) ) {
			const to = resolveSpecifier( spec, file );
			edges.push( [ file, to ] );
			queue.push( to );
		}
	}
	return { reached, edges };
}

test( 'the walk itself finds what it should (sanity)', () => {
	assert.deepEqual( staticSpecifiers( "import a from './a.js';\nimport { b,\n c } from \"../b.js\";\nexport { d } from './d.js';\nimport './e.js';\nexport * from 'vue';\nconst x = `import y from './no.js'`;" ),
		[ './a.js', '../b.js', './d.js', './e.js', 'vue' ] );
	assert.deepEqual( dynamicImports( "await import( url ); import('/x.js')" ), [ 'url', "'/x.js'" ] );
	// The vendored Vue build has no imports of its own.
	assert.deepEqual( staticSpecifiers( read( VENDOR ) ).filter( ( s ) => s.startsWith( '.' ) || s.startsWith( '/' ) ), [] );
} );

test( 'everything the shell reaches before sign-in is on the public list', () => {
	const { reached } = walk();
	for ( const file of reached ) {
		assert.ok( isPublic( file ), `${ file } is reached from index.html but is not public` );
	}
} );

test( 'everything on the public list is reached from the shell (nothing extra is public)', () => {
	const { reached } = walk();
	for ( const file of publicList ) {
		assert.ok( reached.has( file ), `${ file } is public but nothing loads it before sign-in` );
	}
	assert.equal( new Set( publicList ).size, publicList.length, 'no duplicates' );
} );

test( 'no public file statically imports a protected one', () => {
	const { edges } = walk();
	for ( const [ from, to ] of edges ) {
		assert.ok( isPublic( to ), `${ from } imports ${ to }, which is protected` );
	}
} );

test( 'the protected areas are not public', () => {
	for ( const file of publicList ) {
		assert.ok( ! /^\/(contracts|components|kit)\//.test( file ), file );
	}
	for ( const file of [ PROTECTED_ENTRY, '/runtime/PageHost.js', '/runtime/Contracted.js', '/runtime/slots.js', '/runtime/contracts.js',
		'/runtime/contracts-instance.js', '/runtime/loader.js', '/runtime/notices.js', '/runtime/menu.js', '/runtime/stylesheets.js',
		// The password rows of the user forms (Step 3f): shared, never public.
		'/runtime/password-strength.js', '/contracts/core/user-password.js', '/components/core/user-password.js',
		// The admin email verification after sign-in (Step 3f): shared, never public.
		'/contracts/core/admin-email-confirm.js', '/components/core/admin-email-confirm.js',
		// The package layer of the Plugins pages (Step 3g): shared, never public.
		'/components/core/package-parts/queue.js', '/components/core/package-parts/events.js', '/components/core/package-parts/credentials.js',
		'/components/core/package-parts/runner.js', '/components/core/list-table-parts/live-search.js',
		'/contracts/core/filesystem-credentials.js', '/components/core/filesystem-credentials.js',
		'/contracts/core/plugin-information.js', '/components/core/plugin-information.js',
		'/styles/frame.css', '/styles/kit.css', '/public-files.json', '/shared-files.json' ] ) {
		assert.ok( ! isPublic( file ), file );
	}
} );

test( 'the only dynamic import in public code is the one post-sign-in entry point', () => {
	const found = [];
	for ( const file of publicList.filter( ( f ) => isModule( f ) && f !== VENDOR ) ) {
		for ( const arg of dynamicImports( read( file ) ) ) {
			found.push( [ file, arg ] );
		}
	}
	assert.deepEqual( found.map( ( [ file ] ) => file ), [ '/runtime/app.js' ] );
	const app = read( 'runtime/app.js' );
	const entryLoader = read( 'runtime/protected-loader.js' );
	assert.match( entryLoader, new RegExp( `export const PROTECTED_ENTRY = '${ PROTECTED_ENTRY }';` ) );
	assert.match( found[ 0 ][ 1 ], /^url$/ );
	assert.match( entryLoader, /const url = PROTECTED_ENTRY \+/ );
	// app.js imports nothing but the protected entry (with or without a retry query).
	assert.match( app, /url\.split\( '\?' \)\[ 0 \] === PROTECTED_ENTRY \? import\( url \)/ );
	assert.ok( fs.existsSync( path.join( SITE, PROTECTED_ENTRY ) ) );
} );

test( 'the protected entry statically brings in the page host, the frame machinery and the notices service', () => {
	const specs = staticSpecifiers( read( 'runtime/protected.js' ) ).map( ( s ) => resolveSpecifier( s, PROTECTED_ENTRY ) );
	for ( const file of [ '/runtime/PageHost.js', '/runtime/Contracted.js', '/runtime/slots.js', '/runtime/contracts-instance.js', '/runtime/notices.js' ] ) {
		assert.ok( specs.includes( file ), file );
	}
	assert.match( read( 'runtime/protected.js' ), /'\/styles\/frame\.css', '\/styles\/kit\.css'/ );
} );

test( 'no public file contains admin markup, kit components or another core contract', () => {
	const kitNames = [ ...read( 'kit/index.js' ).matchAll( /export \{ default as (\w+) \}/g ) ].map( ( m ) => m[ 1 ] );
	assert.ok( kitNames.length >= 8, 'kit names found' );
	const markers = [
		'adminmenu', 'wp-menu-name', 'wpadminbar', 'wp-admin-bar', 'form-table', 'wpwrap', 'wpcontent', 'wpbody', 'wp-admin-notices',
		'wp-admin-page', 'wp-heading-inline', 'menu-top', 'wp-submenu', 'PageHost', 'SlotOutlet', 'core/menu', 'core/admin-bar', 'core/notices',
		'Main menu', 'Log Out', 'Skip to main content', '@wp-admin/kit',
	];
	for ( const file of publicList ) {
		const source = read( file.slice( 1 ) );
		// The import map names the kit's URL so that page modules can import it; it does not load it.
		const checked = file === '/index.html' ? source.replace( /<script type="importmap">[\s\S]*?<\/script>/, '' ) : source;
		for ( const marker of markers ) {
			assert.ok( ! checked.includes( marker ), `${ file } contains ${ marker }` );
		}
		for ( const name of kitNames ) {
			assert.ok( ! new RegExp( `\\b${ name }\\b` ).test( checked ), `${ file } names the kit component ${ name }` );
		}
		// Only core/frame may be named (as the id to load once signed in).
		for ( const [ id ] of checked.matchAll( /\bcore\/[a-z0-9-]+/g ) ) {
			assert.equal( id, 'core/frame', `${ file } names ${ id }` );
		}
	}
} );

test( 'the shell document is a static file with no templating and no data', () => {
	assert.doesNotMatch( html, /<\?|{{|{%|<%|\$\{/ );
	assert.match( html, /<div id="app"><\/div>/ );
	assert.doesNotMatch( html, /frame\.css|kit\.css/ );
} );
