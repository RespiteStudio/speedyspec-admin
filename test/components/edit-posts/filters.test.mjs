/** @jest-environment jsdom */
// The filters above the Posts list, and the query Filter and Search build from the list form:
// the filters' values, and none of the bulk or inline fields.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Filters, { categoryOption, flatTree } from '../../../site/components/core/edit-posts/filters.js';
import { isBulkField } from '../../../site/components/core/edit-posts/state.js';
import { formQuery } from '../../../site/components/core/list-table-parts/list-form.js';
import { loadContracts, mountPosts, postsData, settle } from './data.mjs';

beforeEach( async () => {
	window.scrollTo = () => {};
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

const FILTERS = ( over = {} ) => ( {
	months: { label: 'Filter by date', value: '0', options: [ { value: '201903', label: 'March 2019' }, { value: '202005', label: 'May 2020' } ] },
	categories: { label: 'Filter by category', allLabel: 'All Categories', value: '0', tree: [ { id: 3, name: 'Alpha', children: [ { id: 5, name: 'Alpha child', children: [] } ] }, { id: 4, name: 'Beta', children: [] } ] },
	categoriesHtml: null,
	formats: { value: '', options: [ { value: 'aside', label: 'Aside' }, { value: 'gallery', label: 'Gallery' } ] },
	restrictHtml: null, navHtml: null, filterButton: true, emptyTrash: null,
	...over,
} );
const optionTexts = ( wrapper, selector ) => wrapper.findAll( selector + ' option' ).map( ( option ) => option.text() );

test( 'the filters show the months, the categories as a tree and the formats, each at its value', () => {
	const wrapper = mountPart( Filters, { props: { filters: FILTERS( { months: { ...FILTERS().months, value: '202005' }, formats: { ...FILTERS().formats, value: 'gallery' } } ) } } );
	expect( optionTexts( wrapper, '#filter-by-date' ) ).toEqual( [ 'All dates', 'March 2019', 'May 2020' ] );
	expect( wrapper.find( '#filter-by-date' ).element.value ).toBe( '202005' );
	// Children are indented, as wp_dropdown_categories() pads them.
	expect( wrapper.findAll( '#cat option' ).map( ( option ) => option.element.textContent ) ).toEqual( [ 'All Categories', 'Alpha', '\u00a0\u00a0\u00a0Alpha child', 'Beta' ] );
	expect( wrapper.find( '#filter-by-format' ).element.value ).toBe( 'gallery' );
	expect( optionTexts( wrapper, '#filter-by-format' ) ).toEqual( [ 'All formats', 'Aside', 'Gallery' ] );
	expect( wrapper.find( '#post-query-submit' ).attributes( 'value' ) ).toBe( 'Filter' );
} );

test( 'a filter that WordPress did not print is not shown, and without any the Filter button is not either', () => {
	const none = mountPart( Filters, { props: { filters: FILTERS( { months: null, categories: null, formats: null, filterButton: false } ) } } );
	expect( none.find( 'select' ).exists() ).toBe( false );
	expect( none.find( '#post-query-submit' ).exists() ).toBe( false );
	const some = mountPart( Filters, { props: { filters: FILTERS( { categories: null, formats: null } ) } } );
	expect( some.findAll( 'select' ).map( ( select ) => select.attributes( 'id' ) ) ).toEqual( [ 'filter-by-date' ] );
} );

test( 'the Filter button asks the page to submit, and submits no form itself', async () => {
	const submits = [];
	const wrapper = mountPart( Filters, { props: { filters: FILTERS(), onSubmit: () => submits.push( 1 ) } } );
	const event = new window.MouseEvent( 'click', { bubbles: true, cancelable: true } );
	wrapper.find( '#post-query-submit' ).element.dispatchEvent( event );
	expect( event.defaultPrevented ).toBe( true );
	expect( submits ).toHaveLength( 1 );
} );

test( 'flatTree lists the categories in the order of wp_dropdown_categories(), each with its level', () => {
	expect( flatTree( FILTERS().categories.tree ) ).toEqual( [ { id: 3, name: 'Alpha', level: 0 }, { id: 5, name: 'Alpha child', level: 1 }, { id: 4, name: 'Beta', level: 0 } ] );
	expect( categoryOption( { name: 'x', level: 2 } ) ).toBe( '\u00a0'.repeat( 6 ) + 'x' );
	expect( flatTree( null ) ).toEqual( [] );
} );

async function mountWithRouter( data ) {
	const visited = [];
	const wrapper = await mountPosts( data, { router: { navigate: ( url ) => visited.push( url ) } } );
	return { wrapper, visited };
}
const withFilters = () => postsData( {
	filters: FILTERS(),
	search: { shown: true, label: 'Search Posts', inputId: 'post-search-input', value: '', keep: [ { name: 'post_status', value: 'draft' } ] },
	formFields: [ { name: 'post_type', value: 'post' } ],
} );

test( 'Filter builds the query from the filters and the list\'s hidden fields, and leaves the bulk fields out', async () => {
	const { wrapper, visited } = await mountWithRouter( withFilters() );
	await wrapper.find( '#filter-by-date' ).setValue( '201903' );
	await wrapper.find( '#cat' ).setValue( '4' );
	await wrapper.find( '#filter-by-format' ).setValue( 'aside' );
	// A checked row and a chosen bulk action are in the form, and never in the query.
	await wrapper.find( '#post-7 input[type="checkbox"]' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'trash' );
	await wrapper.find( '#post-query-submit' ).trigger( 'click' );
	await settle();
	expect( visited ).toHaveLength( 1 );
	const url = new URL( visited[ 0 ], 'http://x.invalid' );
	expect( url.pathname ).toBe( '/wp-admin/edit.php' );
	expect( [ ...url.searchParams ] ).toEqual( [ [ 'post_status', 'draft' ], [ 's', '' ], [ 'post_type', 'post' ], [ 'm', '201903' ], [ 'cat', '4' ], [ 'post_format', 'aside' ], [ 'paged', '1' ] ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'Search replaces the term and keeps the filters', async () => {
	const { wrapper, visited } = await mountWithRouter( withFilters() );
	await wrapper.find( '#cat' ).setValue( '3' );
	await wrapper.find( '#post-search-input' ).setValue( 'hello world' );
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( visited ).toHaveLength( 1 );
	const params = new URL( visited[ 0 ], 'http://x.invalid' ).searchParams;
	expect( params.get( 's' ) ).toBe( 'hello world' );
	expect( params.get( 'cat' ) ).toBe( '3' );
	expect( params.get( 'post_type' ) ).toBe( 'post' );
	expect( params.get( 'm' ) ).toBe( '0' );
} );

test( 'formQuery skips the named fields and replaces a value once; isBulkField names the bulk and inline fields', () => {
	expect( formQuery( [ [ 'a', '1' ], [ 'b', '2' ], [ 'b', '3' ], [ 'c', '4' ] ], { b: 'x' }, new Set( [ 'a' ] ) ) ).toBe( 'b=x&c=4' );
	expect( formQuery( [ [ 'a', '1' ] ], { s: 'term' } ) ).toBe( 'a=1&s=term' );
	const bulk = [ 'action', 'action2', 'post[]', 'bulk_edit', 'delete_all', '_wpnonce', 'post_title', '_status', 'tax_input[genre][]', 'post_category[]' ];
	expect( bulk.filter( isBulkField ) ).toEqual( bulk );
	// post_format is also the format filter's own name.
	const kept = [ 'm', 'cat', 'post_format', 's', 'post_type', 'post_status', 'author' ];
	expect( kept.filter( ( name ) => ! isBulkField( name ) ) ).toEqual( kept );
} );
