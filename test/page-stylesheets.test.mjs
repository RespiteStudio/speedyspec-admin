import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';


const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { coreStylesheets, syncStylesheets, pageStylesheets, syncPageStylesheets } = await import( '../site/runtime/stylesheets.js' );
const { default: PageHost } = await import( '../site/runtime/PageHost.js' );
const { default: i18n } = await import( '../site/runtime/i18n-instance.js' );

const { h, shallowRef } = Vue;

/** Just enough of a document for <link> handling in <head>. */
function fakeDocument() {
	const make = ( tag ) => ( {
		tagName: tag.toUpperCase(),
		attributes: {},
		parent: null,
		setAttribute( k, v ) {
			this.attributes[ k ] = String( v );
		},
		getAttribute( k ) {
			return this.attributes[ k ] ?? null;
		},
		hasAttribute( k ) {
			return k in this.attributes;
		},
		remove() {
			this.parent?.children.splice( this.parent.children.indexOf( this ), 1 );
			this.parent = null;
		},
		listeners: {},
		addEventListener( type, fn ) {
			( this.listeners[ type ] ??= [] ).push( fn );
		},
		fire( type ) {
			( this.listeners[ type ] ?? [] ).splice( 0 ).forEach( ( fn ) => fn() );
		},
	} );
	const head = {
		children: [],
		insertBefore( el, ref ) {
			el.parent = head;
			const i = ref ? head.children.indexOf( ref ) : -1;
			head.children.splice( i < 0 ? head.children.length : i, 0, el );
		},
		appendChild( el ) {
			head.insertBefore( el, null );
		},
		querySelectorAll( selector ) {
			const attribute = /^link\[(data-wp-admin-(?:core|page))\]$/.exec( selector );
			if ( attribute ) {
				return head.children.filter( ( c ) => c.hasAttribute( attribute[ 1 ] ) );
			}
			if ( selector === 'link[rel="stylesheet"]' ) {
				return head.children.filter( ( c ) => c.getAttribute( 'rel' ) === 'stylesheet' );
			}
			return [];
		},
	};
	const own = make( 'link' );
	own.setAttribute( 'rel', 'stylesheet' );
	own.setAttribute( 'href', '/styles/frame.css' );
	head.appendChild( own );
	return { head, createElement: make, title: '' };
}

const hrefs = ( doc ) => doc.head.children.map( ( c ) => c.getAttribute( 'href' ) );
const pageLinks = ( doc ) => doc.head.children.filter( ( c ) => c.hasAttribute( 'data-wp-admin-page' ) );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );
function timers() {
	const pending = [];
	return { setTimer: ( fn ) => pending.push( fn ), run: () => pending.splice( 0 ).forEach( ( fn ) => fn() ) };
}

afterEach( () => {
	unmountAll();
	apiStub.reset();
	i18n.setLocale( { code: 'en_US', dir: 'ltr' } );
	delete globalThis.document;
} );

// pageStylesheets -------------------------------------------------------------------

test( 'pageStylesheets maps core handles to wp-admin/css files, with the RTL variants for rtl', () => {
	assert.deepEqual( pageStylesheets( [ 'dashboard', 'site-health' ], 'ltr' ), [ '/wp-admin/css/dashboard.css', '/wp-admin/css/site-health.css' ] );
	assert.deepEqual( pageStylesheets( [ 'dashboard', 'site-health' ], 'rtl' ), [ '/wp-admin/css/dashboard-rtl.css', '/wp-admin/css/site-health-rtl.css' ] );
} );

test( 'pageStylesheets maps `editor-buttons` to wp-includes/css/editor.css, the Quicktags editor\'s styles (A-I3)', () => {
	assert.deepEqual( pageStylesheets( [ 'list-tables', 'editor-buttons' ], 'ltr' ), [ '/wp-admin/css/list-tables.css', '/wp-includes/css/editor.css' ] );
	assert.deepEqual( pageStylesheets( [ 'editor-buttons' ], 'rtl' ), [ '/wp-includes/css/editor-rtl.css' ] );
	assert.deepEqual( pageStylesheets( [ 'editor-buttons', 'editor-buttons' ], 'ltr' ), [ '/wp-includes/css/editor.css' ] );
} );

test( 'the pages that mount the Quicktags editor load its stylesheet (A-I3)', async () => {
	for ( const name of [ 'edit-comments', 'comment-edit', 'dashboard' ] ) {
		const module = await import( '../site/components/core/' + name + '.js' );
		assert.ok( module.stylesheets.includes( 'editor-buttons' ), name );
	}
} );

test( 'pageStylesheets leaves out malformed handles, duplicates and the frame\'s own styles', () => {
	assert.deepEqual( pageStylesheets( [ 'dashboard', 'dashboard', '../x', 'Dash', 'a/b', '', 7, null, 'common', 'edit' ], 'ltr' ), [ '/wp-admin/css/dashboard.css' ] );
	assert.deepEqual( pageStylesheets( null, 'ltr' ), [] );
	assert.deepEqual( pageStylesheets( 'dashboard', 'ltr' ), [] );
} );

// syncPageStylesheets ---------------------------------------------------------------

test( 'syncPageStylesheets adds the page links after the core links and before the site styles, and settles once they load', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'ltr', t );
	let settled = false;
	const done = syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css', '/wp-admin/css/site-health.css' ], t ).then( () => {
		settled = true;
	} );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/wp-admin/css/dashboard.css', '/wp-admin/css/site-health.css', '/styles/frame.css' ] );
	await tick();
	assert.equal( settled, false, 'waits for the files' );
	pageLinks( doc )[ 0 ].fire( 'load' );
	pageLinks( doc )[ 1 ].fire( 'error' );
	await done;
	assert.equal( settled, true );
} );

test( 'syncPageStylesheets keeps a link the next page needs too, and removes the others once the new ones load', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css' ], t );
	pageLinks( doc ).forEach( ( link ) => link.fire( 'load' ) );
	await tick();
	const kept = pageLinks( doc )[ 0 ];

	const done = syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css', '/wp-admin/css/site-health.css' ], t );
	assert.equal( pageLinks( doc )[ 0 ], kept, 'not loaded again' );
	assert.equal( pageLinks( doc ).length, 2 );
	pageLinks( doc )[ 1 ].fire( 'load' );
	await done;

	const toNone = syncPageStylesheets( doc, [], t );
	await toNone;
	assert.deepEqual( hrefs( doc ), [ '/styles/frame.css' ], 'a page without stylesheets drops them' );
} );

test( 'syncPageStylesheets waits for a kept link still loading, and only until the timeout', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css' ], t );
	let settled = false;
	const again = syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css', '/wp-admin/css/site-health.css' ], t ).then( () => {
		settled = true;
	} );
	pageLinks( doc )[ 1 ].fire( 'load' );
	await tick();
	assert.equal( settled, false, 'dashboard.css has not loaded yet' );
	t.run();
	await again;
	assert.equal( settled, true );
} );

test( 'syncPageStylesheets does nothing for the set already shown, nor without a document', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css' ], t );
	pageLinks( doc )[ 0 ].fire( 'load' );
	await syncPageStylesheets( doc, [ '/wp-admin/css/dashboard.css' ], t );
	assert.equal( pageLinks( doc ).length, 1 );
	await syncPageStylesheets( null, [ '/wp-admin/css/dashboard.css' ] );
	await syncPageStylesheets( {}, [ '/wp-admin/css/dashboard.css' ] );
} );

// The page host ----------------------------------------------------------------------

globalThis.__modules ??= {};
for ( const id of [ 'core/styled', 'core/plain', 'core/legacy' ] ) {
	globalThis.__modules[ '/contracts/' + id + '.js' ] = { default: { id, version: '1.0.0', props: {}, slots: {}, emits: [] } };
}
globalThis.__modules[ '/components/core/styled.js' ] = { default: { props: [ 'page' ], render: () => h( 'p', { class: 'styled-page' }, 'Styled' ) }, stylesheets: [ 'dashboard' ] };
globalThis.__modules[ '/components/core/plain.js' ] = { default: { props: [ 'page' ], render: () => h( 'p', { class: 'plain-page' }, 'Plain' ) } };
globalThis.__modules[ '/components/core/legacy.js' ] = { default: { props: [ 'page' ], render: () => h( 'p', { class: 'legacy-page' }, 'Classic' ) }, stylesheets: [ 'dashboard' ] };

const pageFor = ( path, component ) => ( { path, title: 'Title of ' + path, component, data: {}, textDomains: [], help: { tabs: [], sidebar: null } } );

test( 'the page host loads the stylesheets the page module exports before it shows the page, and drops them for the next page', async () => {
	const doc = fakeDocument();
	globalThis.document = doc;
	apiStub.respondWith( async () => ( { notices: [], scripts: [], styles: [] } ) );
	const page = shallowRef( pageFor( 'index.php', 'core/styled' ) );
	const view = mount( () => h( PageHost, { page: page.value } ) );
	await flush();
	assert.deepEqual( pageLinks( doc ).map( ( l ) => l.getAttribute( 'href' ) ), [ '/wp-admin/css/dashboard.css' ] );
	assert.equal( find( view.container, byClass( 'styled-page' ) ), null, 'not shown before its stylesheet has loaded' );
	pageLinks( doc )[ 0 ].fire( 'load' );
	await flush();
	assert.ok( find( view.container, byClass( 'styled-page' ) ), 'shown once it has' );

	page.value = pageFor( 'options-general.php', 'core/plain' );
	await flush();
	assert.ok( find( view.container, byClass( 'plain-page' ) ) );
	assert.deepEqual( pageLinks( doc ), [], 'the next page does not keep them' );
} );

test( 'the page host loads the RTL variants for a right-to-left language, again when the language changes', async () => {
	const doc = fakeDocument();
	globalThis.document = doc;
	i18n.setLocale( { code: 'he_IL', dir: 'rtl' } );
	const page = shallowRef( pageFor( 'index.php', 'core/styled' ) );
	mount( () => h( PageHost, { page: page.value } ) );
	await flush();
	assert.deepEqual( pageLinks( doc ).map( ( l ) => l.getAttribute( 'href' ) ), [ '/wp-admin/css/dashboard-rtl.css' ] );
	pageLinks( doc )[ 0 ].fire( 'load' );
	await flush();

	const { localeVersion } = await import( '../site/runtime/text.js' );
	i18n.setLocale( { code: 'en_US', dir: 'ltr' } );
	localeVersion.value++;
	await flush();
	pageLinks( doc ).forEach( ( link ) => link.fire( 'load' ) );
	await flush();
	assert.deepEqual( pageLinks( doc ).map( ( l ) => l.getAttribute( 'href' ) ), [ '/wp-admin/css/dashboard.css' ] );
} );

test( 'the page host loads no page stylesheets for a hosted classic screen', async () => {
	const doc = fakeDocument();
	globalThis.document = doc;
	const page = shallowRef( pageFor( 'index.php', 'core/legacy' ) );
	const view = mount( () => h( PageHost, { page: page.value } ) );
	await flush();
	assert.deepEqual( pageLinks( doc ), [] );
	assert.ok( find( view.container, byClass( 'legacy-page' ) ) );
} );
