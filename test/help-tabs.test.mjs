import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const render = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, reactive, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices', 'help-tabs' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const contractFile = await import( '../site/contracts/core/help-tabs.js' );

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

let seq = 0;
function module( component, extra = {} ) {
	const specifier = 'help-m' + seq++;
	const url = '/m/' + specifier + '.js';
	globalThis.__modules[ url ] = { default: component, ...extra };
	loader.applyImportMap( { [ specifier ]: url } );
	return specifier;
}

const pageContract = ( id ) => ( { id, version: '1.0.0', props: {}, slots: {}, emits: [] } );
const Page = defineComponent( { render: () => h( 'p', { class: 'page-body' }, 'Body' ) } );
const Overview = defineComponent( { render: () => h( 'p', { class: 'overview-text' }, 'The fields on this screen.' ) } );
const Sidebar = defineComponent( { render: () => h( 'p', { class: 'module-sidebar' }, 'For more information:' ) } );
const NO_HELP = { tabs: [], sidebar: null };
const MANIFEST = { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] };

function pageFor( path, component, extra = {} ) {
	return { path, title: 'Title of ' + path, component, data: {}, textDomains: [], help: NO_HELP, ...extra };
}

async function frame( page ) {
	const notices = createNotices( { reactive } );
	const view = mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page, current: page.path, base: '/wp-admin/', siteName: 'S' } ), { provide: { notices } } );
	await flush();
	return view;
}

const toggle = ( view ) => find( view.container, byProp( 'id', 'contextual-help-link' ) );
const panel = ( view ) => find( view.container, byProp( 'id', 'screen-meta' ) );
const tabs = ( view ) => findAll( view.container, byProp( 'role', 'tab' ) );
const panels = ( view ) => findAll( view.container, byProp( 'role', 'tabpanel' ) );

// Contract ------------------------------------------------------------------------

test( 'the core/help-tabs contract has its props, slots and event', () => {
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	const contract = contractFile.default;
	assert.equal( contract.id, 'core/help-tabs' );
	assert.equal( contract.version, '1.0.0' );
	assert.notEqual( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'tabs', 'sidebar' ] );
	assert.equal( contract.props.tabs.required, true );
	assert.equal( contract.props.sidebar.required, false );
	assert.deepEqual( contract.props.sidebar.type, [ 'Object', 'Function', 'String' ], 'the types the component accepts' );
	for ( const spec of Object.values( contract.props ) ) {
		assert.deepEqual( Object.keys( spec ).sort(), [ 'required', 'type' ] );
	}
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-tabs', 'after-tabs' ] );
	for ( const slot of Object.values( contract.slots ) ) {
		assert.deepEqual( Object.keys( slot ), [ 'props' ] );
	}
	assert.deepEqual( contract.emits, [ 'toggle' ] );
} );

// Merging -------------------------------------------------------------------------

test( 'PHP tabs and module tabs merge in priority order, module tabs first at equal priority', () => {
	const merged = mergeHelp(
		{ tabs: [ { id: 'overview', title: () => 'Overview', component: Overview }, { id: 'more', title: 'More', component: Overview, priority: 30 } ], sidebar: Sidebar },
		{ tabs: [
			{ id: 'late', title: 'Late', content: '<p>late</p>', priority: 20 },
			{ id: 'early', title: 'Early', content: '<p>early</p>', priority: 5 },
			{ id: 'same', title: 'Same', content: '<p>same</p>', priority: 10 },
		], sidebar: null }
	);
	assert.deepEqual( merged.tabs.map( ( tab ) => [ tab.id, tab.title ] ), [ [ 'early', 'Early' ], [ 'overview', 'Overview' ], [ 'same', 'Same' ], [ 'late', 'Late' ], [ 'more', 'More' ] ] );
	assert.equal( merged.tabs[ 1 ].component, Overview );
	assert.equal( merged.tabs[ 0 ].content, '<p>early</p>' );
	assert.equal( merged.sidebar, Sidebar );
} );

test( 'a PHP tab with a module tab\'s id takes its place; a PHP sidebar replaces the module\'s', () => {
	const merged = mergeHelp(
		{ tabs: [ { id: 'overview', title: 'Overview', component: Overview } ], sidebar: Sidebar },
		{ tabs: [ { id: 'overview', title: 'Plugin overview', content: '<p>Mine</p>', priority: 10 } ], sidebar: '<p>Plugin sidebar</p>' }
	);
	assert.deepEqual( merged.tabs, [ { id: 'overview', title: 'Plugin overview', content: '<p>Mine</p>', priority: 10 } ] );
	assert.equal( merged.sidebar, '<p>Plugin sidebar</p>' );
} );

test( 'mergeHelp ignores what is not help', () => {
	assert.deepEqual( mergeHelp( null, undefined ), { tabs: [], sidebar: null } );
	const merged = mergeHelp(
		{ tabs: [ null, { id: '', title: 'No id', component: Overview }, { id: 'x', title: 'No body' }, { id: 'ok', title: 'Ok', component: Overview } ], sidebar: 'not a component' },
		{ tabs: [ { id: 'bad', title: 3, content: '' }, 'tab' ], sidebar: 7 }
	);
	assert.deepEqual( merged.tabs.map( ( tab ) => tab.id ), [ 'ok' ] );
	assert.equal( merged.sidebar, null );
} );

// Frame -----------------------------------------------------------------------------

test( 'the frame shows no Help toggle for a page without help', async () => {
	const specifier = module( Page, { contract: pageContract( 'acme/none' ) } );
	const view = await frame( pageFor( 'acme.php', 'acme/none', { module: specifier } ) );
	assert.ok( find( view.container, byClass( 'page-body' ) ), 'the page is shown' );
	assert.equal( toggle( view ), null );
	assert.equal( panel( view ), null );
} );

test( 'the frame shows no Help toggle for a hosted classic screen', async () => {
	globalThis.__modules[ '/contracts/core/legacy.js' ] = await import( '../site/contracts/core/legacy.js' );
	globalThis.__modules[ '/components/core/legacy.js' ] = { default: defineComponent( { render: () => h( 'div', { class: 'legacy-stub' } ) } ) };
	const view = await frame( pageFor( 'tools.php', 'core/legacy', { legacy: { src: '/wp-admin/tools.php' }, help: undefined } ) );
	assert.equal( toggle( view ), null );
} );

test( 'the frame shows the Help toggle, collapsed, above the page heading, for the router\'s PHP tabs', async () => {
	const specifier = module( Page, { contract: pageContract( 'acme/php-help' ) } );
	const view = await frame( pageFor( 'acme.php', 'acme/php-help', { module: specifier, help: { tabs: [ { id: 'plugin', title: 'Plugin', content: '<p>From PHP</p>', priority: 10 } ], sidebar: null } } ) );
	const button = toggle( view );
	assert.ok( button );
	assert.equal( button.tag, 'button' );
	assert.equal( textOf( button ).trim(), 'Help' );
	assert.equal( button.props[ 'aria-expanded' ], 'false' );
	assert.equal( button.props[ 'aria-controls' ], 'contextual-help-wrap' );
	assert.equal( panel( view ).props.hidden, true );

	const content = find( view.container, byProp( 'id', 'wpbody-content' ) );
	const order = findAll( content, ( el ) => el.props.id === 'screen-meta-links' || el.props.id === 'wp-admin-page' ).map( ( el ) => el.props.id );
	assert.deepEqual( order, [ 'screen-meta-links', 'wp-admin-page' ], 'the help comes before the page and its heading' );

	const legacy = find( panel( view ), byClass( 'wp-admin-legacy-html' ) );
	assert.ok( legacy, 'PHP content is shown through LegacyHtml' );
	assert.equal( legacy.innerHTML, '<p>From PHP</p>' );
} );

test( 'the Help toggle opens and closes the panel and reports aria-expanded', async () => {
	const specifier = module( Page, { contract: pageContract( 'acme/toggle' ), help: { tabs: [ { id: 'overview', title: () => 'Overview', component: Overview } ], sidebar: Sidebar } } );
	const view = await frame( pageFor( 'acme.php', 'acme/toggle', { module: specifier } ) );
	toggle( view ).props.onClick();
	await flush();
	assert.equal( toggle( view ).props[ 'aria-expanded' ], 'true' );
	assert.ok( hasClass( toggle( view ), 'screen-meta-active' ) );
	assert.equal( panel( view ).props.hidden, false );
	assert.equal( textOf( find( panel( view ), byClass( 'overview-text' ) ) ), 'The fields on this screen.' );
	assert.equal( textOf( find( panel( view ), byClass( 'module-sidebar' ) ) ), 'For more information:' );

	toggle( view ).props.onClick();
	await flush();
	assert.equal( toggle( view ).props[ 'aria-expanded' ], 'false' );
	assert.equal( panel( view ).props.hidden, true );
} );

test( 'the frame shows the module\'s tabs and the router\'s PHP tabs in priority order', async () => {
	const specifier = module( Page, { contract: pageContract( 'acme/merged' ), help: { tabs: [ { id: 'overview', title: () => 'Overview', component: Overview } ], sidebar: Sidebar } } );
	const view = await frame( pageFor( 'acme.php', 'acme/merged', { module: specifier, help: { tabs: [
		{ id: 'plugin', title: 'Plugin', content: '<p>Plugin</p>', priority: 10 },
		{ id: 'first', title: 'First', content: '<p>First</p>', priority: 1 },
	], sidebar: null } } ) );
	assert.deepEqual( tabs( view ).map( ( tab ) => textOf( tab ) ), [ 'First', 'Overview', 'Plugin' ] );
} );

test( 'a page replacement\'s help replaces the default module\'s', async () => {
	const specifier = module( Page, { contract: pageContract( 'acme/replaced' ), help: { tabs: [ { id: 'overview', title: 'Default', component: Overview } ] } } );
	const replacement = module( Page, { implementsContract: pageContract( 'acme/replaced' ), help: { tabs: [ { id: 'mine', title: 'Replacement', component: Overview } ] } } );
	contracts.configure( { replacements: { 'acme/replaced': { module: replacement, implements: '1.0.0' } }, slots: {} } );
	const view = await frame( pageFor( 'acme.php', 'acme/replaced', { module: specifier } ) );
	assert.deepEqual( tabs( view ).map( ( tab ) => textOf( tab ) ), [ 'Replacement' ] );
} );

// The tab list ----------------------------------------------------------------------

async function helpTabs( props = {}, listeners = {} ) {
	const view = mount( () => h( Contracted, {
		id: 'core/help-tabs',
		tabs: [
			{ id: 'overview', title: 'Overview', component: Overview },
			{ id: 'plugin', title: 'Plugin', content: '<p>Plugin</p>' },
			{ id: 'last', title: 'Last', content: '<p>Last</p>' },
		],
		sidebar: null,
		...props,
		...listeners,
	} ) );
	await flush();
	return view;
}

const selected = ( view ) => tabs( view ).filter( ( tab ) => tab.props[ 'aria-selected' ] === 'true' ).map( textOf );
const key = async ( view, name ) => {
	let prevented = false;
	const current = tabs( view ).find( ( tab ) => tab.props[ 'aria-selected' ] === 'true' );
	current.props.onKeydown( { key: name, preventDefault: () => {
		prevented = true;
	} } );
	await flush();
	return prevented;
};

test( 'the tab list is a vertical tab list whose tabs control their panels', async () => {
	const view = await helpTabs();
	const list = find( view.container, byProp( 'role', 'tablist' ) );
	assert.equal( list.props[ 'aria-orientation' ], 'vertical' );
	assert.deepEqual( selected( view ), [ 'Overview' ] );
	for ( const [ index, tab ] of tabs( view ).entries() ) {
		const id = [ 'overview', 'plugin', 'last' ][ index ];
		assert.equal( tab.props.id, 'tab-link-' + id );
		assert.equal( tab.props[ 'aria-controls' ], 'tab-panel-' + id );
		assert.equal( tab.props.tabindex, index === 0 ? '0' : '-1', 'only the selected tab is in the tab order' );
	}
	const shown = panels( view ).filter( ( p ) => ! p.props.hidden );
	assert.deepEqual( shown.map( ( p ) => p.props.id ), [ 'tab-panel-overview' ] );
	assert.equal( shown[ 0 ].props[ 'aria-labelledby' ], 'tab-link-overview' );
	assert.ok( hasClass( find( view.container, byProp( 'id', 'contextual-help-wrap' ) ), 'no-sidebar' ) );
} );

test( 'arrow keys, Home and End move the selection and focus through the tabs', async () => {
	const view = await helpTabs();
	assert.equal( await key( view, 'ArrowDown' ), true );
	assert.deepEqual( selected( view ), [ 'Plugin' ] );
	assert.equal( render.focused?.props.id, 'tab-link-plugin' );
	assert.deepEqual( panels( view ).filter( ( p ) => ! p.props.hidden ).map( ( p ) => p.props.id ), [ 'tab-panel-plugin' ] );

	await key( view, 'End' );
	assert.deepEqual( selected( view ), [ 'Last' ] );
	await key( view, 'ArrowDown' );
	assert.deepEqual( selected( view ), [ 'Overview' ], 'wraps to the first tab' );
	await key( view, 'ArrowUp' );
	assert.deepEqual( selected( view ), [ 'Last' ], 'wraps to the last tab' );
	await key( view, 'Home' );
	assert.deepEqual( selected( view ), [ 'Overview' ] );
	assert.equal( render.focused?.props.id, 'tab-link-overview' );
	assert.equal( await key( view, 'a' ), false, 'other keys are left alone' );
} );

test( 'clicking a tab selects it without following its link', async () => {
	const view = await helpTabs();
	let prevented = false;
	tabs( view )[ 2 ].props.onClick( { preventDefault: () => {
		prevented = true;
	} } );
	await flush();
	assert.equal( prevented, true );
	assert.deepEqual( selected( view ), [ 'Last' ] );
} );

test( 'the toggle emits toggle with the new state; a string sidebar is shown through LegacyHtml', async () => {
	const events = [];
	const view = await helpTabs( { sidebar: '<p><strong>For more information:</strong></p>' }, { onToggle: ( open ) => events.push( open ) } );
	toggle( view ).props.onClick();
	await flush();
	toggle( view ).props.onClick();
	await flush();
	assert.deepEqual( events, [ true, false ] );
	const sidebar = find( view.container, byClass( 'contextual-help-sidebar' ) );
	assert.equal( find( sidebar, byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<p><strong>For more information:</strong></p>' );
	assert.ok( ! hasClass( find( view.container, byProp( 'id', 'contextual-help-wrap' ) ), 'no-sidebar' ) );
} );

test( 'the help panel is labelled and its slots render around the tab list', async () => {
	const before = module( defineComponent( { props: [ 'tabs' ], render() { return h( 'span', { class: 'before-tabs' }, String( this.tabs.length ) ); } } ) );
	const after = module( defineComponent( { render: () => h( 'span', { class: 'after-tabs' } ) } ) );
	contracts.configure( { replacements: {}, slots: { 'core/help-tabs': { 'before-tabs': [ { module: before } ], 'after-tabs': [ { module: after } ] } } } );
	const view = await helpTabs();
	await flush();
	const wrap = find( view.container, byProp( 'id', 'contextual-help-wrap' ) );
	assert.equal( wrap.props.role, 'region', 'a landmark, so that its label is announced' );
	assert.equal( wrap.props[ 'aria-label' ], 'Contextual Help Tab' );
	assert.equal( textOf( find( view.container, byClass( 'before-tabs' ) ) ), '3' );
	assert.ok( find( view.container, byClass( 'after-tabs' ) ) );
} );

test( 'the selection moves to the first tab when the selected one goes', async () => {
	const list = Vue.ref( [ { id: 'a', title: 'A', content: '<p>a</p>' }, { id: 'b', title: 'B', content: '<p>b</p>' } ] );
	const view = mount( () => h( Contracted, { id: 'core/help-tabs', tabs: list.value, sidebar: null } ) );
	await flush();
	tabs( view )[ 1 ].props.onClick( { preventDefault() {} } );
	await flush();
	list.value = [ { id: 'a', title: 'A', content: '<p>a</p>' } ];
	await flush();
	assert.deepEqual( selected( view ), [ 'A' ] );
} );

test( 'the module\'s help goes with its page, and is hidden while the forbidden screen shows', async () => {
	const withHelp = module( Page, { contract: pageContract( 'acme/with-help' ), help: { tabs: [ { id: 'overview', title: 'Overview', component: Overview } ] } } );
	const without = module( Page, { contract: pageContract( 'acme/without-help' ) } );
	const state = reactive( { page: pageFor( 'a.php', 'acme/with-help', { module: withHelp } ) } );
	const router = { state: reactive( { status: 'ready' } ), refresh() {} };
	const view = mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page: state.page, current: state.page.path, base: '/wp-admin/' } ), { provide: { notices: createNotices( { reactive } ), router } } );
	await flush();
	assert.ok( toggle( view ), 'shown for the page with help' );

	router.state.status = 'forbidden';
	await flush();
	assert.equal( toggle( view ), null, 'hidden on the forbidden screen' );
	router.state.status = 'ready';
	await flush();
	assert.ok( toggle( view ) );

	state.page = pageFor( 'b.php', 'acme/without-help', { module: without } );
	await flush();
	assert.equal( toggle( view ), null, 'gone on the next page, which has none' );
} );

test( 'the Help panel is closed again on the next page', async () => {
	const first = module( Page, { contract: pageContract( 'acme/first-help' ), help: { tabs: [ { id: 'overview', title: 'Overview', component: Overview } ] } } );
	const second = module( Page, { contract: pageContract( 'acme/second-help' ), help: { tabs: [ { id: 'other', title: 'Other', component: Overview } ] } } );
	const state = reactive( { page: pageFor( 'a.php', 'acme/first-help', { module: first } ) } );
	const view = mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page: state.page, current: state.page.path, base: '/wp-admin/' } ), { provide: { notices: createNotices( { reactive } ) } } );
	await flush();
	toggle( view ).props.onClick();
	await flush();
	assert.equal( toggle( view ).props[ 'aria-expanded' ], 'true' );

	state.page = pageFor( 'b.php', 'acme/second-help', { module: second } );
	await flush();
	assert.deepEqual( tabs( view ).map( textOf ), [ 'Other' ] );
	assert.equal( toggle( view ).props[ 'aria-expanded' ], 'false' );
	assert.equal( panel( view ).props.hidden, true );
} );
