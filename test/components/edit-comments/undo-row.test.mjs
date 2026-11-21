/** @jest-environment jsdom */
// The undo row of a comment moved to the Trash or marked as spam: the part, then in the page, where
// Undo posts the request WordPress gave and a failure leaves the row in place.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import UndoRow from '../../../site/components/core/edit-comments/undo-row.js';
import { answer, commentsData, loadContracts, mountComments, row, settle, undoNotice } from './data.mjs';

const flat = ( found ) => found.text().replace( /\s+/g, ' ' );

function undoRow( undo, onUndo = () => {} ) {
	const table = document.createElement( 'table' );
	const body = document.createElement( 'tbody' );
	table.appendChild( body );
	document.body.appendChild( table );
	return mountPart( UndoRow, { props: { id: 8, undo, colspan: 4, onUndo }, attachTo: body } );
}

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

test( 'the Trash notice: the row has the classes and the message WordPress gives, with the author in bold', () => {
	const wrapper = undoRow( { ...undoNotice( 8, 'trash', 'Pat 8' ), avatar: 'https://example.org/a.png' } );
	const tr = wrapper.find( 'tr#undo-8' );
	expect( tr.classes() ).toEqual( [ 'undo', 'untrash' ] );
	expect( wrapper.find( 'td' ).attributes( 'colspan' ) ).toBe( '4' );
	expect( wrapper.find( '.trash-undo-inside' ).exists() ).toBe( true );
	expect( wrapper.find( '.trash-undo-inside strong' ).text() ).toBe( 'Pat 8' );
	expect( flat( wrapper.find( '.trash-undo-inside' ) ) ).toBe( 'Comment by Pat 8 moved to the Trash. Undo' );
	expect( wrapper.find( 'img.avatar' ).attributes( 'src' ) ).toBe( 'https://example.org/a.png' );
} );

test( 'the spam notice has the spam classes and message', () => {
	const wrapper = undoRow( undoNotice( 8, 'spam', 'Pat 8' ) );
	expect( wrapper.find( 'tr#undo-8' ).classes() ).toEqual( [ 'undo', 'unspam' ] );
	expect( flat( wrapper.find( '.spam-undo-inside' ) ) ).toBe( 'Comment by Pat 8 marked as spam. Undo' );
} );

test( 'Undo is a button-role link that emits undo and is not followed', async () => {
	let undone = 0;
	const wrapper = undoRow( undoNotice( 8 ), () => undone++ );
	const link = wrapper.find( 'span.undo a' );
	expect( link.attributes( 'role' ) ).toBe( 'button' );
	expect( link.classes() ).toEqual( [ 'vim-z', 'vim-destructive', 'aria-button-if-js' ] );
	const click = new MouseEvent( 'click', { bubbles: true, cancelable: true } );
	link.element.dispatchEvent( click );
	expect( click.defaultPrevented ).toBe( true );
	expect( undone ).toBe( 1 );
} );

// In the page ---------------------------------------------------------------------------------

/** Trashes comment 8: the answer gives its undo notice. Returns the page. */
async function trashed( over = {} ) {
	api.respondWith( async () => answer( { id: 8, status: 'trash', undo: undoNotice( 8 ) } ) );
	const wrapper = await mountComments( commentsData(), over );
	await wrapper.find( '#comment-8 .row-actions .trash a' ).trigger( 'click' );
	await settle();
	api.reset();
	return wrapper;
}

test( 'Trash leaves the undo row in place of the comment', async () => {
	const wrapper = await trashed();
	expect( wrapper.find( '#comment-8' ).classes() ).toContain( 'hidden' );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( true );
	expect( wrapper.find( '#undo-8' ).text() ).toContain( 'Comment by Pat 8 moved to the Trash.' );
} );

test( 'Undo posts the request of the notice (with the list), and the comment comes back', async () => {
	const wrapper = await trashed();
	api.respondWith( async () => answer( { id: 8, status: 'approved', row: row( 8 ) } ) );
	await wrapper.find( '#undo-8 span.undo a' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'POST' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/8/status' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { status: 'untrash', screen: 'edit-comments', list: { comment_status: 'all' } } );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#comment-8' ).exists() ).toBe( true );
	expect( wrapper.find( '#comment-8' ).classes() ).not.toContain( 'hidden' );
} );

test( 'a second click while Undo is on its way sends nothing more', async () => {
	const wrapper = await trashed();
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( answer( { id: 8, row: row( 8 ) } ) );
	} ) );
	await wrapper.find( '#undo-8 span.undo a' ).trigger( 'click' );
	await wrapper.find( '#undo-8 span.undo a' ).trigger( 'click' );
	expect( api.calls ).toHaveLength( 1 );
	release();
	await settle();
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( false );
} );

test( 'a failing Undo keeps the undo row, the comment hidden, and says why', async () => {
	const warned = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	const spoken = [];
	const added = [];
	const wrapper = await trashed( { speak: ( message ) => spoken.push( message ), notices: { add: ( notice ) => added.push( notice ) } } );
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture failure.' ), { status: 500 } );
	} );
	await wrapper.find( '#undo-8 span.undo a' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( warned ).toHaveBeenCalledTimes( 1 );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( true );
	expect( wrapper.find( '#comment-8' ).classes() ).toContain( 'hidden' );
	expect( spoken ).toEqual( [ 'Fixture failure.' ] );
	expect( added ).toEqual( [ { type: 'error', message: 'Fixture failure.', dismissible: true, scope: 'page' } ] );

	// The notice's Undo can be tried again.
	api.respondWith( async () => answer( { id: 8, row: row( 8 ) } ) );
	await wrapper.find( '#undo-8 span.undo a' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 2 );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( false );
} );

afterEach( () => jest.restoreAllMocks() );
