import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';


const { mount, unmountAll, find, byClass, byTag, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { default: Shell, shellTitle } = await import( '../site/runtime/Shell.js' );

const { h, reactive, shallowRef, defineComponent } = Vue;
afterEach( unmountAll );

test( 'shellTitle names the screen shown when no page is on screen', () => {
	assert.equal( shellTitle( 'login' ), 'Sign in' );
	assert.equal( shellTitle( 'loading' ), 'Loading…' );
	assert.equal( shellTitle( 'error' ), 'Error' );
	assert.equal( shellTitle( 'notfound' ), 'Error' );
} );

test( 'the shell leaves the title to the page while a page is on screen, also while the next one loads', async ( t ) => {
	t.mock.method( globalThis, 'fetch', async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } ) );
	const doc = { title: '' };
	globalThis.document = doc;
	t.after( () => {
		delete globalThis.document;
	} );

	const Frame = defineComponent( { props: [ 'page' ], render() { return h( 'main', this.page.title ); } } );
	const admin = { Contracted: Frame, adminBase: () => '/wp-admin/', currentMenuPath: ( { path } ) => path };
	const signedIn = shallowRef( null );
	// The login screen's v-model needs a real DOM; the error screen does not.
	const state = reactive( { status: 'error', manifest: null, page: null, error: null } );
	const router = { state, refresh() {}, login() {}, signOut() {} };

	mount( () => h( Shell, { router, signedIn } ) );
	await flush();
	assert.equal( doc.title, 'Error' );

	state.status = 'loading';
	await flush();
	assert.equal( doc.title, 'Loading…' );

	signedIn.value = admin;
	Object.assign( state, { status: 'ready', manifest: { menu: [] }, page: { path: 'a.php', title: 'A' } } );
	await flush();
	doc.title = 'A ‹ Site — WordPress'; // What the page host writes.

	state.status = 'loading'; // The next page is loading; the frame stays.
	await flush();
	assert.equal( doc.title, 'A ‹ Site — WordPress' );

	state.status = 'notfound';
	await flush();
	assert.equal( doc.title, 'Error' );
} );

test( 'a page the router refuses keeps the frame when one is shown; without a frame the forbidden screen is shown alone', async ( t ) => {
	t.mock.method( globalThis, 'fetch', async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } ) );
	const Frame = defineComponent( { props: [ 'page', 'id' ], render() { return h( 'div', { class: 'frame', 'data-id': this.id }, this.page.title ); } } );
	const admin = { Contracted: Frame, adminBase: () => '/wp-admin/', currentMenuPath: ( { path } ) => path };
	const signedIn = shallowRef( admin );
	const state = reactive( { status: 'forbidden', manifest: null, page: null, error: null } );
	const router = { state, refresh() {}, login() {}, signOut() {} };
	const view = mount( () => h( Shell, { router, signedIn } ) );
	await flush();
	assert.equal( find( view.container, byClass( 'frame' ) ), null );
	assert.equal( find( view.container, byTag( 'main' ) ).props[ 'data-kind' ], 'forbidden' );

	Object.assign( state, { status: 'forbidden', manifest: { menu: [] }, page: { path: 'index.php', title: 'Dashboard' } } );
	await flush();
	const frame = find( view.container, byClass( 'frame' ) );
	assert.ok( frame, 'the frame stays' );
	assert.equal( frame.props[ 'data-id' ], 'core/frame' );
	assert.equal( find( view.container, ( el ) => el.props?.[ 'data-kind' ] === 'forbidden' ), null, 'the page host, not the shell, shows the forbidden screen' );
} );

test( 'the frame\'s current menu item is the page\'s menuCurrent when it has one, else its path', async ( t ) => {
	t.mock.method( globalThis, 'fetch', async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } ) );
	const Frame = defineComponent( { props: [ 'page', 'current' ], render() { return h( 'div', { class: 'frame', 'data-current': this.current } ); } } );
	const admin = { Contracted: Frame, adminBase: () => '/wp-admin/', currentMenuPath: ( { context, path } ) => ( context === 'site' ? path : context + '/' + path ) };
	const state = reactive( { status: 'ready', manifest: { menu: [] }, page: { path: 'comment.php?action=editcomment&c=3', title: 'Edit Comment', menuCurrent: 'edit-comments.php' }, error: null } );
	const router = { state, refresh() {}, login() {}, signOut() {} };
	const view = mount( () => h( Shell, { router, signedIn: shallowRef( admin ) } ) );
	await flush();
	assert.equal( find( view.container, byClass( 'frame' ) ).props[ 'data-current' ], 'edit-comments.php' );
	state.page = { path: 'edit-comments.php?p=4', title: 'Comments', menuCurrent: null };
	await flush();
	assert.equal( find( view.container, byClass( 'frame' ) ).props[ 'data-current' ], 'edit-comments.php?p=4' );
} );
