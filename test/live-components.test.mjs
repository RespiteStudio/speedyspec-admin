import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';


const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byTag, byClass, hasClass, textOf, Vue } = render;
const { flush } = await import( './helpers/dom.mjs' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { default: PageHost } = await import( '../site/runtime/PageHost.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );

const { h, reactive, shallowRef, defineComponent, inject } = Vue;

globalThis.__modules = {};
for ( const name of [ 'menu', 'notices' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
	delete globalThis.document;
} );

const item = ( path, label, children = [] ) => ( { path, label, icon: '', count: null, children: children.map( ( c ) => ( { path: c, label: c, icon: '', count: null, children: [] } ) ) } );

const topItems = ( view ) => findAll( view.container, ( el ) => el.tag === 'li' && hasClass( el, 'menu-top' ) );
const topLink = ( li ) => li.children.find( ( c ) => c.tag === 'a' );

/** A menu on screen whose items can be replaced, as when the manifest is replaced by a live update. */
async function menuView( initial ) {
	const state = reactive( { items: initial } );
	const view = mount( () => h( Contracted, { id: 'core/menu', items: state.items, current: 'index.php', base: '/wp-admin/' } ) );
	await flush();
	const nav = find( view.container, byTag( 'nav' ) );
	// The fake DOM has no selectors: the first top-level link, as a browser would find it.
	nav.querySelector = () => find( nav, ( el ) => el.tag === 'a' && hasClass( el, 'menu-top' ) );
	return { view, state, nav };
}

/** Pretends the browser's focus is on this rendered element. */
function focusOn( el ) {
	el.getAttribute = ( name ) => el.props[ name ] ?? null;
	globalThis.document = { activeElement: el };
}

test( 'the menu keeps its component and its items when the manifest is replaced', async () => {
	const { view, state, nav } = await menuView( [ item( 'index.php', 'Dashboard' ), item( 'edit.php', 'Posts', [ 'edit.php', 'post-new.php' ] ), item( 'tools.php', 'Tools' ) ] );
	const [ dashboard, posts, tools ] = topItems( view );

	// An open flyout survives an item being added in front of it.
	find( posts, byClass( 'wp-admin-menu-toggle' ) ).props.onClick();
	await flush();
	assert.equal( find( posts, byClass( 'wp-submenu' ) ).props.hidden, false );

	state.items = [ item( 'index.php', 'Dashboard' ), item( 'new.php', 'New' ), item( 'edit.php', 'Posts', [ 'edit.php', 'extra.php', 'post-new.php' ] ), item( 'tools.php', 'Tools' ) ];
	await flush();

	assert.equal( find( view.container, byTag( 'nav' ) ), nav, 'the menu is not mounted again' );
	const after = topItems( view );
	assert.equal( after.length, 4 );
	assert.deepEqual( [ after[ 0 ], after[ 2 ], after[ 3 ] ], [ dashboard, posts, tools ], 'the items that remain are the same elements' );
	assert.equal( textOf( after[ 1 ] ).includes( 'New' ), true, 'the new item is in the right position' );
	assert.equal( find( posts, byClass( 'wp-submenu' ) ).props.hidden, false, 'the open submenu stays open' );
	const children = findAll( posts, ( el ) => el.tag === 'a' && ! hasClass( el, 'menu-top' ) ).map( ( a ) => a.props.href );
	assert.deepEqual( children, [ '/wp-admin/edit.php', '/wp-admin/extra.php', '/wp-admin/post-new.php' ] );

	state.items = [ item( 'index.php', 'Dashboard' ), item( 'tools.php', 'Tools' ) ];
	await flush();
	assert.deepEqual( topItems( view ), [ dashboard, tools ] );
} );

test( 'focus stays on an item that is still there', async () => {
	const { view, state } = await menuView( [ item( 'index.php', 'Dashboard' ), item( 'tools.php', 'Tools' ) ] );
	focusOn( topLink( topItems( view )[ 1 ] ) );
	state.items = [ item( 'new.php', 'New' ), item( 'index.php', 'Dashboard' ), item( 'tools.php', 'Tools' ) ];
	await flush();
	assert.equal( render.focused, null, 'focus is not moved' );
} );

test( 'focus moves to the first item when the focused item is removed', async () => {
	const { view, state } = await menuView( [ item( 'index.php', 'Dashboard' ), item( 'tools.php', 'Tools' ) ] );
	focusOn( topLink( topItems( view )[ 1 ] ) );
	state.items = [ item( 'index.php', 'Dashboard' ) ];
	await flush();
	assert.equal( render.focused, topLink( topItems( view )[ 0 ] ) );
} );

test( 'focus on a submenu link moves to the first item when that link is removed', async () => {
	const { view, state } = await menuView( [ item( 'index.php', 'Dashboard' ), item( 'edit.php', 'Posts', [ 'edit.php', 'post-new.php' ] ) ] );
	const child = findAll( topItems( view )[ 1 ], ( el ) => el.tag === 'a' && ! hasClass( el, 'menu-top' ) )[ 1 ];
	focusOn( child );
	state.items = [ item( 'index.php', 'Dashboard' ), item( 'edit.php', 'Posts', [ 'edit.php' ] ) ];
	await flush();
	assert.equal( render.focused, topLink( topItems( view )[ 0 ] ) );
} );

test( 'focus outside the menu is left alone when the menu changes', async () => {
	const { state } = await menuView( [ item( 'index.php', 'Dashboard' ) ] );
	globalThis.document = { activeElement: { getAttribute: () => null } };
	state.items = [ item( 'other.php', 'Other' ) ];
	await flush();
	assert.equal( render.focused, null );
} );

test( 'a notice with an action shows its button; clicking runs it and dismisses the notice', async () => {
	const notices = createNotices( { reactive } );
	const view = mount( () => h( Contracted, { id: 'core/notices', notices: notices.items, onDismiss: notices.dismiss } ) );
	await flush();
	let ran = 0;
	notices.add( { type: 'warning', message: 'Changed.', action: { label: 'Reload this screen', run: () => ran++ } } );
	notices.add( { type: 'info', message: 'Plain.' } );
	await flush();
	const buttons = findAll( view.container, ( el ) => el.tag === 'button' && ! hasClass( el, 'notice-dismiss' ) );
	assert.equal( buttons.length, 1, 'only the notice with an action has one' );
	assert.equal( textOf( buttons[ 0 ] ), 'Reload this screen' );
	buttons[ 0 ].props.onClick();
	await flush();
	assert.equal( ran, 1 );
	assert.deepEqual( notices.items.map( ( n ) => n.message ), [ 'Plain.' ] );
} );

test( 'an action that is not a label and a function is dropped', () => {
	const notices = createNotices();
	notices.add( { type: 'info', message: 'A.', action: { label: 'Go' } } );
	assert.equal( notices.items[ 0 ].action, undefined );
} );

// Page state ------------------------------------------------------------------------------

test( 'PageHost gives the page pageState; dirty reaches the router and is cleared when the page changes or goes', async () => {
	const router = { dirty: false, setDirty( value ) { this.dirty = value; }, isDirty() { return this.dirty; } };
	let state = null;
	const Page = defineComponent( { setup() { state = inject( 'pageState' ); return () => h( 'p', 'page' ); } } );
	globalThis.__modules[ '/m/dirty.js' ] = { default: Page, contract: { id: 'acme/dirty', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	loader.applyImportMap( { 'acme-dirty': '/m/dirty.js' } );
	const current = shallowRef( { path: 'a.php', title: 'A', component: 'acme/dirty', module: 'acme-dirty', data: {}, textDomains: [] } );
	const view = mount( () => h( PageHost, { page: current.value } ), { provide: { router } } );
	await flush();

	assert.equal( state.isDirty(), false );
	state.setDirty( true );
	assert.equal( router.isDirty(), true );
	assert.equal( state.isDirty(), true );

	current.value = { ...current.value, path: 'b.php' };
	await flush();
	assert.equal( router.isDirty(), false, 'a new page starts clean' );

	state.setDirty( true );
	view.app.unmount();
	assert.equal( router.isDirty(), false, 'and it is cleared when the page goes' );
} );

test( 'PageHost gives the page onAddress: the handler reaches the router, the remover removes it, and a new page or the host going clears it', async () => {
	const router = { handler: null, setDirty() {}, isDirty: () => false, setLeaveWarning() {}, setAddressHandler( handler ) {
		const own = typeof handler === 'function' ? handler : null;
		this.handler = own;
		return () => {
			if ( this.handler === own ) {
				this.handler = null;
			}
		};
	} };
	const told = [];
	let remove = null;
	const Page = defineComponent( { props: [ 'page' ], setup( props ) {
		remove = inject( 'pageState' ).onAddress( ( url ) => told.push( props.page.path + ' ' + url ) );
		return () => h( 'p', 'page' );
	} } );
	globalThis.__modules[ '/m/address.js' ] = { default: Page, contract: { id: 'acme/address', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	loader.applyImportMap( { 'acme-address': '/m/address.js' } );
	const current = shallowRef( { path: 'a.php', title: 'A', component: 'acme/address', module: 'acme-address', data: {}, textDomains: [] } );
	const view = mount( () => h( PageHost, { page: current.value } ), { provide: { router } } );
	await flush();

	router.handler( '/wp-admin/a.php?x=1' );
	remove();
	assert.equal( router.handler, null, 'The remover removes it.' );

	// A new page registers its own; the one before is cleared first.
	current.value = { ...current.value, path: 'b.php' };
	await flush();
	router.handler( '/wp-admin/b.php?y=1' );
	assert.deepEqual( told, [ 'a.php /wp-admin/a.php?x=1', 'b.php /wp-admin/b.php?y=1' ] );

	view.app.unmount();
	assert.equal( router.handler, null, 'And it is cleared when the page goes.' );
} );

test( 'PageHost works without a router: pageState is a no-op', async () => {
	let state = null;
	const Page = defineComponent( { setup() { state = inject( 'pageState' ); return () => h( 'p', 'page' ); } } );
	globalThis.__modules[ '/m/dirty2.js' ] = { default: Page, contract: { id: 'acme/dirty2', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	loader.applyImportMap( { 'acme-dirty2': '/m/dirty2.js' } );
	mount( () => h( PageHost, { page: { path: 'a.php', title: 'A', component: 'acme/dirty2', module: 'acme-dirty2', data: {}, textDomains: [] } } ) );
	await flush();
	state.setDirty( true );
	assert.equal( state.isDirty(), false );
	assert.equal( typeof state.onAddress( () => {} ), 'function' );
} );

test( 'a live configuration change adds, swaps and removes slot modules in a mounted component', async () => {
	const { SlotOutlet } = await import( '../site/runtime/slots.js' );
	const Show = ( label ) => defineComponent( { name: 'Show' + label, render: () => h( 'i', label ) } );
	globalThis.__modules[ '/m/slot-a.js' ] = { default: Show( 'A' ) };
	globalThis.__modules[ '/m/slot-b.js' ] = { default: Show( 'B' ) };
	const Impl = defineComponent( { render: () => h( 'div', [ 'start|', h( SlotOutlet, { name: 'after' } ), '|end' ] ) } );
	globalThis.__modules[ '/contracts/core/slotted-live.js' ] = { default: { id: 'core/slotted-live', version: '1.0.0', props: {}, slots: { after: { props: {} } }, emits: [] } };
	globalThis.__modules[ '/components/core/slotted-live.js' ] = { default: Impl };
	contracts.configure( { replacements: {}, slots: {} } );
	const view = mount( () => h( Contracted, { id: 'core/slotted-live' } ) );
	await flush();
	assert.equal( textOf( view.container ), 'start||end' );

	contracts.configure( { replacements: {}, slots: { 'core/slotted-live': { after: [ { module: '/m/slot-a.js' } ] } } } );
	await flush();
	assert.equal( textOf( view.container ), 'start|A|end', 'a newly activated slot module appears' );

	contracts.configure( { replacements: {}, slots: { 'core/slotted-live': { after: [ { module: '/m/slot-b.js' } ] } } } );
	await flush();
	assert.equal( textOf( view.container ), 'start|B|end', 'a swapped slot module is replaced' );

	contracts.configure( { replacements: {}, slots: {} } );
	await flush();
	assert.equal( textOf( view.container ), 'start||end', 'a deactivated slot module is removed' );
} );
