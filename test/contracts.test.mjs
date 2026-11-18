import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../site/runtime/loader.js';
import { createContracts, isCompatible, orderEntries, renderErrorAction } from '../site/runtime/contracts.js';

const Default = { name: 'Default' };
const contractFile = ( over = {} ) => ( { default: { id: 'core/list-table', version: '1.2', props: {}, slots: { 'row-actions': { props: {} } }, emits: [], ...over } } );

function setup( extra = {} ) {
	const modules = {
		'/contracts/core/list-table.js': contractFile(),
		'/components/core/list-table.js': { default: Default },
		...extra,
	};
	const importFn = async ( url ) => {
		if ( ! ( url in modules ) ) {
			throw new Error( 'cannot load ' + url );
		}
		return modules[ url ];
	};
	const loader = createLoader( { importFn } );
	const contracts = createContracts( { loader, importFn } );
	return { contracts, loader, modules };
}

function quiet( t ) {
	const warnings = [];
	t.mock.method( console, 'warn', ( ...a ) => warnings.push( a.join( ' ' ) ) );
	return warnings;
}

test( 'core contract resolves to static default when nothing is registered', async () => {
	const { contracts } = setup();
	const r = await contracts.resolve( 'core/list-table' );
	assert.equal( r.contract.id, 'core/list-table' );
	assert.equal( r.component, Default );
	assert.equal( r.defaultComponent, Default );
	assert.equal( r.replaced, false );
	assert.equal( r.fallbackReason, null );
} );

test( 'replacement with same major version is used', async () => {
	const Repl = { name: 'Repl' };
	const { contracts, loader } = setup( { '/p/r.js': { default: Repl, implementsContract: { id: 'core/list-table', version: '1.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r', implements: '1.0', priority: 10 } }, slots: {} } );
	const r = await contracts.resolve( 'core/list-table' );
	assert.equal( r.replaced, true );
	assert.equal( r.component, Repl );
	assert.equal( r.defaultComponent, Default );
	assert.equal( r.fallbackReason, null );
} );

test( 'replacement with different major falls back with reason incompatible', async () => {
	const { contracts, loader } = setup( { '/p/r.js': { default: {}, implementsContract: { id: 'core/list-table', version: '2.0.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r' } }, slots: {} } );
	const r = await contracts.resolve( 'core/list-table' );
	assert.equal( r.replaced, false );
	assert.equal( r.component, Default );
	assert.equal( r.fallbackReason, 'incompatible' );
} );

test( 'replacement implementing another contract id is incompatible', async () => {
	const { contracts, loader } = setup( { '/p/r.js': { default: {}, implementsContract: { id: 'core/other', version: '1.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r' } }, slots: {} } );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
} );

test( 'replacement without implementsContract is incompatible', async () => {
	const { contracts, loader } = setup( { '/p/r.js': { default: {} } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r' } }, slots: {} } );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
} );

test( 'replacement that fails to load falls back with reason load-failed', async () => {
	const { contracts, loader } = setup();
	loader.applyImportMap( { 'plug/missing': '/p/missing.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/missing' } }, slots: {} } );
	const r = await contracts.resolve( 'core/list-table' );
	assert.equal( r.component, Default );
	assert.equal( r.fallbackReason, 'load-failed' );
	assert.equal( r.replaced, false );
} );

test( 'version compatibility edge cases', () => {
	const c = ( version ) => ( { id: 'a/b', version } );
	assert.equal( isCompatible( c( '1' ), c( '1.0.0' ) ), true );
	assert.equal( isCompatible( c( '1.0' ), c( '1.9.3' ) ), true );
	assert.equal( isCompatible( c( '1.2.3' ), c( '1' ) ), true );
	assert.equal( isCompatible( c( '1.0' ), c( '2.0' ) ), false );
	assert.equal( isCompatible( c( '10.0' ), c( '1.0' ) ), false );
	assert.equal( isCompatible( c( '1.0' ), c( '' ) ), false );
	assert.equal( isCompatible( c( '1.0' ), c( 'x.1' ) ), false );
	assert.equal( isCompatible( c( 'x' ), c( 'x' ) ), false );
	assert.equal( isCompatible( c( '1.0' ), { id: 'a/b' } ), false );
	assert.equal( isCompatible( c( '1.0' ), { id: 'a/c', version: '1.0' } ), false );
	assert.equal( isCompatible( c( '1.0' ), null ), false );
	assert.equal( isCompatible( c( '1.0' ), { id: 'a/b', version: 1 } ), true );
} );

test( 'non-core contract resolves from the page module; missing named export is synthesized with a warning', async ( t ) => {
	const warnings = quiet( t );
	const Page = { name: 'Page' };
	const { contracts, loader } = setup( {
		'/p/page.js': { default: Page, contract: { id: 'acme/page', version: '3.1', props: {}, slots: {}, emits: [] } },
		'/p/bare.js': { default: Page },
	} );
	loader.applyImportMap( { 'acme/page': '/p/page.js', 'acme/bare': '/p/bare.js' } );
	const r = await contracts.resolve( 'acme/page', { module: 'acme/page' } );
	assert.equal( r.component, Page );
	assert.equal( r.contract.version, '3.1' );
	const b = await contracts.resolve( 'acme/bare', { module: 'acme/bare' } );
	assert.deepEqual( b.contract, { id: 'acme/bare', version: '0.0.0', props: {}, slots: {}, emits: [] } );
	assert.equal( warnings.length, 1 );
} );

test( 'a non-core id without a module, or a malformed core id, rejects', async () => {
	const { contracts } = setup();
	await assert.rejects( contracts.resolve( 'acme/page' ) );
	await assert.rejects( contracts.resolve( 'core/../server' ) );
	await assert.rejects( contracts.resolve( 'core/missing' ) );
} );

test( 'undeclared slot name yields no entries and warns once', async ( t ) => {
	const warnings = quiet( t );
	const { contracts } = setup();
	contracts.configure( { replacements: {}, slots: { 'core/list-table': { nope: [ { module: 'x', priority: 1 } ] } } } );
	await contracts.resolve( 'core/list-table' );
	assert.deepEqual( contracts.slotEntries( 'core/list-table', 'nope' ), [] );
	assert.deepEqual( contracts.slotEntries( 'core/list-table', 'nope' ), [] );
	assert.equal( warnings.length, 1 );
} );

test( 'slotEntries orders by priority then given order and ignores other slots', async () => {
	const { contracts } = setup();
	contracts.configure( { replacements: {}, slots: { 'core/list-table': {
		'row-actions': [
			{ module: 'c', priority: 20 },
			{ module: 'a', priority: 5 },
			{ module: 'b', priority: 5 },
			{ module: 'd' },
		],
	} } } );
	await contracts.resolve( 'core/list-table' );
	assert.deepEqual( contracts.slotEntries( 'core/list-table', 'row-actions' ).map( ( e ) => e.module ), [ 'a', 'b', 'd', 'c' ] );
	assert.deepEqual( contracts.slotEntries( 'core/list-table', 'declared-but-empty' ), [] );
} );

test( 'orderEntries is stable and does not mutate its input', () => {
	const input = [ { module: 'x', priority: 1 }, { module: 'y', priority: 1 }, { module: 'z', priority: 0 } ];
	assert.deepEqual( orderEntries( input ).map( ( e ) => e.module ), [ 'z', 'x', 'y' ] );
	assert.equal( input[ 0 ].module, 'x' );
	assert.deepEqual( orderEntries( undefined ), [] );
} );

test( 'configure notifies subscribers, which can unsubscribe', () => {
	const { contracts } = setup();
	let n = 0;
	const off = contracts.onChange( () => { n++; } );
	contracts.configure( { replacements: {}, slots: { 'core/list-table': { 'row-actions': [ { module: 'a', priority: 1 } ] } } } );
	off();
	contracts.configure( { replacements: {}, slots: {} } );
	assert.equal( n, 1 );
} );

test( 'configure does not notify subscribers when the configuration is unchanged', () => {
	const { contracts } = setup();
	let n = 0;
	contracts.onChange( () => { n++; } );
	contracts.configure( { replacements: {}, slots: {} } );
	assert.equal( n, 0, 'same as the initial empty configuration' );
	contracts.configure( { replacements: { 'core/x': { module: 'm', implements: '1.0', priority: 10 } }, slots: {} } );
	contracts.configure( { slots: {}, replacements: { 'core/x': { priority: 10, implements: '1.0', module: 'm' } } } );
	assert.equal( n, 1, 'key order does not matter' );
	contracts.configure( { replacements: { 'core/x': { module: 'm', implements: '2.0', priority: 10 } }, slots: {} } );
	assert.equal( n, 2 );
} );

test( 'a failed replacement is not loaded or reported again until its configuration changes', async () => {
	let imports = 0;
	const { contracts, loader, modules } = setup();
	Object.defineProperty( modules, '/p/r.js', { enumerable: true, get: () => {
		imports++;
		return { default: { name: 'R' }, implementsContract: { id: 'core/list-table', version: '9.0' } };
	} } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	const config = ( module, version ) => ( { replacements: { 'core/list-table': { module, implements: version, priority: 10 } }, slots: {} } );
	contracts.configure( config( 'plug/r', '9.0' ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	const again = await contracts.resolve( 'core/list-table' );
	assert.equal( again.fallbackReason, null );
	assert.equal( again.component, Default );
	assert.equal( imports, 1 );
	// A different declared version is a different configuration: tried again.
	contracts.configure( config( 'plug/r', '9.1' ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
} );

/** Counts loader.loadModule() calls per specifier (what "trying a replacement" costs). */
function countLoads( loader ) {
	const loads = {};
	const original = loader.loadModule;
	loader.loadModule = ( specifier ) => {
		loads[ specifier ] = ( loads[ specifier ] ?? 0 ) + 1;
		return original( specifier );
	};
	return loads;
}

const replacing = ( entries, slots = {} ) => ( { replacements: Object.fromEntries( entries.map( ( [ id, module, version ] ) => [ id, { module, implements: version, priority: 10 } ] ) ), slots } );

test( 'a failed replacement that is removed and added back is tried again', async () => {
	const { contracts, loader } = setup( { '/p/r.js': { default: { name: 'R' }, implementsContract: { id: 'core/list-table', version: '9.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	const loads = countLoads( loader );
	contracts.configure( replacing( [ [ 'core/list-table', 'plug/r', '9.0' ] ] ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	contracts.configure( replacing( [] ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, null );
	contracts.configure( replacing( [ [ 'core/list-table', 'plug/r', '9.0' ] ] ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	assert.equal( loads[ 'plug/r' ], 2 );
} );

test( 'a removed replacement is forgotten also when nothing resolves while it is gone', async () => {
	const { contracts, loader } = setup( { '/p/r.js': { default: { name: 'R' }, implementsContract: { id: 'core/list-table', version: '9.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js' } );
	const loads = countLoads( loader );
	contracts.configure( replacing( [ [ 'core/list-table', 'plug/r', '9.0' ] ] ) );
	await contracts.resolve( 'core/list-table' );
	contracts.configure( replacing( [] ) );
	contracts.configure( replacing( [ [ 'core/list-table', 'plug/r', '9.0' ] ] ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	assert.equal( loads[ 'plug/r' ], 2 );
} );

test( 'a load failure is retried at the next real configuration change; an incompatible one is not', async () => {
	const modules = {
		'/contracts/core/other.js': { default: { id: 'core/other', version: '1.0', props: {}, slots: {}, emits: [] } },
		'/components/core/other.js': { default: { name: 'Other' } },
		'/p/incompatible.js': { default: { name: 'I' }, implementsContract: { id: 'core/other', version: '9.0' } },
	};
	const { contracts, loader } = setup( modules );
	loader.applyImportMap( { 'plug/missing': '/p/missing.js', 'plug/incompatible': '/p/incompatible.js' } );
	const loads = countLoads( loader );
	const config = ( slots ) => replacing( [ [ 'core/list-table', 'plug/missing', '1.0' ], [ 'core/other', 'plug/incompatible', '9.0' ] ], slots );

	contracts.configure( config() );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'load-failed' );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, 'incompatible' );

	// An identical configuration (every navigation): both stay set aside.
	contracts.configure( config() );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, null );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, null );
	assert.deepEqual( loads, { 'plug/missing': 1, 'plug/incompatible': 1 } );

	// An unrelated change: the load failure gets another attempt, the incompatible module does not.
	contracts.configure( config( { 'core/elsewhere': { s: [ { module: 'x' } ] } } ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'load-failed' );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, null );
	assert.deepEqual( loads, { 'plug/missing': 2, 'plug/incompatible': 1 } );

	// Retried once only: identical again.
	contracts.configure( config( { 'core/elsewhere': { s: [ { module: 'x' } ] } } ) );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, null );
	assert.equal( loads[ 'plug/missing' ], 2 );
} );

test( 'failed replacements of two contracts are remembered independently', async () => {
	const modules = {
		'/contracts/core/other.js': { default: { id: 'core/other', version: '1.0', props: {}, slots: {}, emits: [] } },
		'/components/core/other.js': { default: { name: 'Other' } },
		'/p/a.js': { default: { name: 'A' }, implementsContract: { id: 'core/list-table', version: '9.0' } },
		'/p/b.js': { default: { name: 'B' }, implementsContract: { id: 'core/other', version: '9.0' } },
	};
	const { contracts, loader } = setup( modules );
	loader.applyImportMap( { 'plug/a': '/p/a.js', 'plug/b': '/p/b.js' } );
	const loads = countLoads( loader );
	const both = replacing( [ [ 'core/list-table', 'plug/a', '9.0' ], [ 'core/other', 'plug/b', '9.0' ] ] );
	contracts.configure( both );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, 'incompatible' );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, null );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, null );

	// Removing one forgets only that one.
	contracts.configure( replacing( [ [ 'core/other', 'plug/b', '9.0' ] ] ) );
	contracts.configure( both );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).fallbackReason, 'incompatible' );
	assert.equal( ( await contracts.resolve( 'core/other' ) ).fallbackReason, null );
	assert.deepEqual( loads, { 'plug/a': 2, 'plug/b': 1 } );
} );

test( 'markFailed sets aside the configured replacement until it changes', async () => {
	const Repl = { name: 'Repl' };
	const { contracts, loader } = setup( { '/p/r.js': { default: Repl, implementsContract: { id: 'core/list-table', version: '1.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js', 'plug/s': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r', implements: '1.0' } }, slots: {} } );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).component, Repl );
	contracts.markFailed( 'core/list-table' );
	const set = await contracts.resolve( 'core/list-table' );
	assert.equal( set.component, Default );
	assert.equal( set.fallbackReason, null );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/s', implements: '1.0' } }, slots: {} } );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).component, Repl );
} );

test( 'a core contract whose file is a 404 is reported as not found; other failures are not', async () => {
	const { modules } = setup();
	const notFound = Object.assign( new Error( 'gone' ), { status: 404 } );
	const broken = new SyntaxError( 'Unexpected token' );
	const importFn = async ( url ) => {
		if ( url === '/contracts/core/gone.js' ) {
			throw notFound;
		}
		if ( url === '/contracts/core/broken.js' ) {
			throw broken;
		}
		return modules[ url ] ?? { default: {} };
	};
	const c = createContracts( { loader: createLoader( { importFn } ), importFn } );
	await assert.rejects( c.resolve( 'core/gone' ), ( e ) => e.code === 'contract_not_found' );
	await assert.rejects( c.resolve( 'core/broken' ), ( e ) => e === broken );
} );

test( 'a core contract whose contract or implementation file is refused with 403 is reported as forbidden', async () => {
	const { modules } = setup();
	const refused = () => Object.assign( new Error( 'refused' ), { status: 403, code: 'admin_forbidden' } );
	const notFound = () => Object.assign( new Error( 'gone' ), { status: 404 } );
	const importFn = async ( url ) => {
		if ( [ '/contracts/core/page-a.js', '/components/core/page-a.js', '/components/core/page-b.js', '/contracts/core/page-c.js' ].includes( url ) ) {
			throw refused();
		}
		if ( url === '/components/core/page-c.js' ) {
			throw notFound();
		}
		return modules[ url ] ?? { default: {} };
	};
	const c = createContracts( { loader: createLoader( { importFn } ), importFn } );
	for ( const id of [ 'core/page-a', 'core/page-b', 'core/page-c' ] ) {
		await assert.rejects( c.resolve( id ), ( e ) => e.code === 'contract_forbidden' && e.status === 403 && e.cause?.status === 403, id );
	}
	// A 404 beside a 403 is still the 403: the user may not load that page at all.
	const both = async ( url ) => {
		throw url.startsWith( '/contracts/' ) ? notFound() : refused();
	};
	await assert.rejects( createContracts( { loader: createLoader( { importFn: both } ), importFn: both } ).resolve( 'core/x' ), ( e ) => e.code === 'contract_forbidden' );
} );

test( 'error boundary decision: replacement falls back once, then shows failure', () => {
	assert.equal( renderErrorAction( { replaced: true, usingDefault: false } ), 'use-default' );
	assert.equal( renderErrorAction( { replaced: true, usingDefault: true } ), 'show-failure' );
	assert.equal( renderErrorAction( { replaced: false, usingDefault: true } ), 'show-failure' );
} );

test( 'server-provided ids such as constructor, __proto__ and toString do not hit Object.prototype', async ( t ) => {
	quiet( t );
	for ( const id of [ 'constructor', '__proto__', 'toString' ] ) {
		const { contracts, loader } = setup( { '/p/c.js': { default: {}, contract: { id, version: '1.0', props: {}, slots: { [ id ]: { props: {} } }, emits: [] } } } );
		loader.applyImportMap( { 'acme/c': '/p/c.js' } );
		contracts.configure( { replacements: {}, slots: {} } );
		const r = await contracts.resolve( id, { module: 'acme/c' } );
		assert.equal( r.fallbackReason, null, id );
		assert.equal( r.replaced, false, id );
		assert.deepEqual( contracts.slotEntries( id, id ), [], id );
		// Own properties of JSON-parsed configuration still work.
		contracts.configure( JSON.parse( '{"replacements":{},"slots":{"' + id + '":{"' + id + '":[{"module":"m","priority":1}]}}}' ) );
		assert.deepEqual( contracts.slotEntries( id, id ).map( ( e ) => e.module ), [ 'm' ], id );
	}
} );

test( 'a page module or core component without a default export rejects, so the failure message shows', async () => {
	const { contracts, loader } = setup( {
		'/p/nodefault.js': { contract: { id: 'acme/nodefault', version: '1.0', props: {}, slots: {}, emits: [] } },
		'/contracts/core/empty.js': { default: { id: 'core/empty', version: '1.0', props: {}, slots: {}, emits: [] } },
		'/components/core/empty.js': {},
	} );
	loader.applyImportMap( { 'acme/nodefault': '/p/nodefault.js' } );
	await assert.rejects( contracts.resolve( 'acme/nodefault', { module: 'acme/nodefault' } ), /no default export/ );
	await assert.rejects( contracts.resolve( 'core/empty' ), /no default export/ );
} );

test( 'markFailed with the key of the resolved replacement never sets aside a newer one', async () => {
	const Repl = { name: 'Repl' };
	const { contracts, loader } = setup( { '/p/r.js': { default: Repl, implementsContract: { id: 'core/list-table', version: '1.0' } } } );
	loader.applyImportMap( { 'plug/r': '/p/r.js', 'plug/s': '/p/r.js' } );
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/r', implements: '1.0' } }, slots: {} } );
	const first = await contracts.resolve( 'core/list-table' );
	assert.equal( typeof first.replacementKey, 'string' );
	// The configuration changes before the old replacement's render error is reported.
	contracts.configure( { replacements: { 'core/list-table': { module: 'plug/s', implements: '1.0' } }, slots: {} } );
	contracts.markFailed( 'core/list-table', first.replacementKey );
	assert.equal( ( await contracts.resolve( 'core/list-table' ) ).component, Repl, 'the new replacement is still tried' );
} );
