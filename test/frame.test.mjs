import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = render;
const { flush } = await import( './helpers/dom.mjs' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { default: PageHost, documentTitle } = await import( '../site/runtime/PageHost.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );

const { h, reactive, defineComponent } = Vue;
const NAMES = [ 'frame', 'menu', 'admin-bar', 'notices' ];
const SLOTS = {
	frame: [ 'before-content', 'after-content' ],
	menu: [ 'before-items', 'after-items' ],
	'admin-bar': [ 'start', 'end' ],
	notices: [ 'before', 'after' ],
};

globalThis.__modules = {};
const contractFiles = {};
for ( const name of NAMES ) {
	contractFiles[ name ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = contractFiles[ name ];
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

let seq = 0;
function module( component, extra = {} ) {
	const specifier = 'm' + seq++;
	const url = '/m/' + specifier + '.js';
	globalThis.__modules[ url ] = { default: component, ...extra };
	loader.applyImportMap( { [ specifier ]: url } );
	return specifier;
}

function quiet( t ) {
	const warnings = [];
	t.mock.method( console, 'warn', ( ...a ) => warnings.push( a.map( String ).join( ' ' ) ) );
	return warnings;
}

const MENU = [
	{ path: 'index.php', label: 'Dashboard', icon: 'dashicons-dashboard', count: null, children: [
		{ path: 'index.php', label: 'Home', icon: '', count: null, children: [] },
		{ path: 'update-core.php', label: 'Updates', icon: '', count: 2, children: [] },
	] },
	{ path: 'edit.php?post_type=page', label: 'Pages', icon: '/wp-content/plugins/p/icon.svg', count: null, children: [
		{ path: 'edit.php?post_type=page', label: 'All Pages', icon: '', count: null, children: [] },
		{ path: 'post-new.php?post_type=page', label: 'Add New Page', icon: '', count: null, children: [] },
	] },
	{ path: 'edit-comments.php', label: 'Comments', icon: 'javascript:alert(1)', count: 3, children: [] },
	{ path: 'tools.php', label: 'Tools', icon: 'none', count: null, children: [] },
];

// Contract files ---------------------------------------------------------------

test( 'contract files have exactly the required shape', () => {
	for ( const name of NAMES ) {
		const contract = contractFiles[ name ].default;
		assert.deepEqual( Object.keys( contractFiles[ name ] ), [ 'default' ], name + ' has only a default export' );
		assert.deepEqual( Object.keys( contract ).sort(), [ 'emits', 'id', 'props', 'slots', 'version' ], name );
		assert.equal( contract.id, 'core/' + name );
		assert.equal( contract.version, '1.0.0' );
		assert.deepEqual( Object.keys( contract.slots ), SLOTS[ name ], name + ' slots' );
		for ( const slot of Object.values( contract.slots ) ) {
			assert.deepEqual( Object.keys( slot ), [ 'props' ] );
		}
		assert.ok( Array.isArray( contract.emits ) );
		for ( const [ prop, spec ] of Object.entries( contract.props ) ) {
			assert.deepEqual( Object.keys( spec ).sort(), [ 'required', 'type' ], name + '.' + prop );
			assert.equal( typeof spec.required, 'boolean' );
		}
	}
} );

// Menu ---------------------------------------------------------------------------

async function renderMenu( current, base = '/wp-admin/' ) {
	const view = mount( () => h( Contracted, { id: 'core/menu', items: MENU, current, base } ) );
	await flush();
	return view;
}

const topItems = ( view ) => findAll( view.container, ( el ) => el.tag === 'li' && hasClass( el, 'menu-top' ) );
const link = ( li ) => li.children.find( ( c ) => c.tag === 'a' );

test( 'the menu is a labelled navigation of real links', async () => {
	const view = await renderMenu( 'tools.php', '/sites/2/wp-admin/' );
	const nav = find( view.container, byTag( 'nav' ) );
	assert.equal( nav.props[ 'aria-label' ], 'Main menu' );
	assert.deepEqual( topItems( view ).map( ( li ) => link( li ).props.href ), [
		'/sites/2/wp-admin/index.php',
		'/sites/2/wp-admin/edit.php?post_type=page',
		'/sites/2/wp-admin/edit-comments.php',
		'/sites/2/wp-admin/tools.php',
	] );
	assert.deepEqual( findAll( view.container, byClass( 'wp-menu-name' ) ).map( ( el ) => el.children[ 0 ].text ), [ 'Dashboard', 'Pages', 'Comments', 'Tools' ] );
} );

test( 'the current item and its parent are marked', async () => {
	const view = await renderMenu( 'post-new.php?post_type=page' );
	const [ dashboard, pages, comments ] = topItems( view );
	assert.ok( hasClass( pages, 'wp-has-current-submenu' ) && hasClass( pages, 'wp-menu-open' ) );
	assert.equal( link( pages ).props[ 'aria-current' ], 'page' );
	assert.ok( hasClass( dashboard, 'wp-not-current-submenu' ) );
	assert.equal( link( dashboard ).props[ 'aria-current' ], null );
	const child = find( pages, ( el ) => el.tag === 'a' && el.props[ 'aria-current' ] === 'page' && ! hasClass( el, 'menu-top' ) );
	assert.equal( textOf( child ), 'Add New Page' );
	assert.ok( hasClass( child, 'current' ) );
	assert.ok( ! hasClass( comments, 'current' ) );

	const single = await renderMenu( 'edit-comments.php' );
	const commentsItem = topItems( single )[ 2 ];
	assert.ok( hasClass( commentsItem, 'current' ) );
	assert.equal( link( commentsItem ).props[ 'aria-current' ], 'page' );
} );

test( 'icons: Dashicons class, image with empty alt, nothing for unsafe values', async () => {
	const view = await renderMenu( 'tools.php' );
	const images = topItems( view ).map( ( li ) => find( li, byClass( 'wp-menu-image' ) ) );
	assert.ok( hasClass( images[ 0 ], 'dashicons-before' ) && hasClass( images[ 0 ], 'dashicons-dashboard' ) );
	const img = find( images[ 1 ], byTag( 'img' ) );
	assert.equal( img.props.src, '/wp-content/plugins/p/icon.svg' );
	assert.equal( img.props.alt, '' );
	for ( const unsafe of [ images[ 2 ], images[ 3 ] ] ) {
		assert.equal( find( unsafe, byTag( 'img' ) ), null );
		assert.ok( ! JSON.stringify( unsafe.props ).includes( 'javascript' ) );
		assert.equal( unsafe.props.style, undefined );
	}
} );

test( 'counts are badges with a translated accessible name', async () => {
	const view = await renderMenu( 'tools.php' );
	const badge = find( topItems( view )[ 2 ], byClass( 'awaiting-mod' ) );
	assert.ok( hasClass( badge, 'count-3' ) );
	assert.equal( textOf( find( badge, byClass( 'screen-reader-text' ) ) ), '3 items' );
	assert.equal( find( badge, byClass( 'pending-count' ) ).props[ 'aria-hidden' ], 'true' );
} );

test( 'submenus toggle with their button and close with Escape', async () => {
	const view = await renderMenu( 'tools.php' );
	const dashboard = topItems( view )[ 0 ];
	const toggle = find( dashboard, byClass( 'wp-admin-menu-toggle' ) );
	const submenu = () => find( dashboard, byClass( 'wp-submenu' ) );
	assert.equal( toggle.props[ 'aria-label' ], 'Submenu: Dashboard' );
	assert.equal( toggle.props[ 'aria-controls' ], submenu().props.id );
	assert.equal( toggle.props[ 'aria-expanded' ], 'false' );
	assert.equal( submenu().props.hidden, true );

	toggle.props.onClick(); // Enter and Space activate a <button>.
	await flush();
	assert.equal( toggle.props[ 'aria-expanded' ], 'true' );
	assert.equal( submenu().props.hidden, false );
	assert.ok( hasClass( dashboard, 'opensub' ) );

	dashboard.props.onKeydown( { key: 'Escape' } );
	await flush();
	assert.equal( toggle.props[ 'aria-expanded' ], 'false' );
	assert.equal( submenu().props.hidden, true );
	assert.equal( render.focused, toggle, 'focus returns to the toggle' );
} );

test( 'the current submenu is shown and can be collapsed', async () => {
	const view = await renderMenu( 'index.php' );
	const dashboard = topItems( view )[ 0 ];
	const toggle = find( dashboard, byClass( 'wp-admin-menu-toggle' ) );
	assert.equal( find( dashboard, byClass( 'wp-submenu' ) ).props.hidden, false );
	toggle.props.onClick();
	await flush();
	assert.equal( toggle.props[ 'aria-expanded' ], 'false' );
	assert.equal( find( dashboard, byClass( 'wp-submenu' ) ).props.hidden, true );
} );

test( 'menu slot modules render before the first and after the last item', async () => {
	const Extra = ( label ) => defineComponent( { props: [ 'items' ], render() { return h( 'li', { class: 'extra' }, label + this.items.length ); } } );
	contracts.configure( { replacements: {}, slots: { 'core/menu': {
		'after-items': [ { module: module( Extra( 'after' ) ) } ],
		'before-items': [ { module: module( Extra( 'before' ) ) } ],
	} } } );
	const view = await renderMenu( 'tools.php' );
	const list = find( view.container, byProp( 'id', 'adminmenu' ) );
	const lis = list.children.filter( ( c ) => c.tag === 'li' );
	assert.equal( textOf( lis[ 0 ] ), 'before4' );
	assert.equal( textOf( lis[ lis.length - 1 ] ), 'after4' );
	assert.equal( lis.length, MENU.length + 2 );
} );

// Admin bar ----------------------------------------------------------------------

test( 'the admin bar links the site name, shows the user and signs out', async () => {
	let signOuts = 0;
	const user = { id: 1, name: 'Ada', avatar: 'https://secure.gravatar.com/avatar/x' };
	const view = mount( () => h( Contracted, { id: 'core/admin-bar', user, base: '/wp-admin/', siteName: 'My Site', onSignOut: () => signOuts++ } ) );
	await flush();
	assert.equal( find( view.container, byTag( 'nav' ) ).props[ 'aria-label' ], 'Toolbar' );
	const site = find( view.container, byClass( 'wp-admin-bar__site' ) );
	assert.equal( site.props.href, '/wp-admin/' );
	assert.match( textOf( site ), /My Site/ );
	const avatar = find( view.container, byTag( 'img' ) );
	assert.equal( avatar.props.src, user.avatar );
	assert.equal( avatar.props.alt, '' );
	assert.match( view.text(), /Howdy, Ada/ );
	const logout = find( view.container, byClass( 'wp-admin-bar__logout' ) );
	assert.equal( textOf( logout ), 'Log Out' );
	logout.props.onClick();
	assert.equal( signOuts, 1 );
} );

test( 'the admin bar shows no avatar for a URL that is not http(s)', async () => {
	const view = mount( () => h( Contracted, { id: 'core/admin-bar', user: { name: 'Ada', avatar: 'javascript:alert(1)' }, base: '/wp-admin/' } ) );
	await flush();
	assert.equal( find( view.container, byTag( 'img' ) ), null );
	assert.match( textOf( find( view.container, byClass( 'wp-admin-bar__site' ) ) ), /Dashboard/ );
} );

// Notices ------------------------------------------------------------------------

test( 'notices raised before mounting are shown, with a live role by type, and can be dismissed', async () => {
	const notices = createNotices( { reactive } );
	notices.add( { type: 'success', message: 'Saved.' } );
	notices.add( { type: 'error', message: 'Broken.' } );
	notices.add( { type: 'info', message: 'Fixed.', dismissible: false } );
	const view = mount( () => h( Contracted, { id: 'core/notices', notices: notices.items, onDismiss: notices.dismiss } ) );
	await flush();
	const shown = findAll( view.container, byClass( 'notice' ) );
	assert.deepEqual( shown.map( ( n ) => [ textOf( find( n, byTag( 'p' ) ) ), n.props.role ] ), [
		[ 'Saved.', 'status' ], [ 'Broken.', 'alert' ], [ 'Fixed.', 'status' ],
	] );
	assert.ok( hasClass( shown[ 0 ], 'notice-success' ) && hasClass( shown[ 0 ], 'is-dismissible' ) );
	assert.ok( ! hasClass( shown[ 2 ], 'is-dismissible' ) );
	assert.equal( find( shown[ 2 ], byClass( 'notice-dismiss' ) ), null );

	const dismiss = find( shown[ 1 ], byClass( 'notice-dismiss' ) );
	assert.equal( textOf( dismiss ).trim(), 'Dismiss this notice.' );
	dismiss.props.onClick();
	await flush();
	assert.deepEqual( findAll( view.container, byClass( 'notice' ) ).map( ( n ) => textOf( find( n, byTag( 'p' ) ) ) ), [ 'Saved.', 'Fixed.' ] );

	notices.add( { type: 'warning', message: 'Later.' } );
	await flush();
	assert.equal( findAll( view.container, byClass( 'notice' ) ).at( -1 ).props.role, 'alert' );
} );

// Page host ----------------------------------------------------------------------

const pageFor = ( path, component, extra = {} ) => ( { path, title: 'Title of ' + path, component, data: {}, textDomains: [], ...extra } );

test( 'PageHost renders a plugin page from its module with data and page', async () => {
	const Page = defineComponent( { props: [ 'data', 'page' ], render() { return h( 'p', { class: 'greeting' }, this.data.greeting + ' @ ' + this.page.path ); } } );
	const specifier = module( Page, { contract: { id: 'acme/page', version: '1.0.0', props: {}, slots: {}, emits: [] } } );
	const page = pageFor( 'acme.php', 'acme/page', { module: specifier, data: { greeting: 'Hello from PHP' } } );
	const view = mount( () => h( PageHost, { page } ) );
	await flush();
	const main = find( view.container, byTag( 'main' ) );
	assert.equal( main.props.id, 'wp-admin-page' );
	assert.equal( textOf( find( main, byTag( 'h1' ) ) ), 'Title of acme.php' );
	assert.equal( textOf( find( main, byClass( 'greeting' ) ) ), 'Hello from PHP @ acme.php' );
} );

test( 'PageHost shows a translated message, and no notice, for a core contract that cannot be resolved', async ( t ) => {
	const warnings = quiet( t );
	const notices = [];
	const view = mount( () => h( PageHost, { page: pageFor( 'index.php', 'core/legacy', { legacy: { src: '/wp-admin/index.php' } } ) } ), { provide: { notices: { add: ( n ) => notices.push( n ) } } } );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'contracted-unavailable' ) ) ), 'This screen is not available yet.' );
	assert.equal( notices.length, 0 );
	assert.ok( warnings.some( ( w ) => w.includes( 'core/legacy' ) ) );
} );

test( 'PageHost shows the failure message for a plugin page whose module cannot be loaded', async ( t ) => {
	quiet( t );
	const notices = [];
	loader.applyImportMap( { gone: '/m/gone.js' } );
	const view = mount( () => h( PageHost, { page: pageFor( 'gone.php', 'acme/gone', { module: 'gone' } ) } ), { provide: { notices: { add: ( n ) => notices.push( n ) } } } );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'contracted-failure' ) ) ), 'This screen could not be displayed.' );
	assert.equal( notices.length, 1 );
} );

test( 'PageHost renders a fresh page on a path change and moves focus to the heading', async () => {
	let mounts = 0;
	const Page = defineComponent( { props: [ 'page' ], mounted: () => mounts++, render() { return h( 'p', { class: 'p' }, this.page.path ); } } );
	const specifier = module( Page, { contract: { id: 'acme/many', version: '1.0.0', props: {}, slots: {}, emits: [] } } );
	const current = Vue.shallowRef( pageFor( 'a.php', 'acme/many', { module: specifier } ) );
	const view = mount( () => h( PageHost, { page: current.value } ) );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'p' ) ) ), 'a.php' );
	assert.equal( render.focused, null, 'no focus move on the first page' );

	current.value = pageFor( 'b.php', 'acme/many', { module: specifier } );
	await flush();
	assert.equal( textOf( find( view.container, byClass( 'p' ) ) ), 'b.php' );
	assert.equal( mounts, 2 );
	const heading = find( view.container, byTag( 'h1' ) );
	assert.equal( textOf( heading ), 'Title of b.php' );
	assert.equal( render.focused, heading );
	assert.equal( heading.props.tabindex, '-1' );
} );

test( 'documentTitle adds the site name through a translatable pattern', () => {
	assert.equal( documentTitle( 'Settings', 'My Site' ), 'Settings ‹ My Site — WordPress' );
	assert.equal( documentTitle( 'Settings', '' ), 'Settings' );
} );

// Frame --------------------------------------------------------------------------

test( 'the frame composes admin bar, menu, notices and the page', async ( t ) => {
	quiet( t );
	const notices = createNotices( { reactive } );
	notices.add( { type: 'warning', message: 'Early notice.' } );
	const Page = defineComponent( { props: [ 'data' ], render() { return h( 'p', { class: 'greeting' }, this.data.greeting ); } } );
	const specifier = module( Page, { contract: { id: 'acme/page', version: '1.0.0', props: {}, slots: {}, emits: [] } } );
	const manifest = { user: { id: 1, name: 'Ada', avatar: '' }, menu: MENU };
	const page = pageFor( 'acme.php', 'acme/page', { module: specifier, data: { greeting: 'Hi' } } );
	let signOuts = 0;
	const view = mount(
		() => h( Contracted, { id: 'core/frame', manifest, page, current: 'acme.php', base: '/wp-admin/', siteName: 'S', onSignOut: () => signOuts++ } ),
		{ provide: { notices } }
	);
	await flush();
	assert.ok( find( view.container, byClass( 'wp-admin-bar' ) ) );
	assert.ok( find( view.container, byProp( 'id', 'adminmenu' ) ) );
	assert.equal( textOf( find( view.container, byClass( 'greeting' ) ) ), 'Hi' );
	assert.match( textOf( find( view.container, byClass( 'notice' ) ) ), /Early notice\./ );
	const skip = find( view.container, byClass( 'screen-reader-shortcut' ) );
	assert.equal( skip.props.href, '#wp-admin-page' );
	assert.equal( textOf( skip ), 'Skip to main content' );
	find( view.container, byClass( 'wp-admin-bar__logout' ) ).props.onClick();
	assert.equal( signOuts, 1 );

	find( find( view.container, byClass( 'notice' ) ), byClass( 'notice-dismiss' ) ).props.onClick();
	await flush();
	assert.equal( notices.items.length, 0 );
} );

test( 'Contracted keeps the shown implementation while re-resolving the same contract', async () => {
	let mounts = 0;
	const Impl = defineComponent( { mounted: () => mounts++, render: () => h( 'span', 'same' ) } );
	globalThis.__modules[ '/contracts/core/steady.js' ] = { default: { id: 'core/steady', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	globalThis.__modules[ '/components/core/steady.js' ] = { default: Impl };
	const view = mount( () => h( Contracted, { id: 'core/steady' } ) );
	await flush();
	contracts.configure( { replacements: {}, slots: {} } );
	assert.equal( view.text(), 'same', 'still shown while resolving again' );
	await flush();
	assert.equal( view.text(), 'same' );
	assert.equal( mounts, 1 );
} );
