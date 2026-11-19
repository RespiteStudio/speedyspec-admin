import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { loadScreenAssets, SCREEN_ASSETS_ROUTE } = await import( '../site/runtime/screen-assets.js' );
const { default: PageHost } = await import( '../site/runtime/PageHost.js' );
const { default: LegacyHtml } = await import( '../site/kit/LegacyHtml.js' );

const { h, shallowRef } = Vue;

// The pages shown here: one plain, one with a legacy island whose own assets are given.
let islandAssets = {};
globalThis.__modules ??= {};
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
	assert.deepEqual( await loadScreenAssets( api, pageFor( 'options-general.php' ) ), answer );
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
