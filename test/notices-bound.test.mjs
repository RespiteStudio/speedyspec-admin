import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

// Its own file (its own module table): core/notices resolves as it is, which notices-ready.test.mjs's cases change.
const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const apiStub = await import( './helpers/api-stub.mjs' );
const { SCREEN_ASSETS_ROUTE } = await import( '../site/runtime/screen-assets.js' );
const { NOTICES_ROUTE } = await import( '../site/runtime/page-notices.js' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );

const { h, reactive } = Vue;

globalThis.__modules ??= {};
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
globalThis.__modules[ '/contracts/core/plain.js' ] = { default: { id: 'core/plain', version: '1.0.0', props: {}, slots: {}, emits: [] } };
globalThis.__modules[ '/components/core/plain.js' ] = { default: { props: [ 'page' ], render() { return h( 'p', this.page.path ); } } };

afterEach( () => {
	unmountAll();
	apiStub.reset();
	delete globalThis.location;
	delete globalThis.document;
	delete globalThis.window;
} );

const NOTICE = '<div class="notice late-notice"><p>Late</p></div>';
const pageFor = ( path ) => ( { path, title: 'Title of ' + path, component: 'core/plain', data: {}, textDomains: [], help: { tabs: [], sidebar: null } } );
const script = ( handle, src ) => ( { handle, src, sameOrigin: true, data: '', before: '', after: '', translations: '' } );

/** A document that records the script files appended to its head; files load at once. */
function useDocument( log, shown ) {
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
				if ( el.src ) {
					log.push( 'file:' + el.src + ' notice shown: ' + shown() );
					setTimeout( () => el.listeners.load?.(), 0 );
				}
			},
		},
	};
	globalThis.window = {};
}

test( 'pageNotices.ready() settles within its bound from the start of the navigation when the notices request never answers; a late answer is still shown', async () => {
	const log = [];
	let view;
	const shown = () => find( find( view.container, byClass( 'wp-admin-notices__captured' ) ) ?? { children: [] }, byClass( 'wp-admin-legacy-html' ) )?.innerHTML === NOTICE;
	useDocument( log, shown );
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	let answer;
	const asked = [];
	apiStub.respondWith( ( method, route, params ) => {
		if ( route === NOTICES_ROUTE ) {
			asked.push( params );
			return new Promise( ( resolve ) => {
				answer = () => resolve( { notices: [ { html: NOTICE, error: false } ], assets: {} } );
			} );
		}
		return Promise.resolve( route === SCREEN_ASSETS_ROUTE ? { scripts: [ script( 'hung-screen', '/wp-content/plugins/acme/hung.js' ) ], styles: [], ajaxurl: '' } : {} );
	} );
	const notices = createNotices( { reactive } );
	view = mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'options-general.php' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured, noticesReadyTimeout: 30 } } );
	await flush();
	assert.deepEqual( log, [], 'waiting for the notices' );
	await new Promise( ( resolve ) => setTimeout( resolve, 40 ) );
	await flush();
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/hung.js notice shown: false' ], 'the screen assets load once the bound is over' );

	answer();
	await flush();
	assert.equal( shown(), true, 'the late answer is shown' );
} );

test( 'the notices request is given up after its timeout, and aborted when the user leaves the page', async () => {
	useDocument( [], () => false );
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	const signals = [];
	apiStub.respondWith( ( method, route ) => ( route === NOTICES_ROUTE ? new Promise( () => {} ) : Promise.resolve( {} ) ) );
	const get = apiStub.default.get;
	apiStub.default.get = ( route, params, options ) => {
		if ( route === NOTICES_ROUTE ) {
			signals.push( options );
		}
		return get( route, params, options );
	};
	try {
		const notices = createNotices( { reactive } );
		const page = Vue.shallowRef( pageFor( 'options-general.php' ) );
		mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: page.value, current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured, noticesRequestTimeout: 1234 } } );
		await flush();
		page.value = pageFor( 'options-writing.php' );
		await flush();
	} finally {
		apiStub.default.get = get;
	}
	assert.equal( signals.length, 2 );
	assert.equal( signals[ 0 ].timeout, 1234 );
	assert.equal( signals[ 0 ].signal.aborted, true, 'the first page\'s request is aborted' );
	assert.equal( signals[ 1 ].signal.aborted, false );
} );
