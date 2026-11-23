/** @jest-environment jsdom */
// core/inline-edit 1.1.0: `layout: 'single'` (one fieldset, as WP_Terms_List_Table::inline_edit()
// prints it) and `saveLabel`. Without `layout` the three fieldsets render, as 1.0.0.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

beforeEach( async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'inline-edit' ] );
} );
afterEach( () => resetContracts() );

async function form( props, slots = {} ) {
	const wrapper = mountPart( { render: () => h( 'table', [ h( 'tbody', [ h( Contracted, { id: 'core/inline-edit', kind: 'quick', rowId: 'edit-5', ...props }, slots ) ] ) ] ) } );
	await settle();
	return wrapper;
}
const left = () => ( { left: () => [ h( 'label', [ h( 'input', { name: 'name', value: 'Term' } ) ] ), h( 'input', { type: 'hidden', name: 'tax', value: 'post_tag' } ) ] } );

test( 'layout single renders one fieldset with the legend, one column and the save label', async () => {
	const wrapper = await form( { layout: 'single', legend: 'Quick Edit', saveLabel: 'Update tag' }, left() );
	expect( wrapper.findAll( 'fieldset' ) ).toHaveLength( 1 );
	expect( wrapper.find( 'fieldset legend.inline-edit-legend' ).text() ).toBe( 'Quick Edit' );
	expect( wrapper.find( 'fieldset > div.inline-edit-col input[name="name"]' ).exists() ).toBe( true );
	expect( wrapper.find( '.inline-edit-col-left' ).exists() ).toBe( false );
	expect( wrapper.find( 'button.save' ).text() ).toBe( 'Update tag' );
	expect( wrapper.find( '.inline-edit-wrapper' ).element.lastElementChild.className ).toBe( 'submit inline-edit-save' );
} );

test( 'single layout puts the custom boxes after the column and before the buttons', async () => {
	const wrapper = await form( { layout: 'single', customBoxes: [ { column: 'x', html: '<input name="box">', error: false } ] }, left() );
	const tags = [ ...wrapper.find( '.inline-edit-wrapper' ).element.children ].map( ( child ) => child.tagName + '.' + child.className );
	expect( tags ).toEqual( [ 'FIELDSET.', 'DIV.wp-admin-legacy-html', 'DIV.submit inline-edit-save' ] );
} );

test( 'the save label defaults to Update', async () => {
	const wrapper = await form( { layout: 'single' }, left() );
	expect( wrapper.find( 'button.save' ).text() ).toBe( 'Update' );
} );

test( 'single layout: Escape cancels and Enter in an input saves the classic fields', async () => {
	const saved = [];
	let cancelled = 0;
	const wrapper = await form( { layout: 'single', onSave: ( fields ) => saved.push( fields ), onCancel: () => cancelled++ }, left() );
	await wrapper.find( 'input[name="name"]' ).trigger( 'keydown', { key: 'Enter' } );
	expect( saved ).toEqual( [ { name: 'Term', tax: 'post_tag' } ] );
	await wrapper.find( 'tr' ).trigger( 'keyup', { key: 'Escape' } );
	expect( cancelled ).toBe( 1 );
} );

test( 'without layout the three fieldsets render, as 1.0.0', async () => {
	const wrapper = await form( { kind: 'quick' }, { left: () => 'l', center: () => 'c', right: () => 'r' } );
	expect( wrapper.findAll( 'fieldset' ) ).toHaveLength( 3 );
	expect( wrapper.find( 'fieldset.inline-edit-col-left' ).exists() ).toBe( true );
	expect( wrapper.find( 'button.save' ).text() ).toBe( 'Update' );
} );
