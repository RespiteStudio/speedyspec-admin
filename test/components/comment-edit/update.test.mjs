/** @jest-environment jsdom */
// Update of the Edit Comment page, and what a failed one shows: the message of WordPress, or that
// it cannot be reached, in a notice that is spoken and focused; the form keeps its values.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { ANSWER, DATA, api, flushPromises, openPage, recorder, useContracts } from './data.mjs';
import { UNREACHABLE } from '../../helpers/host.mjs';

const setup = useContracts();
beforeEach( async () => {
	api.reset();
	// The page logs the refused request; the tests read what it shows instead.
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	await setup();
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.innerHTML = '';
} );


test( 'a refused Update shows WordPress\'s message in a notice, says it, focuses the notice, keeps the values and enables Update again', async () => {
	const record = recorder();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Invalid parent comment.' ), { status: 400, code: 'comment_parent_invalid' } );
	} );
	const wrapper = await openPage( DATA(), record );
	await wrapper.find( '#name' ).setValue( 'Edited name' );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	expect( record.added.map( ( notice ) => [ notice.type, notice.message, notice.scope ] ) ).toEqual( [ [ 'error', 'Invalid parent comment.', 'page' ] ] );
	expect( record.spoken ).toEqual( [ 'Invalid parent comment.' ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
	expect( wrapper.find( '#name' ).element.value ).toBe( 'Edited name' );
	expect( wrapper.find( '#save' ).element.disabled ).toBe( false );
	expect( record.followed ).toEqual( [] );
} );

test( 'an Update that cannot reach WordPress says so, and focuses the notice', async () => {
	const record = recorder();
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } );
	} );
	const wrapper = await openPage( DATA(), record );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	expect( record.added.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', UNREACHABLE ] ] );
	expect( record.spoken ).toEqual( [ UNREACHABLE ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
	expect( wrapper.find( '#save' ).element.disabled ).toBe( false );
} );

test( 'an error with no message of its own says the generic one', async () => {
	const record = recorder();
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 500, code: 'internal' } );
	} );
	const wrapper = await openPage( DATA(), record );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	expect( record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'An error occurred while processing your request. Please try again later.' ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
} );

test( 'a refused Move to Trash and an unreachable one show their message and focus it', async () => {
	const record = recorder();
	let failure = Object.assign( new Error( 'Sorry, you are not allowed to edit comments on this post.' ), { status: 403, code: 'rest_forbidden' } );
	api.respondWith( async () => {
		throw failure;
	} );
	const wrapper = await openPage( DATA(), record );
	await wrapper.find( '#delete-action a' ).trigger( 'click' );
	await flushPromises();
	expect( record.added.at( -1 ).message ).toBe( 'Sorry, you are not allowed to edit comments on this post.' );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );

	failure = Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } );
	await wrapper.find( '#delete-action a' ).trigger( 'click' );
	await flushPromises();
	expect( record.added.at( -1 ).message ).toBe( UNREACHABLE );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-2' );
	expect( record.followed ).toEqual( [] );
} );

test( 'a successful Update follows the answer and shows no notice', async () => {
	const record = recorder();
	api.respondWith( async () => ANSWER() );
	const wrapper = await openPage( DATA(), record );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	expect( record.followed ).toEqual( [ ANSWER() ] );
	expect( record.added ).toEqual( [] );
} );
