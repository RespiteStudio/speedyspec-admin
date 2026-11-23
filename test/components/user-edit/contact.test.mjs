/** @jest-environment jsdom */
// The Name, Contact Info and About sections of Profile and Edit User (core/user-edit/name.js and
// contact.js) in user-edit.php's markup: the stored values as text, the email's confirmation
// description on one's own profile, the pending email notice and its Cancel (DELETE
// users/me/email-change), the contact methods, the biography and the profile picture.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { HOSTILE, apiError, editData, loadContracts, mountUserEdit, profileData, setMeter, settle, unsetMeter } from './data.mjs';

beforeEach( async () => {
	api.reset();
	setMeter( 4 );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	delete window.__ran;
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	unsetMeter();
	delete window.__ran;
	document.body.className = '';
	document.body.innerHTML = '';
} );

const PENDING = { markup: 'There is a pending change of your email to <code>new@example.org</code>.', cancel: { label: 'Cancel request', method: 'DELETE', path: 'users/me/email-change' } };

test( 'the Name section: Username read-only, the names, Nickname required and the display choices', async () => {
	const wrapper = await mountUserEdit();
	const headings = wrapper.findAll( 'form#your-profile h2' ).map( ( h2 ) => h2.text() );
	expect( headings.slice( 0, 4 ) ).toEqual( [ 'Personal Options', 'Name', 'Contact Info', 'About Yourself' ] );
	expect( wrapper.find( 'tr.user-user-login-wrap #user_login' ).element.value ).toBe( 'jdoe' );
	expect( wrapper.find( '#user_login' ).attributes( 'readonly' ) ).toBeDefined();
	expect( wrapper.find( '#user-login-description' ).text() ).toBe( 'Usernames cannot be changed.' );
	expect( wrapper.find( 'tr.user-first-name-wrap #first_name' ).element.value ).toBe( 'John' );
	expect( wrapper.find( '#first_name' ).attributes( 'autocomplete' ) ).toBe( 'given-name' );
	expect( wrapper.find( 'tr.user-last-name-wrap #last_name' ).element.value ).toBe( 'Doe' );
	expect( wrapper.find( 'label[for="nickname"]' ).text().replace( /\s+/g, ' ' ) ).toBe( 'Nickname (required)' );
	expect( wrapper.find( '#nickname' ).element.value ).toBe( 'jdoe' );
	expect( wrapper.findAll( '#display_name option' ).map( ( option ) => option.text() ) ).toEqual( [ 'jdoe', 'John', 'Doe', 'John Doe', 'Doe John' ] );
	expect( wrapper.find( '#display_name' ).element.value ).toBe( 'John Doe' );
	expect( wrapper.find( '#role' ).exists() ).toBe( false );
} );

test( 'the Name section: typing a name and leaving the field adds its display choices', async () => {
	const wrapper = await mountUserEdit();
	await wrapper.find( '#first_name' ).setValue( 'Johnny' );
	await wrapper.find( '#first_name' ).trigger( 'blur' );
	expect( wrapper.findAll( '#display_name option' ).map( ( option ) => option.text() ) ).toEqual( [ 'jdoe', 'John', 'Doe', 'John Doe', 'Doe John', 'Johnny', 'Johnny Doe', 'Doe Johnny' ] );
	await wrapper.find( '#display_name' ).setValue( 'Johnny Doe' );
	expect( wrapper.find( '#display_name' ).element.value ).toBe( 'Johnny Doe' );
} );

test( 'contact: email with its confirmation description on one\'s own profile, the website, the fixture contact method', async () => {
	const data = profileData( {
		contact: { methods: [ { name: 'detached_fixture_contact', label: 'Fixture contact' } ], emailConfirms: true, pendingEmail: null },
		user: { ...profileData().user, contact: { detached_fixture_contact: '@jdoe' } },
	} );
	const wrapper = await mountUserEdit( data );
	expect( wrapper.find( 'tr.user-email-wrap label[for="email"]' ).text().replace( /\s+/g, ' ' ) ).toBe( 'Email (required)' );
	expect( wrapper.find( '#email' ).element.value ).toBe( 'jdoe@example.org' );
	expect( wrapper.find( '#email' ).attributes( 'type' ) ).toBe( 'email' );
	expect( wrapper.find( '#email-description' ).text() ).toBe( 'If you change this, an email will be sent at your new address to confirm it. The new address will not become active until confirmed.' );
	expect( wrapper.find( '#email-description strong' ).text() ).toBe( 'The new address will not become active until confirmed.' );
	expect( wrapper.find( 'tr.user-url-wrap #url' ).element.value ).toBe( 'https://example.org/jdoe' );
	expect( wrapper.find( 'tr.user-detached_fixture_contact-wrap label[for="detached_fixture_contact"]' ).text() ).toBe( 'Fixture contact' );
	expect( wrapper.find( '#detached_fixture_contact' ).element.value ).toBe( '@jdoe' );
} );

test( 'contact: another user\'s email has no confirmation description', async () => {
	const wrapper = await mountUserEdit( editData() );
	expect( wrapper.find( '#email' ).element.value ).toBe( 'jroe@example.org' );
	expect( wrapper.find( '#email-description' ).exists() ).toBe( false );
	expect( wrapper.findAll( 'form#your-profile h2' ).map( ( h2 ) => h2.text() ) ).toContain( 'About the user' );
} );

test( 'contact: the biography and the profile picture with its description', async () => {
	const wrapper = await mountUserEdit();
	expect( wrapper.find( 'tr.user-description-wrap label[for="description"]' ).text() ).toBe( 'Biographical Info' );
	expect( wrapper.find( '#description' ).element.value ).toBe( 'Writes things.' );
	expect( wrapper.find( '#description-description' ).text() ).toBe( 'Share a little biographical information to fill out your profile. This may be shown publicly.' );
	const picture = wrapper.find( 'tr.user-profile-picture' );
	expect( picture.find( 'th' ).text() ).toBe( 'Profile Picture' );
	expect( picture.find( 'img.avatar' ).attributes( 'src' ) ).toBe( 'https://secure.gravatar.com/avatar/abc?s=96' );
	expect( picture.find( 'p.description a' ).attributes( 'href' ) ).toBe( 'https://gravatar.com/' );
	// Avatars off: no row.
	wrapper.unmount();
	const off = await mountUserEdit( profileData( { about: { heading: 'About Yourself', avatar: null } } ) );
	expect( off.find( 'tr.user-profile-picture' ).exists() ).toBe( false );
} );

test( 'pending notice and cancel: the inline notice under the email, and Cancel request deletes the change and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'profile.php?updated=true' } ) );
	const wrapper = await mountUserEdit( profileData( { contact: { methods: [], emailConfirms: true, pendingEmail: PENDING } } ) );
	const notice = wrapper.find( 'tr.user-email-wrap .notice.notice-info.inline' );
	expect( notice.text() ).toContain( 'There is a pending change of your email to new@example.org.' );
	expect( notice.find( 'code' ).text() ).toBe( 'new@example.org' );
	await notice.find( 'button' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/users/me/email-change', payload: undefined } ] );
	expect( wrapper.record.followed ).toEqual( [ [ { redirect: 'profile.php?updated=true' }, null ] ] );
} );

test( 'pending notice and cancel: the page notice\'s Cancel request does the same', async () => {
	api.respondWith( async () => ( { redirect: 'profile.php?updated=true' } ) );
	const message = { markup: 'Your email address has not been updated yet. Please check your inbox at <code>new@example.org</code> for a confirmation email.', type: 'info', back: null, cancel: PENDING.cancel };
	const wrapper = await mountUserEdit( profileData( { messages: [ message ] } ) );
	const notice = wrapper.find( '.wp-admin-user-edit-messages .notice.notice-info' );
	expect( notice.text() ).toContain( 'Your email address has not been updated yet.' );
	await notice.find( 'button.button-link' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => [ call.method, call.route ] ) ).toEqual( [ [ 'DELETE', 'wp-admin/v1/users/me/email-change' ] ] );
	expect( wrapper.record.followed ).toHaveLength( 1 );
} );

test( 'a failed answer: Cancel request says WordPress\'s message in a page notice', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture cancel failure.' } );
	} );
	const wrapper = await mountUserEdit( profileData( { contact: { methods: [], emailConfirms: true, pendingEmail: PENDING } } ) );
	await wrapper.find( 'tr.user-email-wrap .notice button' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.added ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Fixture cancel failure.' } ) ] );
	expect( wrapper.record.followed ).toEqual( [] );
} );

test( 'as text: a display name, nickname, contact value, biography and name with markup run nothing', async () => {
	const data = editData( {
		title: 'Edit User ' + HOSTILE,
		user: { ...editData().user, firstName: HOSTILE, nickname: HOSTILE, displayName: HOSTILE, description: HOSTILE, contact: { detached_fixture_contact: HOSTILE } },
		name: { role: null, displayNames: [ HOSTILE, 'jroe' ] },
		contact: { methods: [ { name: 'detached_fixture_contact', label: 'Fixture <b>contact</b>' } ], emailConfirms: false, pendingEmail: null },
	} );
	const wrapper = await mountUserEdit( data );
	await settle();
	expect( window.__ran ).toBeUndefined();
	expect( wrapper.find( 'img[src="x"]' ).exists() ).toBe( false );
	expect( wrapper.find( '#first_name' ).element.value ).toBe( HOSTILE );
	expect( wrapper.find( '#nickname' ).element.value ).toBe( HOSTILE );
	expect( wrapper.find( '#description' ).element.value ).toBe( HOSTILE );
	expect( wrapper.find( '#detached_fixture_contact' ).element.value ).toBe( HOSTILE );
	expect( wrapper.findAll( '#display_name option' )[ 0 ].text() ).toBe( HOSTILE );
	expect( wrapper.find( 'label[for="detached_fixture_contact"]' ).text() ).toBe( 'Fixture <b>contact</b>' );
} );
