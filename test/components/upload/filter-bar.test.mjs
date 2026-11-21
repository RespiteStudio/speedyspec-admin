/** @jest-environment jsdom */
// The Media list's filter bar (upload/filter-bar.js), through the real page: Filter and Search
// Media submit the list form, and the page navigates to upload.php with the form's fields. The
// form is read as the browser reads it (jsdom's FormData), so the query is what the controls say.
import { afterEach, expect, jest, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import FilterBar from '../../../site/components/core/upload/filter-bar.js';
import { DATA, FILTER_BAR, ROW, mountMedia, settle } from './data.mjs';

afterEach( () => resetContracts() );

const submit = async ( wrapper ) => {
	await wrapper.find( '#posts-filter' ).trigger( 'submit' );
	await settle();
};

test( 'Filter with Mine chosen navigates to upload.php with attachment-filter=mine, and no bulk or dialog field', async () => {
	const { wrapper, seen } = await mountMedia();
	await wrapper.find( '#attachment-filter' ).setValue( 'mine' );
	// Fields the query must leave out: a bulk action and a checked row, as the form holds them.
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'delete' );
	wrapper.find( '#post-7 input[type="checkbox"]' ).element.click();
	await submit( wrapper );
	expect( seen.navigated ).toEqual( [ '/wp-admin/upload.php?mode=list&attachment-filter=mine&m=0&s=&paged=1' ] );
	expect( api.calls ).toEqual( [] );
	expect( seen.asked ).toEqual( [] );
} );

test( 'the query carries the type, the month and the search, in the form\'s order', async () => {
	const { wrapper, seen } = await mountMedia();
	await wrapper.find( '#attachment-filter' ).setValue( 'detached' );
	await wrapper.find( '#filter-by-date' ).setValue( '202611' );
	await wrapper.find( '#media-search-input' ).setValue( 'a cat & dog' );
	await submit( wrapper );
	expect( seen.navigated ).toEqual( [ '/wp-admin/upload.php?mode=list&attachment-filter=detached&m=202611&s=a+cat+%26+dog&paged=1' ] );
} );

test( 'the hidden mode field is the current mode, so the filtered list stays a list', async () => {
	const { wrapper } = await mountMedia();
	expect( wrapper.find( 'input[name="mode"]' ).element.value ).toBe( 'list' );
	expect( wrapper.findAll( '.view-switch a' ).map( ( link ) => [ link.attributes( 'id' ), link.attributes( 'aria-current' ) ?? null ] ) ).toEqual( [ [ 'view-switch-list', 'page' ], [ 'view-switch-grid', null ] ] );
} );

test( 'Mine is offered by the data and selected when the data says it is the filter', async () => {
	const data = DATA( { filterBar: FILTER_BAR( { types: { options: FILTER_BAR().types.options, value: 'mine' } } ), query: { mode: 'list', 'attachment-filter': 'mine' } } );
	const { wrapper } = await mountMedia( data );
	const select = wrapper.find( '#attachment-filter' );
	expect( select.findAll( 'option' ).map( ( option ) => option.attributes( 'value' ) ) ).toEqual( [ '', 'post_mime_type:image', 'detached', 'mine' ] );
	expect( select.element.value ).toBe( 'mine' );
	expect( select.find( 'option[value="mine"]' ).text() ).toBe( 'Mine' );
} );

test( 'the part alone: no months field and no Empty Trash without them in the data; Empty Trash emits empty-trash', async () => {
	const bar = mountPart( FilterBar, { props: { filterBar: FILTER_BAR( { months: null, emptyTrash: null } ) } } );
	expect( bar.find( '#filter-by-date' ).exists() ).toBe( false );
	expect( bar.find( '#delete_all' ).exists() ).toBe( false );
	const emptied = jest.fn();
	const trash = mountPart( FilterBar, { props: { filterBar: FILTER_BAR( { emptyTrash: { label: 'Empty Trash' } } ), onEmptyTrash: emptied } } );
	expect( trash.find( '#delete_all' ).element.value ).toBe( 'Empty Trash' );
	expect( emptied ).not.toHaveBeenCalled();
	await trash.find( '#delete_all' ).trigger( 'click' );
	expect( emptied ).toHaveBeenCalledTimes( 1 );
} );

test( 'a list with rows still builds the same query (the rows add no field of their own to it)', async () => {
	const { wrapper, seen } = await mountMedia( DATA( { items: [ ROW( 7 ), ROW( 8 ), ROW( 9 ) ] } ) );
	for ( const id of [ 7, 8, 9 ] ) {
		wrapper.find( `#post-${ id } input[type="checkbox"]` ).element.click();
	}
	await wrapper.find( '#media-search-input' ).setValue( 'x' );
	await submit( wrapper );
	expect( seen.navigated ).toEqual( [ '/wp-admin/upload.php?mode=list&attachment-filter=&m=0&s=x&paged=1' ] );
} );
