import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

// Its own file (its own module table): core/notices must not have been resolved by another test.
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

test( 'pageNotices.ready() waits until core/notices, resolved late, has put the captured notices in the document', async () => {
	const log = [];
	let view;
	const shown = () => find( find( view.container, byClass( 'wp-admin-notices__captured' ) ) ?? { children: [] }, byClass( 'wp-admin-legacy-html' ) )?.innerHTML === NOTICE;
	useDocument( log, shown );
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	apiStub.respondWith( async ( method, route ) => {
		if ( route === NOTICES_ROUTE ) {
			return { notices: [ { html: NOTICE, error: false } ], assets: {} };
		}
		return route === SCREEN_ASSETS_ROUTE ? { scripts: [ script( 'late-screen', '/wp-content/plugins/acme/late.js' ) ], styles: [], ajaxurl: '' } : {};
	} );

	// core/notices' implementation arrives only once released.
	const component = globalThis.__modules[ '/components/core/notices.js' ];
	let release;
	globalThis.__modules[ '/components/core/notices.js' ] = new Promise( ( resolve ) => {
		release = () => resolve( component );
	} );

	const notices = createNotices( { reactive } );
	view = mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'options-general.php' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured } } );
	await flush();
	assert.deepEqual( log, [], 'the screen assets wait while core/notices is not resolved' );

	release();
	await flush();
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/late.js notice shown: true' ] );
} );

test( 'pageNotices.ready() settles when core/notices cannot be resolved, so that the screen assets still load', async () => {
	const log = [];
	useDocument( log, () => false );
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	apiStub.respondWith( async ( method, route ) => ( route === SCREEN_ASSETS_ROUTE ? { scripts: [ script( 'broken-screen', '/wp-content/plugins/acme/broken.js' ) ], styles: [], ajaxurl: '' } : { notices: [], assets: {} } ) );
	globalThis.__modules[ '/components/core/notices.js' ] = new SyntaxError( 'Unexpected token' );
	const warn = console.warn;
	console.warn = () => {};
	try {
		const notices = createNotices( { reactive } );
		mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'options-general.php' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured } } );
		await flush();
	} finally {
		console.warn = warn;
	}
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/broken.js notice shown: false' ] );
} );

test( 'pageNotices.ready() gives up waiting for a core/notices that never loads, so that the screen assets still load', async () => {
	const log = [];
	useDocument( log, () => false );
	globalThis.location = { pathname: '/wp-admin/options-general.php', search: '' };
	apiStub.respondWith( async ( method, route ) => ( route === SCREEN_ASSETS_ROUTE ? { scripts: [ script( 'stalled-screen', '/wp-content/plugins/acme/stalled.js' ) ], styles: [], ajaxurl: '' } : { notices: [], assets: {} } ) );
	globalThis.__modules[ '/components/core/notices.js' ] = new Promise( () => {} );
	const notices = createNotices( { reactive } );
	mount( () => h( Contracted, { id: 'core/frame', manifest: { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] }, page: pageFor( 'options-general.php' ), current: '', base: '/wp-admin/' } ), { provide: { notices, capturedNotices: notices.addCaptured, noticesReadyTimeout: 30 } } );
	await flush();
	assert.deepEqual( log, [], 'still waiting' );
	await new Promise( ( resolve ) => setTimeout( resolve, 40 ) );
	await flush();
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/plugins/acme/stalled.js notice shown: false' ] );
} );
