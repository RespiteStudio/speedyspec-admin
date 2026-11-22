/** @jest-environment jsdom */
// Profile and Edit User (core/user-edit) as a page: the contract, user-edit.php's form and
// heading, Update (POST users/{id} with classicPost(), the screen and the referer, then the
// redirect followed with history replace), the form's errors with the typed values kept, a failed
// answer, the messages with Go to Users, the refusal, the `#password` hash, and Help.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { openHelp, selected, titles } from '../../helpers/help-tabs.mjs';
import contract from '../../../site/contracts/core/user-edit.js';
import { apiError, editData, host, loadContracts, mountUserEdit, profileData, setMeter, settle, unsetMeter } from './data.mjs';

beforeEach( async () => {
	api.reset();
	setMeter( 4 );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	unsetMeter();
	window.location.hash = '';
	delete window.HTMLElement.prototype.scrollIntoView;
	document.body.className = '';
	document.body.innerHTML = '';
} );

const saves = () => api.calls.filter( ( call ) => call.method === 'POST' && /^wp-admin\/v1\/users\/\d+$/.test( call.route ) );

test( 'the contract: a page, two segments, 1.0.0, data and page, emits saved', () => {
	expect( contract.id ).toBe( 'core/user-edit' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBe( true );
	expect( Object.keys( contract.props ).sort() ).toEqual( [ 'data', 'page' ] );
	expect( contract.emits ).toEqual( [ 'saved' ] );
} );

test( 'the form: form#your-profile, the hidden user_id, Update Profile, the body class while shown', async () => {
	const wrapper = await mountUserEdit();
	const form = wrapper.find( '#profile-page form#your-profile' );
	expect( form.attributes( 'novalidate' ) ).toBeDefined();
	expect( form.find( 'input#user_id' ).element.value ).toBe( '7' );
	expect( form.find( 'p.submit input#submit.button.button-primary' ).element.value ).toBe( 'Update Profile' );
	expect( wrapper.find( '.page-title-action' ).exists() ).toBe( false );
	expect( document.body.classList.contains( 'profile-php' ) ).toBe( true );
	wrapper.unmount();
	expect( document.body.classList.contains( 'profile-php' ) ).toBe( false );
} );

test( 'back link: Edit User has the heading\'s Add User and Update User; User updated. links back with Go to Users', async () => {
	const message = { markup: '<strong>User updated.</strong>', type: 'updated', back: { label: '← Go to Users', path: 'users.php' }, cancel: null };
	const wrapper = await mountUserEdit( editData( { messages: [ message ] } ), host( '/wp-admin/user-edit.php', '?user_id=9&updated=1' ) );
	const add = wrapper.find( 'a.page-title-action' );
	expect( add.text() ).toBe( 'Add User' );
	expect( add.attributes( 'href' ) ).toBe( '/wp-admin/user-new.php' );
	expect( wrapper.find( '#submit' ).element.value ).toBe( 'Update User' );
	const notice = wrapper.find( '#message.updated.notice.is-dismissible' );
	expect( notice.findAll( 'p' )[ 0 ].text() ).toBe( 'User updated.' );
	expect( notice.find( 'p a' ).text() ).toBe( '← Go to Users' );
	expect( notice.find( 'p a' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php' );
	await notice.find( 'button.notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
} );

test( 'payload: Update posts users/{id} with the fields, the screen and the referer, then follows the redirect, replacing the entry', async () => {
	api.respondWith( async () => ( { redirect: 'user-edit.php?user_id=9&updated=1&wp_http_referer=users.php', location: null } ) );
	const record = host( '/wp-admin/user-edit.php', '?user_id=9' );
	const wrapper = await mountUserEdit( editData(), record );
	await wrapper.find( '#first_name' ).setValue( 'Janet' );
	await wrapper.find( '#email' ).setValue( 'janet@example.org' );
	await wrapper.find( '#role' ).setValue( 'editor' );
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( saves() ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/9', payload: {
		fields: {
			user_login: 'jroe', admin_color: 'modern', admin_bar_front: '1',
			role: 'editor', first_name: 'Janet', last_name: 'Roe', nickname: 'jroe', display_name: 'Jane Roe',
			email: 'janet@example.org', url: 'https://example.org/jdoe', description: 'Writes things.',
		},
		screen: 'user-edit',
		referer: 'http://localhost:8889/wp-admin/users.php',
	} } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'user-edit.php?user_id=9&updated=1&wp_http_referer=users.php', location: null }, { replace: true } ] ] );
} );

test( 'payload: the Profile posts screen profile and no referer', async () => {
	api.respondWith( async () => ( { redirect: 'profile.php?updated=1', location: null } ) );
	const wrapper = await mountUserEdit();
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( saves()[ 0 ].payload.screen ).toBe( 'profile' );
	expect( saves()[ 0 ].payload.referer ).toBe( '' );
} );

test( 'errors keep values: every error in the classic notice, the typed values kept, the password closed again, nothing followed', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === 'wp-admin/v1/users/7' ) {
			throw apiError( { status: 400, code: 'nickname', message: 'Please enter a nickname.', data: { field: 'nickname', errors: [
				{ code: 'nickname', message: '<strong>Error:</strong> Please enter a nickname.', field: 'nickname' },
				{ code: 'detached_fixture_profile_error', message: 'Fixture profile error.', field: null },
			] } } );
		}
		return { password: 'Another-generated-1' };
	} );
	const wrapper = await mountUserEdit();
	await wrapper.find( '#nickname' ).setValue( '' );
	await wrapper.find( '#first_name' ).setValue( 'Kept' );
	await wrapper.find( 'button.wp-generate-pw' ).trigger( 'click' );
	await settle();
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	const errors = wrapper.findAll( '.wp-admin-user-edit-errors.notice.error p' );
	expect( errors.map( ( p ) => p.text() ) ).toEqual( [ 'Error: Please enter a nickname.', 'Fixture profile error.' ] );
	expect( errors[ 0 ].find( 'strong' ).text() ).toBe( 'Error:' );
	expect( wrapper.find( '#nickname' ).element.value ).toBe( '' );
	expect( wrapper.find( '#first_name' ).element.value ).toBe( 'Kept' );
	expect( wrapper.find( '#pass1' ).exists() ).toBe( false );
	expect( wrapper.find( 'button.wp-generate-pw' ).attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( wrapper.record.followed ).toEqual( [] );
	expect( wrapper.record.spoken ).toContain( 'Please enter a nickname.' );
} );

test( 'a failed answer: WordPress\'s message in a focused page notice; values kept; Update enabled', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture save failure.' } );
	} );
	const wrapper = await mountUserEdit();
	await wrapper.find( '#first_name' ).setValue( 'Kept' );
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( wrapper.record.added ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Fixture save failure.', scope: 'page' } ) ] );
	expect( document.activeElement?.id ).toBe( 'wp-admin-notice-1' );
	expect( wrapper.find( '#first_name' ).element.value ).toBe( 'Kept' );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( false );
	expect( wrapper.find( '.wp-admin-user-edit-errors' ).exists() ).toBe( false );
} );

test( 'a failed answer: a second Update while one is on its way is ignored', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = resolve;
	} ) );
	const wrapper = await mountUserEdit();
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( saves() ).toHaveLength( 1 );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( true );
	release( { redirect: 'profile.php?updated=1', location: null } );
	await settle();
} );

test( 'messages: the super admin notice, Profile updated., the new-email error, each in its classic notice', async () => {
	const wrapper = await mountUserEdit( profileData( { messages: [
		{ markup: '<strong>Important:</strong> This user has super admin privileges.', type: 'info', back: null, cancel: null },
		{ markup: '<strong>Profile updated.</strong>', type: 'updated', back: null, cancel: null },
		{ markup: 'Error while saving the new email address. Please try again.', type: 'error', back: null, cancel: null },
	] } ) );
	const notices = wrapper.findAll( '.wp-admin-user-edit-messages > .notice' );
	expect( notices.map( ( notice ) => notice.find( 'p' ).text() ) ).toEqual( [ 'Important: This user has super admin privileges.', 'Profile updated.', 'Error while saving the new email address. Please try again.' ] );
	expect( notices[ 0 ].classes() ).toContain( 'notice-info' );
	expect( notices[ 1 ].attributes( 'id' ) ).toBe( 'message' );
	expect( notices[ 2 ].classes() ).toContain( 'notice-error' );
} );

test( 'die screen: the refusal\'s text instead of the form, no user data; the load failure says so', async () => {
	let wrapper = await mountUserEdit( { error: { kind: 'die', status: 404, message: 'Invalid user ID.' } } );
	expect( wrapper.find( '.wp-admin-user-edit-error p' ).text() ).toBe( 'Invalid user ID.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
	wrapper.unmount();
	wrapper = await mountUserEdit( { failed: true } );
	expect( wrapper.find( '.wp-admin-user-edit-failed' ).text() ).toBe( 'The profile could not be loaded.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
} );

test( 'the #password hash scrolls to the password row, as user-edit.php', async () => {
	const scrolled = [];
	window.HTMLElement.prototype.scrollIntoView = function () {
		scrolled.push( this.className );
	};
	window.location.hash = '#password';
	await mountUserEdit();
	expect( scrolled ).toEqual( [ expect.stringContaining( 'user-pass1-wrap' ) ] );
} );

test( 'new data (the page read again after Update) resets the values', async () => {
	const record = host();
	const { h, ref } = await import( 'vue' );
	const { mountPart } = await import( '../../helpers/mount.mjs' );
	const Contracted = ( await import( '../../../site/runtime/Contracted.js' ) ).default;
	const data = ref( profileData() );
	const wrapper = mountPart( { setup: () => () => h( Contracted, { id: 'core/user-edit', data: data.value, page: { path: 'profile.php', title: 'Profile' } } ) }, { provide: record.provide } );
	await settle();
	await wrapper.find( '#first_name' ).setValue( 'Typed' );
	data.value = profileData( { user: { ...profileData().user, firstName: 'Stored' } } );
	await settle();
	expect( wrapper.find( '#first_name' ).element.value ).toBe( 'Stored' );
} );

const HELP = {
	tabs: [ { id: 'overview', title: 'Overview', priority: 10, content: '<p>Your profile contains information about you (your &#8220;account&#8221;) as well as some personal options related to using WordPress.</p><p>Remember to click the Update Profile button when you are finished.</p>' } ],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/users-your-profile-screen/">Documentation on User Profiles</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

test( 'help: Overview from the router, with the User Profiles documentation in the sidebar', () => {
	const wrapper = openHelp( null, HELP, { data: profileData() } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [
		'https://wordpress.org/documentation/article/users-your-profile-screen/',
		'https://wordpress.org/support/forums/',
	] );
} );
