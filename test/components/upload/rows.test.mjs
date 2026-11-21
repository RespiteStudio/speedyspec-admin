/** @jest-environment jsdom */
// The cells of a Media list row (upload/rows.js), through the real page: the row actions and the
// links they make. Download file is on WordPress's origin, so it opens in a new tab (the
// `download` attribute is ignored across origins) and never replaces the admin.
import { afterEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { DATA, FILE, ROW, mountMedia } from './data.mjs';

afterEach( () => resetContracts() );

const link = ( wrapper, id, action ) => wrapper.find( `#post-${ id } .row-actions .${ action } a` );

test( 'Download file links to the file in a new tab, with rel noopener and the download attribute', async () => {
	const { wrapper } = await mountMedia();
	const download = link( wrapper, 7, 'download' );
	expect( download.text() ).toBe( 'Download file' );
	expect( download.attributes( 'href' ) ).toBe( FILE( 7 ) );
	expect( download.attributes( 'target' ) ).toBe( '_blank' );
	expect( download.attributes( 'rel' ) ).toBe( 'noopener' );
	expect( download.attributes( 'download' ) ).toBeDefined();
	expect( download.attributes( 'aria-label' ) ).toBe( 'Download “File 7”' );
} );

test( 'each row\'s Download file points at its own file', async () => {
	const { wrapper } = await mountMedia();
	expect( [ 7, 8 ].map( ( id ) => link( wrapper, id, 'download' ).attributes( 'href' ) ) ).toEqual( [ FILE( 7 ), FILE( 8 ) ] );
} );

test( 'a Download file whose address is not http(s) is no link to follow', async () => {
	const row = ROW( 7 );
	row.actions = row.actions.map( ( action ) => ( action.action === 'download' ? { ...action, url: 'javascript:alert(1)' } : action ) );
	const { wrapper } = await mountMedia( DATA( { items: [ row ] } ) );
	expect( link( wrapper, 7, 'download' ).attributes( 'href' ) ).toBe( '#' );
} );

test( 'Edit is a link to the attachment editor, in the row actions and on the title; View opens a new tab', async () => {
	const { wrapper } = await mountMedia();
	expect( link( wrapper, 7, 'edit' ).attributes( 'href' ) ).toBe( '/wp-admin/post.php?post=7&action=edit' );
	expect( link( wrapper, 7, 'edit' ).attributes( 'target' ) ).toBeUndefined();
	expect( wrapper.find( '#post-7 .column-title strong a' ).attributes( 'href' ) ).toBe( '/wp-admin/post.php?post=7&action=edit' );
	const view = link( wrapper, 7, 'view' );
	expect( view.attributes( 'target' ) ).toBe( '_blank' );
	expect( view.attributes( 'rel' ) ).toBe( 'bookmark' );
} );

test( 'the row actions come in the order the data gives them, separated as classic separates them', async () => {
	const { wrapper } = await mountMedia();
	expect( wrapper.findAll( '#post-7 .row-actions > span' ).map( ( span ) => span.classes() ) ).toEqual( [ [ 'edit' ], [ 'delete' ], [ 'view' ], [ 'copy' ], [ 'download' ] ] );
	expect( wrapper.find( '#post-7 .row-actions' ).text().replace( /\s+/g, ' ' ) ).toBe( 'Edit | Delete Permanently | View | Copy URLCopied! | Download file' );
} );
