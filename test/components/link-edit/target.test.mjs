/** @jest-environment jsdom */
// The Target box (link_target_meta_box()): the three radios, the one WordPress checks (none on
// Add), and the save sends link_target only when one is checked, as the classic form posts it.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { addData, editData, loadContracts, mountAdd, mountLink, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
} );

const radios = ( wrapper ) => wrapper.findAll( '#linktargetdiv input[name="link_target"]' ).map( ( input ) => [ input.attributes( 'id' ), input.element.value, input.element.checked ] );

test( 'the radios with their labels, the stored target checked, and a change posted', async () => {
	const wrapper = await mountLink( editData( { link: { ...editData().link, target: '_top' } } ) );
	expect( radios( wrapper ) ).toEqual( [ [ 'link_target_blank', '_blank', false ], [ 'link_target_top', '_top', true ], [ 'link_target_none', '', false ] ] );
	expect( wrapper.findAll( '#linktargetdiv code' ).map( ( code ) => code.text() ) ).toEqual( [ '_blank', '_top', '_none' ] );
	expect( wrapper.find( '#linktargetdiv legend' ).text() ).toBe( 'Target' );
	await wrapper.find( '#link_target_none' ).setValue( true );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( api.calls.at( -1 ).payload.fields.link_target ).toBe( '' );
} );

test( 'none checked on Add, and the save then sends no link_target', async () => {
	const wrapper = await mountAdd( addData() );
	expect( radios( wrapper ).map( ( [ , , checked ] ) => checked ) ).toEqual( [ false, false, false ] );
	await wrapper.find( 'form#addlink' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( api.calls.at( -1 ).payload.fields, 'link_target' ) ).toBe( false );
	await wrapper.find( '#link_target_blank' ).setValue( true );
	await wrapper.find( 'form#addlink' ).trigger( 'submit' );
	await settle();
	expect( api.calls.at( -1 ).payload.fields.link_target ).toBe( '_blank' );
} );
