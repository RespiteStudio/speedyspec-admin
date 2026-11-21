/** @jest-environment jsdom */
// A parameter WordPress refuses (a 400 `rest_invalid_param`) is shown beside its control: in an element with the id
// `<field>-error`, which the control's `aria-describedby` lists, with `aria-invalid`; focus moves to the control, the
// message is also a notice, and the other fields keep what was typed.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { discussionData, discussionPage, settle } from './data.mjs';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-discussion', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

const refused = ( params, message = 'Invalid parameter(s): comments_per_page' ) => Object.assign( new Error( message ), { code: 'rest_invalid_param', data: { status: 400, params } } );

test( 'the refused control gets the message, aria-invalid and aria-describedby, and takes focus', async () => {
	api.respondWith( async () => {
		throw refused( { comments_per_page: 'comments_per_page does not match pattern ^$.' } );
	} );
	const wrapper = await discussionPage( discussionData() );
	const input = wrapper.find( '#comments_per_page' );
	expect( input.attributes( 'aria-describedby' ) ).toBeUndefined();
	expect( input.attributes( 'aria-invalid' ) ).toBeUndefined();
	await input.setValue( '12' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const message = wrapper.find( '#comments_per_page-error' );
	expect( message.text() ).toBe( 'comments_per_page does not match pattern ^$.' );
	expect( message.classes() ).toContain( 'wp-admin-field-error' );
	expect( input.attributes( 'aria-describedby' ) ).toBe( 'comments_per_page-error' );
	expect( input.attributes( 'aria-invalid' ) ).toBe( 'true' );
	expect( document.activeElement ).toBe( input.element );
	// What was typed stays, and the form can be saved again.
	expect( input.element.value ).toBe( '12' );
	expect( wrapper.find( '#submit' ).attributes( 'disabled' ) ).toBeUndefined();
} );

test( 'the other controls have no message, and a control with a description keeps it in aria-describedby', async () => {
	api.respondWith( async () => {
		throw refused( { comment_max_links: 'Not a number.' } );
	} );
	const wrapper = await discussionPage( discussionData() );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( wrapper.find( '#comment_max_links-error' ).text() ).toBe( 'Not a number.' );
	expect( wrapper.find( '#comment_max_links' ).attributes( 'aria-describedby' ) ).toBe( 'comment_links_moderation_desc comment_max_links-error' );
	expect( wrapper.findAll( '.wp-admin-field-error' ) ).toHaveLength( 1 );
	expect( wrapper.find( '#comments_per_page' ).attributes( 'aria-invalid' ) ).toBeUndefined();
} );

test( 'a checkbox\'s error is shown in its row, and the next save clears it', async () => {
	let fail = true;
	api.respondWith( async () => {
		if ( fail ) {
			throw refused( { show_comments_cookies_opt_in: 'Not allowed.' } );
		}
		return { ...discussionData(), notices: [] };
	} );
	const wrapper = await discussionPage( discussionData() );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#show_comments_cookies_opt_in-error' ).text() ).toBe( 'Not allowed.' );
	expect( wrapper.find( '#show_comments_cookies_opt_in' ).attributes( 'aria-describedby' ) ).toBe( 'show_comments_cookies_opt_in-error' );

	fail = false;
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#show_comments_cookies_opt_in-error' ).exists() ).toBe( false );
	expect( wrapper.find( '#show_comments_cookies_opt_in' ).attributes( 'aria-describedby' ) ).toBeUndefined();
} );

test( 'the message is also raised as an error notice', async () => {
	const added = [];
	api.respondWith( async () => {
		throw refused( { comments_per_page: 'Nope.' }, 'Invalid parameter(s): comments_per_page' );
	} );
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-discussion', data: discussionData(), page: { path: 'options-discussion.php', title: 'Discussion Settings' } } ) }, {
		provide: { notices: { add: ( notice ) => added.push( notice ) }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( added ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Invalid parameter(s): comments_per_page', scope: 'page' } ) ] );
} );

test( 'an error for a name that is no field of the page is not shown beside anything', async () => {
	api.respondWith( async () => {
		throw refused( { unknown_field: 'Nope.' } );
	} );
	const wrapper = await discussionPage( discussionData() );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.findAll( '.wp-admin-field-error' ) ).toHaveLength( 0 );
} );
