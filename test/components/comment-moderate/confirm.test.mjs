/** @jest-environment jsdom */
// The moderation confirmation page (comment.php?action=approve|trash|spam|delete), driven with
// real events: the Confirm button sends the request WordPress gives and follows the answer, Cancel
// is a link that sends nothing, and a failure is shown and focused.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import * as api from '../../helpers/api-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { hostRecorder, UNREACHABLE } from '../../helpers/host.mjs';

const TEXTS = {
	approve: [ 'You are about to approve the following comment:', 'Approve comment' ],
	trash: [ 'You are about to move the following comment to the Trash:', 'Move to Trash' ],
	spam: [ 'You are about to mark the following comment as spam:', 'Mark as spam' ],
	delete: [ 'You are about to delete the following comment:', 'Permanently delete comment' ],
};
// What _wp_admin_comment_request() gives (wp-includes/admin/comment-moderation.php) with screen set by the page's data.
const CONFIRM = ( action ) => ( action === 'delete'
	? { method: 'DELETE', route: 'wp-admin/v1/comments/5', body: { screen: 'comment-moderate' } }
	: { method: 'POST', route: 'wp-admin/v1/comments/5/status', body: { status: action, screen: 'comment-moderate' } } );
const DATA = ( action = 'trash', extra = {} ) => ( {
	screen: 'comment',
	action,
	error: null,
	statusNotice: { markup: 'This comment is currently approved.' },
	caution: TEXTS[ action ][ 0 ],
	button: TEXTS[ action ][ 1 ],
	comment: { id: 5, author: 'Pat', email: 'pat@example.org', url: 'https://pat.example/', contentHtml: '<p>Hi</p>', date: { text: '2024/03/07 at 9:05 am', url: null } },
	response: { title: 'The post', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/' },
	parent: null,
	editUrl: 'comment.php?action=editcomment&c=5',
	cancelUrl: 'edit-comments.php',
	confirm: CONFIRM( action ),
	...extra,
} );
const ANSWER = ( extra = {} ) => ( { id: 5, postId: 40, status: 'trash', changed: true, redirect: 'edit-comments.php?trashed=1&ids=5', location: null, ...extra } );

let record;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'comment-moderate' ] );
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	record = hostRecorder();
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.innerHTML = '';
	document.body.className = '';
} );

async function openPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/comment-moderate', data, page: { path: 'comment.php?action=' + data.action + '&c=5', title: 'Moderate Comment' } } ) }, { provide: {
		...record.host(),
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '' },
	} } );
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
	expect( wrapper.find( 'table.comment-ays' ).exists() ).toBe( true );
	return wrapper;
}

const confirm = ( wrapper ) => wrapper.find( '#submit' );

test.each( [
	[ 'approve', 'You are about to approve the following comment:', 'Approve comment' ],
	[ 'trash', 'You are about to move the following comment to the Trash:', 'Move to Trash' ],
	[ 'spam', 'You are about to mark the following comment as spam:', 'Mark as spam' ],
	[ 'delete', 'You are about to delete the following comment:', 'Permanently delete comment' ],
] )( '%s: the caution and the button are WordPress\'s, and nothing is sent on opening', async ( action, caution, button ) => {
	const wrapper = await openPage( DATA( action ) );
	expect( wrapper.find( '.notice-warning' ).text().replace( /\s+/g, ' ' ) ).toBe( 'Caution: ' + caution );
	expect( confirm( wrapper ).element.value ).toBe( button );
	expect( api.calls ).toEqual( [] );
	expect( document.body.classList.contains( 'comment-php' ) ).toBe( true );
} );

test.each( [ 'approve', 'trash', 'spam' ] )( 'Confirm on %s posts the data\'s status request and follows its answer', async ( action ) => {
	api.respondWith( async () => ANSWER( { status: action } ) );
	const wrapper = await openPage( DATA( action ) );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	await flushPromises();
	expect( api.calls.map( ( call ) => [ call.method, call.route, call.payload ] ) ).toEqual( [ [ 'POST', 'wp-admin/v1/comments/5/status', { status: action, screen: 'comment-moderate' } ] ] );
	expect( record.followed ).toEqual( [ ANSWER( { status: action } ) ] );
} );

test( 'Confirm on delete sends a DELETE, its fields in the query, and follows the answer', async () => {
	api.respondWith( async () => ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) );
	const wrapper = await openPage( DATA( 'delete' ) );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	await flushPromises();
	expect( api.calls.map( ( call ) => [ call.method, call.route ] ) ).toEqual( [ [ 'DELETE', 'wp-admin/v1/comments/5?screen=comment-moderate' ] ] );
	expect( record.followed ).toEqual( [ ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) ] );
} );

test( 'Cancel is a link to the Comments list, and clicking it sends nothing', async () => {
	const wrapper = await openPage( DATA( 'trash' ) );
	const cancel = wrapper.find( '.comment-ays-submit .button-cancel' );
	expect( cancel.text() ).toBe( 'Cancel' );
	expect( cancel.attributes( 'href' ) ).toBe( '/wp-admin/edit-comments.php' );
	expect( cancel.element.tagName ).toBe( 'A' );
	// jsdom cannot navigate: stop the link's own default, and record that the click reached it.
	let clicked = 0;
	cancel.element.addEventListener( 'click', ( event ) => {
		clicked++;
		event.preventDefault();
	} );
	await cancel.trigger( 'click' );
	expect( clicked ).toBe( 1 );
	await flushPromises();
	expect( api.calls ).toEqual( [] );
	expect( record.followed ).toEqual( [] );
	expect( confirm( wrapper ).element.disabled ).toBe( false );
} );

test( 'the Edit link of the comment goes to Edit Comment', async () => {
	const wrapper = await openPage( DATA( 'trash' ) );
	expect( wrapper.find( 'p.edit-comment a' ).attributes( 'href' ) ).toBe( '/wp-admin/comment.php?action=editcomment&c=5' );
} );

test( 'a refused confirmation shows WordPress\'s message in a notice, says it and focuses it; the button works again', async () => {
	const message = 'Sorry, you are not allowed to edit comments on this post.';
	api.respondWith( async () => {
		throw Object.assign( new Error( message ), { status: 403, code: 'rest_forbidden' } );
	} );
	const wrapper = await openPage( DATA( 'trash' ) );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	await flushPromises();
	expect( record.added.map( ( notice ) => [ notice.type, notice.message, notice.scope ] ) ).toEqual( [ [ 'error', message, 'page' ] ] );
	expect( record.spoken ).toEqual( [ message ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
	expect( record.followed ).toEqual( [] );
	expect( confirm( wrapper ).element.disabled ).toBe( false );

	// The retry, once WordPress answers.
	api.respondWith( async () => ANSWER() );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	await flushPromises();
	expect( record.followed ).toHaveLength( 1 );
} );

test( 'a confirmation that cannot reach WordPress says so, and focuses the notice', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } );
	} );
	const wrapper = await openPage( DATA( 'spam' ) );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	await flushPromises();
	expect( record.added.map( ( notice ) => notice.message ) ).toEqual( [ UNREACHABLE ] );
	expect( record.spoken ).toEqual( [ UNREACHABLE ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
} );

test( 'one request at a time: a second submit while the first is open sends nothing', async () => {
	let finish;
	api.respondWith( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await openPage( DATA( 'trash' ) );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	expect( confirm( wrapper ).element.disabled ).toBe( true );
	await wrapper.find( 'form.comment-ays-submit' ).trigger( 'submit' );
	expect( api.calls ).toHaveLength( 1 );
	finish( ANSWER() );
	await flushPromises();
	expect( record.followed ).toHaveLength( 1 );
	expect( confirm( wrapper ).element.disabled ).toBe( false );
} );

test( 'without WordPress\'s caution and button text, neither is shown, and Cancel still is', async () => {
	const wrapper = await openPage( DATA( 'trash', { caution: null, button: null } ) );
	expect( wrapper.find( '.notice-warning' ).exists() ).toBe( false );
	expect( wrapper.find( '#submit' ).exists() ).toBe( false );
	expect( wrapper.find( '.button-cancel' ).exists() ).toBe( true );
} );
