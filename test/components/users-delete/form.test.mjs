/** @jest-environment jsdom */
// The Delete Users and Remove Users from Site confirmations (core/users-delete) as WordPress's
// data describes them (wp-admin/users.php `delete` and `remove`): the form, each user's line, the
// content options of a user with content, the error, the plugins' form output with the note, the
// button or the text with nobody to act on, the route of each mode, and names that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import { apiError, deleting, deletionData, host, loadContracts, mountDeletion, removalData, removing, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.body.className = bodyClass;
	delete window.__ran;
	jest.restoreAllMocks();
	resetContracts();
	document.body.innerHTML = '';
} );

const items = ( wrapper ) => wrapper.findAll( 'form#updateusers > ul > li' );

/** Notices that render an element each, as the page notices do, so a test can see which one has the focus. */
function focusableNotices( record ) {
	record.provide.notices = {
		add: ( notice ) => {
			record.notices.push( notice );
			const id = 'notice-' + record.notices.length;
			const element = document.createElement( 'div' );
			element.id = noticeElementId( id );
			element.tabIndex = -1;
			document.body.appendChild( element );
			return id;
		},
	};
	return record;
}

test( 'no-content line: the form, the intro, the user\'s line with its login in strong, and Confirm Deletion', async () => {
	const wrapper = await mountDeletion( deletionData( { intro: 'You have specified this user for deletion:', users: [ deleting( 7 ) ], reassignOptions: [] } ) );
	const form = wrapper.find( 'form#updateusers' );
	expect( form.attributes( 'method' ) ).toBe( 'post' );
	expect( form.attributes( 'name' ) ).toBe( 'updateusers' );
	expect( form.classes() ).toContain( 'delete-and-reassign-users-form' );
	expect( form.find( 'p' ).text() ).toBe( 'You have specified this user for deletion:' );
	expect( items( wrapper ) ).toHaveLength( 1 );
	expect( items( wrapper )[ 0 ].find( 'p' ).text() ).toBe( 'user7 (ID #7): This user does not have any content.' );
	expect( items( wrapper )[ 0 ].find( 'p strong' ).text() ).toBe( 'user7' );
	expect( items( wrapper )[ 0 ].find( 'input[type="radio"]' ).exists() ).toBe( false );
	const submit = wrapper.find( 'p.submit input#submit' );
	expect( submit.element.value ).toBe( 'Confirm Deletion' );
	expect( submit.classes() ).toEqual( [ 'button', 'button-primary' ] );
	expect( document.body.classList.contains( 'users-php' ) ).toBe( true );
} );

test( 'no-content line: Confirm Deletion posts users/delete with the user deleted, the referer, and follows the answer', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?s=m&delete_count=1&update=del', location: null } ) );
	const wrapper = await mountDeletion( deletionData( { users: [ deleting( 7 ) ] } ), { record } );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/delete', payload: { ids: [ 7 ], options: { 7: 'delete' }, reassign: {}, referer: '/wp-admin/users.php?s=m' } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'users.php?s=m&delete_count=1&update=del', location: null } ] );
} );

test( 'radios and select: a user with content has a fieldset, required radios and the users to attribute to', async () => {
	const wrapper = await mountDeletion();
	const fieldset = items( wrapper )[ 1 ].find( 'fieldset' );
	expect( fieldset.find( 'legend' ).text() ).toBe( 'user8 (ID #8): What should be done with the content owned by this user?' );
	const remove = fieldset.find( 'input#delete_option_8' );
	const reassign = fieldset.find( 'input#reassign_option_8' );
	expect( [ remove.attributes( 'type' ), remove.attributes( 'name' ), remove.element.value, remove.element.required ] ).toEqual( [ 'radio', 'delete_option[8]', 'delete', true ] );
	expect( [ reassign.attributes( 'name' ), reassign.element.value, reassign.element.required ] ).toEqual( [ 'delete_option[8]', 'reassign', true ] );
	expect( fieldset.find( 'label[for="delete_option_8"]' ).text() ).toBe( 'Delete all content.' );
	expect( fieldset.find( 'label[for="reassign_option_8"]' ).text() ).toBe( 'Attribute all content to another user.' );
	expect( fieldset.find( 'label[for="reassign_user_8"]' ).text() ).toBe( 'Select a user to attribute the content to.' );
	expect( fieldset.find( 'label[for="reassign_user_8"]' ).classes() ).toEqual( [ 'screen-reader-text' ] );
	const select = fieldset.find( 'select#reassign_user_8' );
	expect( select.attributes( 'name' ) ).toBe( 'reassign_user[8]' );
	expect( select.findAll( 'option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] ) ).toEqual( [ [ '', 'Select a user' ], [ '1', 'admin (admin)' ], [ '9', 'Nine (user9)' ] ] );
	expect( remove.element.checked ).toBe( false );
	expect( reassign.element.checked ).toBe( false );
} );

test( 'radios and select: choosing a user checks Attribute (common.js); Confirm posts the option and the user', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?delete_count=2&update=del_many', location: null } ) );
	const wrapper = await mountDeletion( deletionData(), { record } );
	await wrapper.find( 'select#reassign_user_8' ).setValue( '9' );
	expect( wrapper.find( 'input#reassign_option_8' ).element.checked ).toBe( true );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { ids: [ 7, 8 ], options: { 7: 'delete', 8: 'reassign' }, reassign: { 8: 9 }, referer: '/wp-admin/users.php?s=m' } );
	expect( record.followed ).toHaveLength( 1 );
} );

test( 'radios and select: Delete all content posts `delete` for the user and no one to attribute to', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?delete_count=2&update=del_many', location: null } ) );
	const wrapper = await mountDeletion();
	await wrapper.find( 'input#delete_option_8' ).setValue( true );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { ids: [ 7, 8 ], options: { 7: 'delete', 8: 'delete' }, reassign: {}, referer: '/wp-admin/users.php?s=m' } );
} );

test( 'radios and select: an option left unset is not sent, and WordPress answers the error', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?action=delete&users[]=7&users[]=8&error=true', location: null } ) );
	const wrapper = await mountDeletion();
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 0 ].payload.options ).toEqual( { 7: 'delete' } );
} );

test( 'error from data: "Please select an option." in an error notice with classic\'s Error: prefix', async () => {
	const wrapper = await mountDeletion( deletionData( { error: 'Please select an option.' } ) );
	const notice = wrapper.find( '.wp-admin-users-delete > .notice' );
	expect( notice.classes() ).toEqual( [ 'notice', 'error' ] );
	expect( notice.find( 'p' ).text() ).toBe( 'Error: Please select an option.' );
	expect( notice.find( 'p strong' ).text() ).toBe( 'Error:' );
	// Before the form, as users.php prints it.
	expect( wrapper.find( '.wp-admin-users-delete' ).element.firstElementChild.classList.contains( 'notice' ) ).toBe( true );
} );

test( 'canSubmit false: the current user is listed as not deleted, the no-valid-users text, and no button', async () => {
	const wrapper = await mountDeletion( deletionData( { intro: 'You have specified this user for deletion:', users: [ deleting( 1, { login: 'me', current: true } ) ], reassignOptions: [], canSubmit: false } ) );
	expect( items( wrapper )[ 0 ].text() ).toBe( 'ID #1: me The current user will not be deleted.' );
	expect( items( wrapper )[ 0 ].find( 'strong' ).text() ).toBe( 'The current user will not be deleted.' );
	expect( wrapper.find( '#submit' ).exists() ).toBe( false );
	expect( wrapper.find( 'form#updateusers > p:last-of-type' ).text() ).toBe( 'There are no valid users selected for deletion.' );
} );

test( 'canSubmit false: with the current user and another, the current user is not sent', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?delete_count=1&update=del', location: null } ) );
	const wrapper = await mountDeletion( deletionData( { users: [ deleting( 1, { login: 'me', current: true } ), deleting( 7 ) ] } ) );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 0 ].payload.ids ).toEqual( [ 7 ] );
} );

test( 'formHtml: what delete_user_form prints shows before the button, with the not-saved note', async () => {
	const wrapper = await mountDeletion( deletionData( { formHtml: '<div class="detached-fixture-delete-form">Fixture delete form</div>' } ) );
	expect( wrapper.find( '.detached-fixture-delete-form' ).text() ).toBe( 'Fixture delete form' );
	expect( wrapper.find( '.wp-admin-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	const html = wrapper.find( 'form#updateusers' ).html();
	expect( html.indexOf( 'detached-fixture-delete-form' ) ).toBeLessThan( html.indexOf( 'id="submit"' ) );
	const plain = await mountDeletion();
	expect( plain.find( '.wp-admin-plugin-note' ).exists() ).toBe( false );
} );

test( 'a failed answer: Confirm Deletion\'s error is said in a page notice, nothing is followed, and the button works again', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountDeletion( deletionData( { users: [ deleting( 7 ) ] } ), { record } );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture failure.' ] ] );
	expect( record.spoken ).toEqual( [ 'Fixture failure.' ] );
	expect( record.followed ).toEqual( [] );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( false );
} );

test( 'a failed answer: the page notice takes the focus, as on the other Users and Profile pages', async () => {
	const record = focusableNotices( host() );
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountDeletion( deletionData( { users: [ deleting( 7 ) ] } ), { record } );
	await wrapper.find( 'form#updateusers' ).trigger( 'submit' );
	await settle();
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Fixture failure.' ] );
	expect( document.activeElement?.id ).toBe( noticeElementId( 'notice-1' ) );
} );

test( 'remove mode: each line, Confirm Removal posts users/remove with those who may be removed, and follows the answer', async () => {
	const record = host( { origin: 'http://localhost', pathname: '/wp-admin/users.php', search: '?action=remove&users%5B%5D=7&users%5B%5D=8' } );
	api.respondWith( async () => ( { redirect: 'users.php?update=remove', location: null } ) );
	const wrapper = await mountDeletion( removalData(), { path: 'users.php?action=remove&users[]=7&users[]=8', record } );
	const form = wrapper.find( 'form#updateusers' );
	expect( form.classes() ).not.toContain( 'delete-and-reassign-users-form' );
	expect( items( wrapper ).map( ( li ) => li.text() ) ).toEqual( [ 'ID #7: user7', 'ID #8: user8 Sorry, you are not allowed to remove this user.' ] );
	expect( wrapper.find( 'fieldset' ).exists() ).toBe( false );
	expect( wrapper.find( '#submit' ).element.value ).toBe( 'Confirm Removal' );
	await form.trigger( 'submit' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/remove', payload: { ids: [ 7 ] } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'users.php?update=remove', location: null } ] );
} );

test( 'remove mode: nobody to remove gives the removal text and no button', async () => {
	const wrapper = await mountDeletion( removalData( { users: [ removing( 8, { canRemove: false } ) ], canSubmit: false } ), { path: 'users.php?action=remove&user=8' } );
	expect( wrapper.find( '#submit' ).exists() ).toBe( false );
	expect( wrapper.find( 'form#updateusers > p:last-of-type' ).text() ).toBe( 'There are no valid users selected for removal.' );
} );

test( 'the refusal shows the classic message instead of the form', async () => {
	const wrapper = await mountDeletion( { refusal: { status: 403, heading: null, message: 'Sorry, you are not allowed to delete that user.' }, title: 'Delete Users' } );
	expect( wrapper.find( '.wp-admin-users-delete-error p' ).text() ).toBe( 'Sorry, you are not allowed to delete that user.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
} );

test( 'names as text: a login and reassign labels holding <img onerror> and O\'Brien & run nothing', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const escaped = '&lt;img src=x onerror=&quot;window.__ran=1&quot;&gt;';
	const user = deleting( 8, { login: evil, hasContent: true, markup: '<strong>' + escaped + '</strong> (ID #8): What should be done with the content owned by this user?' } );
	const wrapper = await mountDeletion( deletionData( { users: [ user ], reassignOptions: [ { value: '', label: 'Select a user' }, { value: '9', label: 'O\'Brien & ' + evil } ] } ) );
	await settle();
	expect( wrapper.find( 'form img' ).exists() ).toBe( false );
	expect( wrapper.find( 'legend strong' ).text() ).toBe( evil );
	expect( wrapper.findAll( 'select#reassign_user_8 option' )[ 1 ].text() ).toBe( 'O\'Brien & ' + evil );
	expect( window.__ran ).toBeUndefined();
} );
