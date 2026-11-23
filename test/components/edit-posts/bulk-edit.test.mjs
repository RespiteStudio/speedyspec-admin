/** @jest-environment jsdom */
// Bulk Edit of the Posts list: the selected posts it lists, Remove, the categories that start
// indeterminate, and what Update posts.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { bulkCategories, bulkEditPayload } from '../../../site/components/core/edit-posts/bulk-edit.js';
import { loadContracts, mountPosts, postsData, row, settle } from './data.mjs';

beforeEach( async () => {
	// jsdom does not implement scrolling; Bulk Edit scrolls to the top when it opens.
	window.scrollTo = () => {};
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

const BULK = 'wp-admin/v1/posts/bulk';
const ROWS = () => postsData( { items: [ row( 7, { inline: { terms: { category: [ 3, 4 ] } } } ), row( 8, { inline: { terms: { category: [ 3 ] } } } ), row( 9 ) ] } );

async function openBulk( ids, data = ROWS() ) {
	const wrapper = await mountPosts( data );
	for ( const id of ids ) {
		await wrapper.find( '#post-' + id + ' input[type="checkbox"]' ).trigger( 'click' );
	}
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'edit' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#bulk-edit' ).exists() ).toBe( true );
	return wrapper;
}
const listed = ( wrapper ) => wrapper.findAll( '#bulk-titles-list li' ).map( ( item ) => item.find( '.ntdeltitle' ).text() );

test( 'Bulk Edit lists the selected posts, in the order of the table', async () => {
	const wrapper = await openBulk( [ 8, 7 ] );
	expect( listed( wrapper ) ).toEqual( [ 'Post 7', 'Post 8' ] );
} );

test( 'Remove takes the post out of the list and unchecks its row; Update posts only the rest', async () => {
	api.respondWith( async () => ( { redirect: null } ) );
	const wrapper = await openBulk( [ 7, 8 ] );
	await wrapper.find( '#bulk-titles-list #_7' ).trigger( 'click' );
	await settle();
	expect( listed( wrapper ) ).toEqual( [ 'Post 8' ] );
	expect( wrapper.find( '#post-7 input[type="checkbox"]' ).element.checked ).toBe( false );
	expect( wrapper.find( '#post-8 input[type="checkbox"]' ).element.checked ).toBe( true );
	// The focus goes to the Remove button that is left.
	expect( document.activeElement ).toBe( wrapper.find( '#bulk-titles-list #_8' ).element );

	await wrapper.find( '#bulk-edit select[name="comment_status"]' ).setValue( 'closed' );
	await wrapper.find( '#bulk-edit #bulk_edit' ).trigger( 'click' );
	await settle();
	const saves = api.calls.filter( ( call ) => call.route === BULK );
	expect( saves ).toHaveLength( 1 );
	expect( saves[ 0 ].payload ).toMatchObject( { postType: 'post', action: 'edit', ids: [ 8 ] } );
	expect( saves[ 0 ].payload.fields.comment_status ).toBe( 'closed' );
} );

test( 'removing the last post closes Bulk Edit, and no request goes out', async () => {
	const wrapper = await openBulk( [ 7 ] );
	await wrapper.find( '#bulk-titles-list #_7' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#bulk-edit' ).exists() ).toBe( false );
	expect( api.calls.filter( ( call ) => call.route === BULK ) ).toEqual( [] );
} );

test( 'a category that some of the posts have starts indeterminate, one all have starts checked', async () => {
	const wrapper = await openBulk( [ 7, 8 ] );
	const box = ( id ) => wrapper.find( `#bulk-edit input[name="post_category[]"][value="${ id }"]` ).element;
	expect( box( 3 ).checked ).toBe( true );
	expect( box( 3 ).indeterminate ).toBe( false );
	expect( box( 4 ).checked ).toBe( false );
	expect( box( 4 ).indeterminate ).toBe( true );
	expect( wrapper.find( '#bulk-edit input[name="indeterminate_post_category[]"][value="4"]' ).exists() ).toBe( true );
	expect( wrapper.find( '#bulk-edit input[name="indeterminate_post_category[]"][value="3"]' ).exists() ).toBe( false );
} );

test( 'the indeterminate state follows the selection: with post 9 added, nothing is checked for all', async () => {
	const wrapper = await openBulk( [ 7, 8, 9 ] );
	const box = ( id ) => wrapper.find( `#bulk-edit input[name="post_category[]"][value="${ id }"]` ).element;
	expect( box( 3 ).checked ).toBe( false );
	expect( box( 3 ).indeterminate ).toBe( true );
	expect( box( 4 ).indeterminate ).toBe( true );
} );

test( 'Update posts the categories as classic does: the checked ones, and the indeterminate ones apart', async () => {
	api.respondWith( async () => ( { redirect: null } ) );
	const wrapper = await openBulk( [ 7, 8 ] );
	await wrapper.find( '#bulk-edit #bulk_edit' ).trigger( 'click' );
	await settle();
	const fields = api.calls.find( ( call ) => call.route === BULK ).payload.fields;
	expect( fields.post_category ).toEqual( expect.arrayContaining( [ '3' ] ) );
	expect( fields.post_category ).not.toContain( '4' );
	expect( fields.indeterminate_post_category ).toEqual( [ '4' ] );
} );

test( 'bulkCategories: checked where all have it, indeterminate where some do', () => {
	const rows = [ { inline: { terms: { category: [ 1, 2 ] } } }, { inline: { terms: { category: [ 2, 3 ] } } }, { inline: { terms: { category: [ 2 ] } } } ];
	expect( bulkCategories( rows ) ).toEqual( { checked: [ 2 ], indeterminate: [ 1, 3 ] } );
	expect( bulkCategories( [ rows[ 0 ] ] ) ).toEqual( { checked: [ 1, 2 ], indeterminate: [] } );
	expect( bulkCategories( [ rows[ 0 ], { inline: {} } ] ) ).toEqual( { checked: [], indeterminate: [ 1, 2 ] } );
	expect( bulkCategories( [] ) ).toEqual( { checked: [], indeterminate: [] } );
	expect( bulkCategories( null ) ).toEqual( { checked: [], indeterminate: [] } );
} );

test( 'bulkEditPayload names the posts, the form fields and the list the request came from', () => {
	expect( bulkEditPayload( { postType: 'page', ids: [ 1, 2 ], fields: { a: '1' }, query: { s: 'x' } } ) ).toEqual( { postType: 'page', action: 'edit', ids: [ 1, 2 ], fields: { a: '1' }, list: { s: 'x' } } );
	expect( bulkEditPayload( { postType: 'post', ids: [ 3 ], fields: null, query: null } ) ).toEqual( { postType: 'post', action: 'edit', ids: [ 3 ], fields: {}, list: {} } );
} );
