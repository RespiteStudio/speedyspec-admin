/** @jest-environment jsdom */
// Account Management and Additional Capabilities of Profile and Edit User
// (core/user-edit/account.js): the password rows (core/user-password, `change`), Send Reset Link
// (POST users/{id}/password-reset), the session buttons (DELETE users/{id}/sessions, the message
// in the row and the button disabled after, as user-profile.js), the sections the filters hide,
// and the capabilities list.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { INITIAL, account, apiError, editData, loadContracts, mountUserEdit, profileData, setMeter, settle, unsetMeter } from './data.mjs';

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
	document.body.className = '';
	document.body.innerHTML = '';
} );

const saves = () => api.calls.filter( ( call ) => call.method === 'POST' && /^wp-admin\/v1\/users\/\d+$/.test( call.route ) );

test( 'the section: Account Management with the password rows closed, Set New Password and the session row', async () => {
	const wrapper = await mountUserEdit();
	expect( wrapper.findAll( 'form#your-profile h2' ).map( ( h2 ) => h2.text() ) ).toContain( 'Account Management' );
	const generate = wrapper.find( 'tr.user-pass1-wrap button.wp-generate-pw' );
	expect( generate.text() ).toBe( 'Set New Password' );
	expect( generate.attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( wrapper.find( '#pass1' ).exists() ).toBe( false );
	expect( wrapper.find( 'tr.user-pass1-wrap label[for="pass1"]' ).text() ).toBe( 'New Password' );
	const sessions = wrapper.find( 'tr.user-sessions-wrap' );
	expect( sessions.find( 'th' ).text() ).toBe( 'Sessions' );
	expect( sessions.find( '.destroy-sessions button' ).text() ).toBe( 'Log Out Everywhere Else' );
	expect( sessions.find( '.destroy-sessions button' ).element.disabled ).toBe( true );
	expect( sessions.find( '#sessions-description' ).text() ).toBe( 'You are only logged in at this location.' );
	expect( wrapper.find( 'tr.user-generate-reset-link-wrap' ).exists() ).toBe( false );
} );

test( 'password sent only after Set: Update sends no password while closed; after Set, pass1 and pass2 equal; Cancel sends none again', async () => {
	api.respondWith( async () => ( { redirect: 'profile.php?updated=1', location: null } ) );
	const wrapper = await mountUserEdit();
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( saves()[ 0 ].payload.fields, 'pass1' ) ).toBe( false );

	await wrapper.find( 'button.wp-generate-pw' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#pass1' ).element.value ).toBe( INITIAL );
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( saves()[ 1 ].payload.fields.pass1 ).toBe( INITIAL );
	expect( saves()[ 1 ].payload.fields.pass2 ).toBe( INITIAL );

	await wrapper.find( 'button.wp-cancel-pw' ).trigger( 'click' );
	await settle();
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( saves()[ 2 ].payload.fields, 'pass1' ) ).toBe( false );
} );

test( 'password sent only after Set: a weak password disables Update until it is confirmed', async () => {
	setMeter( 1 );
	const wrapper = await mountUserEdit();
	await wrapper.find( 'button.wp-generate-pw' ).trigger( 'click' );
	await wrapper.find( '#pass1' ).setValue( 'abc' );
	await settle();
	expect( wrapper.find( 'tr.pw-weak' ).exists() ).toBe( true );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( true );
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	expect( saves() ).toEqual( [] );
	await wrapper.find( 'input.pw-checkbox' ).setValue( true );
	await settle();
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( false );
} );

test( 'password sent only after Set: Set New Password asks users/generate-password for the next one', async () => {
	api.respondWith( async () => ( { password: 'Next-generated-password-1' } ) );
	const wrapper = await mountUserEdit();
	await wrapper.find( 'button.wp-generate-pw' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => [ call.method, call.route ] ) ).toEqual( [ [ 'GET', 'wp-admin/v1/users/generate-password' ] ] );
} );

test( 'sessions: Log Out Everywhere Else ends the others, says so in the row and is disabled after', async () => {
	api.respondWith( async () => ( { message: 'You are now logged out everywhere else.' } ) );
	const wrapper = await mountUserEdit( profileData( { account: account( { sessions: { kind: 'others', label: 'Log Out Everywhere Else', description: 'Did you lose your phone or leave your account logged in at a public computer? You can log out everywhere else, and stay logged in here.', disabled: false } } ) } ) );
	const button = wrapper.find( '#destroy-sessions' );
	expect( button.element.disabled ).toBe( false );
	await button.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/users/7/sessions', payload: undefined } ] );
	const notice = wrapper.find( 'tr.user-sessions-wrap .notice.notice-success.inline' );
	expect( notice.attributes( 'role' ) ).toBe( 'alert' );
	expect( notice.text() ).toBe( 'You are now logged out everywhere else.' );
	expect( wrapper.find( '#destroy-sessions' ).element.disabled ).toBe( true );
} );

test( 'sessions: on Edit User, Log Out Everywhere ends the user\'s sessions', async () => {
	api.respondWith( async () => ( { message: 'Jane Roe has been logged out.' } ) );
	const wrapper = await mountUserEdit( editData() );
	expect( wrapper.find( 'tr.user-sessions-wrap #sessions-description' ).text() ).toBe( 'Log Jane Roe out of all locations.' );
	await wrapper.find( '#destroy-sessions' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => [ call.method, call.route ] ) ).toEqual( [ [ 'DELETE', 'wp-admin/v1/users/9/sessions' ] ] );
	expect( wrapper.find( 'tr.user-sessions-wrap .notice-success' ).text() ).toBe( 'Jane Roe has been logged out.' );
	expect( wrapper.find( '#destroy-sessions' ).element.disabled ).toBe( true );
} );

test( 'a failed answer: sessions show WordPress\'s message as an error in the row, the button stays enabled', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 403, code: 'error', message: 'Could not log out user sessions. Please try again.' } );
	} );
	const wrapper = await mountUserEdit( editData() );
	await wrapper.find( '#destroy-sessions' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'tr.user-sessions-wrap .notice.notice-error.inline' ).text() ).toBe( 'Could not log out user sessions. Please try again.' );
	expect( wrapper.find( '#destroy-sessions' ).element.disabled ).toBe( false );
} );

test( 'reset link: Send Reset Link posts users/{id}/password-reset, says the answer and is disabled after', async () => {
	api.respondWith( async () => ( { message: 'A password reset link was emailed to jroe.' } ) );
	const wrapper = await mountUserEdit( editData() );
	const row = wrapper.find( 'tr.user-generate-reset-link-wrap' );
	expect( row.find( 'th' ).text() ).toBe( 'Password Reset' );
	expect( row.find( '#generate-reset-link-description' ).text() ).toBe( 'Send Jane Roe a link to reset their password. This will not change their password, nor will it force a change.' );
	await row.find( '#generate-reset-link' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/9/password-reset', payload: {} } ] );
	expect( wrapper.find( '.generate-reset-link .notice.notice-success.inline' ).text() ).toBe( 'A password reset link was emailed to jroe.' );
	expect( wrapper.find( '#generate-reset-link' ).element.disabled ).toBe( true );
} );

test( 'a failed answer: Send Reset Link shows the error in the row and stays enabled', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture reset failure.' } );
	} );
	const wrapper = await mountUserEdit( editData() );
	await wrapper.find( '#generate-reset-link' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '.generate-reset-link .notice.notice-error.inline' ).text() ).toBe( 'Fixture reset failure.' );
	expect( wrapper.find( '#generate-reset-link' ).element.disabled ).toBe( false );
} );

test( 'null sections: no password rows with show_password_fields off; the session row stays; no section at all for null', async () => {
	let wrapper = await mountUserEdit( profileData( { account: account( { password: false, initialPassword: null } ) } ) );
	expect( wrapper.find( 'tr.user-pass1-wrap' ).exists() ).toBe( false );
	expect( wrapper.find( 'tr.user-sessions-wrap' ).exists() ).toBe( true );
	wrapper.unmount();
	wrapper = await mountUserEdit( profileData( { account: null } ) );
	expect( wrapper.findAll( 'form#your-profile h2' ).map( ( h2 ) => h2.text() ) ).not.toContain( 'Account Management' );
	expect( wrapper.find( 'tr.user-sessions-wrap' ).exists() ).toBe( false );
} );

test( 'capabilities: the list under Additional Capabilities, as text; none when null', async () => {
	let wrapper = await mountUserEdit( editData( { capabilities: 'detached_extra, Denied: edit_posts' } ) );
	const headings = wrapper.findAll( 'form#your-profile h2' ).map( ( h2 ) => h2.text() );
	expect( headings.at( -1 ) ).toBe( 'Additional Capabilities' );
	const row = wrapper.find( 'tr.user-capabilities-wrap' );
	expect( row.find( 'th' ).text() ).toBe( 'Capabilities' );
	expect( row.find( 'td' ).text() ).toBe( 'detached_extra, Denied: edit_posts' );
	wrapper.unmount();
	wrapper = await mountUserEdit( editData( { capabilities: null } ) );
	expect( wrapper.find( 'tr.user-capabilities-wrap' ).exists() ).toBe( false );
} );
