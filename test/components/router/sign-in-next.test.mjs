/** @jest-environment jsdom */
// Where a sign-in lands (wp-login.php's decision, answered by WordPress as the session's `next`):
// the router sends the remembered address relative to its admin as `redirect_to`, follows the
// `redirect` or loads the `location` WordPress answers, holds the admin email verification
// (`next.verifyAdminEmail`) until it is answered through `session/admin-email`, and, without a
// `next` (an older WordPress), opens the remembered address as before.
import { expect, test } from '@jest/globals';
import { defineComponent, h, reactive, shallowRef } from 'vue';
import { adminRelative, createRouter } from '../../../site/runtime/router.js';
import { ApiError } from '../../../site/runtime/api.js';
import Shell from '../../../site/runtime/Shell.js';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';

const ORIGIN = 'http://admin.test';
const SESSION = 'wp-admin/v1/session';
const ADMIN_EMAIL = 'wp-admin/v1/session/admin-email';
const manifestFor = ( path ) => ( { apiVersion: 1, locale: { code: 'en_US', dir: 'ltr' }, importMap: { imports: {} }, menu: [], replacements: {}, slots: {}, page: { path, title: path, component: 'core/x', textDomains: [], data: {} } } );
const VERIFICATION = {
	title: 'Confirm your administration email',
	email: 'owner@example.org',
	helpUrl: 'https://wordpress.org/documentation/article/settings-general-screen/#email-address',
	changePath: 'options-general.php?highlight=confirm_admin_email',
	remindLater: true,
	texts: {},
	hooks: { confirm: null, form: null },
	redirectTo: 'http://wp.test/wp-admin/edit.php',
};

/** A router on a fake location and history, signed out at `initial`, whose session answers `answer`. */
async function signedOutAt( initial, { session = {}, emailAnswer = async () => ( { redirect: '', location: null } ) } = {} ) {
	const location = { origin: ORIGIN, pathname: '', search: '', assigned: [] };
	location.assign = ( url ) => location.assigned.push( url );
	const set = ( url ) => {
		const u = new URL( url, ORIGIN );
		location.pathname = u.pathname;
		location.search = u.search;
	};
	set( initial );
	const calls = [];
	const history = {
		pushState( s, t, url ) {
			calls.push( [ 'push', url ] );
			set( url );
		},
		replaceState( s, t, url ) {
			calls.push( [ 'replace', url ] );
			set( url );
		},
	};
	let signedIn = false;
	const log = [];
	const api = {
		base: '/wp-json/',
		setBase( base ) {
			api.base = base;
		},
		setNonce() {},
		onUnauthorized() {},
		async get( route, params ) {
			log.push( [ 'get', route, params, api.base ] );
			if ( ! signedIn ) {
				throw new ApiError( { status: 401, code: 'rest_not_logged_in', message: 'no' } );
			}
			return manifestFor( params.path );
		},
		async post( route, body ) {
			log.push( [ 'post', route, body, api.base ] );
			if ( route === ADMIN_EMAIL ) {
				return emailAnswer( body );
			}
			signedIn = true;
			return { user: { id: 1 }, nonce: 'n', components: [], ...session };
		},
		async del() {
			return null;
		},
	};
	const verified = [];
	const router = createRouter( { api, history, location, reactive, onVerifyAdminEmail: () => verified.push( true ) } );
	await router.navigate( initial );
	expect( router.state.status ).toBe( 'login' );
	calls.length = 0;
	log.length = 0;
	return { router, location, calls, log, verified };
}

const login = ( router ) => router.login( { username: 'a', password: 'b', remember: false } );

test( 'redirect_to sent: the remembered address relative to its admin, without the /wp-admin/ or /sites/{id}/wp-admin/ prefix', async () => {
	const cases = [
		[ '/wp-admin/', '' ],
		[ '/wp-admin/edit.php?post_type=page', 'edit.php?post_type=page' ],
		[ '/sites/3/wp-admin/upload.php?mode=list', 'upload.php?mode=list' ],
		[ '/wp-admin/network/sites.php', 'network/sites.php' ],
	];
	for ( const [ initial, sent ] of cases ) {
		const { router, log } = await signedOutAt( initial );
		await login( router );
		expect( log[ 0 ] ).toEqual( [ 'post', SESSION, { username: 'a', password: 'b', remember: false, redirect_to: sent }, '/wp-json/' ] );
	}
	expect( adminRelative( '/wp-admin/?admin_email_remind_later=1' ) ).toBe( '?admin_email_remind_later=1' );
	expect( adminRelative( '/wp-login.php' ) ).toBe( '' );
} );

test( 'redirect followed: a Subscriber signing in at the admin is sent to Profile, replacing the address', async () => {
	const { router, location, calls } = await signedOutAt( '/wp-admin/', { session: { next: { redirect: 'profile.php', location: null, verifyAdminEmail: null } } } );
	await login( router );
	expect( router.state.status ).toBe( 'ready' );
	expect( router.state.page.path ).toBe( 'profile.php' );
	expect( location.pathname ).toBe( '/wp-admin/profile.php' );
	expect( calls ).toEqual( [ [ 'replace', '/wp-admin/profile.php' ] ] );
} );

test( 'redirect followed on a subsite: the target is in that site\'s admin', async () => {
	const { router, location } = await signedOutAt( '/sites/3/wp-admin/', { session: { next: { redirect: 'edit.php?detached_fixture_login=1', location: null, verifyAdminEmail: null } } } );
	await login( router );
	expect( location.pathname + location.search ).toBe( '/sites/3/wp-admin/edit.php?detached_fixture_login=1' );
	expect( router.state.page.path ).toBe( 'edit.php?detached_fixture_login=1' );
} );

test( 'location loaded: a target out of the admin (a user without read: the home page) is loaded in the browser', async () => {
	const { router, location } = await signedOutAt( '/wp-admin/', { session: { next: { redirect: null, location: 'http://wp.test/', verifyAdminEmail: null } } } );
	await login( router );
	expect( location.assigned ).toEqual( [ 'http://wp.test/' ] );
} );

test( 'verifyAdminEmail held: nothing else is shown or asked for until it is answered; confirm posts the answer on the root site and follows it', async () => {
	const answers = [];
	const { router, location, log, verified } = await signedOutAt( '/sites/3/wp-admin/edit.php', {
		session: { next: { redirect: 'edit.php', location: null, verifyAdminEmail: VERIFICATION } },
		emailAnswer: async ( body ) => {
			answers.push( body );
			return { redirect: 'edit.php', location: null };
		},
	} );
	await login( router );
	expect( router.state.status ).toBe( 'verify' );
	expect( router.state.verifyAdminEmail ).toEqual( VERIFICATION );
	expect( verified ).toEqual( [ true ] );
	expect( log.filter( ( [ method ] ) => method === 'get' ) ).toEqual( [] );
	expect( location.pathname ).toBe( '/sites/3/wp-admin/edit.php' );

	await router.answerAdminEmail( 'confirm' );
	expect( answers ).toEqual( [ { action: 'confirm', redirect_to: VERIFICATION.redirectTo } ] );
	expect( log.find( ( [ , route ] ) => route === ADMIN_EMAIL )[ 3 ] ).toBe( '/wp-json/' );
	expect( router.state.verifyAdminEmail ).toBe( null );
	expect( router.state.status ).toBe( 'ready' );
	expect( router.state.page.path ).toBe( 'edit.php' );
} );

test( 'verifyAdminEmail held: remind follows the answer with its query', async () => {
	const { router, location } = await signedOutAt( '/wp-admin/', {
		session: { next: { redirect: '', location: null, verifyAdminEmail: VERIFICATION } },
		emailAnswer: async () => ( { redirect: '?admin_email_remind_later=1', location: null } ),
	} );
	await login( router );
	await router.answerAdminEmail( 'remind' );
	expect( location.pathname + location.search ).toBe( '/wp-admin/?admin_email_remind_later=1' );
	expect( router.state.page.path ).toBe( 'index.php?admin_email_remind_later=1' );
} );

test( 'verifyAdminEmail held: a failed answer keeps the step and rethrows', async () => {
	const { router } = await signedOutAt( '/wp-admin/', {
		session: { next: { redirect: '', location: null, verifyAdminEmail: VERIFICATION } },
		emailAnswer: async () => {
			throw new ApiError( { status: 500, code: 'fixture_failure', message: 'Broken' } );
		},
	} );
	await login( router );
	await expect( router.answerAdminEmail( 'confirm' ) ).rejects.toMatchObject( { code: 'fixture_failure' } );
	expect( router.state.status ).toBe( 'verify' );
	expect( router.state.verifyAdminEmail ).toEqual( VERIFICATION );
} );

test( 'verifyAdminEmail held: leaving it another way (a navigation) skips it, as leaving the classic screen does', async () => {
	const { router } = await signedOutAt( '/wp-admin/', { session: { next: { redirect: '', location: null, verifyAdminEmail: VERIFICATION } } } );
	await login( router );
	await router.navigate( '/wp-admin/options-general.php?highlight=confirm_admin_email' );
	expect( router.state.verifyAdminEmail ).toBe( null );
	expect( router.state.status ).toBe( 'ready' );
	expect( router.state.page.path ).toBe( 'options-general.php?highlight=confirm_admin_email' );
} );

test( 'no next falls back: an older WordPress opens the remembered address, as before', async () => {
	const { router, location, calls } = await signedOutAt( '/wp-admin/options-general.php' );
	await login( router );
	expect( router.state.status ).toBe( 'ready' );
	expect( router.state.page.path ).toBe( 'options-general.php' );
	expect( location.pathname ).toBe( '/wp-admin/options-general.php' );
	expect( calls ).toEqual( [] );
} );

test( 'a next with no target that can be followed opens the remembered address', async () => {
	const { router } = await signedOutAt( '/wp-admin/edit.php', { session: { next: { redirect: null, location: 'javascript:alert(1)', verifyAdminEmail: null } } } );
	await login( router );
	expect( router.state.page.path ).toBe( 'edit.php' );
} );

test( 'the shell shows the verification step alone (core/admin-email-confirm with the data and the router\'s answer), titled by WordPress', async () => {
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } );
	try {
		const shown = [];
		const Contracted = defineComponent( {
			inheritAttrs: false,
			setup( props, { attrs } ) {
				return () => {
					shown.push( { ...attrs } );
					return h( 'div', { class: 'stub-' + attrs.id } );
				};
			},
		} );
		const admin = { Contracted, ADMIN_EMAIL_CONFIRM: 'core/admin-email-confirm', adminBase: () => '/wp-admin/', currentMenuPath: ( { path } ) => path };
		const answered = [];
		const state = reactive( { status: 'verify', manifest: null, page: null, error: null, forbiddenMarkup: null, verifyAdminEmail: VERIFICATION } );
		const router = { state, refresh() {}, login() {}, signOut() {}, answerAdminEmail: async ( action ) => answered.push( action ) };
		const wrapper = mountPart( Shell, { props: { router, signedIn: shallowRef( admin ) } } );
		await settle();
		expect( wrapper.findAll( '[class^="stub-"]' ).map( ( node ) => node.classes()[ 0 ] ) ).toEqual( [ 'stub-core/admin-email-confirm' ] );
		expect( wrapper.find( '.wp-admin-login__form' ).exists() ).toBe( false );
		expect( shown.at( -1 ).data ).toEqual( VERIFICATION );
		await shown.at( -1 ).answer( 'remind' );
		expect( answered ).toEqual( [ 'remind' ] );
		expect( document.title ).toBe( 'Confirm your administration email' );

		// Before the protected entry is loaded: the loading screen, not the sign-in form.
		const waiting = mountPart( Shell, { props: { router, signedIn: shallowRef( null ) } } );
		await settle();
		expect( waiting.find( '.wp-admin-loading' ).exists() ).toBe( true );
		expect( waiting.find( '.wp-admin-login__form' ).exists() ).toBe( false );
	} finally {
		globalThis.fetch = realFetch;
	}
} );
