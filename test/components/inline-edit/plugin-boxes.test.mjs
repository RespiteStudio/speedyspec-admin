/** @jest-environment jsdom */
// What plugins print on `quick_edit_custom_box` and `bulk_edit_custom_box`, in the Quick Edit and
// Bulk Edit rows: kept as the plugin printed it (kit/LegacyHtml), after the right fieldset and
// before the buttons, each box isolated, and its field read when the form is saved. Then in the
// Posts page: the Quick Edit boxes show only in Quick Edit, the Bulk Edit boxes only in Bulk Edit.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import * as api from '../../helpers/api-stub.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { INLINE_EDIT, loadContracts, mountPosts, postsData, row, settle } from '../edit-posts/data.mjs';

beforeEach( async () => {
	window.scrollTo = () => {};
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'inline-edit' ] );
} );
afterEach( () => resetContracts() );

const BULK_BOX = { column: 'detached_fixture', html: '<input name="detached_fixture_bulk_note" class="detached-fixture-bulk-note">', error: false };
const QUICK_BOX = { column: 'detached_fixture', html: '<fieldset class="inline-edit-col-right detached-fixture-quick-edit"><label><span class="title">Fixture note</span><input type="text" name="fixture_note" value=""></label></fieldset>', error: false };

/** Mounts the inline form as the contract table resolves it, with `props`. */
async function form( props ) {
	const wrapper = mountPart( { render: () => h( 'table', [ h( 'tbody', [ h( Contracted, { id: 'core/inline-edit', rowId: 'bulk-edit', ...props } ) ] ) ] ) } );
	await settle();
	return wrapper;
}
const childClasses = ( wrapper ) => [ ...wrapper.find( '.inline-edit-wrapper' ).element.children ].map( ( child ) => child.className );

test( 'a Bulk Edit box is the plugin\'s HTML as printed, after the right fieldset and before the buttons', async () => {
	const wrapper = await form( { kind: 'bulk', customBoxes: [ BULK_BOX ] } );
	expect( childClasses( wrapper ) ).toEqual( [ 'inline-edit-col-left', 'inline-edit-col-right', 'wp-admin-legacy-html', 'submit inline-edit-save' ] );
	const box = wrapper.find( '.wp-admin-legacy-html' );
	expect( box.element.innerHTML ).toBe( BULK_BOX.html );
	expect( box.find( 'input.detached-fixture-bulk-note' ).attributes( 'name' ) ).toBe( 'detached_fixture_bulk_note' );
} );

test( 'a Quick Edit box is the plugin\'s HTML as printed, in the same place', async () => {
	const wrapper = await form( { kind: 'quick', rowId: 'edit-7', customBoxes: [ QUICK_BOX ] } );
	expect( childClasses( wrapper ) ).toEqual( [ 'inline-edit-col-left', 'inline-edit-col-right', 'wp-admin-legacy-html', 'submit inline-edit-save' ] );
	expect( wrapper.find( '.wp-admin-legacy-html' ).element.innerHTML ).toBe( QUICK_BOX.html );
	expect( wrapper.find( 'tr#edit-7 input[name="fixture_note"]' ).exists() ).toBe( true );
} );

test( 'every box shows, in the order WordPress sent, and a box with nothing in it shows nothing', async () => {
	const other = { column: 'acme', html: '<input name="acme_note" class="acme-note">', error: false };
	const wrapper = await form( { kind: 'bulk', customBoxes: [ BULK_BOX, { column: 'empty', html: '', error: false }, other ] } );
	const boxes = wrapper.findAll( '.wp-admin-legacy-html' );
	expect( boxes ).toHaveLength( 2 );
	expect( boxes.map( ( box ) => box.find( 'input' ).attributes( 'name' ) ) ).toEqual( [ 'detached_fixture_bulk_note', 'acme_note' ] );
} );

test( 'a box whose callback failed shows the failure message in its place; the other boxes still show', async () => {
	const wrapper = await form( { kind: 'bulk', customBoxes: [ { column: 'broken', html: '', error: true }, BULK_BOX ] } );
	expect( wrapper.find( 'p.wp-admin-legacy-failure' ).attributes( 'role' ) ).toBe( 'alert' );
	expect( wrapper.find( 'p.wp-admin-legacy-failure' ).text() ).toBe( 'This box could not be displayed.' );
	expect( wrapper.findAll( '.wp-admin-legacy-html' ) ).toHaveLength( 1 );
	expect( wrapper.find( 'input.detached-fixture-bulk-note' ).exists() ).toBe( true );
} );

test( 'the plugin\'s field is read with the form\'s own when Update is used', async () => {
	const saved = [];
	const wrapper = await form( { kind: 'bulk', customBoxes: [ BULK_BOX ], onSave: ( fields ) => saved.push( fields ) } );
	await wrapper.find( 'input.detached-fixture-bulk-note' ).setValue( 'A note' );
	await wrapper.find( '#bulk_edit' ).trigger( 'click' );
	expect( saved ).toHaveLength( 1 );
	expect( saved[ 0 ] ).toMatchObject( { detached_fixture_bulk_note: 'A note' } );
} );

test( 'what the user typed in a plugin\'s field survives other updates of the form', async () => {
	const wrapper = await form( { kind: 'bulk', customBoxes: [ BULK_BOX ] } );
	await wrapper.find( 'input.detached-fixture-bulk-note' ).setValue( 'Kept' );
	await wrapper.setProps( { saving: false } );
	await settle();
	expect( wrapper.find( 'input.detached-fixture-bulk-note' ).element.value ).toBe( 'Kept' );
} );

test( 'Posts: Quick Edit shows the quick boxes only, Bulk Edit the bulk boxes only', async () => {
	await loadContracts();
	const data = postsData( { inlineEdit: { ...INLINE_EDIT, customBoxes: { quick: [ QUICK_BOX ], bulk: [ BULK_BOX ] } }, items: [ row( 7 ), row( 8 ) ] } );
	const wrapper = await mountPosts( data );
	await wrapper.find( '#post-7 button.editinline' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7 input[name="fixture_note"]' ).exists() ).toBe( true );
	expect( wrapper.find( '#edit-7 input.detached-fixture-bulk-note' ).exists() ).toBe( false );
	await wrapper.find( '#edit-7 button.cancel' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );

	await wrapper.find( '#post-7 input[type="checkbox"]' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'edit' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#bulk-edit input.detached-fixture-bulk-note' ).exists() ).toBe( true );
	expect( wrapper.find( '#bulk-edit input[name="fixture_note"]' ).exists() ).toBe( false );
} );

test( 'Posts: Bulk Edit posts the plugin\'s field with the others; saving the status goes out as one request for the posts listed', async () => {
	await loadContracts();
	api.respondWith( async () => ( { redirect: null } ) );
	const data = postsData( { inlineEdit: { ...INLINE_EDIT, customBoxes: { quick: [], bulk: [ BULK_BOX ] } }, items: [ row( 7 ), row( 8 ) ] } );
	const wrapper = await mountPosts( data );
	await wrapper.find( '#post-7 input[type="checkbox"]' ).trigger( 'click' );
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'edit' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#bulk-edit input.detached-fixture-bulk-note' ).setValue( 'A note' );
	await wrapper.find( '#bulk-edit select[name="_status"]' ).setValue( 'publish' );
	await wrapper.find( '#bulk-edit #bulk_edit' ).trigger( 'click' );
	await settle();
	const saves = api.calls.filter( ( call ) => call.route === 'wp-admin/v1/posts/bulk' );
	expect( saves ).toHaveLength( 1 );
	expect( saves[ 0 ].payload ).toMatchObject( { action: 'edit', ids: [ 7 ] } );
	expect( saves[ 0 ].payload.fields ).toMatchObject( { detached_fixture_bulk_note: 'A note', _status: 'publish' } );
} );
