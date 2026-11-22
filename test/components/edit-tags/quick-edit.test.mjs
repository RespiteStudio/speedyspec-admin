/** @jest-environment jsdom */
// Quick Edit of a terms list row (edit-tags/quick-edit.js), as inline-edit-tax.js runs it: the
// single fieldset filled from the row as text, Escape, Cancel and the list form's submit buttons
// revert it, Enter and the save button post `terms/{id}/inline`, the answer's row and parent options
// replace the old ones, the focus comes back to the Quick Edit button, errors show in the row;
// plugin boxes, a plugin's `.editinline`, and no Quick Edit without `inlineEdit`.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { ADD_FORM, answer, loadContracts, mountTerms, row, settle, termsData } from './data.mjs';

const SAVE = 'wp-admin/v1/terms/8/inline';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	delete window.__ran;
	resetContracts();
} );

const posted = () => api.calls.filter( ( call ) => call.route === SAVE );
const button = ( wrapper, id = 8 ) => wrapper.find( '#tag-' + id + ' .row-actions .editinline' );

async function open( data = termsData() ) {
	const wrapper = await mountTerms( data );
	await button( wrapper ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( true );
	return wrapper;
}

test( 'fill as text; Escape; focus back: the form opens in place of the row with the name focused, and Escape reverts it', async () => {
	const wrapper = await open( termsData( { items: [ row( 7 ), row( 8, { inline: { name: 'Tom &amp; Jerry', slug: 'tom-jerry', parent: 0 } } ), row( 9 ) ] } ) );
	expect( wrapper.find( '#tag-8' ).classes() ).toContain( 'hidden' );
	expect( button( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( wrapper.find( '#edit-8' ).classes() ).toEqual( [ 'inline-edit-row', 'inline-editor' ] );
	expect( wrapper.find( '#edit-8 legend' ).text() ).toBe( 'Quick Edit' );
	expect( wrapper.findAll( '#edit-8 fieldset' ) ).toHaveLength( 1 );
	expect( wrapper.find( '#edit-8 input[name="name"]' ).element.value ).toBe( 'Tom &amp; Jerry' );
	expect( wrapper.find( '#edit-8 input[name="slug"]' ).element.value ).toBe( 'tom-jerry' );
	expect( document.activeElement ).toBe( wrapper.find( '#edit-8 input[name="name"]' ).element );
	expect( wrapper.find( '#edit-8 button.save' ).text() ).toBe( 'Update Category' );

	await wrapper.find( '#edit-8 input[name="name"]' ).setValue( 'Changed' );
	await wrapper.find( '#edit-8' ).trigger( 'keyup', { key: 'Escape' } );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-8' ).classes() ).not.toContain( 'hidden' );
	expect( api.calls ).toEqual( [] );
	expect( document.activeElement ).toBe( button( wrapper ).element );
	expect( button( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'false' );
} );

test( 'Cancel reverts too, and opening another row reverts the open one', async () => {
	const wrapper = await open();
	await wrapper.find( '#edit-8 button.cancel' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( false );
	expect( document.activeElement ).toBe( button( wrapper ).element );

	await button( wrapper ).trigger( 'click' );
	await settle();
	await button( wrapper, 9 ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#edit-9' ).exists() ).toBe( true );
} );

test( 'the list form\'s submit buttons revert Quick Edit on mousedown, as inline-edit-tax.js', async () => {
	const wrapper = await open();
	await wrapper.find( '#doaction' ).trigger( 'mousedown' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-8' ).classes() ).not.toContain( 'hidden' );

	// A mousedown elsewhere in the list form does not.
	await button( wrapper ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-action-selector-top' ).trigger( 'mousedown' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( true );
} );

test( 'save payload; row replaced; spoken: Update and Enter post the inline route, and the parent option is renamed', async () => {
	const renamed = row( 8, { name: 'Renamed' } );
	const options = { ...ADD_FORM.parent, options: ADD_FORM.parent.options.map( ( option ) => ( option.value === '8' ? { ...option, label: 'Renamed' } : option ) ) };
	api.respondWith( async () => answer( { id: 8, row: renamed, parentOptions: options } ) );
	const wrapper = await open();
	await wrapper.find( '#edit-8 input[name="name"]' ).setValue( 'Renamed' );
	await wrapper.find( '#edit-8 button.save' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].payload ).toEqual( { taxonomy: 'category', name: 'Renamed', slug: 'term-8', screen: 'edit-tags', list: { taxonomy: 'category' } } );
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-8 .row-title' ).text() ).toBe( 'Renamed' );
	expect( wrapper.find( '#parent option[value="8"]' ).text() ).toBe( 'Renamed' );
	expect( document.activeElement ).toBe( button( wrapper ).element );
	expect( button( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( wrapper.spoken ).toEqual( [ [ 'Changes saved.', null ] ] );

	api.reset();
	api.respondWith( async () => answer( { id: 8, row: row( 8, { name: 'By Enter' } ) } ) );
	await button( wrapper ).trigger( 'click' );
	await settle();
	await wrapper.find( '#edit-8 input[name="name"]' ).setValue( 'By Enter' );
	await wrapper.find( '#edit-8 input[name="slug"]' ).trigger( 'keydown', { key: 'Enter' } );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].payload.name ).toBe( 'By Enter' );
	expect( wrapper.find( '#tag-8 .row-title' ).text() ).toBe( 'By Enter' );
} );

test( 'error text; empty answer text: the error shows in the row and the form stays', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'The slug “term-7” is already in use by another term.' ), { status: 400, code: 'duplicate_term_slug' } );
	} );
	const wrapper = await open();
	await wrapper.find( '#edit-8 input[name="slug"]' ).setValue( 'term-7' );
	await wrapper.find( '#edit-8 button.save' ).trigger( 'click' );
	await settle();
	const notice = wrapper.find( '#edit-8 .notice-error' );
	expect( notice.classes() ).not.toContain( 'hidden' );
	expect( notice.find( 'p.error' ).text() ).toBe( 'The slug “term-7” is already in use by another term.' );
	expect( wrapper.find( '#edit-8 input[name="slug"]' ).element.value ).toBe( 'term-7' );
	expect( wrapper.find( '#tag-8 .row-title' ).text() ).toBe( 'Term 8' );

	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 500, code: 'http_500' } );
	} );
	await wrapper.find( '#edit-8 button.save' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8 .notice-error p.error' ).text() ).toBe( 'Error while saving the changes.' );
} );

test( 'a failed answer: the fixture\'s failure text in the row', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture failure.' ), { status: 500, code: 'fixture_failure' } );
	} );
	const wrapper = await open();
	await wrapper.find( '#edit-8 button.save' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8 .notice-error p.error' ).text() ).toBe( 'Fixture failure.' );
	expect( wrapper.find( '#edit-8 button.save' ).element.disabled ).toBe( false );
} );

test( 'custom boxes: the plugins\' Quick Edit boxes show in the form, and their fields are not posted', async () => {
	api.respondWith( async () => answer( { id: 8, row: row( 8 ) } ) );
	const wrapper = await open( termsData( { inlineEdit: { saveLabel: 'Update Category', customBoxes: [ { column: 'detached_fixture', html: '<input name="detached_fixture_term_note" class="detached-fixture-quick-note">', error: false } ] } } ) );
	expect( wrapper.find( '#edit-8 .detached-fixture-quick-note' ).exists() ).toBe( true );
	wrapper.find( '#edit-8 .detached-fixture-quick-note' ).element.value = 'note';
	await wrapper.find( '#edit-8 button.save' ).trigger( 'click' );
	await settle();
	expect( Object.keys( posted()[ 0 ].payload ).sort() ).toEqual( [ 'list', 'name', 'screen', 'slug', 'taxonomy' ] );
} );

test( 'editinlineTrigger: a plugin\'s `.editinline` in its filtered row actions opens Quick Edit, and the focus comes back to it', async () => {
	const rewritten = row( 8, {
		actionsHtml: '<span class=\'edit\'><a href="term.php?tag_ID=8">Edit</a> | </span><span class=\'inline hide-if-no-js\'><button type="button" class="button-link editinline detached-fixture-term-quick">Fixture Quick Edit</button></span>',
		coreActions: [ 'edit' ],
	} );
	const wrapper = await mountTerms( termsData( { items: [ row( 7 ), rewritten, row( 9 ) ] } ) );
	await settle();
	await wrapper.find( '#tag-8 .detached-fixture-term-quick' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( true );
	expect( wrapper.find( '#tag-8 .detached-fixture-term-quick' ).attributes( 'aria-expanded' ) ).toBe( 'true' );
	await wrapper.find( '#edit-8' ).trigger( 'keyup', { key: 'Escape' } );
	await settle();
	expect( document.activeElement ).toBe( wrapper.find( '#tag-8 .detached-fixture-term-quick' ).element );
	expect( wrapper.find( '#tag-8 .detached-fixture-term-quick' ).attributes( 'aria-expanded' ) ).toBe( 'false' );
} );

test( 'no Quick Edit without inlineEdit: the button and the form are absent', async () => {
	const plain = row( 8 );
	plain.actions = plain.actions.filter( ( action ) => action.action !== 'inline' );
	plain.inline = null;
	const wrapper = await mountTerms( termsData( { inlineEdit: null, items: [ plain ] } ) );
	expect( wrapper.find( '#tag-8 .editinline' ).exists() ).toBe( false );
	expect( wrapper.find( '#inline_8' ).exists() ).toBe( false );
	expect( wrapper.find( '#inline-edit' ).exists() ).toBe( false );
} );
