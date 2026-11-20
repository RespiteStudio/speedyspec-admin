import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';


const Vue = await import( '../site/vendor/vue.esm-browser.prod.js' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { SlotOutlet } = await import( '../site/runtime/slots.js' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { createNodeOps, flush } = await import( './helpers/dom.mjs' );

const { h, createRenderer, defineComponent } = Vue;
let seq = 0;
const mounted = [];
afterEach( () => {
	while ( mounted.length ) {
		mounted.pop().unmount();
	}
} );
globalThis.__modules = {};

const contractFor = ( id, version = '1.0', slots = {} ) => ( { id, version, props: {}, slots, emits: [] } );
const Text = ( label ) => defineComponent( { name: 'T' + label, render: () => h( 'span', label ) } );
const Boom = defineComponent( { name: 'Boom', render() { throw new Error( 'render failed' ); } } );

/** Registers core/<name> with the given default implementation; returns the id. */
function coreContract( impl, slots = {} ) {
	const name = 'c' + seq++;
	const id = 'core/' + name;
	globalThis.__modules[ '/contracts/' + id + '.js' ] = { default: contractFor( id, '1.2', slots ) };
	globalThis.__modules[ '/components/' + id + '.js' ] = { default: impl };
	return id;
}

function replacementModule( specifier, component, id, version ) {
	const url = '/m/' + specifier + '.js';
	globalThis.__modules[ url ] = { default: component, implementsContract: id ? { id, version } : undefined };
	loader.applyImportMap( { [ specifier ]: url } );
	return specifier;
}

function mount( root, { notices = null, provide = {} } = {} ) {
	const { ops, text } = createNodeOps();
	const container = ops.createElement( 'div' );
	const { createApp } = createRenderer( ops );
	const app = createApp( { render: () => ( typeof root === 'function' ? root() : root ) } );
	app.provide( 'notices', notices );
	for ( const [ k, v ] of Object.entries( provide ) ) {
		app.provide( k, v );
	}
	app.config.errorHandler = ( error ) => { throw error; };
	app.mount( container );
	mounted.push( app );
	return { text: () => text( container ), app };
}

function capture( t ) {
	const notices = [];
	const warnings = [];
	t.mock.method( console, 'warn', ( ...a ) => warnings.push( a.map( String ).join( ' ' ) ) );
	return { notices, warnings, service: { add: ( n ) => notices.push( n ) } };
}

test( 'compatible replacement is rendered', async ( t ) => {
	const c = capture( t );
	const id = coreContract( Text( 'default' ) );
	contracts.configure( { replacements: { [ id ]: { module: replacementModule( 'r' + seq++, Text( 'replacement' ), id, '1.0' ) } }, slots: {} } );
	const view = mount( () => h( Contracted, { id } ), { notices: c.service } );
	assert.equal( view.text(), '' ); // Renders nothing while resolving.
	await flush();
	assert.equal( view.text(), 'replacement' );
	assert.equal( c.notices.length, 0 );
} );

test( 'incompatible and load-failed replacements render the default and raise one notice', async ( t ) => {
	const c = capture( t );
	const id = coreContract( Text( 'default' ) );
	contracts.configure( { replacements: { [ id ]: { module: replacementModule( 'r' + seq++, Text( 'x' ), id, '9.0' ) } }, slots: {} } );
	const view = mount( () => h( Contracted, { id } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'default' );
	assert.equal( c.notices.length, 1 );

	const id2 = coreContract( Text( 'default2' ) );
	loader.applyImportMap( { ['gone' + seq]: '/m/nonexistent.js' } );
	contracts.configure( { replacements: { [ id2 ]: { module: 'gone' + seq } }, slots: {} } );
	const view2 = mount( () => h( Contracted, { id: id2 } ), { notices: c.service } );
	await flush();
	assert.equal( view2.text(), 'default2' );
	assert.equal( c.notices.length, 2 );
} );

test( 'a replacement that throws during render falls back to the default with a notice', async ( t ) => {
	const c = capture( t );
	const id = coreContract( Text( 'default' ) );
	contracts.configure( { replacements: { [ id ]: { module: replacementModule( 'r' + seq++, Boom, id, '1.1' ) } }, slots: {} } );
	const view = mount( () => h( Contracted, { id } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'default' );
	assert.equal( c.notices.length, 1 );
} );

test( 'a default that throws shows the failure message and no exception escapes', async ( t ) => {
	const c = capture( t );
	const id = coreContract( Boom );
	contracts.configure( { replacements: {}, slots: {} } );
	const view = mount( () => h( Contracted, { id } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'This screen could not be displayed.' );
} );

test( 'a contract that cannot be resolved warns, raises a notice and shows the failure message', async ( t ) => {
	const c = capture( t );
	contracts.configure( { replacements: {}, slots: {} } );
	const view = mount( () => h( Contracted, { id: 'core/missing-' + seq++ } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'This screen could not be displayed.' );
	assert.equal( c.notices.length, 1 );
	assert.ok( c.warnings.some( ( w ) => w.includes( 'core/missing-' ) ) );
} );

test( 'notices fall back to console.warn when none is injected', async ( t ) => {
	const c = capture( t );
	const id = coreContract( Text( 'default' ) );
	contracts.configure( { replacements: { [ id ]: { module: replacementModule( 'r' + seq++, Boom, id, '1.0' ) } }, slots: {} } );
	mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( c.warnings.length, 1 );
} );

test( 'attributes and slots pass through to the implementation', async () => {
	const Impl = defineComponent( { props: [ 'label' ], render() { return h( 'p', [ this.label, this.$slots.default?.() ] ); } } );
	const id = coreContract( Impl );
	contracts.configure( { replacements: {}, slots: {} } );
	const view = mount( () => h( Contracted, { id, label: 'L:' }, { default: () => 'child' } ) );
	await flush();
	assert.equal( view.text(), 'L:child' );
} );

test( 'with `contract`, the contract id comes from it and `id` passes through as a prop of the implementation', async () => {
	const Impl = defineComponent( { props: [ 'id', 'label' ], render() { return h( 'p', [ this.id + ':' + this.label, this.$slots.default?.() ] ); } } );
	const slotted = defineComponent( { setup: () => () => h( SlotOutlet, { name: 'after' } ) } );
	const contract = coreContract( defineComponent( { props: [ 'id' ], render: () => [ h( Impl, { id: 'blogname', label: 'Site Title' } ), h( slotted ) ] } ), { after: { props: {} } } );
	const slotModule = replacementModule( 's' + seq++, Text( 'slot' ) );
	contracts.configure( { replacements: {}, slots: { [ contract ]: { after: [ { module: slotModule } ] } } } );
	const field = coreContract( Impl );
	const view = mount( () => [ h( Contracted, { contract: field, id: 'blogname', label: 'Site Title' }, { default: () => '!' } ), h( Contracted, { contract } ) ] );
	await flush();
	assert.equal( view.text(), 'blogname:Site Title!blogname:Site Titleslot', 'the field is rendered; SlotOutlet sees the contract id' );
} );

test( 'with `contract`, a replacement that throws falls back to the default, which still gets `id`', async ( t ) => {
	const c = capture( t );
	const Impl = defineComponent( { props: [ 'id' ], render() { return h( 'p', 'default:' + this.id ); } } );
	const contract = coreContract( Impl );
	contracts.configure( { replacements: { [ contract ]: { module: replacementModule( 'r' + seq++, Boom, contract, '1.2' ) } }, slots: {} } );
	const view = mount( () => h( Contracted, { contract, id: 'blogname' } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'default:blogname' );
	assert.equal( c.notices.length, 1 );
} );

test( 'without `id` or `contract`, Contracted warns', async ( t ) => {
	const c = capture( t );
	mount( () => h( Contracted, {} ), { notices: c.service } );
	await flush();
	assert.ok( c.warnings.some( ( w ) => w.includes( 'Contracted needs an `id` or a `contract`.' ) ) );
} );

test( 'changing id re-resolves', async () => {
	const a = coreContract( Text( 'A' ) );
	const b = coreContract( Text( 'B' ) );
	contracts.configure( { replacements: {}, slots: {} } );
	const current = Vue.ref( a );
	const view = mount( () => h( Contracted, { id: current.value } ) );
	await flush();
	assert.equal( view.text(), 'A' );
	current.value = b;
	await flush();
	assert.equal( view.text(), 'B' );
} );

test( 'calling contracts.configure re-resolves', async () => {
	const id = coreContract( Text( 'default' ) );
	contracts.configure( { replacements: {}, slots: {} } );
	const view = mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( view.text(), 'default' );
	contracts.configure( { replacements: { [ id ]: { module: replacementModule( 'r' + seq++, Text( 'late' ), id, '1.0' ) } }, slots: {} } );
	await flush();
	assert.equal( view.text(), 'late' );
} );

function slotted( slotsDeclared, entries, outletName = 'row', context = {} ) {
	const Impl = defineComponent( { render: () => h( 'div', [ h( 'b', 'start|' ), h( SlotOutlet, { name: outletName, context } ), h( 'b', '|end' ) ] ) } );
	const id = coreContract( Impl, slotsDeclared );
	contracts.configure( { replacements: {}, slots: { [ id ]: entries } } );
	return id;
}

test( 'slot entries render in priority order and receive the context as props', async () => {
	const Show = defineComponent( { props: [ 'row' ], render() { return h( 'i', 'x' + this.row ); } } );
	const first = replacementModule( 's' + seq++, Show );
	const second = replacementModule( 's' + seq++, Text( 'two' ) );
	const id = slotted( { row: { props: {} } }, { row: [ { module: second, priority: 20 }, { module: first, priority: 1 } ] }, 'row', { row: 7 } );
	const view = mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( view.text(), 'start|x7two|end' );
} );

test( 'a slot entry that fails to load or throws does not stop the others', async ( t ) => {
	const c = capture( t );
	loader.applyImportMap( { ['missing' + seq]: '/m/missing-slot.js' } );
	const missing = 'missing' + seq;
	const throwing = replacementModule( 's' + seq++, Boom );
	const good = replacementModule( 's' + seq++, Text( 'good' ) );
	const id = slotted( { row: { props: {} } }, { row: [ { module: missing, priority: 1 }, { module: throwing, priority: 2 }, { module: good, priority: 3 } ] } );
	const view = mount( () => h( Contracted, { id } ), { notices: c.service } );
	await flush();
	assert.equal( view.text(), 'start|good|end' );
	assert.equal( c.notices.length, 2 );
} );

test( 'the same module listed twice in a slot renders twice', async () => {
	const m = replacementModule( 's' + seq++, Text( 'dup' ) );
	const id = slotted( { row: { props: {} } }, { row: [ { module: m, priority: 1 }, { module: m, priority: 1 } ] } );
	const view = mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( view.text(), 'start|dupdup|end' );
} );

test( 'an undeclared slot name renders nothing and warns once', async ( t ) => {
	const c = capture( t );
	const m = replacementModule( 's' + seq++, Text( 'never' ) );
	const id = slotted( { row: { props: {} } }, { nope: [ { module: m } ] }, 'nope' );
	const view = mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( view.text(), 'start||end' );
	const again = mount( () => h( Contracted, { id } ) );
	await flush();
	assert.equal( again.text(), 'start||end' );
	assert.equal( c.warnings.filter( ( w ) => w.includes( 'does not declare slot' ) ).length, 1 );
} );

test( 'SlotOutlet outside a Contracted renders nothing', async () => {
	const view = mount( () => h( SlotOutlet, { name: 'row' } ) );
	await flush();
	assert.equal( view.text(), '' );
} );
