/** @jest-environment jsdom */
// The cells of a Comments list row (edit-comments/rows.js): what each shows, and what a click or a
// double-click on it asks of the page.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import RowCell, { inlineAction, isRequest, shownActions } from '../../../site/components/core/edit-comments/rows.js';
import { commentsData, loadContracts, mountComments, row, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

// wrapper.text() trims each root node of a fragment: the whole text is read from the document.
const flat = () => document.body.textContent.replace( /\s+/g, ' ' ).trim();

/** jsdom cannot navigate: a click on a link is stopped at the document, after noting whether the part had stopped it. */
function noteClicks() {
	const seen = [];
	const listener = ( event ) => {
		seen.push( event.defaultPrevented );
		event.preventDefault();
	};
	document.addEventListener( 'click', listener );
	return { seen, stop: () => document.removeEventListener( 'click', listener ) };
}

const COLUMN = ( key ) => ( { key, label: key, core: true } );

function cell( key, item = row( 8 ), props = {} ) {
	const calls = { act: [], toggle: [], html: [], buttons: [] };
	const wrapper = mountPart( RowCell, {
		props: {
			item, column: COLUMN( key ), ...props,
			onAct: ( ...args ) => calls.act.push( args ),
			onToggle: ( ...args ) => calls.toggle.push( args ),
			onActionsHtml: ( ...args ) => calls.html.push( args ),
			buttonRef: ( id, action, element ) => calls.buttons.push( [ id, action, element ] ),
		},
	} );
	return { wrapper, calls };
}

test( 'a double-click on the comment\'s text asks the page to toggle that row', async () => {
	const item = row( 8, { content: 'Double me' } );
	const { wrapper, calls } = cell( 'comment', item );
	await wrapper.find( 'p' ).trigger( 'dblclick' );
	expect( calls.toggle ).toHaveLength( 1 );
	expect( calls.toggle[ 0 ][ 0 ] ).toBe( item );
	expect( wrapper.text() ).toContain( 'Double me' );
} );

test( 'a double-click elsewhere in the cell does not toggle', async () => {
	const { wrapper, calls } = cell( 'comment' );
	await wrapper.find( '.row-actions' ).trigger( 'dblclick' );
	await wrapper.find( '.comment-author' ).trigger( 'dblclick' );
	expect( calls.toggle ).toEqual( [] );
} );

test( 'a row action that calls a route emits act with its row and action, and its click is not followed', async () => {
	const item = row( 8 );
	const { wrapper, calls } = cell( 'comment', item );
	const link = wrapper.find( '.row-actions .spam a' );
	expect( link.attributes( 'role' ) ).toBe( 'button' );
	expect( link.attributes( 'aria-label' ) ).toBe( 'Mark this comment as spam' );
	const click = new MouseEvent( 'click', { bubbles: true, cancelable: true } );
	link.element.dispatchEvent( click );
	expect( click.defaultPrevented ).toBe( true );
	expect( calls.act ).toHaveLength( 1 );
	expect( calls.act[ 0 ][ 0 ] ).toBe( item );
	expect( calls.act[ 0 ][ 1 ].action ).toBe( 'spam' );
} );

test( 'Edit is a plain link to its address, with no role and no act', async () => {
	const { wrapper, calls } = cell( 'comment' );
	const edit = wrapper.find( '.row-actions .edit a' );
	expect( edit.attributes( 'href' ) ).toContain( 'comment.php?action=editcomment&c=8' );
	expect( edit.attributes( 'role' ) ).toBeUndefined();
	const clicks = noteClicks();
	edit.element.dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true } ) );
	clicks.stop();
	expect( clicks.seen ).toEqual( [ false ] );
	expect( calls.act ).toEqual( [] );
} );

test( 'Reply and Quick Edit are buttons that report themselves to the page and show whether their form is open', async () => {
	const item = row( 8 );
	const { wrapper, calls } = cell( 'comment', item, { expanded: 'replyto' } );
	const reply = wrapper.find( 'button[data-action="replyto"]' );
	const quick = wrapper.find( 'button[data-action="edit"]' );
	expect( reply.attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( quick.attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( [ reply.attributes( 'data-comment-id' ), reply.attributes( 'data-post-id' ) ] ).toEqual( [ '8', '40' ] );
	expect( calls.buttons.map( ( [ id, action, element ] ) => [ id, action, element ] ) ).toEqual( [ [ 8, 'reply', reply.element ], [ 8, 'quickedit', quick.element ] ] );
	await quick.trigger( 'click' );
	expect( calls.act.map( ( args ) => args[ 1 ].action ) ).toEqual( [ 'quickedit' ] );
} );

test( 'the plugins\' row actions HTML is shown as it is, and a click in it is reported', async () => {
	const item = row( 8, { actionsHtml: '<span class="approve"><a href="comment.php?action=approvecomment&amp;c=8">Approve</a></span> | <span class="mine"><a href="#">Mine</a></span>' } );
	const { wrapper, calls } = cell( 'comment', item );
	expect( wrapper.find( '.row-actions .mine a' ).text() ).toBe( 'Mine' );
	const clicks = noteClicks();
	await wrapper.find( '.row-actions .approve a' ).trigger( 'click' );
	clicks.stop();
	expect( calls.html ).toHaveLength( 1 );
	expect( calls.html[ 0 ][ 0 ] ).toBe( item );
	expect( calls.act ).toEqual( [] );
} );

test( 'the row actions show only when WordPress made them visible (the excerpt view)', () => {
	expect( cell( 'comment', row( 8 ) ).wrapper.find( '.row-actions' ).classes() ).not.toContain( 'visible' );
	expect( cell( 'comment', { ...row( 8 ), actionsVisible: true } ).wrapper.find( '.row-actions' ).classes() ).toContain( 'visible' );
} );

test( 'the Quick Edit source is the row\'s inline data', () => {
	const { wrapper } = cell( 'comment', row( 8, { content: 'Source words', author: 'Source Author' } ) );
	const source = wrapper.find( '#inline-8' );
	expect( source.classes() ).toContain( 'hidden' );
	expect( source.find( 'textarea.comment' ).element.value ).toBe( 'Source words' );
	expect( source.find( '.author' ).text() ).toBe( 'Source Author' );
	expect( source.find( '.author-email' ).text() ).toBe( 'pat8@example.org' );
	expect( source.find( '.comment_status' ).text() ).toBe( '1' );
} );

test( 'the author cell: name, site, email as mailto and the IP as the link that filters the list', () => {
	const { wrapper } = cell( 'author' );
	expect( wrapper.find( 'strong' ).text() ).toBe( 'Pat 8' );
	expect( wrapper.find( 'a[rel]' ).attributes( 'href' ) ).toBe( 'https://pat.example.org/' );
	expect( wrapper.find( 'a[href^="mailto:"]' ).attributes( 'href' ) ).toBe( 'mailto:pat8@example.org' );
	const ip = wrapper.findAll( 'a' ).find( ( link ) => link.text() === '1.2.3.8' );
	expect( ip.attributes( 'href' ) ).toContain( 'edit-comments.php?s=1.2.3.8&mode=detail' );
} );

test( 'a comment someone may not see the details of shows no email and no IP', () => {
	const item = row( 8 );
	item.author = { ...item.author, email: '', ip: '', ipUrl: null };
	const { wrapper } = cell( 'author', item );
	expect( wrapper.find( 'a[href^="mailto:"]' ).exists() ).toBe( false );
	expect( wrapper.text() ).not.toContain( '1.2.3.8' );
} );

test( 'the response cell: the post, its View Post link and the bubble', () => {
	const { wrapper } = cell( 'response' );
	expect( wrapper.find( '.comments-edit-item-link' ).text() ).toBe( 'Post' );
	expect( wrapper.find( '.comments-view-item-link' ).text() ).toBe( 'View Post' );
	expect( wrapper.find( '.comments-view-item-link' ).attributes( 'href' ) ).toBe( 'https://example.org/p/' );
	expect( wrapper.find( '.post-com-count-wrapper' ).classes() ).toContain( 'post-com-count-40' );
} );

test( 'the date cell links to the comment on the site', () => {
	const { wrapper } = cell( 'date' );
	expect( wrapper.find( '.submitted-on a' ).text() ).toBe( '2026/11/19 at 9:00 am' );
	expect( wrapper.find( '.submitted-on a' ).attributes( 'href' ) ).toBe( 'https://example.org/p/#comment-8' );
} );

test( 'a reply names its parent', () => {
	const item = { ...row( 8 ), parent: { name: 'Parent Name', url: 'https://example.org/p/#comment-3' } };
	const { wrapper } = cell( 'comment', item );
	expect( flat() ).toContain( 'In reply to Parent Name.' );
	expect( wrapper.find( 'a[href="https://example.org/p/#comment-3"]' ).text() ).toBe( 'Parent Name' );
} );

test( 'a comment\'s HTML runs nothing: markup in the text is inert', () => {
	const { wrapper } = cell( 'comment', row( 8, { content: '<img src="x" onerror="window.__ran = 1"><script>window.__ran = 2</script>text' } ) );
	expect( window.__ran ).toBeUndefined();
	expect( wrapper.find( 'script' ).exists() ).toBe( false );
} );

test( 'the pure helpers: a request needs a route and POST or DELETE; only quickedit and reply open a form; an action needs a route or an address', () => {
	expect( isRequest( { method: 'POST', route: 'wp-admin/v1/comments/1' } ) ).toBe( true );
	expect( isRequest( { method: 'DELETE', route: 'wp-admin/v1/comments/1' } ) ).toBe( true );
	expect( isRequest( { method: 'GET', route: 'wp-admin/v1/comments/1' } ) ).toBe( false );
	expect( isRequest( { method: 'POST', route: '' } ) ).toBe( false );
	expect( isRequest( null ) ).toBe( false );
	expect( inlineAction( { action: 'quickedit' } ) ).toBe( 'edit' );
	expect( inlineAction( { action: 'reply' } ) ).toBe( 'replyto' );
	expect( inlineAction( { action: 'approve' } ) ).toBeNull();
	expect( shownActions( [ { action: 'a', request: null, url: '' }, { action: 'b', request: null, url: 'x.php' }, null ] ).map( ( action ) => action.action ) ).toEqual( [ 'b' ] );
} );

// In the page ---------------------------------------------------------------------------------

test( 'in the page, a double-click on a comment\'s text opens Quick Edit with its fields', async () => {
	const wrapper = await mountComments();
	await wrapper.find( '#comment-8 .wp-admin-inert-html' ).trigger( 'dblclick' );
	await settle( 3 );
	expect( wrapper.find( '#editlegend' ).text() ).toBe( 'Edit Comment' );
	expect( wrapper.find( '#replyrow' ).element.previousElementSibling.id ).toBe( 'comment-8' );
	expect( wrapper.find( '#author-name' ).element.value ).toBe( 'Pat 8' );
	expect( wrapper.find( '#comment-8' ).classes() ).toContain( 'hidden' );
	expect( api.calls ).toEqual( [] );
} );

test( 'in the page, a double-click while another form holds changes asks before discarding them', async () => {
	const asked = [];
	const wrapper = await mountComments( commentsData(), { confirm: ( message ) => {
		asked.push( message );
		return false;
	} } );
	await wrapper.find( '#comment-8 button[data-action="replyto"]' ).trigger( 'click' );
	await settle( 3 );
	await wrapper.find( '#comment-9 .wp-admin-inert-html' ).trigger( 'dblclick' );
	await settle( 3 );
	expect( asked ).toEqual( [ 'Are you sure you want to edit this comment?\nThe changes you made will be lost.' ] );
	// Declined: the Reply form stays.
	expect( wrapper.find( '#replyhead' ).exists() ).toBe( true );
	expect( wrapper.find( '#editlegend' ).exists() ).toBe( false );
} );
