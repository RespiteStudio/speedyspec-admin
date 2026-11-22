/** @jest-environment jsdom */
// Bulk actions of the Users list: common.js's two checks with their texts, then `users/bulk` with
// the checked rows and the list's query, and the page goes where the answer leads
// (wp-admin/users.php:120-294): the list with a message, or the Delete Users confirmation.
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

test( 'no action chosen, then no row checked: common.js\'s texts, and nothing is posted', async () => {
	const record = host();
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'resetpassword' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Please select a bulk action to perform.', 'Please select at least one item to perform this action on.' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'Send password reset with checked rows posts users/bulk with them and the list\'s query, and follows the redirect', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?s=m&reset_count=2&update=resetpassword', location: null } ) );
	const wrapper = await mountUsers( usersData( { query: { s: 'm' } } ), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#cb-select-9' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-bottom' ).setValue( 'resetpassword' );
	await wrapper.find( '#doaction2' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: BULK, payload: { action: 'resetpassword', ids: [ 7, 9 ], list: { s: 'm' } } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'users.php?s=m&reset_count=2&update=resetpassword', location: null } ] );
} );

test( 'delete answers a redirect to the Delete Users confirmation, which the page follows', async () => {
	const record = host();
	const target = 'users.php?action=delete&users%5B0%5D=7&users%5B1%5D=8&wp_http_referer=%2Fwp-admin%2Fusers.php';
	api.respondWith( async () => ( { redirect: target, location: null } ) );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#cb-select-all-1' ).trigger( 'click' );
	await wrapper.find( '#cb-select-9' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { action: 'delete', ids: [ 7, 8 ], list: {} } );
	expect( record.followed ).toEqual( [ { redirect: target, location: null } ] );
	// Not the address shown: nothing is read again.
	expect( record.refreshed ).toBe( 0 );
} );

test( 'a plugin\'s bulk action is posted as chosen', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?detached_fixture_users_done=1', location: null } ) );
	const wrapper = await mountUsers( usersData( { bulkActions: [ ...usersData().bulkActions, { value: 'detached_fixture_users', label: 'Fixture user action' } ] } ), record );
	await wrapper.find( '#cb-select-8' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'detached_fixture_users' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { action: 'detached_fixture_users', ids: [ 8 ], list: {} } );
	expect( record.followed ).toHaveLength( 1 );
} );

test( 'a failed answer is said in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'resetpassword' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture failure.' ] ] );
	expect( record.followed ).toEqual( [] );
} );
