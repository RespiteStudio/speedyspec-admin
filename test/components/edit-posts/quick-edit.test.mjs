/** @jest-environment jsdom */
// Quick Edit of the Posts list: Private and the password field, what a save posts, Escape, and
// the refusal a save can get (a lock another user holds), shown in the form.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { loadContracts, mountPosts, postsData, row, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

const SAVE = 'wp-admin/v1/posts/7/inline';

async function openQuickEdit( data = postsData() ) {
	const wrapper = await mountPosts( data );
	await wrapper.find( '#post-7 .row-actions .inline button' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( true );
	return wrapper;
}
const posted = () => api.calls.filter( ( call ) => call.route === SAVE );

test( 'checking Private empties the password and disables it; unchecking enables it again', async () => {
	const wrapper = await openQuickEdit();
	const password = wrapper.find( '#edit-7 input[name="post_password"]' );
	await password.setValue( 'secret' );
	expect( password.element.disabled ).toBe( false );

	await wrapper.find( '#edit-7 input[name="keep_private"]' ).setValue( true );
	expect( password.element.value ).toBe( '' );
	expect( password.element.disabled ).toBe( true );

	await wrapper.find( '#edit-7 input[name="keep_private"]' ).setValue( false );
	expect( password.element.disabled ).toBe( false );
	// Unchecking does not bring the old password back.
	expect( password.element.value ).toBe( '' );
} );

test( 'a private post opens with Private checked and a disabled, empty password, whatever the data holds', async () => {
	const data = postsData( { items: [ row( 7, { inline: { _status: 'private', post_password: 'stale' } } ), row( 8 ) ] } );
	const wrapper = await openQuickEdit( data );
	expect( wrapper.find( '#edit-7 input[name="keep_private"]' ).element.checked ).toBe( true );
	expect( wrapper.find( '#edit-7 input[name="post_password"]' ).element.value ).toBe( '' );
	expect( wrapper.find( '#edit-7 input[name="post_password"]' ).element.disabled ).toBe( true );
} );

test( 'Update posts the password when Private is off, and Private without a password when it is on', async () => {
	api.respondWith( async () => ( { id: 7, row: row( 7 ) } ) );
	let wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7 input[name="post_password"]' ).setValue( 'secret' );
	await wrapper.find( '#edit-7 button.save' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].payload.fields ).toMatchObject( { post_password: 'secret', keep_private: '', post_title: 'Post 7', post_name: 'post-7' } );
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );

	api.reset();
	api.respondWith( async () => ( { id: 7, row: row( 7 ) } ) );
	wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7 input[name="post_password"]' ).setValue( 'secret' );
	await wrapper.find( '#edit-7 input[name="keep_private"]' ).setValue( true );
	await wrapper.find( '#edit-7 button.save' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].payload.fields.keep_private ).toBe( 'private' );
	expect( Object.hasOwn( posted()[ 0 ].payload.fields, 'post_password' ) ).toBe( false );
} );

test( 'Escape closes the form without saving, and the focus is back on the Quick Edit button', async () => {
	const wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7 input[name="post_title"]' ).setValue( 'Changed' );
	await wrapper.find( '#edit-7' ).trigger( 'keyup', { key: 'Escape' } );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );
	expect( api.calls ).toEqual( [] );
	expect( document.activeElement ).toBe( wrapper.find( '#post-7 .row-actions .inline button' ).element );
	expect( wrapper.find( '#post-7 .row-actions .inline button' ).attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( wrapper.find( '#post-7 .row-title' ).text() ).toBe( 'Post 7' );
} );

test( 'another key on the form does not close it', async () => {
	const wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7' ).trigger( 'keyup', { key: 'a' } );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( true );
} );

test( 'a refused save shows the message in the form, keeps the form and its values, and a retry that works closes it', async () => {
	const message = 'Saving is disabled: Ed is currently editing this post.';
	api.respondWith( async () => {
		throw Object.assign( new Error( message ), { status: 409 } );
	} );
	const wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7 input[name="post_title"]' ).setValue( 'Refused' );
	await wrapper.find( '#edit-7 button.save' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	const notice = wrapper.find( '#edit-7 .notice-error' );
	expect( notice.classes() ).not.toContain( 'hidden' );
	expect( notice.find( 'p.error' ).text() ).toBe( message );
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( true );
	expect( wrapper.find( '#edit-7 input[name="post_title"]' ).element.value ).toBe( 'Refused' );
	expect( wrapper.find( '#edit-7 button.save' ).element.disabled ).toBe( false );
	// The row in the list is not changed by a refusal.
	expect( wrapper.find( '#post-7 .row-title' ).text() ).toBe( 'Post 7' );

	api.respondWith( async () => ( { id: 7, row: row( 7, { title: { html: 'Refused', editUrl: 'post.php?post=7&action=edit', pad: 0 } } ) } ) );
	await wrapper.find( '#edit-7 button.save' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 2 );
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );
	expect( wrapper.find( '#post-7 .row-title' ).text() ).toBe( 'Refused' );
} );

test( 'a failure without a message shows the default text of classic', async () => {
	api.respondWith( async () => {
		throw new Error( '' );
	} );
	const wrapper = await openQuickEdit();
	await wrapper.find( '#edit-7 button.save' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7 .notice-error p.error' ).text() ).toBe( 'Error while saving the changes.' );
} );
