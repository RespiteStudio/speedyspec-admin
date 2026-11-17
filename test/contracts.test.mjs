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
	contracts.configure( { replacements: {}, slots: {} } );
	off();
	contracts.configure( { replacements: {}, slots: {} } );
	assert.equal( n, 1 );
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
