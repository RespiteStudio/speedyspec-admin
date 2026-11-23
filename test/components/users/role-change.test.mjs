/** @jest-environment jsdom */
// The role change of the Users list (WP_Users_List_Table::extra_tablenav(), users.php:120-186):
// `#new_role` and `#changeit` above the table, `#new_role2` and `#changeit2` below it, each button
// posting `users/bulk` with the role of its own select, then the page follows the answer, whose
// message the list shows.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, host, loadContracts, mountUsers, settle, usersData } from './data.mjs';

const BULK = 'wp-admin/v1/users/bulk';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
} );

test( 'the selects and buttons from data: label, first option, the roles, No role, and Change', async () => {
	const wrapper = await mountUsers();
	for ( const [ select, button ] of [ [ 'new_role', 'changeit' ], [ 'new_role2', 'changeit2' ] ] ) {
		const element = wrapper.find( 'select#' + select );
		expect( element.attributes( 'name' ) ).toBe( select );
		expect( wrapper.find( 'label[for="' + select + '"]' ).text() ).toBe( 'Change role to…' );
		expect( element.findAll( 'option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] ) ).toEqual( [
			[ '', 'Change role to…' ], [ 'subscriber', 'Subscriber' ], [ 'editor', 'Editor' ], [ 'administrator', 'Administrator' ], [ 'none', '— No role for this site —' ],
		] );
		const input = wrapper.find( 'input#' + button );
		expect( input.attributes( 'name' ) ).toBe( button );
		expect( input.element.value ).toBe( 'Change' );
		expect( input.classes() ).toEqual( [ 'button' ] );
	}
	expect( wrapper.find( '.tablenav.top select#new_role' ).exists() ).toBe( true );
	expect( wrapper.find( '.tablenav.bottom select#new_role2' ).exists() ).toBe( true );
} );

test( 'payload per button: the top Change sends #new_role, the bottom Change sends #new_role2, each followed', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?update=promote', location: null } ) );
	const wrapper = await mountUsers( usersData( { query: { role: 'editor' } } ), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#new_role' ).setValue( 'editor' );
	await wrapper.find( '#new_role2' ).setValue( 'subscriber' );
	await wrapper.find( '#changeit' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#cb-select-8' ).trigger( 'click' );
	await wrapper.find( '#changeit2' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [
		{ method: 'POST', route: BULK, payload: { action: 'promote', role: 'editor', ids: [ 7 ], list: { role: 'editor' } } },
		{ method: 'POST', route: BULK, payload: { action: 'promote', role: 'subscriber', ids: [ 7, 8 ], list: { role: 'editor' } } },
	] );
	expect( record.followed ).toHaveLength( 2 );
} );

test( 'payload per button: No role sends `none`', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?update=promote', location: null } ) );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#cb-select-9' ).trigger( 'click' );
	await wrapper.find( '#new_role2' ).setValue( 'none' );
	await wrapper.find( '#changeit2' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { action: 'promote', role: 'none', ids: [ 9 ], list: {} } );
} );

test( 'without promote_users (no roleChange), no role change is shown', async () => {
	const wrapper = await mountUsers( usersData( { roleChange: null } ) );
	expect( wrapper.find( '#new_role' ).exists() ).toBe( false );
	expect( wrapper.find( '#changeit2' ).exists() ).toBe( false );
} );

test( 'message from data: the error of one\'s own role, and the other roles changed, as the list shows them', async () => {
	const wrapper = await mountUsers( usersData( { messages: [
		{ markup: 'You cannot change your own role to one that does not allow managing other users. Your role was not changed.', type: 'error' },
		{ markup: 'Other user roles have been changed.', type: 'updated' },
	] } ) );
	expect( wrapper.findAll( '.wp-admin-users > .notice p' ).map( ( p ) => p.text() ) ).toEqual( [
		'You cannot change your own role to one that does not allow managing other users. Your role was not changed.',
		'Other user roles have been changed.',
	] );
	expect( wrapper.find( '.wp-admin-users > .notice.error' ).exists() ).toBe( true );
} );

test( 'a failed answer: the refusal is said in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Sorry, you are not allowed to give users that role.', 403, 'promote_users' );
	} );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#new_role' ).setValue( 'administrator' );
	await wrapper.find( '#changeit' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Sorry, you are not allowed to give users that role.' ] ] );
	expect( record.followed ).toEqual( [] );
} );
