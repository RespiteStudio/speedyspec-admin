import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, byTag, Vue } = await import( './helpers/render.mjs' );
const { sitePrefix } = await import( '../site/runtime/router.js' );
const { default: ErrorScreen } = await import( '../site/pages/ErrorScreen.js' );
const { default: Login } = await import( '../site/pages/Login.js' );
const { h } = Vue;

afterEach( unmountAll );

test( 'sitePrefix is the /sites/{id} part of an admin path, or empty', () => {
	assert.equal( sitePrefix( '/sites/3/wp-admin/options-general.php' ), '/sites/3' );
	assert.equal( sitePrefix( '/wp-admin/' ), '' );
	assert.equal( sitePrefix( '/sites/x/wp-admin/' ), '' );
} );

const routerAt = ( url ) => ( { state: { error: null }, refresh() {}, currentUrl: () => url } );

test( 'the error screen links to the Dashboard of the site shown', () => {
	const view = mount( () => h( ErrorScreen, { router: routerAt( '/sites/3/wp-admin/edit.php' ), kind: 'forbidden' } ) );
	assert.equal( find( view.container, byTag( 'a' ) ).props.href, '/sites/3/wp-admin/' );
	unmountAll();
	const root = mount( () => h( ErrorScreen, { router: routerAt( '/wp-admin/edit.php' ), kind: 'notfound' } ) );
	assert.equal( find( root.container, byTag( 'a' ) ).props.href, '/wp-admin/' );
} );

test( 'the sign-in screen links to the lost-password screen of the site shown', ( t ) => {
	// Its form controls need a real DOM; the link is computed in setup() and bound in the template.
	t.mock.method( console, 'warn', () => {} );
	assert.match( Login.template, /:href="lostPasswordUrl"/ );
	assert.equal( Login.setup( { router: routerAt( '/sites/3/wp-admin/' ) } ).lostPasswordUrl.value, '/sites/3/wp-login.php?action=lostpassword' );
	assert.equal( Login.setup( { router: routerAt( '/wp-admin/' ) } ).lostPasswordUrl.value, '/wp-login.php?action=lostpassword' );
} );
