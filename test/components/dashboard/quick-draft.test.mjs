/** @jest-environment jsdom */
// Quick Draft (core/dashboard-quick-draft): the form posts what was typed; what WordPress decides (the notice for a
// draft with neither title nor content, the new list of drafts) comes back as data.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const ROUTE = 'wp-admin/v1/dashboard/quick-draft';
const DRAFT = ( id, title ) => ( { id, title, url: 'post.php?post=' + id + '&action=edit', ariaLabel: 'Edit “' + title + '”', date: 'November 19, 2026', isoDate: '2026-11-19T10:00:00+00:00', excerpt: 'Words of ' + title } );
const DATA = { canEdit: true, postId: 5, titleLabel: 'Title', drafts: { items: [ DRAFT( 9, 'Draft one' ) ], viewAll: 'edit.php?post_status=draft' } };

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const quickDraft = async ( data = DATA, options ) => ( await mountWidget( 'quick-draft', data, options ) ).wrapper;
const submit = async ( wrapper ) => {
	await wrapper.find( '#quick-press' ).trigger( 'submit' );
	await settle();
};

test( 'a draft with neither title nor content shows WordPress\'s error in an alert and keeps the fields', async () => {
	api.respondWith( async () => ( { notice: { type: 'error', message: 'Cannot create a draft post with empty title and content.' }, drafts: DATA.drafts, postId: 5 } ) );
	const wrapper = await quickDraft();
	await submit( wrapper );

	expect( api.calls ).toEqual( [ { method: 'POST', route: ROUTE, payload: { title: '', content: '', postId: 5 } } ] );
	const alert = wrapper.find( '#quick-press [role="alert"]' );
	expect( alert.text() ).toBe( 'Cannot create a draft post with empty title and content.' );
	expect( alert.classes() ).toEqual( expect.arrayContaining( [ 'notice', 'notice-error' ] ) );
	// The drafts are as they were, and nothing is highlighted for an error.
	expect( wrapper.findAll( '.drafts li' ) ).toHaveLength( 1 );
	expect( wrapper.find( '.drafts li' ).attributes( 'style' ) ).toBeUndefined();
} );

test( 'the title and the content typed are posted, then the fields empty and the Title field takes the focus', async () => {
	api.respondWith( async () => ( { notice: { type: 'success', message: 'Draft created successfully.' }, drafts: { items: [ DRAFT( 12, 'New title' ), DRAFT( 9, 'Draft one' ) ], viewAll: 'edit.php?post_status=draft' }, postId: 13 } ) );
	const wrapper = await quickDraft();
	await wrapper.find( '#title' ).setValue( 'New title' );
	await wrapper.find( '#content' ).setValue( 'New content' );
	await submit( wrapper );

	expect( api.calls ).toEqual( [ { method: 'POST', route: ROUTE, payload: { title: 'New title', content: 'New content', postId: 5 } } ] );
	expect( wrapper.find( '#title' ).element.value ).toBe( '' );
	expect( wrapper.find( '#content' ).element.value ).toBe( '' );
	expect( wrapper.find( '#quick-press [role="alert"]' ).text() ).toBe( 'Draft created successfully.' );
	expect( wrapper.findAll( '.drafts li .draft-title a' ).map( ( link ) => link.text() ) ).toEqual( [ 'New title', 'Draft one' ] );
	expect( wrapper.find( '.drafts li .draft-title a' ).attributes( 'aria-label' ) ).toBe( 'Edit “New title”' );
	expect( document.activeElement ).toBe( wrapper.find( '#title' ).element );
	// The next save uses the auto-draft WordPress made.
	await wrapper.find( '#title' ).setValue( 'Another' );
	await submit( wrapper );
	expect( api.calls.at( -1 ).payload.postId ).toBe( 13 );
} );

test( 'a request that fails shows its message, or says WordPress cannot be reached, and the button works again', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'The post could not be saved.' ), { status: 500 } );
	} );
	const wrapper = await quickDraft();
	await wrapper.find( '#title' ).setValue( 'Kept title' );
	await submit( wrapper );
	expect( wrapper.find( '#quick-press [role="alert"]' ).text() ).toBe( 'The post could not be saved.' );
	expect( wrapper.find( '#title' ).element.value ).toBe( 'Kept title' );
	expect( wrapper.find( '#save-post' ).attributes( 'disabled' ) ).toBeUndefined();

	api.respondWith( async () => {
		throw new Error( '' );
	} );
	await submit( wrapper );
	expect( wrapper.find( '#quick-press [role="alert"]' ).text() ).toBe( 'WordPress cannot be reached right now. Please try again in a moment.' );
} );

test( 'the button is disabled while the draft is being saved, and a second submit sends nothing', async () => {
	let finish;
	api.respondWith( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await quickDraft();
	await wrapper.find( '#quick-press' ).trigger( 'submit' );
	expect( wrapper.find( '#save-post' ).attributes( 'disabled' ) ).toBeDefined();
	await wrapper.find( '#quick-press' ).trigger( 'submit' );
	expect( api.calls ).toHaveLength( 1 );

	finish( { notice: { type: 'error', message: 'x' }, drafts: DATA.drafts, postId: 5 } );
	await settle();
	expect( wrapper.find( '#save-post' ).attributes( 'disabled' ) ).toBeUndefined();
} );

test( 'the recent drafts link to their editor and to the list of drafts, or say there are none', async () => {
	const wrapper = await quickDraft();
	expect( wrapper.find( '.drafts h2' ).text() ).toBe( 'Your Recent Drafts' );
	expect( wrapper.find( '.drafts .draft-title a' ).attributes( 'href' ) ).toMatch( /post\.php\?post=9&action=edit$/ );
	expect( wrapper.find( '.drafts .draft-content' ).text() ).toBe( 'Words of Draft one' );
	expect( wrapper.find( '.drafts .view-all a' ).attributes( 'href' ) ).toMatch( /edit\.php\?post_status=draft$/ );

	const none = await quickDraft( { ...DATA, drafts: { items: [], viewAll: null } } );
	expect( none.find( '.no-drafts' ).text() ).toBe( 'There are no recent drafts.' );
	expect( none.find( '.drafts' ).exists() ).toBe( false );
} );

test( 'a user who may not edit posts gets no form', async () => {
	const wrapper = await quickDraft( { canEdit: false } );
	expect( wrapper.find( '#quick-press' ).exists() ).toBe( false );
	expect( wrapper.text() ).toBe( '' );
} );
