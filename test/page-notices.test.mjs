import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byClass, Vue } = render;
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices, noticeElementId } = await import( '../site/runtime/notices.js' );
const { loadPageNotices, NOTICES_ROUTE } = await import( '../site/runtime/page-notices.js' );
const { makeNoticesDismissible } = await import( '../site/components/core/captured-notice.js' );

const { h, reactive, shallowRef } = Vue;

globalThis.__modules ??= {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
// The pages the frame shows here: plain components.
for ( const id of [ 'core/options-general', 'core/legacy', 'core/other' ] ) {
	globalThis.__modules[ '/contracts/' + id + '.js' ] = { default: { id, version: '1.0.0', props: {}, slots: {}, emits: [] } };
	globalThis.__modules[ '/components/' + id + '.js' ] = { default: { props: [ 'page' ], render() { return h( 'p', { class: 'page' }, this.page.path ); } } };
}

afterEach( () => {
	unmountAll();
	apiStub.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	delete globalThis.location;
} );

const NOTICE = '<div class="notice notice-warning is-dismissible"><p>Acme needs setup.</p></div>';
const ASSETS = { scripts: [ { handle: 'acme', src: '/wp-content/plugins/acme/a.js', sameOrigin: true } ], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' };
const pageFor = ( path, component = 'core/options-general' ) => ( { path, title: 'Title of ' + path, component, data: {}, textDomains: [], help: { tabs: [], sidebar: null } } );
const MANIFEST = { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] };

// loadPageNotices -----------------------------------------------------------------

test( 'loadPageNotices asks with the router parameters and keeps the notices with markup', async () => {
	const calls = [];
	const api = { get: async ( route, params ) => {
		calls.push( [ route, params ] );
		return { notices: [ { html: NOTICE, error: false }, { html: '', error: true }, { html: ' \n', error: false } ], assets: ASSETS };
	} };
	assert.deepEqual( await loadPageNotices( api, pageFor( 'options-general.php' ) ), [ { html: NOTICE, assets: ASSETS } ] );
	await loadPageNotices( api, pageFor( 'sites.php' ), 'network' );
	assert.deepEqual( calls, [
		[ NOTICES_ROUTE, { path: 'options-general.php' } ],
		[ NOTICES_ROUTE, { path: 'sites.php', context: 'network' } ],
	] );
} );

test( 'loadPageNotices asks nothing for a classic screen and gives none when WordPress fails', async () => {
	let asked = 0;
	const failing = { get: async () => {
		asked++;
		throw new Error( 'down' );
	} };
	assert.deepEqual( await loadPageNotices( failing, pageFor( 'tools.php', 'core/legacy' ) ), [] );
	assert.equal( asked, 0 );
	assert.deepEqual( await loadPageNotices( failing, pageFor( 'options-general.php' ) ), [] );
	assert.equal( asked, 1 );
	assert.deepEqual( await loadPageNotices( { get: async () => ( { notices: 'x' } ) }, pageFor( 'options-general.php' ) ), [] );
} );

// The dismiss button ---------------------------------------------------------------

/** A tiny DOM: elements with classes, children, listeners and selectors by class. */
function fakeDom() {
	const element = ( tag, classes = [] ) => {
		const el = {
			tagName: tag.toUpperCase(),
			className: classes.join( ' ' ),
			attributes: {},
			children: [],
			parent: null,
			listeners: {},
			textContent: '',
			classes() {
				return this.className.split( /\s+/ ).filter( Boolean );
			},
			setAttribute( name, value ) {
				this.attributes[ name ] = value;
			},
			appendChild( child ) {
				child.parent = this;
				this.children.push( child );
				return child;
			},
			remove() {
				if ( this.parent ) {
					this.parent.children.splice( this.parent.children.indexOf( this ), 1 );
					this.parent = null;
				}
			},
			addEventListener( type, listener ) {
				( this.listeners[ type ] ??= [] ).push( listener );
			},
			click() {
				const event = { defaultPrevented: false, preventDefault() {
					this.defaultPrevented = true;
				} };
				for ( const listener of this.listeners.click ?? [] ) {
					listener( event );
				}
				return event;
			},
			all( selector ) {
				const wanted = selector.split( '.' ).filter( Boolean );
				const out = [];
				const walk = ( node ) => {
					for ( const child of node.children ) {
						if ( wanted.every( ( name ) => child.classes().includes( name ) ) ) {
							out.push( child );
						}
						walk( child );
					}
				};
				walk( this );
				return out;
			},
			querySelectorAll( selector ) {
				return this.all( selector );
			},
			querySelector( selector ) {
				return this.all( selector )[ 0 ] ?? null;
			},
		};
		return el;
	};
	return { element, doc: { createElement: ( tag ) => element( tag ) } };
}

test( 'makeNoticesDismissible adds the classic button to dismissible notices and removes a notice after its click', () => {
	const { element, doc } = fakeDom();
	const container = element( 'div' );
	const first = container.appendChild( element( 'div', [ 'notice', 'notice-info', 'is-dismissible' ] ) );
	const fixed = container.appendChild( element( 'div', [ 'notice', 'notice-error' ] ) );
	const own = container.appendChild( element( 'div', [ 'notice', 'is-dismissible' ] ) );
	own.appendChild( element( 'button', [ 'notice-dismiss' ] ) );
	const queued = [];
	let empty = 0;
	const options = { label: 'Dismiss this notice.', doc, onEmpty: () => empty++, later: ( run ) => queued.push( run ) };

	assert.equal( makeNoticesDismissible( container, options ), 1, 'only a dismissible notice without a button gets one' );
	assert.equal( makeNoticesDismissible( container, options ), 0, 'never twice' );
	assert.equal( fixed.children.length, 0 );
	const button = first.children[ 0 ];
	assert.equal( button.tagName, 'BUTTON' );
	assert.equal( button.attributes.type, 'button' );
	assert.equal( button.className, 'notice-dismiss' );
	assert.equal( button.children[ 0 ].className, 'screen-reader-text' );
	assert.equal( button.children[ 0 ].textContent, 'Dismiss this notice.' );

	const event = button.click();
	assert.ok( event.defaultPrevented );
	assert.equal( first.parent, container, 'still there while the click bubbles (plugin handlers find it)' );
	queued.shift()();
	assert.equal( first.parent, null, 'removed after the click' );
	assert.equal( empty, 0, 'other notices are left' );

	fixed.remove();
	own.remove();
	const last = container.appendChild( element( 'div', [ 'notice', 'is-dismissible' ] ) );
	makeNoticesDismissible( container, options );
	last.children[ 0 ].click();
	queued.shift()();
	assert.equal( empty, 1, 'the last notice gone: the container is empty' );
} );

test( 'makeNoticesDismissible does nothing without a container or a document', () => {
	assert.equal( makeNoticesDismissible( null, { label: 'x' } ), 0 );
	assert.equal( makeNoticesDismissible( {}, { label: 'x', doc: {} } ), 0 );
} );

// core/notices ---------------------------------------------------------------------

test( 'core/notices renders nothing for captured notices when there are none', async () => {
	const notices = createNotices( { reactive } );
	const view = mount( () => h( Contracted, { id: 'core/notices', notices: notices.items } ) );
	await flush();
	assert.equal( find( view.container, byClass( 'wp-admin-notices__captured' ) ), null );
	assert.equal( find( view.container, byClass( 'wp-admin-legacy-html' ) ), null );
} );

test( 'core/notices shows captured notices as they are, outside the live regions', async () => {
	const notices = createNotices( { reactive } );
	const view = mount( () => h( Contracted, { id: 'core/notices', notices: notices.items, onDismiss: notices.dismiss } ) );
	notices.add( { type: 'success', message: 'Saved.' } );
	const id = notices.addCaptured( { html: NOTICE, assets: ASSETS } );
	await flush();
	const area = find( view.container, byClass( 'wp-admin-notices__captured' ) );
	const item = find( area, byClass( 'wp-admin-notices__captured-item' ) );
	assert.equal( item.props.id, noticeElementId( id ) );
	assert.equal( find( item, byClass( 'wp-admin-legacy-html' ) ).innerHTML, NOTICE );
	for ( const region of findAll( view.container, byClass( 'wp-admin-notices__region' ) ) ) {
		assert.equal( find( region, byClass( 'wp-admin-legacy-html' ) ), null, 'not announced' );
	}
	assert.equal( findAll( view.container, byClass( 'notice' ) ).length, 1, 'the region notice only: the captured one is HTML' );
	const children = find( view.container, byClass( 'wp-admin-notices' ) ).children.filter( ( c ) => c.type === 'element' );
	assert.ok( children.indexOf( area ) < children.findIndex( ( c ) => c.props.class?.includes?.( 'wp-admin-notices__region' ) ), 'above the live regions, as a classic screen prints them' );
} );

// The frame ------------------------------------------------------------------------

// The page host asks for the page's screen assets too (screen-assets.test.mjs).
const noticeCalls = () => apiStub.calls.filter( ( c ) => c.route === NOTICES_ROUTE );

test( 'the frame asks for nothing when it is not given addCaptured()', async () => {
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	const notices = createNotices( { reactive } );
	const page = shallowRef( pageFor( 'options-general.php' ) );
	mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page: page.value, current: '', base: '/wp-admin/' } ), { provide: { notices } } );
	await flush();
	assert.equal( noticeCalls().length, 0 );
} );

function mountFrame( page, notices ) {
	return mount( () => h( Contracted, { id: 'core/frame', manifest: MANIFEST, page: page.value, current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured } } );
}

test( 'the frame adds the page notices WordPress returns, scoped to the page, and nothing for an empty list', async () => {
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	apiStub.respondWith( async ( method, route, params ) => ( route === NOTICES_ROUTE && params.path === 'options-general.php' ? { notices: [ { html: NOTICE, error: false } ], assets: ASSETS } : { notices: [], assets: {} } ) );
	const notices = createNotices( { reactive } );
	const page = shallowRef( pageFor( 'options-general.php' ) );
	const view = mountFrame( page, notices );
	await flush();

	assert.deepEqual( apiStub.calls.filter( ( c ) => c.route === NOTICES_ROUTE ).map( ( c ) => c.payload ), [ { path: 'options-general.php' } ] );
	assert.deepEqual( notices.items.map( ( n ) => [ n.html, n.scope ] ), [ [ NOTICE, 'page' ] ] );
	assert.deepEqual( notices.items[ 0 ].assets, ASSETS );
	assert.equal( find( find( view.container, byClass( 'wp-admin-notices__captured' ) ), byClass( 'wp-admin-legacy-html' ) ).innerHTML, NOTICE );

	// Another page: the notices go with the page, and none come for it.
	page.value = pageFor( 'options-writing.php' );
	await flush();
	assert.equal( notices.items.length, 0, 'cleared on navigation' );
	assert.equal( find( view.container, byClass( 'wp-admin-notices__captured' ) ), null );
} );

test( 'the frame asks nothing for a classic screen, sends the context, and keeps only what is still printed', async () => {
	globalThis.location = { pathname: '/wp-admin/network/acme.php', search: '' };
	let answer = { notices: [ { html: '<p>one</p>' }, { html: '<p>two</p>' } ], assets: {} };
	apiStub.respondWith( async () => answer );
	const notices = createNotices( { reactive } );
	const page = shallowRef( pageFor( 'acme.php', 'core/other' ) );
	mountFrame( page, notices );
	await flush();
	assert.deepEqual( noticeCalls().map( ( c ) => c.payload ), [ { path: 'acme.php', context: 'network' } ] );
	assert.deepEqual( notices.items.map( ( n ) => n.html ), [ '<p>one</p>', '<p>two</p>' ] );
	const kept = notices.items[ 1 ].id;

	// The same page answered again.
	answer = { notices: [ { html: '<p>two</p>' } ], assets: {} };
	page.value = { ...page.value };
	await flush();
	assert.deepEqual( notices.items.map( ( n ) => [ n.id, n.html ] ), [ [ kept, '<p>two</p>' ] ] );

	globalThis.location = { pathname: '/wp-admin/network/tools.php', search: '' };
	page.value = pageFor( 'tools.php', 'core/legacy' );
	await flush();
	assert.equal( noticeCalls().length, 2, 'a classic screen prints its own' );
	assert.equal( notices.items.length, 0 );
} );

test( 'the frame drops an answer for a page the user has left', async () => {
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	let release;
	apiStub.respondWith( ( method, route, params ) => ( params.path === 'options-general.php' ? new Promise( ( resolve ) => {
		release = () => resolve( { notices: [ { html: '<p>stale</p>' } ], assets: {} } );
	} ) : Promise.resolve( { notices: [], assets: {} } ) ) );
	const notices = createNotices( { reactive } );
	const page = shallowRef( pageFor( 'options-general.php' ) );
	mountFrame( page, notices );
	await flush();
	page.value = pageFor( 'options-writing.php' );
	await flush();
	release();
	await flush();
	assert.equal( notices.items.length, 0 );
} );
