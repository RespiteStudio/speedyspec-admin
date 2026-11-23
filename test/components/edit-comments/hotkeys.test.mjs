/** @jest-environment jsdom */
// The Comments list's keyboard shortcuts, in the page: real key events (keydown, keypress and
// keyup, as a browser fires them for a key) on the document, which the page listens to as
// jquery.table-hotkeys.js does (its `keypress` type). The decisions themselves (hotkeyCommand and
// the others) are pure and are tested with the page in test/edit-comments.test.mjs.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { answer, commentsData, loadContracts, mountComments, pagination, row, settle, undoNotice } from './data.mjs';

const ON = { enabled: true, highlightFirst: false, highlightLast: false };

/** A key press as a browser fires it: keydown, keypress (a printable key), keyup. */
function press( key, { shift = false, ctrl = false, target = document.body } = {} ) {
	const init = { key, shiftKey: shift, ctrlKey: ctrl, bubbles: true, cancelable: true };
	const events = [ 'keydown', 'keypress', 'keyup' ].map( ( type ) => new KeyboardEvent( type, init ) );
	for ( const event of events ) {
		target.dispatchEvent( event );
	}
	return events[ 1 ];
}

const current = ( wrapper ) => wrapper.findAll( '#the-comment-list tr.vim-current' ).map( ( tr ) => tr.attributes( 'id' ) );
const page = ( over = {}, provide = {} ) => mountComments( commentsData( { hotkeys: ON, ...over } ), { hotkeysTarget: document, ...provide } );

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

test( 'j and k move the current row; the first press picks the first row', async () => {
	const wrapper = await page();
	expect( current( wrapper ) ).toEqual( [] );
	const event = press( 'j' );
	await settle( 2 );
	expect( event.defaultPrevented ).toBe( true );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
	press( 'j' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-8' ] );
	press( 'j' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-9' ] );
	press( 'k' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-8' ] );
} );

test( 'the list starts on its first row when WordPress says so (the previous page\'s j)', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
} );

test( 'j on the last row and k on the first open the next and the previous page', async () => {
	const navigated = [];
	const links = { first: null, prev: 'edit-comments.php?comment_status=all&paged=1', next: 'edit-comments.php?comment_status=all&paged=3&hotkeys_highlight_last=1', last: null };
	const wrapper = await page( { pagination: pagination( 9, { page: 2, pages: 3, perPage: 3, links } ) }, { router: { navigate: async ( url ) => navigated.push( url ), follow: async () => true, refresh: async () => {} } } );
	press( 'k' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
	press( 'k' );
	await settle( 2 );
	expect( navigated ).toEqual( [ '/wp-admin/edit-comments.php?comment_status=all&paged=1&hotkeys_highlight_last=1' ] );
	press( 'j' );
	press( 'j' );
	press( 'j' );
	await settle( 2 );
	expect( navigated.at( -1 ) ).toBe( '/wp-admin/edit-comments.php?comment_status=all&paged=3&hotkeys_highlight_first=1' );
} );

test( 'a approves the current pending row: the status request is sent and the row is dimmed back', async () => {
	api.respondWith( async () => answer( { id: 7, status: 'approved', row: row( 7 ) } ) );
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	expect( wrapper.find( '#comment-7' ).classes() ).toContain( 'unapproved' );
	press( 'a' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/7/status' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { status: 'approve', screen: 'edit-comments' } );
	expect( wrapper.find( '#comment-7' ).classes() ).not.toContain( 'unapproved' );
} );

test( 's marks the current row as spam and moves on to the next row; its undo row shows', async () => {
	api.respondWith( async () => answer( { id: 8, status: 'spam', undo: undoNotice( 8, 'spam' ) } ) );
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'j' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-8' ] );
	press( 's' );
	await settle();
	expect( api.calls.map( ( call ) => [ call.route, call.payload.status ] ) ).toEqual( [ [ 'wp-admin/v1/comments/8/status', 'spam' ] ] );
	expect( wrapper.find( '#comment-8' ).classes() ).toContain( 'hidden' );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( true );
	// A destructive action moves on: to the next row.
	expect( current( wrapper ) ).toEqual( [ 'comment-9' ] );
} );

// jquery.table-hotkeys.js cycles through `#the-comment-list tr`: the undo row is a row of the cycle
// (its Undo link carries `vim-z`), so k or j selects it and z undoes. Verified against the classic
// screen: after d the current row is the next one, and z does nothing until k selects the undo row.
test( 'after a row is moved, k selects its undo row and z undoes it', async () => {
	api.respondWith( async () => answer( { id: 8, status: 'trash', undo: undoNotice( 8 ) } ) );
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'j' );
	await settle( 2 );
	press( 'd' );
	await settle();
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( true );
	expect( current( wrapper ) ).toEqual( [ 'comment-9' ] );

	// z on the next row does nothing: it has no Not Spam or Restore.
	press( 'z' );
	await settle( 2 );
	expect( api.calls ).toHaveLength( 1 );

	press( 'k' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'undo-8' ] );
	expect( wrapper.find( '#undo-8' ).classes() ).toContain( 'vim-current' );
	api.respondWith( async () => answer( { id: 8, status: 'approved', row: row( 8 ) } ) );
	press( 'z' );
	await settle();
	expect( api.calls ).toHaveLength( 2 );
	expect( api.calls[ 1 ].route ).toBe( 'wp-admin/v1/comments/8/status' );
	expect( api.calls[ 1 ].payload ).toMatchObject( { status: 'untrash' } );
	expect( wrapper.find( '#undo-8' ).exists() ).toBe( false );
	expect( wrapper.find( '#comment-8' ).classes() ).not.toContain( 'hidden' );
	// The current row moved on, as for any destructive key.
	expect( current( wrapper ) ).toHaveLength( 1 );
	expect( current( wrapper )[ 0 ] ).not.toBe( 'undo-8' );
} );

test( 'j reaches the undo row from the row before it, and other keys on it do nothing', async () => {
	api.respondWith( async () => answer( { id: 8, status: 'spam', undo: undoNotice( 8, 'spam' ) } ) );
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'j' );
	await settle( 2 );
	press( 's' );
	await settle();
	// The first row, then the undo row between it and the next one.
	press( 'k' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'undo-8' ] );
	press( 'k' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
	press( 'j' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'undo-8' ] );
	const calls = api.calls.length;
	for ( const key of [ 'a', 'u', 's', 'd', 'r', 'q', 'x', 'e' ] ) {
		press( key );
	}
	await settle( 2 );
	expect( api.calls ).toHaveLength( calls );
	press( 'j' );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-9' ] );
} );

test( 'z restores the current row in the Trash view (and Not Spam in Spam)', async () => {
	const rows = [ row( 7, { status: 'trash' } ), row( 8, { status: 'trash' } ) ];
	api.respondWith( async () => answer( { id: 7, status: 'approved', undo: null } ) );
	const wrapper = await page( { query: { comment_status: 'trash', mode: 'list' }, items: rows, hotkeys: { ...ON, highlightFirst: true }, bulkActions: [] } );
	press( 'z' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/7/status' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { status: 'untrash', list: { comment_status: 'trash' } } );
	// No undo row in the Trash view: the restored row leaves the list, as classic removes it.
	expect( wrapper.find( '#comment-7' ).exists() ).toBe( false );
} );

test( 'x checks the current row; Shift+X checks every row', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	const checked = () => wrapper.findAll( '#the-comment-list input[type="checkbox"]' ).filter( ( box ) => box.element.checked ).map( ( box ) => box.element.value );
	press( 'x' );
	await settle( 2 );
	expect( checked() ).toEqual( [ '7' ] );
	press( 'x' );
	await settle( 2 );
	expect( checked() ).toEqual( [] );
	press( 'X', { shift: true } );
	await settle( 2 );
	expect( checked() ).toEqual( [ '7', '8', '9' ] );
} );

test( 'Shift+A applies the Approve bulk action to the checked rows', async () => {
	api.respondWith( async () => ( { redirect: 'edit-comments.php?approved=2' } ) );
	await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'X', { shift: true } );
	await settle( 2 );
	press( 'A', { shift: true } );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/bulk' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { action: 'approve', ids: [ 7, 8, 9 ] } );
} );

test( 'q opens Quick Edit and r opens Reply on the current row', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'q' );
	await settle( 3 );
	expect( wrapper.find( '#editlegend' ).exists() ).toBe( true );
	expect( wrapper.find( '#replyrow' ).element.previousElementSibling.id ).toBe( 'comment-7' );

	await wrapper.find( '#replyrow button.cancel' ).trigger( 'click' );
	await settle( 3 );
	expect( wrapper.find( '#editlegend' ).exists() ).toBe( false );
	expect( wrapper.find( '#replyhead' ).exists() ).toBe( false );
	press( 'r' );
	await settle( 3 );
	expect( wrapper.find( '#replyhead' ).text() ).toBe( 'Reply to Comment' );
	expect( wrapper.find( '#editlegend' ).exists() ).toBe( false );
	expect( wrapper.find( '#replyrow' ).element.previousElementSibling.id ).toBe( 'comment-7' );
} );

test( 'e opens the current row\'s Edit page through the router', async () => {
	const navigated = [];
	await page( { hotkeys: { ...ON, highlightFirst: true } }, { router: { navigate: async ( url ) => navigated.push( url ), follow: async () => true, refresh: async () => {} } } );
	press( 'e' );
	await settle( 2 );
	expect( navigated ).toEqual( [ '/wp-admin/comment.php?action=editcomment&c=7' ] );
} );

test( 'keys typed in a field do nothing; with Ctrl they do nothing', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	press( 'j', { target: wrapper.find( '#comment-search-input' ).element } );
	press( 'j', { ctrl: true } );
	await settle( 2 );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'a key typed in the reply editor is text, not a shortcut', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	await wrapper.find( '#comment-8 button[data-action="replyto"]' ).trigger( 'click' );
	await settle( 3 );
	const event = press( 'j', { target: wrapper.find( '#replycontent' ).element } );
	expect( event.defaultPrevented ).toBe( false );
	expect( current( wrapper ) ).toEqual( [ 'comment-7' ] );
} );

test( 'without the user option there is no listener at all', async () => {
	const wrapper = await page( { hotkeys: { enabled: false, highlightFirst: false, highlightLast: false } } );
	const event = press( 'j' );
	press( 'a' );
	await settle( 2 );
	expect( event.defaultPrevented ).toBe( false );
	expect( current( wrapper ) ).toEqual( [] );
	expect( api.calls ).toEqual( [] );
} );

test( 'the listener goes with the page', async () => {
	const wrapper = await page( { hotkeys: { ...ON, highlightFirst: true } } );
	wrapper.unmount();
	const event = press( 'a' );
	await settle( 2 );
	expect( event.defaultPrevented ).toBe( false );
	expect( api.calls ).toEqual( [] );
} );
