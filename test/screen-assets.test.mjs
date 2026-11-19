import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { applyScreenGlobals, loadScreenAssets, markRan, ranBefore, ranKey, SCREEN_ASSETS_ROUTE } = await import( '../site/runtime/screen-assets.js' );
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
	assert.deepEqual( await loadScreenAssets( api, pageFor( 'options-general.php' ) ), { ...answer, globals: null, pluginScripts: false } );
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

// Styles scoped to the page, plugin scripts entered again, the classic baseline -------------

/** A document whose head keeps the elements appended to it; files load at once. */
function keepingDocument( log ) {
	const head = [];
	const element = ( tag ) => ( {
		tagName: tag.toUpperCase(),
		listeners: {},
		textContent: '',
		addEventListener( type, listener ) {
			this.listeners[ type ] = listener;
		},
		remove() {},
	} );
	globalThis.document = {
		title: '',
		createElement: element,
		location: { origin: 'http://localhost:8890' },
		head: {
			appendChild( el ) {
				head.push( el );
				log.push( el.tagName === 'LINK' ? 'style:' + el.href : el.src ? 'file:' + el.src : 'inline:' + el.textContent );
				if ( el.src || el.href ) {
					setTimeout( () => el.listeners.load?.(), 0 );
				}
			},
		},
	};
	globalThis.window = {};
	return head;
}

const style = ( handle, src, after = '' ) => ( { handle, src, sameOrigin: true, media: 'all', after } );
const applies = ( head, href ) => {
	const link = head.find( ( el ) => el.href === 'http://localhost:8890' + href );
	return link ? link.media !== 'not all' : null;
};

test( 'a style only one page\'s screen assets give stops applying when the user leaves the page; one both need stays; nothing loads twice', async () => {
	const log = [];
	const head = keepingDocument( log );
	globalThis.location = { pathname: '/wp-admin/', search: '' };
	apiStub.respondWith( async ( method, route, params ) => ( {
		scripts: [],
		styles: params.path === 'index.php'
			? [ style( 'scoped-dash', '/wp-content/plugins/acme/dash.css' ), style( 'scoped-shared', '/wp-content/plugins/acme/shared.css' ), style( 'scoped-inline', '', '.dash{}' ) ]
			: [ style( 'scoped-shared', '/wp-content/plugins/acme/shared.css' ) ],
		ajaxurl: '',
		globals: { pagenow: params.path === 'index.php' ? 'scoped-dashboard' : 'scoped-general' },
	} ) );
	const page = shallowRef( pageFor( 'index.php' ) );
	mountHost( page );
	await flush();
	assert.equal( applies( head, '/wp-content/plugins/acme/dash.css' ), true );

	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	page.value = pageFor( 'options-general.php' );
	await flush();
	assert.equal( applies( head, '/wp-content/plugins/acme/dash.css' ), false, 'the Dashboard-only stylesheet is off' );
	assert.equal( head.find( ( el ) => el.textContent === '.dash{}' ).media, 'not all', 'and its inline CSS' );
	assert.equal( applies( head, '/wp-content/plugins/acme/shared.css' ), true, 'the shared one stays on' );

	globalThis.location = { pathname: '/wp-admin/', search: '' };
	page.value = pageFor( 'index.php' );
	await flush();
	assert.equal( applies( head, '/wp-content/plugins/acme/dash.css' ), true, 'on again when the page comes back' );
	assert.deepEqual( log, [ 'style:http://localhost:8890/wp-content/plugins/acme/dash.css', 'style:http://localhost:8890/wp-content/plugins/acme/shared.css', 'inline:.dash{}' ], 'each loaded once' );
} );

test( 'the styles a captured notice or an island loads stop applying when it goes', async () => {
	const log = [];
	const head = keepingDocument( log );
	globalThis.location = { pathname: '/wp-admin/options-reading.php', search: '' };
	islandAssets = { scripts: [], styles: [ style( 'island-style', '/wp-content/plugins/acme/island.css' ) ] };
	const page = shallowRef( pageFor( 'options-reading.php', 'core/island' ) );
	mountHost( page );
	await flush();
	assert.equal( applies( head, '/wp-content/plugins/acme/island.css' ), true );
	unmountAll();
	assert.equal( applies( head, '/wp-content/plugins/acme/island.css' ), false );
} );

// Pages rendered, by `setup()` calls of the page component.
const rendered = [];
globalThis.__modules[ '/components/core/counted.js' ] = { default: { props: [ 'page' ], setup( props ) {
	rendered.push( props.page.path );
	return () => h( 'p', props.page.path );
} } };
globalThis.__modules[ '/contracts/core/counted.js' ] = { default: { id: 'core/counted', version: '1.0.0', props: {}, slots: {}, emits: [] } };

test( 'reloads before mounting a page whose plugin scripts ran', async () => {
	const log = useDocument();
	const reloads = [];
	rendered.length = 0;
	globalThis.location = { pathname: '/wp-admin/again.php', search: '' };
	apiStub.respondWith( async ( method, route, params ) => ( params.path === 'again.php'
		? { scripts: [ script( 'again-widget', '/wp-content/plugins/acme/again.js' ) ], styles: [], ajaxurl: '', globals: { pagenow: 'again-dashboard' }, pluginScripts: true }
		: { scripts: [ script( 'again-core', '/wp-includes/js/again-core.js' ) ], styles: [], ajaxurl: '', globals: { pagenow: 'again-general' }, pluginScripts: false } ) );
	const page = shallowRef( pageFor( 'again.php', 'core/counted' ) );
	mount( () => h( PageHost, { page: page.value } ), { provide: { reloadDocument: () => reloads.push( globalThis.location.pathname ) } } );
	await flush();
	assert.deepEqual( rendered, [ 'again.php' ] );
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/again.js' ] );

	// A page whose scripts are all WordPress's own, twice: entered in place.
	for ( let i = 0; i < 2; i++ ) {
		globalThis.location = { pathname: '/wp-admin/again-general.php', search: '' };
		page.value = pageFor( 'again-general.php', 'core/counted' );
		await flush();
		globalThis.location = { pathname: '/wp-admin/again-writing.php', search: '' };
		page.value = pageFor( 'again-writing.php', 'core/counted' );
		await flush();
	}
	assert.deepEqual( reloads, [] );
	const before = rendered.length;

	// Back to the first page: a new document, and its component never sets up.
	globalThis.location = { pathname: '/wp-admin/again.php', search: '' };
	page.value = pageFor( 'again.php', 'core/counted' );
	await flush();
	assert.deepEqual( reloads, [ '/wp-admin/again.php' ] );
	assert.equal( rendered.length, before, 'the page component is never set up' );
	assert.deepEqual( log.filter( ( entry ) => entry.includes( 'again.js' ) ), [ 'file:http://localhost:8890/wp-content/plugins/acme/again.js' ], 'nothing runs again in place' );
} );

test( 'marks the visit before loading assets', async () => {
	const reloads = [];
	rendered.length = 0;
	let release;
	const files = new Promise( ( resolve ) => {
		release = resolve;
	} );
	const doc = fakeDocument( [] );
	// A plugin file that does not load until released: the visit is left mid-load.
	doc.head.appendChild = ( el ) => {
		if ( el.src ) {
			files.then( () => el.listeners.load?.() );
		}
	};
	globalThis.document = doc;
	globalThis.window = {};
	globalThis.location = { pathname: '/wp-admin/mid.php', search: '' };
	apiStub.respondWith( async () => ( { scripts: [ script( 'mid-widget', '/wp-content/plugins/acme/mid.js' ) ], styles: [], ajaxurl: '', globals: null, pluginScripts: true } ) );
	const page = shallowRef( pageFor( 'mid.php', 'core/counted' ) );
	mount( () => h( PageHost, { page: page.value } ), { provide: { reloadDocument: () => reloads.push( globalThis.location.pathname ) } } );
	await flush();
	assert.equal( ranBefore( ranKey( pageFor( 'mid.php' ), 'site' ) ), true, 'counted while the files are still loading' );

	globalThis.location = { pathname: '/wp-admin/mid-other.php', search: '' };
	page.value = pageFor( 'mid-other.php', 'core/counted' );
	await flush();
	globalThis.location = { pathname: '/wp-admin/mid.php', search: '' };
	page.value = pageFor( 'mid.php', 'core/counted' );
	await flush();
	release();
	assert.deepEqual( reloads, [ '/wp-admin/mid.php' ] );
} );

test( 'ranKey is the context and the page path; markRan records only plugin scripts', () => {
	assert.equal( ranKey( { path: 'index.php?welcome=1' }, 'network' ), 'network:index.php?welcome=1' );
	markRan( { pluginScripts: false }, 'site:key-none' );
	markRan( null, 'site:key-null' );
	assert.equal( ranBefore( 'site:key-none' ), false );
	assert.equal( ranBefore( 'site:key-null' ), false );
	markRan( { pluginScripts: true }, 'site:key-yes' );
	assert.equal( ranBefore( 'site:key-yes' ), true );
} );

test( 'when the screen assets request fails, the islands still get the classic baseline the notices answer gave, first', async () => {
	const log = useDocument();
	globalThis.location = { pathname: '/wp-admin/', search: '' };
	const jquery = script( 'baseline-jquery', '/wp-includes/js/jquery/baseline-jquery.js' );
	apiStub.respondWith( async ( method, route ) => {
		if ( route === NOTICES_ROUTE ) {
			return { notices: [], assets: { scripts: [ jquery ], styles: [], ajaxurl: '', baseline: [ 'baseline-jquery' ] } };
		}
		if ( route === SCREEN_ASSETS_ROUTE ) {
			throw new Error( 'down' );
		}
		return {};
	} );
	islandAssets = { scripts: [ script( 'baseline-island', '/wp-content/plugins/acme/baseline-island.js' ) ], styles: [] };
	const notices = createNotices( { reactive } );
	mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'index.php', 'core/island' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured } } );
	await flush();
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-includes/js/jquery/baseline-jquery.js', 'file:http://localhost:8890/wp-content/plugins/acme/baseline-island.js' ] );
} );
