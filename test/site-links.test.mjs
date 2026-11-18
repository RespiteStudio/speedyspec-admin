import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, Vue } = await import( './helpers/render.mjs' );
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

const redirected = ( location ) => ( {
	state: { error: { status: 409, code: 'admin_init_redirect', data: { status: 409, location } } },
	refresh() {},
	currentUrl: () => '/wp-admin/options-general.php',
} );

test( 'the no-access screen after a plugin redirect links to where WordPress sent the user, when that is a safe URL', () => {
	const view = mount( () => h( ErrorScreen, { router: redirected( 'http://localhost:8889/' ), kind: 'forbidden' } ) );
	const links = findAll( view.container, byTag( 'a' ) );
	assert.deepEqual( links.map( ( a ) => a.props.href ), [ 'http://localhost:8889/', '/wp-admin/' ] );
	assert.match( view.text(), /WordPress sent this request to another address/ );
	assert.match( view.text(), /http:\/\/localhost:8889\// );
} );

test( 'an unsafe or missing redirect location is not linked', () => {
	for ( const location of [ 'javascript:alert(1)', 'data:text/html,x', null, 42, ' http://x/' ] ) {
		unmountAll();
		const view = mount( () => h( ErrorScreen, { router: redirected( location ), kind: 'forbidden' } ) );
		assert.deepEqual( findAll( view.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ '/wp-admin/' ], String( location ) );
	}
} );
