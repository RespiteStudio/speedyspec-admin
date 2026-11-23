/** @jest-environment jsdom */
// Delete of a terms list row, as tags.js runs it: showNotice.warn()'s question; declined, nothing;
// accepted, the row turns red with its controls disabled, DELETE terms/{id}, then the focus goes to
// the next row (else the previous one, else the name field), the row, its parent option and the
// count go, and "The selected tag has been deleted." is spoken; the last row gone shows the
// list's empty text and hides the table navigation and the search box; a refusal says tags.js's
// texts and puts the row back.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { ADD_FORM, answer, loadContracts, mountTerms, pagination, row, rowIds, settle, termsData } from './data.mjs';

const WARN = 'You are about to permanently delete these items from your site.\nThis action cannot be undone.\n\'Cancel\' to stop, \'OK\' to delete.';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

const deletes = () => api.calls.filter( ( call ) => call.method === 'DELETE' );
const withoutOption = ( id ) => ( { ...ADD_FORM.parent, options: ADD_FORM.parent.options.filter( ( option ) => option.value !== String( id ) ) } );

test( 'confirm text; dismiss: the classic question, and nothing happens when it is declined', async () => {
	const asked = [];
	const wrapper = await mountTerms( termsData(), { confirm: ( message ) => asked.push( message ) && false } );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [ WARN ] );
	expect( deletes() ).toEqual( [] );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 9 ] );
	expect( wrapper.find( '#tag-8 .row-actions .delete a' ).classes() ).toEqual( [ 'delete-tag', 'aria-button-if-js' ] );
	expect( wrapper.find( '#tag-8 .row-actions .delete a' ).attributes( 'role' ) ).toBe( 'button' );
} );

test( 'accept; nextFocus: the row is red and disabled while on its way, then goes; focus, parent option, count and message follow', async () => {
	let finish;
	api.respondWith( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await mountTerms( termsData(), { confirm: () => true } );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( deletes() ).toHaveLength( 1 );
	expect( deletes()[ 0 ].route ).toBe( 'wp-admin/v1/terms/8?taxonomy=category&screen=edit-tags&list%5Btaxonomy%5D=category' );
	const tr = wrapper.find( '#tag-8' ).element;
	expect( [ ...tr.children ].every( ( cell ) => cell.style.backgroundColor === 'rgb(250, 175, 170)' ) ).toBe( true );
	expect( tr.style.pointerEvents ).toBe( 'none' );
	expect( [ ...tr.querySelectorAll( 'a' ) ].every( ( link ) => link.getAttribute( 'tabindex' ) === '-1' ) ).toBe( true );
	expect( tr.querySelector( 'input[type="checkbox"]' ).disabled ).toBe( true );

	finish( answer( { id: 8, parentOptions: withoutOption( 8 ), pagination: pagination( 2 ) } ) );
	await settle();
	expect( rowIds( wrapper ) ).toEqual( [ 7, 9 ] );
	expect( document.activeElement ).toBe( wrapper.find( '#tag-9 a.row-title' ).element );
	expect( wrapper.find( '#parent option[value="8"]' ).exists() ).toBe( false );
	expect( wrapper.find( '.tablenav.top .displaying-num' ).text() ).toBe( '2 items' );
	expect( wrapper.spoken ).toEqual( [ [ 'The selected tag has been deleted.', 'assertive' ] ] );
} );

test( 'nextFocus: the last row\'s delete focuses the previous row', async () => {
	api.respondWith( async () => answer( { id: 9, parentOptions: withoutOption( 9 ), pagination: pagination( 2 ) } ) );
	const wrapper = await mountTerms( termsData(), { confirm: () => true } );
	await wrapper.find( '#tag-9 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( document.activeElement ).toBe( wrapper.find( '#tag-8 a.row-title' ).element );
} );

test( 'empty state: the last row gone focuses the name field, shows the list\'s empty text and hides the navigation and the search box', async () => {
	api.respondWith( async () => answer( { id: 7, parentOptions: withoutOption( 7 ), pagination: pagination( 0 ), noItems: 'No categories found.' } ) );
	const wrapper = await mountTerms( termsData( { items: [ row( 7 ) ], pagination: pagination( 1 ) } ), { confirm: () => true } );
	await wrapper.find( '#tag-7 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( rowIds( wrapper ) ).toEqual( [] );
	expect( wrapper.find( '#the-list tr.no-items td' ).text() ).toBe( 'No categories found.' );
	expect( document.activeElement ).toBe( wrapper.find( '#tag-name' ).element );
	for ( const nav of wrapper.findAll( '.tablenav' ) ) {
		expect( [ ...nav.element.children ].every( ( child ) => child.style.display === 'none' ) ).toBe( true );
	}
	expect( wrapper.find( 'p.search-box' ).element.style.display ).toBe( 'none' );

	// Adding a term brings them back, as tags.js's updateTableNavCount( 'add' ).
	api.respondWith( async () => answer( { id: 20, row: row( 20 ), parentRow: row( 20 ), pagination: pagination( 1 ) } ) );
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'p.search-box' ).element.style.display ).toBe( '' );
	expect( [ ...wrapper.find( '.tablenav.top' ).element.children ].every( ( child ) => child.style.display === '' ) ).toBe( true );
} );

test( 'a refused delete says tags.js\'s text in #ajax-response and puts the row back', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Sorry, you are not allowed to delete this item.' ), { status: 403, code: 'term_forbidden' } );
	} );
	const wrapper = await mountTerms( termsData(), { confirm: () => true } );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 9 ] );
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'Sorry, you are not allowed to do that.' );
	expect( wrapper.spoken ).toEqual( [ [ 'Sorry, you are not allowed to do that.', 'assertive' ] ] );
	const tr = wrapper.find( '#tag-8' ).element;
	expect( [ ...tr.children ].every( ( cell ) => cell.style.backgroundColor === '' ) ).toBe( true );
	expect( tr.style.pointerEvents ).toBe( '' );
	expect( tr.querySelector( 'a' ).hasAttribute( 'tabindex' ) ).toBe( false );
	expect( tr.querySelector( 'input[type="checkbox"]' ).disabled ).toBe( false );
} );

test( 'a failed answer says tags.js\'s other text', async () => {
	// Without a message of WordPress's own (a plugin's wp_die() message is said as it is, below).
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 500, code: 'fixture_failure' } );
	} );
	const wrapper = await mountTerms( termsData(), { confirm: () => true } );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'An error occurred while processing your request. Please try again later.' );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 9 ] );
} );

test( 'a failed answer with WordPress\'s own message (a plugin\'s wp_die()) says that message; unreachable says so', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'A plugin refused.' ), { status: 500, code: 'term_write_died' } );
	} );
	const wrapper = await mountTerms( termsData(), { confirm: () => true } );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'A plugin refused.' );

	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } );
	} );
	await wrapper.find( '#tag-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'WordPress cannot be reached right now. Please try again in a moment.' );
} );

test( 'Delete in row actions a plugin filtered runs the native delete', async () => {
	api.respondWith( async () => answer( { id: 8, pagination: pagination( 2 ) } ) );
	const filtered = row( 8, {
		actionsHtml: '<span class=\'delete\'><a href="edit-tags.php?action=delete&amp;taxonomy=category&amp;tag_ID=8&amp;_wpnonce=abc" class="delete-tag aria-button-if-js">Delete</a> | </span><span class=\'acme\'><a href="#">Acme</a></span>',
		coreActions: [ 'delete' ],
	} );
	const wrapper = await mountTerms( termsData( { items: [ row( 7 ), filtered, row( 9 ) ] } ), { confirm: () => true } );
	await settle();
	await wrapper.find( '#tag-8 .row-actions .delete-tag' ).trigger( 'click' );
	await settle();
	expect( deletes() ).toHaveLength( 1 );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 9 ] );
} );
