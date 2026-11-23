/** @jest-environment jsdom */
// The Categories box of the link form (link_categories_meta_box(), link.js): the two tabs with
// their keys, the tab posted to the link screen's preferences (the `cats` setting), the checkboxes
// kept the same in both tabs, the names as escaped HTML that runs nothing, the popular boxes'
// disabled flag from the data, and "+ Add Category" posting links/categories.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { addData, editData, host, loadContracts, mountAdd, mountLink, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
	delete window.__ran;
} );

const PREFS = 'wp-admin/v1/screen-preferences/link';
const tabLink = ( wrapper, which ) => wrapper.find( '#category-tabs a[href="#categories-' + which + '"]' );
const shownPanel = ( wrapper ) => [ 'all', 'pop' ].filter( ( which ) => wrapper.find( '#categories-' + which ).element.style.display !== 'none' );

test( 'the box: tabs role=tablist, the All categories checklist and the Most Used one, names as escaped HTML', async () => {
	const wrapper = await mountLink();
	expect( wrapper.find( '#linkcategorydiv #taxonomy-linkcategory.categorydiv' ).exists() ).toBe( true );
	expect( wrapper.find( '#category-tabs' ).attributes( 'role' ) ).toBe( 'tablist' );
	expect( tabLink( wrapper, 'all' ).text() ).toBe( 'All categories' );
	expect( tabLink( wrapper, 'all' ).attributes( 'aria-selected' ) ).toBe( 'true' );
	expect( tabLink( wrapper, 'pop' ).text() ).toBe( 'Most Used' );
	expect( shownPanel( wrapper ) ).toEqual( [ 'all' ] );
	const all = wrapper.findAll( '#categorychecklist > li' );
	expect( all.map( ( li ) => li.attributes( 'id' ) ) ).toEqual( [ 'link-category-2', 'link-category-3', 'link-category-4' ] );
	expect( all[ 1 ].text() ).toBe( 'Friends & Co' );
	const input = wrapper.find( '#in-link-category-2' );
	expect( input.attributes( 'name' ) ).toBe( 'link_category[]' );
	expect( input.element.checked ).toBe( true );
	expect( wrapper.findAll( '#categorychecklist-pop > li' ).map( ( li ) => li.attributes( 'id' ) ) ).toEqual( [ 'popular-link_category-2', 'popular-link_category-3' ] );
	expect( wrapper.find( '#in-popular-link_category-2' ).attributes( 'name' ) ).toBeUndefined();
} );

test( 'tab posts categoryTab; arrow keys; sync: Most Used is shown and posted, All posts all, the arrows move the focus, and the two checklists stay the same', async () => {
	api.respondWith( async ( method, route, payload ) => payload );
	const wrapper = await mountLink();
	// link.js's sync on load: the popular box of a checked category is checked.
	expect( wrapper.find( '#in-popular-link_category-2' ).element.checked ).toBe( true );

	await tabLink( wrapper, 'pop' ).trigger( 'click' );
	await settle();
	expect( shownPanel( wrapper ) ).toEqual( [ 'pop' ] );
	expect( tabLink( wrapper, 'pop' ).attributes( 'aria-selected' ) ).toBe( 'true' );
	expect( tabLink( wrapper, 'all' ).attributes( 'aria-selected' ) ).toBeUndefined();
	expect( tabLink( wrapper, 'all' ).attributes( 'tabindex' ) ).toBe( '-1' );
	expect( wrapper.find( '#category-tabs li.tabs a' ).attributes( 'href' ) ).toBe( '#categories-pop' );
	expect( api.calls ).toEqual( [ { method: 'POST', route: PREFS, payload: { categoryTab: 'pop' } } ] );

	await wrapper.find( '#in-popular-link_category-3' ).setValue( true );
	expect( wrapper.find( '#in-link-category-3' ).element.checked ).toBe( true );
	await wrapper.find( '#in-link-category-2' ).setValue( false );
	expect( wrapper.find( '#in-popular-link_category-2' ).element.checked ).toBe( false );

	await tabLink( wrapper, 'pop' ).trigger( 'keyup', { key: 'ArrowRight' } );
	await settle();
	expect( document.activeElement ).toBe( tabLink( wrapper, 'all' ).element );
	await tabLink( wrapper, 'all' ).trigger( 'keyup', { key: 'ArrowLeft' } );
	await settle();
	expect( document.activeElement ).toBe( tabLink( wrapper, 'pop' ).element );

	await tabLink( wrapper, 'all' ).trigger( 'keydown', { key: 'Enter' } );
	await settle();
	expect( shownPanel( wrapper ) ).toEqual( [ 'all' ] );
	await tabLink( wrapper, 'pop' ).trigger( 'keyup', { key: ' ' } );
	await settle();
	expect( shownPanel( wrapper ) ).toEqual( [ 'pop' ] );
	expect( api.calls.map( ( call ) => call.payload.categoryTab ) ).toEqual( [ 'pop', 'all', 'pop' ] );
} );

test( 'tab posts categoryTab: the box opens on the tab WordPress names, without posting it', async () => {
	const wrapper = await mountLink( editData( { categories: { ...editData().categories, tab: 'pop' } } ) );
	expect( shownPanel( wrapper ) ).toEqual( [ 'pop' ] );
	expect( tabLink( wrapper, 'pop' ).attributes( 'aria-selected' ) ).toBe( 'true' );
	expect( api.calls ).toEqual( [] );
} );

test( 'the popular boxes are disabled when WordPress says so', async () => {
	const popular = editData().categories.popular.map( ( term ) => ( { ...term, disabled: true } ) );
	const wrapper = await mountLink( editData( { categories: { ...editData().categories, popular } } ) );
	expect( wrapper.findAll( '#categorychecklist-pop input' ).map( ( input ) => input.element.disabled ) ).toEqual( [ true, true ] );
} );

test( 'adder: "+ Add Category" opens the form on All, the tip clears on focus, Add posts the names and prepends checked boxes, then the field empties', async () => {
	api.respondWith( async ( method, route, payload ) => ( route === 'wp-admin/v1/links/categories' ? { categories: [ { id: 21, name: 'New &amp; One' }, { id: 22, name: 'Two' } ] } : payload ) );
	const wrapper = await mountAdd( addData( { categories: { ...addData().categories, tab: 'pop' } } ) );
	const adder = wrapper.find( '#category-adder' );
	expect( adder.classes() ).toContain( 'wp-hidden-children' );
	await wrapper.find( '#category-add-toggle' ).trigger( 'click' );
	await settle();
	expect( adder.classes() ).not.toContain( 'wp-hidden-children' );
	expect( shownPanel( wrapper ) ).toEqual( [ 'all' ] );
	expect( api.calls ).toEqual( [ { method: 'POST', route: PREFS, payload: { categoryTab: 'all' } } ] );

	const field = wrapper.find( '#newcat' );
	expect( field.element.value ).toBe( 'New category name' );
	expect( field.classes() ).toContain( 'form-input-tip' );
	await field.trigger( 'focus' );
	expect( field.element.value ).toBe( '' );
	expect( field.classes() ).not.toContain( 'form-input-tip' );
	await field.setValue( 'New & One, Two' );
	await wrapper.find( '#link-category-add-submit' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: 'wp-admin/v1/links/categories', payload: { names: 'New & One, Two' } } );
	expect( wrapper.findAll( '#categorychecklist > li' ).map( ( li ) => li.attributes( 'id' ) ) ).toEqual( [ 'link-category-22', 'link-category-21', 'link-category-2', 'link-category-3', 'link-category-4' ] );
	expect( wrapper.find( '#link-category-21' ).text() ).toBe( 'New & One' );
	expect( wrapper.find( '#in-link-category-21' ).element.checked ).toBe( true );
	expect( wrapper.find( '#newcat' ).element.value ).toBe( '' );
	expect( document.activeElement ).toBe( wrapper.find( '#newcat' ).element );

	api.respondWith( async () => ( { redirect: 'link-add.php?added=true', location: null } ) );
	await wrapper.find( 'form#addlink' ).trigger( 'submit' );
	await settle();
	expect( api.calls.at( -1 ).payload.fields.link_category ).toEqual( [ '22', '21' ] );
} );

test( 'adder: no "+ Add Category" when WordPress says the user may not add one', async () => {
	const wrapper = await mountLink( editData( { categories: { ...editData().categories, canAdd: false } } ) );
	expect( wrapper.find( '#category-adder' ).exists() ).toBe( false );
} );

test( 'a failed answer: the adder says the error in #category-ajax-response and adds nothing; a refused tab is said in a page notice', async () => {
	api.respondWith( async ( method, route ) => {
		throw route === 'wp-admin/v1/links/categories'
			? Object.assign( new Error( 'Sorry, you are not allowed to manage terms in this taxonomy.' ), { status: 403, code: 'term_forbidden' } )
			: Object.assign( new Error( 'Fixture failure.' ), { status: 500, code: 'fixture_failure' } );
	} );
	const record = host();
	const wrapper = await mountLink( editData(), record );
	await wrapper.find( '#newcat' ).trigger( 'focus' );
	await wrapper.find( '#newcat' ).setValue( 'Nope' );
	await wrapper.find( '#link-category-add-submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#category-ajax-response .notice-error p' ).text() ).toBe( 'Sorry, you are not allowed to manage terms in this taxonomy.' );
	expect( wrapper.findAll( '#categorychecklist > li' ) ).toHaveLength( 3 );
	expect( wrapper.find( '#newcat' ).element.value ).toBe( 'Nope' );
	await tabLink( wrapper, 'pop' ).trigger( 'click' );
	await settle();
	expect( record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'Fixture failure.' ] );
} );

test( 'names run nothing: a category named <img onerror> in both checklists and from the adder', async () => {
	const evil = '&lt;img src=x onerror=&quot;window.__ran=1&quot;&gt;';
	api.respondWith( async () => ( { categories: [ { id: 30, name: evil } ] } ) );
	const wrapper = await mountLink( editData( { categories: { all: [ { id: 2, name: evil, checked: true } ], popular: [ { id: 2, name: evil, checked: false, disabled: false } ], tab: 'all', canAdd: true } } ) );
	await wrapper.find( '#newcat' ).trigger( 'focus' );
	await wrapper.find( '#newcat' ).setValue( 'x' );
	await wrapper.find( '#link-category-add-submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#linkcategorydiv img' ).exists() ).toBe( false );
	expect( wrapper.find( '#link-category-2' ).text() ).toBe( '<img src=x onerror="window.__ran=1">' );
	expect( window.__ran ).toBeUndefined();
} );
