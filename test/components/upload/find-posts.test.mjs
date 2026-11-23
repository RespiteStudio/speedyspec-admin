/** @jest-environment jsdom */
// The Find Posts dialog of the Media list (upload/find-posts.js), through the real page in jsdom:
// the focus goes into the dialog when it opens and back to what opened it when it closes, by
// Escape, the close button or the overlay; Select attaches only a checked post. Like classic's
// media.js, the dialog holds no focus trap: it focuses its search field and closes on Escape.
import { afterEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { DATA, FOUND, ROW, mountMedia, settle } from './data.mjs';

afterEach( () => resetContracts() );

const ATTACH_ROUTE = 'wp-admin/v1/media/attach';
const FIND_ROUTE = 'wp-admin/v1/posts/find';
const mountUnattached = async ( answer = FOUND ) => {
	// mountMedia() resets the API double, so the answers are set after it.
	const mounted = await mountMedia( DATA( { items: [ ROW( 7, { attach: true } ), ROW( 8, { attach: true } ) ] } ) );
	api.respondWith( async ( method, route ) => ( route === FIND_ROUTE ? answer : { redirect: 'upload.php?mode=list&attached=1', location: null } ) );
	return mounted;
};
const attachLink = ( wrapper, id = 7 ) => wrapper.find( `#post-${ id } .row-actions .attach a` );
const shown = ( wrapper ) => wrapper.find( '#find-posts' ).attributes( 'style' ) !== 'display: none;';

test( 'opening it focuses the search field, shows it and lists the latest content at once', async () => {
	const { wrapper } = await mountUnattached();
	expect( shown( wrapper ) ).toBe( false );
	await attachLink( wrapper ).trigger( 'click' );
	await settle();
	expect( shown( wrapper ) ).toBe( true );
	expect( document.activeElement ).toBe( wrapper.find( '#find-posts-input' ).element );
	expect( api.calls.filter( ( call ) => call.method === 'GET' ).map( ( call ) => [ call.route, call.payload ] ) ).toEqual( [ [ FIND_ROUTE, { ps: '' } ] ] );
	expect( wrapper.findAll( '#find-posts-response tbody tr' ).map( ( row ) => row.findAll( 'td' ).map( ( cell ) => cell.text() ).filter( Boolean ) ) ).toEqual( [ [ 'Parent one', 'Post', '2026/11/01', 'Published' ], [ 'Parent two', 'Page', '2026/11/02', 'Draft' ] ] );
} );

const closers = {
	'Escape in the search field': ( wrapper ) => wrapper.find( '#find-posts-input' ).trigger( 'keydown', { key: 'Escape' } ),
	'the close button': ( wrapper ) => wrapper.find( '#find-posts-close' ).trigger( 'click' ),
	'a click on the overlay': ( wrapper ) => wrapper.find( '.ui-find-overlay' ).trigger( 'click' ),
};
for ( const [ name, close ] of Object.entries( closers ) ) {
	test( `${ name } closes it, attaches nothing and gives the focus back to Attach`, async () => {
		const { wrapper } = await mountUnattached();
		const opener = attachLink( wrapper );
		opener.element.focus();
		await opener.trigger( 'click' );
		await settle();
		expect( shown( wrapper ) ).toBe( true );
		expect( document.activeElement ).not.toBe( opener.element );
		// Select could attach here: a post is listed and the dialog is open.
		expect( wrapper.findAll( '#find-posts-response tbody tr' ) ).toHaveLength( 2 );
		await close( wrapper );
		await settle();
		expect( shown( wrapper ) ).toBe( false );
		expect( wrapper.find( '.ui-find-overlay' ).exists() ).toBe( false );
		expect( document.activeElement ).toBe( opener.element );
		expect( api.calls.some( ( call ) => call.route === ATTACH_ROUTE ) ).toBe( false );
	} );
}

test( 'a bulk Attach\'s dialog gives the focus back to the Apply button', async () => {
	const { wrapper } = await mountUnattached();
	wrapper.find( '#post-7 input[type="checkbox"]' ).element.click();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'attach' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( shown( wrapper ) ).toBe( true );
	await wrapper.find( '#find-posts-close' ).trigger( 'click' );
	await settle();
	expect( document.activeElement ).toBe( wrapper.find( '#doaction' ).element );
} );

test( 'no results says "No items found."; Select with nothing checked sends nothing and keeps the dialog open', async () => {
	const { wrapper } = await mountUnattached( { rows: [] } );
	await attachLink( wrapper ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#find-posts-response' ).text() ).toBe( 'No items found.' );
	await wrapper.find( '#find-posts-submit' ).trigger( 'click' );
	await settle();
	expect( api.calls.some( ( call ) => call.route === ATTACH_ROUTE ) ).toBe( false );
	expect( shown( wrapper ) ).toBe( true );
} );

test( 'a click on a row checks it and Select posts media/attach with that post and the row\'s attachment', async () => {
	const { wrapper, seen } = await mountUnattached();
	await attachLink( wrapper ).trigger( 'click' );
	await settle();
	// Nothing is checked yet: Select sends nothing (the proof that the later send is the click's).
	await wrapper.find( '#find-posts-submit' ).trigger( 'click' );
	await settle();
	expect( api.calls.some( ( call ) => call.route === ATTACH_ROUTE ) ).toBe( false );
	await wrapper.findAll( '#find-posts-response tbody tr' )[ 1 ].trigger( 'click' );
	expect( wrapper.find( '#found-32' ).element.checked ).toBe( true );
	await wrapper.find( '#find-posts-submit' ).trigger( 'click' );
	await settle();
	const posted = api.calls.filter( ( call ) => call.route === ATTACH_ROUTE );
	expect( posted ).toHaveLength( 1 );
	expect( posted[ 0 ].payload ).toMatchObject( { action: 'attach', parentId: 32, ids: [ 7 ] } );
	expect( seen.followed ).toEqual( [ { redirect: 'upload.php?mode=list&attached=1', location: null } ] );
} );

test( 'a search that finds nothing replaces the rows, and Search asks again with the term', async () => {
	const { wrapper } = await mountUnattached();
	await attachLink( wrapper ).trigger( 'click' );
	await settle();
	expect( wrapper.findAll( '#find-posts-response tbody tr' ) ).toHaveLength( 2 );
	api.respondWith( async () => ( { rows: [] } ) );
	await wrapper.find( '#find-posts-input' ).setValue( 'nothing like this' );
	await wrapper.find( '#find-posts-search' ).trigger( 'click' );
	await settle();
	expect( api.calls.filter( ( call ) => call.method === 'GET' ).pop().payload ).toEqual( { ps: 'nothing like this' } );
	expect( wrapper.find( '#find-posts-response' ).text() ).toBe( 'No items found.' );
} );
