/** @jest-environment jsdom */
// Recent Comments (core/dashboard-recent-comments): the views under the list. Each view is a link to the Comments
// list of its status with its count, and the counts follow a moderation's answer.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const STATUS = ( id, status ) => ( { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/status', body: { status } } );
const view = ( key, label, count, current = false ) => ( { key, label: label + ' (' + count + ')', format: label + ' <span class="count">(%s)</span>', countText: String( count ), countClass: key + '-count', count, url: 'edit-comments.php?comment_status=' + key, current } );
const VIEWS = [ view( 'all', 'All', 6 ), view( 'mine', 'Mine', 1 ), view( 'moderated', 'Pending', 2 ), view( 'approved', 'Approved', 4 ), view( 'spam', 'Spam', 3 ), view( 'trash', 'Trash', 0 ) ];
const ROW = {
	id: 7,
	postId: 3,
	status: 'unapproved',
	classes: [ 'comment', 'unapproved' ],
	type: 'comment',
	typeLabel: null,
	post: { title: 'Hello', url: 'http://example.org/hello/' },
	author: { name: 'Pat', url: null, rel: 'ugc', html: null },
	avatar: null,
	avatarHtml: null,
	excerpt: 'Pending words',
	actions: [ { action: 'approve', url: 'comment.php?action=approvecomment&c=7', hidden: false, separator: false, request: STATUS( 7, 'approve' ) } ],
	actionsHtml: null,
};

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const comments = async ( data ) => ( await mountWidget( 'recent-comments', { comments: [ ROW ], views: VIEWS, viewsHtml: null, ...data } ) ).wrapper;
const links = ( wrapper ) => wrapper.findAll( '.subsubsub li' ).map( ( item ) => [ item.classes().join( ' ' ), item.find( 'a' ).text(), item.find( 'a' ).attributes( 'href' ), item.find( 'a' ).classes().includes( 'current' ) ] );

test( 'each view is a link to the Comments list of its status, with its count', async () => {
	const wrapper = await comments();
	expect( links( wrapper ) ).toEqual( VIEWS.map( ( item ) => [
		item.key,
		item.label,
		expect.stringMatching( new RegExp( 'edit-comments\\.php\\?comment_status=' + item.key + '$' ) ),
		false,
	] ) );
	expect( wrapper.findAll( '.subsubsub .count' ).map( ( count ) => count.classes() ) ).toEqual( VIEWS.map( () => [ 'count' ] ) );
	expect( wrapper.find( 'h3.screen-reader-text' ).text() ).toBe( 'View more comments' );
} );

test( 'the view the data says is current is marked as the current page', async () => {
	const wrapper = await comments( { views: VIEWS.map( ( item ) => ( item.key === 'moderated' ? { ...item, current: true } : item ) ) } );
	const current = wrapper.findAll( '.subsubsub a.current' );
	expect( current ).toHaveLength( 1 );
	expect( current[ 0 ].attributes( 'aria-current' ) ).toBe( 'page' );
	expect( current[ 0 ].attributes( 'href' ) ).toMatch( /comment_status=moderated$/ );
} );

test( 'a moderation\'s answer switches the counts of the views to the answer\'s', async () => {
	const after = VIEWS.map( ( item ) => ( item.key === 'moderated' ? { ...item, label: 'Pending (1)', countText: '1', count: 1 } : item.key === 'approved' ? { ...item, label: 'Approved (5)', countText: '5', count: 5 } : item ) );
	api.respondWith( async () => ( { id: 7, postId: 3, status: 'approved', row: { ...ROW, status: 'approved', classes: [ 'comment', 'approved' ] }, undo: null, views: after, viewsHtml: null } ) );
	const wrapper = await comments();
	expect( wrapper.find( '.subsubsub .moderated .count' ).text() ).toBe( '(2)' );

	await wrapper.find( '#comment-7 .row-actions .approve button, #comment-7 .row-actions .approve a' ).trigger( 'click' );
	await settle();

	expect( wrapper.find( '.subsubsub .moderated .count' ).text() ).toBe( '(1)' );
	expect( wrapper.find( '.subsubsub .approved .count' ).text() ).toBe( '(5)' );
	expect( wrapper.find( '.subsubsub .all .count' ).text() ).toBe( '(6)' );
} );

test( 'views a plugin filtered show as the plugin printed them, separated as classic separates them', async () => {
	const wrapper = await comments( { views: [], viewsHtml: [ { key: 'all', html: '<a href="x" class="plugin-all">All</a>' }, { key: 'acme', html: '<a href="y">Acme</a>' } ] } );
	expect( wrapper.findAll( '.subsubsub li' ).map( ( item ) => item.classes()[ 0 ] ) ).toEqual( [ 'all', 'acme' ] );
	expect( wrapper.find( '.subsubsub .plugin-all' ).text() ).toBe( 'All' );
	expect( wrapper.find( '.subsubsub' ).text() ).toBe( 'All | Acme' );
} );

test( 'with no comments there is the classic sentence and no views', async () => {
	const wrapper = await comments( { comments: [] } );
	expect( wrapper.text() ).toBe( 'No comments to show.' );
	expect( wrapper.find( '.subsubsub' ).exists() ).toBe( false );
} );
