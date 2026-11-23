/** @jest-environment jsdom */
// Bulk actions of the Links list: common.js's two checks with their texts, then `links/bulk` with
// the checked rows and the list's query, and the page goes where the answer leads
// (wp-admin/link-manager.php:18-26).
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { host, linksData, loadContracts, mountLinks, settle } from './data.mjs';

const BULK = 'wp-admin/v1/links/bulk';

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
	const wrapper = await mountLinks( linksData(), record );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Please select a bulk action to perform.', 'Please select at least one item to perform this action on.' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'Delete with checked rows posts links/bulk with them and the list\'s query, and the page follows the redirect', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'link-manager.php?deleted=2', location: null } ) );
	const wrapper = await mountLinks( linksData( { query: { cat_id: '2' } } ), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#cb-select-9' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-bottom' ).setValue( 'delete' );
	await wrapper.find( '#doaction2' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: BULK, payload: { action: 'delete', ids: [ 7, 9 ], list: { cat_id: '2' } } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'link-manager.php?deleted=2', location: null } ] );
} );

test( 'select all, and a plugin\'s bulk action is posted as chosen', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'link-manager.php?detached_fixture_links_done=3', location: null } ) );
	const wrapper = await mountLinks( linksData( { bulkActions: [ { value: 'delete', label: 'Delete' }, { value: 'detached_fixture_links', label: 'Fixture link action' } ] } ), record );
	await wrapper.find( '#cb-select-all-1' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'detached_fixture_links' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { action: 'detached_fixture_links', ids: [ 7, 8, 9 ], list: {} } );
	expect( record.followed ).toHaveLength( 1 );
} );

test( 'a failed answer is said in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture failure.' ), { status: 500, code: 'fixture_failure' } );
	} );
	const wrapper = await mountLinks( linksData(), record );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture failure.' ] ] );
	expect( record.followed ).toEqual( [] );
} );
