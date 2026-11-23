/** @jest-environment jsdom */
// The plugin hooks of the term edit form, as edit-tag-form.php prints them: `pre` before the
// page's markup, `top` at the top of the form, `rows` (the `{$taxonomy}_edit_form_fields` rows)
// in a `tbody` of the form table after the core rows, and `after` after the table. They show
// through kit/LegacyHtml with their scripts; a note says this screen does not save their fields,
// and the save sends only the core fields.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { loadContracts, mountTerm, settle, termData } from './data.mjs';

const NOTE = 'This screen does not save the fields plugins add to this form.';
const HOOKS = {
	pre: '<div class="detached-fixture-pre-edit">Fixture pre-edit</div>',
	top: '<div class="detached-fixture-edit-top">Fixture edit-top</div>',
	rows: '<tr class="form-field detached-fixture-edit-row"><th scope="row">Fixture note</th><td><input name="detached_fixture_term_note"></td></tr><script>window.__ran = ( window.__ran || 0 ) + 1;</script>',
	after: '<div class="detached-fixture-edit-form">Fixture edit-form</div>',
};

beforeEach( async () => {
	api.reset();
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	delete window.__ran;
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
} );

test( 'rows in a tbody: the rows after the core rows in the form table, top before it, after after it, pre before the form; scripts run; the note shows', async () => {
	const wrapper = await mountTerm( termData( { hooks: HOOKS } ) );
	await settle();
	const bodies = wrapper.findAll( '#edittag table.form-table > tbody' );
	expect( bodies ).toHaveLength( 2 );
	expect( bodies[ 0 ].findAll( 'tr' ).map( ( tr ) => tr.classes().find( ( name ) => name.startsWith( 'term-' ) ) ) ).toEqual( [ 'term-name-wrap', 'term-slug-wrap', 'term-parent-wrap', 'term-description-wrap' ] );
	expect( bodies[ 1 ].find( 'tr.detached-fixture-edit-row th' ).text() ).toBe( 'Fixture note' );
	expect( window.__ran ).toBe( 1 );

	const form = wrapper.find( '#edittag' ).element;
	const table = form.querySelector( 'table.form-table' );
	const top = form.querySelector( '.detached-fixture-edit-top' );
	const after = form.querySelector( '.detached-fixture-edit-form' );
	const pre = wrapper.find( '.detached-fixture-pre-edit' ).element;
	// eslint-disable-next-line no-bitwise
	expect( top.compareDocumentPosition( table ) & Node.DOCUMENT_POSITION_FOLLOWING ).toBeTruthy();
	// eslint-disable-next-line no-bitwise
	expect( table.compareDocumentPosition( after ) & Node.DOCUMENT_POSITION_FOLLOWING ).toBeTruthy();
	expect( form.contains( pre ) ).toBe( false );
	// eslint-disable-next-line no-bitwise
	expect( pre.compareDocumentPosition( form ) & Node.DOCUMENT_POSITION_FOLLOWING ).toBeTruthy();
	expect( wrapper.find( '.detached-fixture-edit-form' ).text() ).toBe( 'Fixture edit-form' );
	expect( wrapper.find( '#edittag .wp-admin-term-edit-plugin-note' ).text() ).toBe( NOTE );
} );

test( 'rows in a tbody: the plugin fields are not posted with the save', async () => {
	api.respondWith( async () => ( { redirect: 'term.php?taxonomy=category&tag_ID=5&message=3', location: null } ) );
	const wrapper = await mountTerm( termData( { hooks: HOOKS } ) );
	await settle();
	wrapper.find( 'input[name="detached_fixture_term_note"]' ).element.value = 'plugin note';
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	const saved = api.calls.filter( ( call ) => call.method === 'POST' );
	expect( Object.keys( saved[ 0 ].payload ).sort() ).toEqual( [ 'description', 'name', 'parent', 'referer', 'slug', 'taxonomy' ] );
} );

test( 'no hooks: no second tbody and no note; a pre hook alone (outside the form) shows no note', async () => {
	const none = await mountTerm();
	expect( none.findAll( '#edittag table.form-table > tbody' ) ).toHaveLength( 1 );
	expect( none.find( '.wp-admin-term-edit-plugin-note' ).exists() ).toBe( false );

	const pre = await mountTerm( termData( { hooks: { pre: HOOKS.pre, top: null, rows: null, after: null } } ) );
	expect( pre.find( '.detached-fixture-pre-edit' ).exists() ).toBe( true );
	expect( pre.find( '.wp-admin-term-edit-plugin-note' ).exists() ).toBe( false );
} );
