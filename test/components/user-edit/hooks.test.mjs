/** @jest-environment jsdom */
// What plugins print on Profile and Edit User, shown and not saved (Q1 "Show only, no save"):
// personal_options rows inside the Personal Options table (LegacyHtml as a `tbody`),
// profile_personal_options after it, show_user_profile or edit_user_profile after Application
// Passwords, and the picker hook's extra output; each with the note, and none of their fields
// posted by Update.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { editData, loadContracts, mountUserEdit, personal, profileData, setMeter, settle, unsetMeter } from './data.mjs';

const NOTE = 'This screen does not save the fields plugins add to this form.';
const PERSONAL = '<tr class="detached-fixture-personal"><th>Fixture personal</th><td><input name="detached_fixture_profile_note"></td></tr>';

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
	delete window.__hookRan;
	document.body.className = '';
	document.body.innerHTML = '';
} );

test( 'personal_options rows sit in the Personal Options table as a tbody; profile_personal_options follows the table; each with the note', async () => {
	const data = profileData( { personal: personal( { hooksHtml: { personal: PERSONAL, profile: '<div class="detached-fixture-profile-personal">Fixture profile personal</div>' } } ) } );
	const wrapper = await mountUserEdit( data );
	await settle();
	const table = wrapper.findAll( 'form#your-profile table.form-table' )[ 0 ];
	const body = table.find( 'tbody.wp-admin-legacy-html' );
	expect( body.find( 'tr.detached-fixture-personal th' ).text() ).toBe( 'Fixture personal' );
	expect( wrapper.find( '.detached-fixture-profile-personal' ).text() ).toBe( 'Fixture profile personal' );
	expect( wrapper.findAll( '.wp-admin-user-edit-plugin-note' ).map( ( note ) => note.text() ) ).toEqual( [ NOTE ] );
} );

test( 'show_user_profile on the Profile, edit_user_profile on Edit User, after Application Passwords, with the note and their scripts', async () => {
	let wrapper = await mountUserEdit( profileData( { hooksHtml: { show: '<div class="detached-fixture-show">Fixture show</div><script>window.__hookRan = "show";</script>', edit: null } } ) );
	await settle();
	expect( wrapper.find( '#application-passwords-section ~ .wp-admin-user-edit-hooks .detached-fixture-show' ).text() ).toBe( 'Fixture show' );
	expect( wrapper.find( '.wp-admin-user-edit-hooks .wp-admin-user-edit-plugin-note' ).text() ).toBe( NOTE );
	expect( window.__hookRan ).toBe( 'show' );
	wrapper.unmount();
	wrapper = await mountUserEdit( editData( { hooksHtml: { show: null, edit: '<div class="detached-fixture-edit">Fixture edit</div>' } } ) );
	await settle();
	expect( wrapper.find( '.wp-admin-user-edit-hooks .detached-fixture-edit' ).text() ).toBe( 'Fixture edit' );
} );

test( 'the picker hook\'s extra output shows in the scheme row, with the note', async () => {
	const data = profileData( { personal: personal( { colorScheme: { ...personal().colorScheme, html: '<p class="detached-fixture-picker">Fixture picker</p>' } } ) } );
	const wrapper = await mountUserEdit( data );
	await settle();
	expect( wrapper.find( 'tr.user-admin-color-wrap .detached-fixture-picker' ).text() ).toBe( 'Fixture picker' );
	expect( wrapper.find( 'tr.user-admin-color-wrap .wp-admin-user-edit-plugin-note' ).text() ).toBe( NOTE );
} );

test( 'a plugin\'s field is not posted by Update (the recorded gap)', async () => {
	api.respondWith( async () => ( { redirect: 'profile.php?updated=1', location: null } ) );
	const data = profileData( { personal: personal( { hooksHtml: { personal: PERSONAL, profile: null } } ), hooksHtml: { show: '<input name="detached_fixture_show_field" value="x">', edit: null } } );
	const wrapper = await mountUserEdit( data );
	await settle();
	wrapper.find( 'input[name="detached_fixture_profile_note"]' ).element.value = 'typed note';
	await wrapper.find( 'form#your-profile' ).trigger( 'submit' );
	await settle();
	const fields = api.calls.find( ( call ) => call.route === 'wp-admin/v1/users/7' ).payload.fields;
	expect( Object.hasOwn( fields, 'detached_fixture_profile_note' ) ).toBe( false );
	expect( Object.hasOwn( fields, 'detached_fixture_show_field' ) ).toBe( false );
} );
