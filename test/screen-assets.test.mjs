import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { applyScreenGlobals, loadScreenAssets, SCREEN_ASSETS_ROUTE } = await import( '../site/runtime/screen-assets.js' );
const { default: PageHost } = await import( '../site/runtime/PageHost.js' );
const { default: LegacyHtml } = await import( '../site/kit/LegacyHtml.js' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );
const { NOTICES_ROUTE } = await import( '../site/runtime/page-notices.js' );

const { h, reactive, shallowRef } = Vue;

// The pages shown here: one plain, one with a legacy island whose own assets are given.
let islandAssets = {};
globalThis.__modules ??= {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
for ( const id of [ 'core/plain', 'core/island', 'core/legacy' ] ) {
	globalThis.__modules[ '/contracts/' + id + '.js' ] = { default: { id, version: '1.0.0', props: {}, slots: {}, emits: [] } };
}
globalThis.__modules[ '/components/core/plain.js' ] = { default: { props: [ 'page' ], render() { return h( 'p', this.page.path ); } } };
globalThis.__modules[ '/components/core/legacy.js' ] = { default: { props: [ 'page' ], render() { return h( 'p', 'classic' ); } } };
globalThis.__modules[ '/components/core/island.js' ] = { default: { props: [ 'page' ], render() { return h( LegacyHtml, { html: '<input name="acme">', assets: islandAssets } ); } } };

afterEach( () => {
	unmountAll();
	apiStub.reset();
	islandAssets = {};
	delete globalThis.location;
	delete globalThis.document;
	delete globalThis.window;
} );

const pageFor = ( path, component = 'core/plain' ) => ( { path, title: 'Title of ' + path, component, data: {}, textDomains: [], help: { tabs: [], sidebar: null } } );
const script = ( handle, src ) => ( { handle, src, sameOrigin: true, data: '', before: '', after: '', translations: '' } );
const screenCalls = () => apiStub.calls.filter( ( c ) => c.route === SCREEN_ASSETS_ROUTE );

/** A document that records the scripts and styles appended to its head; files load at once. */
function fakeDocument( log ) {
	const element = ( tag ) => ( {
		tagName: tag.toUpperCase(),
		listeners: {},
		textContent: '',
		addEventListener( type, listener ) {
			this.listeners[ type ] = listener;
		},
		remove() {},
	} );
	return {
		title: '',
		createElement: element,
		location: { origin: 'http://localhost:8890' },
		head: {
			appendChild( el ) {
				if ( el.tagName === 'SCRIPT' ) {
					log.push( el.src ? 'file:' + el.src : 'inline:' + el.textContent );
				} else if ( el.tagName === 'LINK' ) {
					log.push( 'style:' + el.href );
				}
				if ( el.src || el.href ) {
					setTimeout( () => el.listeners.load?.(), 0 );
				}
			},
		},
	};
}

function useDocument() {
	const log = [];
	globalThis.document = fakeDocument( log );
	globalThis.window = {};
	return log;
}

const mountHost = ( page ) => mount( () => h( PageHost, { page: page.value } ) );

// loadScreenAssets --------------------------------------------------------------------

test( 'loadScreenAssets asks with the router parameters and gives the assets when there are any', async () => {
	const calls = [];
	const answer = { scripts: [ script( 'acme', '/wp-content/plugins/acme/a.js' ) ], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' };
	const api = { get: async ( route, params ) => {
		calls.push( [ route, params ] );
		return answer;
	} };
	assert.deepEqual( await loadScreenAssets( api, pageFor( 'options-general.php' ) ), { ...answer, globals: null } );
	await loadScreenAssets( api, pageFor( 'sites.php' ), 'network' );
	assert.deepEqual( calls, [
		[ SCREEN_ASSETS_ROUTE, { path: 'options-general.php' } ],
		[ SCREEN_ASSETS_ROUTE, { path: 'sites.php', context: 'network' } ],
	] );
} );

test( 'loadScreenAssets gives null for an empty answer, a classic screen (not asked) and a failure', async () => {
	let asked = 0;
	const answering = ( value ) => ( { get: async () => {
		asked++;
		if ( value instanceof Error ) {
			throw value;
		}
		return value;
	} } );
	assert.equal( await loadScreenAssets( answering( { scripts: [], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' } ), pageFor( 'options-general.php' ) ), null );
	assert.equal( await loadScreenAssets( answering( { scripts: 'x' } ), pageFor( 'options-general.php' ) ), null );
	assert.equal( await loadScreenAssets( answering( new Error( 'down' ) ), pageFor( 'options-general.php' ) ), null );
	assert.equal( asked, 3 );
	assert.equal( await loadScreenAssets( answering( {} ), pageFor( 'tools.php', 'core/legacy' ) ), null );
	assert.equal( asked, 3, 'a classic screen loads its own' );
} );

test( 'loadScreenAssets gives the screen\'s globals with the assets', async () => {
	const globals = { pagenow: 'dashboard', typenow: '', adminpage: 'index-php', thousandsSeparator: ',', decimalPoint: '.', isRtl: 0 };
	const api = { get: async () => ( { scripts: [ script( 'acme', '/a.js' ) ], styles: [], ajaxurl: '', globals } ) };
	assert.deepEqual( ( await loadScreenAssets( api, pageFor( 'index.php' ) ) ).globals, globals );
	const odd = { get: async () => ( { scripts: [ script( 'acme', '/a.js' ) ], styles: [], ajaxurl: '', globals: [ 'x' ] } ) };
	assert.equal( ( await loadScreenAssets( odd, pageFor( 'index.php' ) ) ).globals, null );
} );

test( 'applyScreenGlobals sets the classic screen\'s globals and puts back what was there', () => {
	const win = { typenow: 'kept', other: 1 };
	const withdraw = applyScreenGlobals( { pagenow: 'dashboard', typenow: '', adminpage: 'index-php', isRtl: 0, ajaxurl: '/x', bogus: {} }, win );
	assert.deepEqual( win, { typenow: '', other: 1, pagenow: 'dashboard', adminpage: 'index-php', isRtl: 0 } );
	withdraw();
	assert.deepEqual( win, { typenow: 'kept', other: 1 } );
	assert.doesNotThrow( () => applyScreenGlobals( null, win )() );
} );

test( 'the page host sets the screen\'s globals before its scripts run, and withdraws them with the page', async () => {
	const log = useDocument();
	const append = globalThis.document.head.appendChild;
	globalThis.document.head.appendChild = function ( el ) {
		if ( el.src ) {
			log.push( 'pagenow:' + globalThis.window.pagenow );
		}
		return append.call( this, el );
	};
	globalThis.location = { pathname: '/wp-admin/', search: '' };
	apiStub.respondWith( async ( method, route, params ) => ( params.path === 'index.php'
		? { scripts: [ script( 'host-globals', '/wp-content/plugins/acme/dash.js' ) ], styles: [], ajaxurl: '', globals: { pagenow: 'dashboard', typenow: '', adminpage: 'index-php' } }
		: { scripts: [], styles: [], ajaxurl: '' } ) );
	const page = shallowRef( pageFor( 'index.php' ) );
	mountHost( page );
	await flush();
	assert.deepEqual( log, [ 'pagenow:dashboard', 'file:http://localhost:8890/wp-content/plugins/acme/dash.js' ] );
	assert.equal( globalThis.window.adminpage, 'index-php' );

	globalThis.location = { pathname: '/wp-admin/options-writing.php', search: '' };
	page.value = pageFor( 'options-writing.php' );
	await flush();
	assert.equal( globalThis.window.pagenow, undefined );
	assert.equal( globalThis.window.adminpage, undefined );
} );

// The page host -----------------------------------------------------------------------

test( 'the page host loads the screen assets WordPress returns, and nothing for an empty answer', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	apiStub.respondWith( async ( method, route, params ) => ( route === SCREEN_ASSETS_ROUTE && params.path === 'options-general.php'
		? { scripts: [ script( 'host-a', '/wp-content/plugins/acme/general.js' ) ], styles: [ { handle: 'host-a', src: '/wp-content/plugins/acme/general.css', sameOrigin: true, after: '' } ], ajaxurl: '/wp-admin/admin-ajax.php' }
		: { scripts: [], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' } ) );
	const page = shallowRef( pageFor( 'options-general.php' ) );
	mountHost( page );
	await flush();

	assert.deepEqual( screenCalls().map( ( c ) => c.payload ), [ { path: 'options-general.php' } ] );
	assert.deepEqual( log, [ 'style:http://localhost:8890/wp-content/plugins/acme/general.css', 'file:http://localhost:8890/wp-content/plugins/acme/general.js' ] );
	assert.equal( globalThis.window.ajaxurl, '/wp-admin/admin-ajax.php' );

	// Another page with none: nothing loads.
	globalThis.location = { pathname: '/wp-admin/options-writing.php', search: '' };
	page.value = pageFor( 'options-writing.php' );
	await flush();
	assert.deepEqual( screenCalls().map( ( c ) => c.payload ), [ { path: 'options-general.php' }, { path: 'options-writing.php' } ] );
	assert.equal( log.length, 2 );
} );

test( 'the page host asks once per page visit: not again when the router answers the same path; a file loads once', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/network/acme.php', search: '' };
	apiStub.respondWith( async () => ( { scripts: [ script( 'host-once', '/wp-content/plugins/acme/once.js' ) ], styles: [], ajaxurl: '' } ) );
	const page = shallowRef( pageFor( 'acme.php' ) );
	mountHost( page );
	await flush();
	page.value = { ...page.value, title: 'Answered again' };
	await flush();

	assert.deepEqual( screenCalls().map( ( c ) => c.payload ), [ { path: 'acme.php', context: 'network' } ] );

	// Away and back: asked again, the file is not loaded twice.
	page.value = pageFor( 'other.php' );
	await flush();
	page.value = pageFor( 'acme.php' );
	await flush();
	assert.equal( screenCalls().length, 3 );
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/once.js' ] );
} );

test( 'the page host asks nothing for a classic screen', async () => {
	useDocument();
	globalThis.location = { pathname: '/wp-admin/tools.php', search: '' };
	mountHost( shallowRef( pageFor( 'tools.php', 'core/legacy' ) ) );
	await flush();
	assert.equal( screenCalls().length, 0 );
} );

test( 'legacy islands in the page set up their own assets and run only after the screen assets', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	let release;
	apiStub.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( { scripts: [ script( 'order-screen', '/wp-content/plugins/acme/screen.js' ) ], styles: [], ajaxurl: '' } );
	} ) );
	islandAssets = { scripts: [ script( 'order-island', '/wp-content/plugins/acme/island.js' ) ], styles: [] };
	mountHost( shallowRef( pageFor( 'options-general.php', 'core/island' ) ) );
	await flush();
	assert.deepEqual( log, [], 'the island waits for the screen assets' );

	release();
	await flush();
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/screen.js', 'file:http://localhost:8890/wp-content/plugins/acme/island.js' ] );
} );

test( 'an answer for a page the user has left is not loaded, and islands do not wait for a failed request', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	let release;
	apiStub.respondWith( ( method, route, params ) => {
		if ( params.path === 'options-general.php' ) {
			return new Promise( ( resolve ) => {
				release = () => resolve( { scripts: [ script( 'stale-screen', '/wp-content/plugins/acme/stale.js' ) ], styles: [], ajaxurl: '' } );
			} );
		}
		return Promise.reject( new Error( 'down' ) );
	} );
	islandAssets = { scripts: [ script( 'failed-island', '/wp-content/plugins/acme/failed-island.js' ) ], styles: [] };
	const page = shallowRef( pageFor( 'options-general.php' ) );
	mountHost( page );
	await flush();
	page.value = pageFor( 'options-reading.php', 'core/island' );
	await flush();
	release();
	await flush();

	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/failed-island.js' ] );
} );

// The frame and the page host together ----------------------------------------------

test( 'notices and screen assets are asked for together; the notices are shown first, then the screen assets load, then the islands run', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	const NOTICE = '<div class="notice detached-order-notice"><p>Order</p></div>';
	let releaseNotices;
	apiStub.respondWith( ( method, route ) => {
		if ( route === NOTICES_ROUTE ) {
			return new Promise( ( resolve ) => {
				releaseNotices = () => resolve( { notices: [ { html: NOTICE, error: false } ], assets: {} } );
			} );
		}
		return Promise.resolve( route === SCREEN_ASSETS_ROUTE ? { scripts: [ script( 'together-screen', '/wp-content/plugins/acme/together.js' ) ], styles: [], ajaxurl: '' } : {} );
	} );
	islandAssets = { scripts: [ script( 'together-island', '/wp-content/plugins/acme/together-island.js' ) ], styles: [] };
	const notices = createNotices( { reactive } );
	let view;
	const noticeShown = () => find( find( view.container, byClass( 'wp-admin-notices__captured' ) ) ?? { children: [] }, byClass( 'wp-admin-legacy-html' ) )?.innerHTML === NOTICE;
	const append = globalThis.document.head.appendChild;
	globalThis.document.head.appendChild = ( el ) => {
		append( el );
		if ( el.src ) {
			log.push( 'notice shown: ' + noticeShown() );
		}
	};
	view = mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'options-general.php', 'core/island' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured } } );
	await flush();

	assert.deepEqual( apiStub.calls.map( ( c ) => c.route ).sort(), [ NOTICES_ROUTE, SCREEN_ASSETS_ROUTE ].sort(), 'both asked at once' );
	assert.deepEqual( log, [], 'the screen assets wait for the notices' );

	releaseNotices();
	await flush();
	assert.deepEqual( log, [
		'file:http://localhost:8890/wp-content/plugins/acme/together.js',
		'notice shown: true',
		'file:http://localhost:8890/wp-content/plugins/acme/together-island.js',
		'notice shown: true',
	] );
} );
