/** @jest-environment jsdom */
// The add form of the terms list (edit-tags/add-form.js), as tags.js submits it: what it posts,
// where the added row goes, the parent select replaced by the answer's, the form emptied (plugin
// fields too), the count, the notice spoken; an empty name marked as validateForm() marks it; a
// second submit ignored while one is on its way; the plugins' hooks shown as printed, with the
// note that this screen does not save them.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { ADD_FORM, answer, loadContracts, mountTerms, pagination, parentOf, row, rowIds, settle, termsData } from './data.mjs';

const ADD = 'wp-admin/v1/terms';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	delete window.__ran;
	resetContracts();
} );

const posted = () => api.calls.filter( ( call ) => call.route === ADD );

test( 'success places, empties and speaks: the row first, the notice in #ajax-response, the count, the fields emptied', async () => {
	api.respondWith( async () => answer( { id: 20, row: row( 20, { name: 'Jazz' } ), parentRow: row( 20, { name: 'Jazz' } ), pagination: pagination( 4 ), notice: { markup: 'Category added.' } } ) );
	const wrapper = await mountTerms( termsData( { addForm: { ...ADD_FORM, hooks: { pre: null, fields: '<div class="form-field"><input name="detached_fixture_term_note" class="detached-fixture-term-note"></div>', after: null } } } ) );
	await settle();
	await wrapper.find( '#tag-name' ).setValue( 'Jazz' );
	await wrapper.find( '#tag-slug' ).setValue( 'jazz' );
	await wrapper.find( '#tag-description' ).setValue( 'All that jazz' );
	wrapper.find( '.detached-fixture-term-note' ).element.value = 'plugin';
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();

	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].payload ).toEqual( { taxonomy: 'category', name: 'Jazz', slug: 'jazz', parent: -1, description: 'All that jazz', screen: 'edit-tags', list: { taxonomy: 'category' } } );
	expect( rowIds( wrapper ) ).toEqual( [ 20, 7, 8, 9 ] );
	expect( wrapper.find( '#ajax-response .notice.notice-success' ).text() ).toBe( 'Category added.' );
	expect( wrapper.find( '#ajax-response .notice' ).attributes( 'role' ) ).toBe( 'alert' );
	expect( wrapper.spoken ).toEqual( [ [ 'Category added.', null ] ] );
	expect( wrapper.findAll( '.tablenav-pages .displaying-num' ).map( ( span ) => span.text() ) ).toEqual( [ '4 items', '4 items' ] );
	expect( wrapper.find( '#tag-name' ).element.value ).toBe( '' );
	expect( wrapper.find( '#tag-slug' ).element.value ).toBe( '' );
	expect( wrapper.find( '#tag-description' ).element.value ).toBe( '' );
	expect( wrapper.find( '.detached-fixture-term-note' ).element.value ).toBe( '' );
	expect( wrapper.find( '#addtag .spinner' ).classes() ).not.toContain( 'is-active' );
} );

test( 'the added row replaces the no-items row', async () => {
	api.respondWith( async () => answer( { id: 20, row: row( 20 ), parentRow: row( 20 ), pagination: pagination( 1 ) } ) );
	const wrapper = await mountTerms( termsData( { items: [], pagination: pagination( 0 ) } ) );
	expect( wrapper.find( '#the-list tr.no-items' ).exists() ).toBe( true );
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#the-list tr.no-items' ).exists() ).toBe( false );
	expect( rowIds( wrapper ) ).toEqual( [ 20 ] );
} );

test( 'parentOptions replace the select; the child goes right after its parent, and the parent stays chosen', async () => {
	const options = parentOf( [ [ 7, 'Term 7' ], [ 8, 'Term 8' ], [ 20, 'Child', 1 ], [ 9, 'Term 9' ] ] );
	api.respondWith( async () => answer( { id: 20, row: row( 20, { name: 'Child', level: 1, parent: 8 } ), parentRow: row( 20, { name: 'Term 8 — Child' } ), parentOptions: options, pagination: pagination( 4 ) } ) );
	const wrapper = await mountTerms();
	await wrapper.find( '#tag-name' ).setValue( 'Child' );
	await wrapper.find( '#parent' ).setValue( '8' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( posted()[ 0 ].payload.parent ).toBe( 8 );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 20, 9 ] );
	expect( wrapper.findAll( '#parent option' ).map( ( option ) => [ option.element.value, option.element.textContent, option.classes().join( ' ' ) ] ) ).toEqual( [
		[ '-1', 'None', '' ], [ '7', 'Term 7', 'level-0' ], [ '8', 'Term 8', 'level-0' ], [ '20', '   Child', 'level-1' ], [ '9', 'Term 9', 'level-0' ],
	] );
	expect( wrapper.find( '#parent' ).element.value ).toBe( '8' );
} );

test( 'a parent dropdown a plugin filtered shows as printed, and its value is posted', async () => {
	const html = '<select name="parent" id="parent" class="postform"><option value="-1">None</option><option value="8" selected>Filtered 8</option></select>';
	api.respondWith( async () => answer( { id: 20, row: row( 20 ), parentRow: row( 20 ), parentOptions: { options: [], html: html.replace( 'Filtered 8', 'Filtered again' ), selected: null } } ) );
	const wrapper = await mountTerms( termsData( { addForm: { ...ADD_FORM, parent: { options: [], html, selected: null } } } ) );
	await settle();
	expect( wrapper.find( '#parent option[value="8"]' ).text() ).toBe( 'Filtered 8' );
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( posted()[ 0 ].payload.parent ).toBe( 8 );
	expect( wrapper.find( '#parent option[value="8"]' ).text() ).toBe( 'Filtered again' );
} );

test( 'empty name marks form-invalid, as validateForm(); the error shows in #ajax-response; a change clears the mark', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'A name is required for this term.' ), { status: 400, code: 'empty_term_name' } );
	} );
	const wrapper = await mountTerms();
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '.term-name-wrap' ).classes() ).toContain( 'form-invalid' );
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'A name is required for this term.' );
	expect( wrapper.spoken ).toEqual( [ [ 'A name is required for this term.', null ] ] );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 9 ] );
	await wrapper.find( '#tag-name' ).setValue( 'x' );
	await wrapper.find( '#tag-name' ).trigger( 'change' );
	expect( wrapper.find( '.term-name-wrap' ).classes() ).not.toContain( 'form-invalid' );
} );

test( 'another error shows its text in #ajax-response and keeps what was typed; the name is not marked', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'A term with the name provided already exists with this parent.' ), { status: 400, code: 'term_exists' } );
	} );
	const wrapper = await mountTerms();
	await wrapper.find( '#tag-name' ).setValue( 'Term 7' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'A term with the name provided already exists with this parent.' );
	expect( wrapper.find( '.term-name-wrap' ).classes() ).not.toContain( 'form-invalid' );
	expect( wrapper.find( '#tag-name' ).element.value ).toBe( 'Term 7' );
} );

test( 'a failed answer without a message says the classic broken text', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 500, code: 'http_500' } );
	} );
	const wrapper = await mountTerms();
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'An error occurred while processing your request. Please try again later.' );
} );

test( 'a failed answer while WordPress cannot be reached says so', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 504, code: 'admin_upstream_timeout' } );
	} );
	const wrapper = await mountTerms();
	await wrapper.find( '#tag-name' ).setValue( 'Term 21' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#ajax-response .notice.notice-error' ).text() ).toBe( 'WordPress cannot be reached right now. Please try again in a moment.' );
} );

test( 'in-flight submit ignored: a second click while the first is on its way posts nothing, and the spinner shows', async () => {
	let finish;
	api.respondWith( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await mountTerms();
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#addtag .submit .spinner' ).classes() ).toContain( 'is-active' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await wrapper.find( '#addtag' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	finish( answer( { id: 20, row: row( 20 ), parentRow: row( 20 ) } ) );
	await settle();
	expect( wrapper.find( '#addtag .submit .spinner' ).classes() ).not.toContain( 'is-active' );
	expect( rowIds( wrapper ) ).toEqual( [ 20, 7, 8, 9 ] );
} );

test( 'no parent when null: a flat taxonomy has no parent field and posts none', async () => {
	api.respondWith( async () => answer( { id: 20, row: row( 20 ), parentRow: null, parentOptions: null } ) );
	const wrapper = await mountTerms( termsData( { addForm: { ...ADD_FORM, parent: null } } ) );
	expect( wrapper.find( '#parent' ).exists() ).toBe( false );
	expect( wrapper.find( '.term-parent-wrap' ).exists() ).toBe( false );
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( Object.hasOwn( posted()[ 0 ].payload, 'parent' ) ).toBe( false );
} );

test( 'the form is the classic one: its fields, labels, descriptions and button', async () => {
	const wrapper = await mountTerms();
	const form = wrapper.find( 'form#addtag' );
	expect( form.attributes( 'method' ) ).toBe( 'post' );
	expect( form.classes() ).toContain( 'validate' );
	expect( wrapper.find( '.form-wrap h2' ).text() ).toBe( 'Add Category' );
	expect( wrapper.find( 'label[for="tag-name"]' ).text() ).toBe( 'Name' );
	expect( wrapper.find( '#tag-name' ).attributes( 'aria-describedby' ) ).toBe( 'name-description' );
	expect( wrapper.find( '#name-description' ).text() ).toBe( 'The name is how it appears on your site.' );
	expect( wrapper.find( 'label[for="tag-slug"]' ).text() ).toBe( 'Slug' );
	expect( wrapper.find( 'label[for="parent"]' ).text() ).toBe( 'Parent Category' );
	expect( wrapper.find( '#parent' ).attributes( 'aria-describedby' ) ).toBe( 'parent-description' );
	expect( wrapper.find( 'label[for="tag-description"]' ).text() ).toBe( 'Description' );
	expect( wrapper.find( '#submit' ).element.value ).toBe( 'Add Category' );
} );

test( 'hooks render through LegacyHtml with their scripts; a note says this screen does not save them, and their fields are not posted', async () => {
	api.respondWith( async () => answer( { id: 20, row: row( 20 ), parentRow: row( 20 ) } ) );
	const hooks = {
		pre: '<div class="detached-fixture-pre-add">Fixture pre-add</div>',
		fields: '<input name="detached_fixture_term_note" class="detached-fixture-term-note"><script>window.__ran = ( window.__ran || 0 ) + 1;</script>',
		after: '<div class="detached-fixture-add-form">Fixture add-form</div>',
	};
	const wrapper = await mountTerms( termsData( { addForm: { ...ADD_FORM, hooks } } ) );
	await settle();
	expect( wrapper.find( '.detached-fixture-pre-add' ).text() ).toBe( 'Fixture pre-add' );
	expect( wrapper.find( '#addtag .detached-fixture-term-note' ).exists() ).toBe( true );
	expect( wrapper.find( '#addtag .detached-fixture-add-form' ).text() ).toBe( 'Fixture add-form' );
	expect( window.__ran ).toBe( 1 );
	expect( wrapper.find( '#addtag .wp-admin-edit-tags-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	await wrapper.find( '#tag-name' ).setValue( 'Term 20' );
	wrapper.find( '.detached-fixture-term-note' ).element.value = 'note';
	await wrapper.find( '#submit' ).trigger( 'click' );
	await settle();
	expect( Object.keys( posted()[ 0 ].payload ).sort() ).toEqual( [ 'description', 'list', 'name', 'parent', 'screen', 'slug', 'taxonomy' ] );

	const none = await mountTerms();
	expect( none.find( '.wp-admin-edit-tags-plugin-note' ).exists() ).toBe( false );
} );
