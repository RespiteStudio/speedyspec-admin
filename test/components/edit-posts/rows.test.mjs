/** @jest-environment jsdom */
// The cells of a Posts list row (edit-posts/rows.js): the row actions come from WordPress's data,
// a click on one asks the page for it, and the comments bubble and author cells are links to what
// the data names.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import RowCell from '../../../site/components/core/edit-posts/rows.js';
import { actionsOf, column, loadContracts, row } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the part has seen it.
const stopNavigation = ( event ) => event.preventDefault();

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	resetContracts();
} );

function cell( key, item = row( 7 ) ) {
	const calls = { act: [], html: [] };
	const wrapper = mountPart( RowCell, {
		props: { item, column: column( key, key ), onAct: ( ...args ) => calls.act.push( args ), onActionsHtml: ( ...args ) => calls.html.push( args ) },
	} );
	return { wrapper, calls };
}
const labels = ( wrapper ) => wrapper.findAll( '.row-actions > span' ).map( ( span ) => span.text().replace( /\s*\|\s*$/, '' ) );

test( 'the row actions are the ones in the data, in its order', () => {
	expect( labels( cell( 'title', row( 7 ) ).wrapper ) ).toEqual( [ 'Edit', 'Quick Edit', 'Trash', 'View' ] );
	// Another set of data, another row: nothing is added by the part.
	expect( labels( cell( 'title', row( 7, { actions: actionsOf( 7, 'trash' ) } ) ).wrapper ) ).toEqual( [ 'Restore', 'Delete Permanently' ] );
	expect( labels( cell( 'title', row( 7, { actions: actionsOf( 7, 'draft' ) } ) ).wrapper ) ).toEqual( [ 'Edit', 'Quick Edit', 'Trash', 'Preview' ] );
	expect( labels( cell( 'title', row( 7, { actions: [] } ) ).wrapper ) ).toEqual( [] );
} );

test( 'an action that calls a route asks the page for it; a link with an address is only a link', async () => {
	const { wrapper, calls } = cell( 'title', row( 7, { actions: actionsOf( 7, 'trash' ) } ) );
	await wrapper.find( '.row-actions .delete a' ).trigger( 'click' );
	expect( calls.act ).toHaveLength( 1 );
	expect( calls.act[ 0 ][ 0 ].id ).toBe( 7 );
	expect( calls.act[ 0 ][ 1 ].action ).toBe( 'delete' );
	expect( calls.act[ 0 ][ 1 ].request.route ).toBe( 'wp-admin/v1/posts/7/delete' );
	expect( wrapper.find( '.row-actions .delete a' ).attributes( 'class' ) ).toBe( 'submitdelete' );

	const live = cell( 'title' );
	await live.wrapper.find( '.row-actions .edit a' ).trigger( 'click' );
	expect( live.calls.act ).toEqual( [] );
	expect( live.wrapper.find( '.row-actions .edit a' ).attributes( 'href' ) ).toBe( '/wp-admin/post.php?post=7&action=edit' );
	await live.wrapper.find( '.row-actions .inline button' ).trigger( 'click' );
	expect( live.calls.act.map( ( args ) => args[ 1 ].action ) ).toEqual( [ 'inline' ] );
} );

test( 'Preview is a link to the address in the data, opened in a new tab', () => {
	const link = cell( 'title', row( 7, { actions: actionsOf( 7, 'draft' ) } ) ).wrapper.find( '.row-actions .view a' );
	expect( link.text() ).toBe( 'Preview' );
	expect( link.attributes( 'href' ) ).toBe( 'https://example.test/?p=7' );
	expect( link.attributes( 'target' ) ).toBe( '_blank' );
	// A row action that is not marked for a new tab stays in the tab.
	const same = cell( 'title', row( 7, { actions: [ { ...actionsOf( 7 )[ 3 ], newTab: false } ] } ) ).wrapper.find( '.row-actions .view a' );
	expect( same.attributes( 'target' ) ).toBeUndefined();
} );

test( 'a row action whose address is not http, https or an admin path is not a link', () => {
	const bad = { action: 'view', text: 'View', ariaLabel: 'View', classes: [ 'view' ], request: null, url: 'javascript:alert(1)', newTab: false };
	const wrapper = cell( 'title', row( 7, { actions: [ bad ] } ) ).wrapper;
	expect( wrapper.find( '.row-actions .view a' ).attributes( 'href' ) ).toBe( '#' );
} );

test( 'the comments bubble links to the Comments screen the data names', () => {
	const approved = { kind: 'approved', approvedUrl: 'edit-comments.php?p=7&comment_status=approved', approvedText: '2', approvedLabel: '2 comments', pending: 1, pendingUrl: 'edit-comments.php?p=7&comment_status=moderated', pendingText: '1', pendingLabel: '1 pending comment' };
	const wrapper = cell( 'comments', row( 7, { bubble: approved } ) ).wrapper;
	const links = wrapper.findAll( 'a' );
	expect( links.map( ( link ) => link.attributes( 'href' ) ) ).toEqual( [ '/wp-admin/edit-comments.php?p=7&comment_status=approved', '/wp-admin/edit-comments.php?p=7&comment_status=moderated' ] );
	expect( links[ 0 ].classes() ).toContain( 'post-com-count-approved' );
	expect( links[ 0 ].text() ).toContain( '2' );
	expect( links[ 0 ].text() ).toContain( '2 comments' );
	expect( links[ 1 ].classes() ).toContain( 'post-com-count-pending' );
} );

test( 'the comments bubble has no link without comments, or without an address', () => {
	expect( cell( 'comments', row( 7 ) ).wrapper.findAll( 'a' ) ).toHaveLength( 0 );
	const none = { kind: 'approved', approvedUrl: null, approvedText: '2', approvedLabel: '2 comments', pending: 0, pendingText: '0', pendingLabel: 'No pending comments' };
	const wrapper = cell( 'comments', row( 7, { bubble: none } ) ).wrapper;
	expect( wrapper.findAll( 'a' ) ).toHaveLength( 0 );
	expect( wrapper.find( '.post-com-count-approved' ).text() ).toContain( '2' );
} );

test( 'the author cell links to the list of that author\'s posts, and says so when there is none', () => {
	expect( cell( 'author' ).wrapper.find( 'a' ).attributes( 'href' ) ).toBe( '/wp-admin/edit.php?post_type=post&author=1' );
	const lost = cell( 'author', row( 7, { author: null } ) ).wrapper;
	expect( lost.find( 'a' ).exists() ).toBe( false );
	expect( lost.find( '.screen-reader-text' ).text() ).toBe( '(no author)' );
} );

test( 'category and tag links are the data\'s, joined as classic joins them', () => {
	const terms = { links: [ { url: 'edit.php?category_name=a', name: 'Alpha' }, { url: 'edit.php?category_name=b', name: 'Beta' } ] };
	const wrapper = cell( 'categories', row( 7, { terms: { categories: terms } } ) ).wrapper;
	expect( wrapper.findAll( 'a' ).map( ( link ) => [ link.text(), link.attributes( 'href' ) ] ) ).toEqual( [ [ 'Alpha', '/wp-admin/edit.php?category_name=a' ], [ 'Beta', '/wp-admin/edit.php?category_name=b' ] ] );
	expect( document.body.textContent ).toBe( 'Alpha, Beta' );
} );
