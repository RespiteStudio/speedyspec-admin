/** @jest-environment jsdom */
// The Comments list on a site without a Trash (`EMPTY_TRASH_DAYS` 0; the throwaway e2e project
// drives the same page). WordPress then describes a `delete` row action, whose request is
// `DELETE wp-admin/v1/comments/<id>`, a `delete` bulk action and no Trash view. The page shows
// what the data gives: it decides nothing about the Trash itself.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const STATUS = ( id, status ) => ( { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/status', body: { status } } );
// The row actions as wp_admin_get_comments_list() gives them with EMPTY_TRASH_DAYS 0.
const ACTIONS = ( id ) => [
	{ action: 'approve', text: 'Approve', ariaLabel: 'Approve this comment', classes: [ 'approve' ], linkClasses: [ 'vim-a', 'aria-button-if-js' ], request: STATUS( id, 'approve' ), url: 'comment.php?action=approvecomment&c=' + id, removes: false, dims: true, separator: false },
	{ action: 'unapprove', text: 'Unapprove', ariaLabel: 'Unapprove this comment', classes: [ 'unapprove' ], linkClasses: [ 'vim-u', 'aria-button-if-js' ], request: STATUS( id, 'unapprove' ), url: 'comment.php?action=unapprovecomment&c=' + id, removes: false, dims: true, separator: false },
	{ action: 'edit', text: 'Edit', ariaLabel: 'Edit this comment', classes: [ 'edit' ], linkClasses: [], request: null, url: 'comment.php?action=editcomment&c=' + id, removes: false, dims: false, separator: true },
	{ action: 'spam', text: 'Spam', ariaLabel: 'Mark this comment as spam', classes: [ 'spam' ], linkClasses: [ 'vim-s', 'vim-destructive', 'aria-button-if-js' ], request: STATUS( id, 'spam' ), url: 'comment.php?action=spamcomment&c=' + id, removes: true, dims: false, separator: true },
	{ action: 'delete', text: 'Delete Permanently', ariaLabel: 'Delete this comment permanently', classes: [ 'delete' ], linkClasses: [ 'delete', 'vim-d', 'vim-destructive', 'aria-button-if-js' ], request: { method: 'DELETE', route: 'wp-admin/v1/comments/' + id, body: [] }, url: 'comment.php?action=deletecomment&c=' + id, removes: true, dims: false, separator: true },
];
const BUBBLE = { postId: 40, kind: 'approved', approved: 2, approvedText: '2', approvedLabel: '2 comments', approvedUrl: 'edit-comments.php?p=40&comment_status=approved', pending: 0, pendingText: '0', pendingLabel: '0 pending', pendingUrl: null };
const ROW = ( id ) => ( {
	id, postId: 40, status: 'approved', type: 'comment', classes: [ 'comment', 'depth-1', 'approved' ], canEdit: true,
	author: { name: 'Pat ' + id, nameHtml: null, avatar: 'https://example.org/a.png', avatarHtml: null, url: '', urlDisplay: '', email: 'pat@example.org', ip: '1.2.3.4', ipUrl: 'edit-comments.php?s=1.2.3.4&mode=detail' },
	parent: null,
	contentHtml: '<p>Words of ' + id + '</p>',
	inline: { content: 'Words of ' + id, author: 'Pat ' + id, email: 'pat@example.org', url: '', status: '1' },
	date: { text: '2026/11/19 at 9:00 am', url: 'https://example.org/p/#comment-' + id },
	response: { title: 'Post', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/', viewLabel: 'View Post', thumbnailHtml: null, bubble: BUBBLE },
	actions: ACTIONS( id ), actionsHtml: null, actionsVisible: false, cells: {},
} );
// No Trash view: wp_admin_get_comments_list() leaves it out, as the classic list does.
const VIEWS = [
	{ key: 'all', label: 'All', format: 'All <span class="count">(%s)</span>', countText: '2', countClass: 'all-count', count: 2, url: 'edit-comments.php?comment_status=all', current: true },
	{ key: 'spam', label: 'Spam', format: 'Spam <span class="count">(%s)</span>', countText: '0', countClass: 'spam-count', count: 0, url: 'edit-comments.php?comment_status=spam', current: false },
];
const PAGINATION = ( total ) => ( { total, totalText: total + ' items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } } );
const DATA = {
	query: { comment_status: 'all', mode: 'list' },
	title: 'Comments',
	heading: { post: null, search: null },
	messages: [], error: null,
	columns: [
		{ key: 'cb', label: '', primary: false, hidden: false, core: true, sortable: null, sorted: null },
		{ key: 'author', label: 'Author', primary: false, hidden: false, core: true, sortable: null, sorted: null },
		{ key: 'comment', label: 'Comment', primary: true, hidden: false, core: true, sortable: null, sorted: null },
	],
	caption: null, classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'comments' ],
	views: VIEWS, viewsHtml: null,
	bulkActions: [ { value: 'unapprove', label: 'Unapprove' }, { value: 'approve', label: 'Approve' }, { value: 'spam', label: 'Mark as spam' }, { value: 'delete', label: 'Delete permanently' } ],
	filters: { commentTypes: [], restrictHtml: null, filterButton: false, empty: null, navHtml: { top: null, bottom: null } },
	search: { shown: true, value: '', label: 'Search Comments', inputId: 'comment-search-input', keep: [] },
	pagination: PAGINATION( 2 ),
	items: [ ROW( 7 ), ROW( 8 ) ],
	extra: [],
	noItems: 'No comments found.',
	replyForm: { quicktags: { id: 'replycontent', buttons: 'strong,em' }, unfilteredHtml: true },
	hotkeys: { enabled: false, highlightFirst: false, highlightLast: false },
	screenOptions: null,
	menuCounts: { 'edit-comments.php': 0 },
};
const ANSWER = { id: 7, postId: 40, status: 'deleted', changed: true, row: null, undo: null, views: VIEWS, viewsHtml: null, pagination: PAGINATION( 1 ), bubble: BUBBLE, title: 'Comments', menuCounts: { 'edit-comments.php': 0 }, extra: [] };

let asked;
const provide = () => ( {
	router: { navigate: async () => true, follow: async () => true, refresh: async () => {} },
	speak: () => {},
	notices: { add: () => 'n1' },
	screenOptions: { set: () => () => {} },
	frameChannel: { setMenuCounts: () => {}, setTitle: () => {} },
	quicktagsEditor: () => ( { started: Promise.resolve(), setValue: () => {}, focus: () => {}, destroy: () => {} } ),
	confirm: ( message ) => {
		asked.push( message );
		return true;
	},
	formEntries: () => [],
	hotkeysTarget: { addEventListener: () => {}, removeEventListener: () => {} },
	pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/edit-comments.php', search: '?comment_status=all' },
} );

const settle = async () => {
	for ( let i = 0; i < 8; i++ ) {
		await flushPromises();
	}
};

beforeEach( async () => {
	asked = [];
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'edit-comments', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav' ] );
} );

afterEach( () => resetContracts() );

async function commentsPage() {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/edit-comments', data: DATA, page: { path: 'edit-comments.php', title: 'Comments' } } ) }, { provide: provide() } );
	await settle();
	expect( wrapper.find( '#comment-7' ).exists() ).toBe( true );
	return wrapper;
}

test( 'the row offers Delete Permanently, not Trash', async () => {
	const wrapper = await commentsPage();
	const row = wrapper.find( '#comment-7' );
	expect( row.find( '.row-actions .trash' ).exists() ).toBe( false );
	const remove = row.find( '.row-actions .delete a, .row-actions .delete button' );
	expect( remove.exists() ).toBe( true );
	expect( remove.text() ).toBe( 'Delete Permanently' );
	expect( remove.attributes( 'aria-label' ) ).toBe( 'Delete this comment permanently' );
} );

test( 'the click sends the delete request WordPress described, and asks nothing', async () => {
	api.respondWith( async () => ANSWER );
	const wrapper = await commentsPage();
	await wrapper.find( '#comment-7 .row-actions .delete a, #comment-7 .row-actions .delete button' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'DELETE' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/7?screen=edit-comments&list%5Bcomment_status%5D=all&list%5Bmode%5D=list' );
	expect( asked ).toEqual( [] );
	// The row leaves the list, as a wp-lists `delete:` link.
	const row = wrapper.find( '#comment-7' );
	expect( ! row.exists() || row.classes().includes( 'hidden' ) ).toBe( true );
} );

test( 'the bulk actions and views are those of the data: Delete permanently, no Trash', async () => {
	const wrapper = await commentsPage();
	const options = wrapper.findAll( '#bulk-action-selector-top option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] );
	expect( options ).toContainEqual( [ 'delete', 'Delete permanently' ] );
	expect( options.map( ( [ value ] ) => value ) ).not.toContain( 'trash' );
	expect( wrapper.find( '.subsubsub .trash' ).exists() ).toBe( false );
} );
