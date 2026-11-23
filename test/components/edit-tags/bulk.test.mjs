/** @jest-environment jsdom */
// Bulk actions of the terms list: common.js's two checks with their texts, then `terms/bulk` with
// the checked rows, and the page goes where the answer leads (edit-tags.php:131-149, 197-208).
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { loadContracts, mountTerms, settle, termsData } from './data.mjs';

const BULK = 'wp-admin/v1/terms/bulk';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

function harness() {
	const notices = [];
	const followed = [];
	const refreshed = [];
	return {
		notices, followed, refreshed,
		provide: {
			notices: { add: ( notice ) => notices.push( notice ) },
			router: { navigate: async () => true, follow: async ( answer ) => followed.push( answer ), refresh: async () => refreshed.push( true ) },
			pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/edit-tags.php', search: '?taxonomy=category' },
		},
	};
}

test( 'no action chosen, then no row checked: common.js\'s texts, and nothing is posted', async () => {
	const h = harness();
	const wrapper = await mountTerms( termsData(), h.provide );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( h.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Please select a bulk action to perform.', 'Please select at least one item to perform this action on.' ] );
	expect( wrapper.spoken.map( ( [ message ] ) => message ) ).toEqual( [ 'Please select a bulk action to perform.', 'Please select at least one item to perform this action on.' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'Delete with checked rows posts terms/bulk with them, and the page follows the redirect', async () => {
	const h = harness();
	api.respondWith( async () => ( { redirect: 'edit-tags.php?taxonomy=category&message=6', location: null } ) );
	const wrapper = await mountTerms( termsData(), h.provide );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#cb-select-9' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-bottom' ).setValue( 'delete' );
	await wrapper.find( '#doaction2' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: BULK, payload: { taxonomy: 'category', action: 'delete', ids: [ 7, 9 ], list: { taxonomy: 'category' } } } ] );
	expect( h.followed ).toEqual( [ { redirect: 'edit-tags.php?taxonomy=category&message=6', location: null } ] );
} );

test( 'select all checks every row that has a checkbox, and a plugin\'s bulk action is posted as chosen', async () => {
	const h = harness();
	api.respondWith( async () => ( { redirect: 'edit-tags.php?taxonomy=category&detached_fixture_terms_done=3', location: null } ) );
	const wrapper = await mountTerms( termsData( { bulkActions: [ { value: 'delete', label: 'Delete' }, { value: 'detached_fixture_terms', label: 'Fixture term action' } ] } ), h.provide );
	await wrapper.find( '#cb-select-all-1' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'detached_fixture_terms' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { taxonomy: 'category', action: 'detached_fixture_terms', ids: [ 7, 8, 9 ], list: { taxonomy: 'category' } } );
	expect( h.followed ).toHaveLength( 1 );
} );

test( 'a failed answer is said in a page notice, and nothing is followed', async () => {
	const h = harness();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture failure.' ), { status: 500, code: 'fixture_failure' } );
	} );
	const wrapper = await mountTerms( termsData(), h.provide );
	await wrapper.find( '#cb-select-7' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( h.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture failure.' ] ] );
	expect( h.followed ).toEqual( [] );
} );
