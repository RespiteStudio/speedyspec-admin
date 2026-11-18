import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyStatic } from '../server/tiers.mjs';
import { COMPONENT_ID } from '../server/auth.mjs';

// Keeps the three tiers honest: every file under site/ is public, shared or a page's, as the proxy
// classifies it; what every signed-in user loads is shared; no page's file is shared or needed by a
// shared one.

const SITE = new URL( '../site/', import.meta.url ).pathname;
const PROTECTED_ENTRY = '/runtime/protected.js';
const VENDOR = '/vendor/vue.esm-browser.prod.js';
const LIST_FILES = [ '/public-files.json', '/shared-files.json' ];
const read = ( file ) => fs.readFileSync( path.join( SITE, file ), 'utf8' );
const listOf = ( name ) => JSON.parse( read( name ) ).files;
const publicList = listOf( 'public-files.json' );
const sharedList = listOf( 'shared-files.json' );
const publicSet = new Set( [ '/index.html', ...publicList ] );
const sharedSet = new Set( sharedList );

const html = read( 'index.html' );
const importMap = JSON.parse( /<script type="importmap">([\s\S]*?)<\/script>/.exec( html )[ 1 ] ).imports;

/** Every file under site/, as a root-relative path. */
function siteFiles( dir = SITE, prefix = '' ) {
	const files = [];
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		const rel = prefix + '/' + entry.name;
		if ( entry.isDirectory() ) {
			files.push( ...siteFiles( path.join( dir, entry.name ), rel ) );
		} else {
			files.push( rel );
		}
	}
	return files;
}

/** Static `import … from`, `import '…'` and `export … from` specifiers of a module's source. */
function staticSpecifiers( source ) {
	const specs = [];
	for ( const [ , spec ] of source.matchAll( /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?['"]([^'"\n]+)['"]/g ) ) {
		specs.push( spec );
	}
	return specs;
}

function resolveSpecifier( spec, from ) {
	if ( Object.hasOwn( importMap, spec ) ) {
		return importMap[ spec ];
	}
	assert.ok( spec.startsWith( '/' ) || spec.startsWith( './' ) || spec.startsWith( '../' ), `unmapped bare specifier ${ spec } in ${ from }` );
	return new URL( spec, 'http://site' + from ).pathname;
}

const isModule = ( file ) => file.endsWith( '.js' ) && file !== VENDOR;

/** The static import edges of a module. */
const edgesOf = ( file ) => staticSpecifiers( read( file ) ).map( ( spec ) => resolveSpecifier( spec, file ) );

/** Every file statically reached from `start`, with the edges walked. */
function walk( start ) {
	const reached = new Set();
	const queue = [ start ];
	while ( queue.length > 0 ) {
		const file = queue.shift();
		if ( reached.has( file ) ) {
			continue;
		}
		reached.add( file );
		assert.ok( fs.existsSync( path.join( SITE, file ) ), `${ file } exists` );
		if ( isModule( file ) ) {
			queue.push( ...edgesOf( file ) );
		}
	}
	return reached;
}

const tierOf = ( file ) => classifyStatic( file, publicSet, sharedSet );

// The contract files, imported: they are plain objects without imports.
const contractFiles = siteFiles().filter( ( file ) => file.startsWith( '/contracts/' ) );
const contracts = new Map();
for ( const file of contractFiles ) {
	const module = await import( pathToFileURL( path.join( SITE, file ) ).href );
	contracts.set( file, module.default );
}
const pageIds = new Set( [ ...contracts.values() ].filter( ( contract ) => contract.page === true ).map( ( contract ) => contract.id ) );

/** The contract id a page-tier file belongs to. */
const pageOf = ( file ) => tierOf( file ).contractId;

test( 'the lists exist, have no duplicates and name existing regular files (not links)', () => {
	for ( const [ name, list ] of [ [ 'public', publicList ], [ 'shared', sharedList ] ] ) {
		assert.ok( list.length > 0, name );
		assert.equal( new Set( list ).size, list.length, `${ name } has no duplicates` );
		for ( const file of list ) {
			const stat = fs.lstatSync( path.join( SITE, file ), { throwIfNoEntry: false } );
			assert.ok( stat?.isFile(), `${ file } on the ${ name } list is a regular file` );
		}
	}
	for ( const file of sharedList ) {
		assert.ok( ! publicSet.has( file ), `${ file } is on both lists` );
	}
} );

test( 'there is at least one page contract, and General Settings is one', () => {
	assert.ok( pageIds.has( 'core/options-general' ) );
	for ( const [ file, contract ] of contracts ) {
		assert.equal( '/contracts/' + contract.id + '.js', file, `${ file } declares its own id` );
		assert.ok( contract.page === undefined || typeof contract.page === 'boolean', `${ file }: page is a boolean` );
	}
} );

test( 'the settings form every settings screen imports is shared, not a page\'s', () => {
	for ( const file of [ '/components/core/settings-form/state.js', '/components/core/settings-form/use-settings-form.js', '/components/core/settings-form/legacy-fields.js' ] ) {
		assert.ok( sharedSet.has( file ), `${ file } is shared` );
		assert.equal( tierOf( file ).tier, 'shared', file );
	}
	assert.ok( ! fs.existsSync( path.join( SITE, 'components/core/options-general/legacy-fields.js' ) ), 'The legacy fields left the General Settings directory.' );
} );

test( 'everything the protected entry statically imports, and every stylesheet it inserts, is shared or public', () => {
	const reached = walk( PROTECTED_ENTRY );
	assert.ok( reached.has( '/runtime/PageHost.js' ), 'sanity: the walk follows imports' );
	for ( const file of reached ) {
		assert.ok( sharedSet.has( file ) || publicSet.has( file ), `${ file } is loaded by every signed-in user but is on neither list` );
	}
	const stylesheets = /export const STYLESHEETS = \[([^\]]*)\]/.exec( read( 'runtime/protected.js' ) );
	assert.ok( stylesheets, 'STYLESHEETS found' );
	const hrefs = [ ...stylesheets[ 1 ].matchAll( /'([^']+)'/g ) ].map( ( m ) => m[ 1 ] );
	assert.ok( hrefs.length >= 2 );
	for ( const href of hrefs ) {
		assert.ok( sharedSet.has( href ), `${ href } is inserted for every signed-in user but is not shared` );
	}
} );

test( 'every file under site/ is in exactly one tier, and every page-tier file belongs to a page contract', () => {
	const errors = [];
	for ( const file of siteFiles() ) {
		if ( LIST_FILES.includes( file ) ) {
			// Read by the proxy and never served: on no list.
			if ( publicSet.has( file ) || sharedSet.has( file ) ) {
				errors.push( `${ file } is a list file and must not be listed` );
			}
			continue;
		}
		const tier = tierOf( file );
		const tiers = [ publicSet.has( file ), sharedSet.has( file ), tier.tier === 'page' && tier.contractId !== undefined ].filter( Boolean ).length;
		if ( tiers !== 1 ) {
			errors.push( `${ file } is in ${ tiers } tiers (list it as public or shared, or put it under /contracts/ or /components/)` );
		} else if ( tier.tier === 'page' && ! pageIds.has( pageOf( file ) ) ) {
			errors.push( `${ file } is a page file of no page contract (list it as shared, or mark its contract page: true)` );
		}
	}
	assert.deepEqual( errors, [] );
} );

test( 'no page contract or implementation file is shared, and no shared contract is a page', () => {
	for ( const id of pageIds ) {
		const files = [ `/contracts/${ id }.js`, `/components/${ id }.js` ];
		const dir = path.join( SITE, 'components', id );
		if ( fs.existsSync( dir ) ) {
			files.push( ...siteFiles( dir, `/components/${ id }` ) );
		}
		assert.ok( fs.existsSync( path.join( SITE, files[ 1 ] ) ), `${ id } has an implementation` );
		for ( const file of files ) {
			assert.ok( ! sharedSet.has( file ) && ! publicSet.has( file ), `${ file } belongs to the page ${ id } but is listed` );
			assert.equal( tierOf( file ).tier, 'page', file );
			assert.equal( pageOf( file ), id, `${ file } is served by the rule of ${ id }` );
		}
	}
	for ( const file of sharedList.filter( ( f ) => f.startsWith( '/contracts/' ) ) ) {
		assert.notEqual( contracts.get( file )?.page, true, `${ file } is a page contract on the shared list` );
	}
} );

test( 'no shared or public file statically imports a page file, and no page imports another page\'s files', () => {
	const errors = [];
	for ( const file of siteFiles().filter( isModule ) ) {
		const from = tierOf( file );
		for ( const to of edgesOf( file ) ) {
			const target = tierOf( to );
			if ( target.tier !== 'page' ) {
				continue;
			}
			if ( from.tier !== 'page' ) {
				errors.push( `${ file } (${ from.tier }) imports the page file ${ to }: users without that page could not load it` );
			} else if ( pageOf( file ) !== pageOf( to ) ) {
				errors.push( `${ file } imports ${ to }, a file of another page` );
			}
		}
	}
	assert.deepEqual( errors, [] );
} );

test( 'contract files are exactly two segments deep, and no contract id is a directory of another', () => {
	const ids = [ ...contracts.values() ].map( ( contract ) => contract.id );
	for ( const file of contractFiles ) {
		assert.equal( file.split( '/' ).length, 4, `${ file } is /contracts/<namespace>/<name>.js` );
		assert.ok( file.endsWith( '.js' ), file );
	}
	for ( const id of ids ) {
		assert.ok( COMPONENT_ID.test( id ), `${ id } is <namespace>/<name>` );
	}
	for ( const id of pageIds ) {
		assert.equal( id.split( '/' ).length, 2, id );
	}
	// Ids of shared component files too (menu-item, notice-item, …), not only of contracts.
	const componentIds = sharedList.filter( ( f ) => f.startsWith( '/components/' ) ).map( ( f ) => f.slice( '/components/'.length ).replace( /\.js$/, '' ) );
	for ( const id of pageIds ) {
		for ( const other of [ ...ids, ...componentIds ] ) {
			assert.ok( ! other.startsWith( id + '/' ), `${ other } lies below the page ${ id }` );
			assert.ok( ! id.startsWith( other + '/' ), `the page ${ id } lies below ${ other }` );
		}
	}
} );

test( 'the walk and the tiers themselves behave (sanity)', () => {
	assert.equal( tierOf( '/runtime/protected.js' ).tier, 'shared' );
	assert.equal( tierOf( '/runtime/app.js' ).tier, 'public' );
	assert.equal( pageOf( '/components/core/options-general/timezone.js' ), 'core/options-general' );
	assert.equal( tierOf( '/public-files.json' ).contractId, undefined );
	assert.deepEqual( staticSpecifiers( "import a from './a.js';\nexport * from 'vue';" ), [ './a.js', 'vue' ] );
} );
