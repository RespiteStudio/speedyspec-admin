import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, Vue } = await import( './helpers/render.mjs' );
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
