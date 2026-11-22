/** @jest-environment jsdom */
// The Links list page (core/link-manager) as WordPress's data describes it (WP_Links_List_Table,
// wp-admin/link-manager.php): the cells, the empty search, the category filter, the sortable
// headers, the edit links, row Delete with its confirmation, Screen Options, plugin cells, the
// messages, the die screen, and names that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { column, host, linksData, loadContracts, mountLinks, row, rowIds, settle } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	delete window.__ran;
	jest.restoreAllMocks();
	resetContracts();
} );

const cellText = ( wrapper, id, key ) => wrapper.find( '#link-' + id + ' td.column-' + key ).text();

test( 'cells from data: the name link, the URL link, the categories, the relationship, Visible and Rating, with the classic ids and Add Link', async () => {
	const linked = row( 7, { name: 'Tom & Jerry', rel: 'friend met', visible: 'No', rating: 4, categories: [ { name: 'Blogroll', url: null }, { name: 'Friends & Co', url: 'link-manager.php?cat_id=3' } ] } );
	const wrapper = await mountLinks( linksData( { items: [ linked, row( 8 ) ] } ) );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8 ] );
	expect( wrapper.find( 'form#posts-filter' ).attributes( 'method' ) ).toBe( 'get' );
	expect( wrapper.find( '#the-list' ).exists() ).toBe( true );
	const title = wrapper.find( '#link-7 .column-name strong a.row-title' );
	expect( title.text() ).toBe( 'Tom & Jerry' );
	expect( title.attributes( 'href' ) ).toBe( '/wp-admin/link.php?action=edit&link_id=7' );
	expect( title.attributes( 'aria-label' ) ).toBe( 'Edit “Tom & Jerry”' );
	const url = wrapper.find( '#link-7 td.column-url a' );
	expect( url.attributes( 'href' ) ).toBe( 'https://example.org/7' );
	expect( url.text() ).toBe( 'example.org/7' );
	// The category the list is filtered by is not a link (column_categories()).
	expect( cellText( wrapper, 7, 'categories' ) ).toBe( 'Blogroll, Friends & Co' );
	expect( wrapper.findAll( '#link-7 td.column-categories a' ).map( ( a ) => [ a.text(), a.attributes( 'href' ) ] ) ).toEqual( [ [ 'Friends & Co', '/wp-admin/link-manager.php?cat_id=3' ] ] );
	expect( cellText( wrapper, 7, 'rel' ) ).toBe( 'friend met' );
	// An empty relationship prints a line break, as column_rel().
	expect( wrapper.find( '#link-8 td.column-rel br' ).exists() ).toBe( true );
	expect( cellText( wrapper, 7, 'visible' ) ).toBe( 'No' );
	expect( cellText( wrapper, 7, 'rating' ) ).toBe( '4' );
	expect( wrapper.find( '#link-7 input[type="checkbox"]' ).attributes( 'name' ) ).toBe( 'linkcheck[]' );
	expect( wrapper.find( '#link-7 .row-actions' ).text() ).toBe( 'Edit | Delete' );
	expect( wrapper.findAll( '#link-7 .row-actions > span' ).map( ( span ) => span.classes() ) ).toEqual( [ [ 'edit' ], [ 'delete' ] ] );
	expect( wrapper.find( '#link-7 .row-actions .delete a' ).classes() ).toEqual( [ 'submitdelete' ] );
	const add = wrapper.find( 'a.page-title-action' );
	expect( add.text() ).toBe( 'Add Link' );
	expect( add.attributes( 'href' ) ).toBe( '/wp-admin/link-add.php' );
	expect( document.body.classList.contains( 'link-manager-php' ) ).toBe( true );
	wrapper.unmount();
	expect( document.body.classList.contains( 'link-manager-php' ) ).toBe( false );
} );

test( 'noItems: the search subtitle as text and "No links found."; a search navigates with the form\'s fields', async () => {
	const record = host();
	const wrapper = await mountLinks( linksData( { heading: { title: 'Links', addNew: { label: 'Add Link', path: 'link-add.php' }, search: '<b>x</b>' }, items: [] } ), record );
	expect( wrapper.find( '.subtitle' ).text() ).toBe( 'Search results for: <b>x</b>' );
	expect( wrapper.find( '.subtitle strong' ).text() ).toBe( '<b>x</b>' );
	expect( wrapper.find( '#the-list tr.no-items td' ).text() ).toBe( 'No links found.' );
	await wrapper.find( '#link-search-input' ).setValue( 'jazz' );
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/link-manager.php?s=jazz&cat_id=0' ] );
} );

test( 'filter submits cat_id: the select with the data\'s options and value, its label, and Filter navigates through the router', async () => {
	const record = host();
	const wrapper = await mountLinks( linksData( { filter: { ...linksData().filter, value: '3', label: 'Filter by category' } } ), record );
	const select = wrapper.find( '.tablenav.top select#cat_id' );
	expect( select.attributes( 'name' ) ).toBe( 'cat_id' );
	expect( select.classes() ).toContain( 'postform' );
	expect( select.findAll( 'option' ).map( ( option ) => [ option.attributes( 'value' ), option.text(), option.element.className ] ) ).toEqual( [ [ '0', 'All Link Categories', '' ], [ '2', 'Blogroll', 'level-0' ], [ '3', 'Friends', 'level-0' ] ] );
	expect( select.element.value ).toBe( '3' );
	expect( wrapper.find( 'label[for="cat_id"]' ).text() ).toBe( 'Filter by category' );
	expect( wrapper.find( '.tablenav.bottom select#cat_id' ).exists() ).toBe( false );
	await select.setValue( '2' );
	const filter = wrapper.find( '#post-query-submit' );
	expect( filter.element.value ).toBe( 'Filter' );
	expect( filter.attributes( 'name' ) ).toBe( 'filter_action' );
	await filter.trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/link-manager.php?s=&cat_id=2' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'filter submits cat_id: a dropdown a plugin filtered is shown as its HTML, and its value is read from the form', async () => {
	const record = host();
	const html = '<select name="cat_id" id="cat_id" class="postform acme"><option value="0">All</option><option value="5" selected>Acme</option></select>';
	const wrapper = await mountLinks( linksData( { filter: { ...linksData().filter, html } } ), record );
	expect( wrapper.find( 'select.acme' ).exists() ).toBe( true );
	await wrapper.find( '#post-query-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/link-manager.php?s=&cat_id=5' ] );
} );

test( 'sortable headers: Name, URL, Visible and Rating link to the sorted list; Categories and Relationship do not', async () => {
	const wrapper = await mountLinks();
	expect( wrapper.find( 'thead th#name a' ).attributes( 'href' ) ).toBe( '/wp-admin/link-manager.php?orderby=name&order=asc' );
	expect( wrapper.find( 'thead th#url a' ).attributes( 'href' ) ).toBe( '/wp-admin/link-manager.php?orderby=url&order=asc' );
	expect( wrapper.find( 'thead th#visible a' ).attributes( 'href' ) ).toBe( '/wp-admin/link-manager.php?orderby=visible&order=asc' );
	expect( wrapper.find( 'thead th#rating a' ).attributes( 'href' ) ).toBe( '/wp-admin/link-manager.php?orderby=rating&order=asc' );
	expect( wrapper.find( 'thead th#categories a' ).exists() ).toBe( false );
	expect( wrapper.find( 'thead th#rel a' ).exists() ).toBe( false );
} );

test( 'editUrl: the name link and Edit open the link\'s edit screen through the admin; a row without one has no link', async () => {
	const plain = row( 9 );
	plain.name = { text: 'Link 9', editUrl: null };
	const wrapper = await mountLinks( linksData( { items: [ row( 8 ), plain ] } ) );
	expect( wrapper.find( '#link-8 .row-actions .edit a' ).attributes( 'href' ) ).toBe( '/wp-admin/link.php?action=edit&link_id=8' );
	expect( wrapper.find( '#link-9 .column-name a.row-title' ).exists() ).toBe( false );
	expect( wrapper.find( '#link-9 .column-name strong' ).text() ).toBe( 'Link 9' );
} );

test( 'confirm text from data: row Delete asks WordPress\'s question; dismissed, nothing is sent', async () => {
	const asked = [];
	const wrapper = await mountLinks( linksData(), host(), { confirm: ( message ) => {
		asked.push( message );
		return false;
	} } );
	await wrapper.find( '#link-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [ 'You are about to delete this link \'Link 8\'\n  \'Cancel\' to stop, \'OK\' to delete.' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'confirm text from data: accepted, DELETE links/{id} is called and the answer\'s list is opened again', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const wrapper = await mountLinks( linksData(), record, { confirm: () => true } );
	await wrapper.find( '#link-8 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/links/8', payload: undefined } ] );
	expect( record.followed ).toEqual( [ { redirect: 'link-manager.php', location: null } ] );
	// The answer leads to the address shown: the list is read again.
	expect( record.refreshed ).toBe( 1 );
} );

test( 'a failed answer: a refused delete is said in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Sorry, you are not allowed to edit the links for this site.' ), { status: 403, code: 'link_forbidden' } );
	} );
	const wrapper = await mountLinks( linksData(), record, { confirm: () => true } );
	await wrapper.find( '#link-7 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Sorry, you are not allowed to edit the links for this site.' ] ] );
	expect( record.spoken ).toEqual( [ 'Sorry, you are not allowed to edit the links for this site.' ] );
	expect( record.followed ).toEqual( [] );
} );

test( 'Screen Options columns: offered from the data, hidden columns saved for screen link-manager and hidden at once', async () => {
	let offered = null;
	const data = linksData( { screenOptions: { tableColumns: [ { key: 'url', label: 'URL', hidden: false }, { key: 'rel', label: 'Relationship', hidden: true } ], legend: 'Columns', perPage: null, viewMode: null, settingsHtml: null }, columns: linksData().columns.map( ( c ) => ( c.key === 'rel' ? { ...c, hidden: true } : c ) ) } );
	const wrapper = await mountLinks( data, host(), { screenOptions: { set: ( options ) => {
		offered = options;
		return () => {};
	} } } );
	expect( offered.tableColumns.map( ( c ) => [ c.key, c.hidden ] ) ).toEqual( [ [ 'url', false ], [ 'rel', true ] ] );
	expect( offered.pagination ).toBe( null );
	expect( wrapper.find( 'thead th#rel' ).classes() ).toContain( 'hidden' );
	await offered.onChange( 'hide-column', { key: 'url', hidden: true } );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/link-manager', payload: { columnsHidden: [ 'rel', 'url' ] } } ] );
	expect( wrapper.find( 'thead th#url' ).classes() ).toContain( 'hidden' );
} );

test( 'plugin cells: a plugin column\'s cell shows its HTML with its scripts (LegacyHtml)', async () => {
	const columns = [ ...linksData().columns, column( 'detached_fixture', 'Fixture link', { core: false } ) ];
	const wrapper = await mountLinks( linksData( { columns, items: [ row( 7, { cells: { detached_fixture: { html: '<em class="acme">link-7</em>', error: false } } } ) ] } ) );
	expect( wrapper.find( '#link-7 td.column-detached_fixture em.acme' ).text() ).toBe( 'link-7' );
} );

test( 'messages: "2 links deleted." in #message, dismissible', async () => {
	const wrapper = await mountLinks( linksData( { messages: [ { markup: '2 links deleted.', type: 'updated' } ] } ) );
	expect( wrapper.find( '#message' ).classes() ).toEqual( expect.arrayContaining( [ 'updated', 'notice', 'is-dismissible' ] ) );
	expect( wrapper.find( '#message p' ).text() ).toBe( '2 links deleted.' );
	await wrapper.find( '#message .notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
} );

test( 'the die screen shows the classic message instead of the list', async () => {
	const wrapper = await mountLinks( { query: {}, error: { kind: 'die', status: 403, heading: null, message: 'Sorry, you are not allowed to edit the links for this site.' } } );
	expect( wrapper.find( '.wp-admin-link-manager-error p' ).text() ).toBe( 'Sorry, you are not allowed to edit the links for this site.' );
	expect( wrapper.find( '#posts-filter' ).exists() ).toBe( false );
} );

test( 'name as text: a link named <img onerror> runs nothing in the name, the label, the categories or the URL text', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const wrapper = await mountLinks( linksData( { items: [ row( 7, { name: evil, rel: evil, url: { href: 'javascript:alert(1)', text: evil }, categories: [ { name: evil, url: 'link-manager.php?cat_id=3' } ] } ) ] } ) );
	await settle();
	expect( wrapper.find( '#the-list img' ).exists() ).toBe( false );
	expect( wrapper.find( '#link-7 a.row-title' ).text() ).toBe( evil );
	expect( wrapper.find( '#link-7 td.column-url a' ).attributes( 'href' ) ).toBe( '#' );
	expect( window.__ran ).toBeUndefined();
} );
