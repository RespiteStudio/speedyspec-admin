// What wp_admin_get_comments_list() answers, built for the Comments list's component tests: rows,
// the row actions of each status as WP_Comments_List_Table gives them (with their `vim-*` link
// classes), the page's data, and what the page injects. Request bodies are what a test asserts on.
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const STATUS = ( id, status ) => ( { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/status', body: { status } } );

/** The row actions of a comment, by status (`approved`, `unapproved`, `spam`, `trash`). */
export function actionsOf( id, status = 'approved' ) {
	const action = ( name, text, ariaLabel, linkClasses, request, flags = {} ) => ( {
		action: name, text, ariaLabel, classes: [ name ], linkClasses, request, url: 'comment.php?action=' + name + 'comment&c=' + id, removes: false, dims: false, separator: false, ...flags,
	} );
	const quick = { method: 'POST', route: 'wp-admin/v1/comments/' + id, body: [] };
	const reply = { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/reply', body: [] };
	if ( status === 'spam' ) {
		return [
			action( 'unspam', 'Not Spam', 'Restore this comment from the spam', [ 'vim-z', 'vim-destructive', 'aria-button-if-js' ], STATUS( id, 'unspam' ), { removes: true } ),
			action( 'delete', 'Delete Permanently', 'Delete this comment permanently', [ 'delete', 'vim-d', 'vim-destructive', 'aria-button-if-js' ], { method: 'DELETE', route: 'wp-admin/v1/comments/' + id, body: [] }, { removes: true, separator: true } ),
		];
	}
	if ( status === 'trash' ) {
		return [
			action( 'untrash', 'Restore', 'Restore this comment from the Trash', [ 'vim-z', 'vim-destructive', 'aria-button-if-js' ], STATUS( id, 'untrash' ), { removes: true } ),
			action( 'delete', 'Delete Permanently', 'Delete this comment permanently', [ 'delete', 'vim-d', 'vim-destructive', 'aria-button-if-js' ], { method: 'DELETE', route: 'wp-admin/v1/comments/' + id, body: [] }, { removes: true, separator: true } ),
		];
	}
	return [
		action( 'approve', 'Approve', 'Approve this comment', [ 'vim-a', 'aria-button-if-js' ], STATUS( id, 'approve' ), { dims: true } ),
		action( 'unapprove', 'Unapprove', 'Unapprove this comment', [ 'vim-u', 'aria-button-if-js' ], STATUS( id, 'unapprove' ), { dims: true } ),
		action( 'reply', 'Reply', 'Reply to this comment', [ 'vim-r', 'comment-inline' ], reply, { separator: true } ),
		action( 'quickedit', 'Quick Edit', 'Quick edit this comment inline', [ 'vim-q', 'comment-inline' ], quick, { separator: true } ),
		action( 'edit', 'Edit', 'Edit this comment', [], null, { separator: true } ),
		action( 'spam', 'Spam', 'Mark this comment as spam', [ 'vim-s', 'vim-destructive', 'aria-button-if-js' ], STATUS( id, 'spam' ), { removes: true, separator: true } ),
		action( 'trash', 'Trash', 'Move this comment to the Trash', [ 'delete', 'vim-d', 'vim-destructive', 'aria-button-if-js' ], STATUS( id, 'trash' ), { removes: true, separator: true } ),
	];
}

export const BUBBLE = { postId: 40, kind: 'approved', approved: 3, approvedText: '3', approvedLabel: '3 comments', approvedUrl: 'edit-comments.php?p=40&comment_status=approved', pending: 0, pendingText: '0', pendingLabel: '0 pending', pendingUrl: null };

/** One row of the list. `status` is `approved`, `unapproved`, `spam` or `trash`. */
export function row( id, { status = 'approved', content = 'Words of ' + id, author = 'Pat ' + id, canEdit = true, actionsHtml = null } = {} ) {
	return {
		id, postId: 40, status, type: 'comment', classes: [ 'comment', 'depth-1', status ], canEdit,
		author: { name: author, nameHtml: null, avatar: 'https://example.org/a.png', avatarHtml: null, url: 'https://pat.example.org/', urlDisplay: 'pat.example.org', email: 'pat' + id + '@example.org', ip: '1.2.3.' + id, ipUrl: 'edit-comments.php?s=1.2.3.' + id + '&mode=detail' },
		parent: null,
		contentHtml: '<p>' + content + '</p>',
		inline: { content, author, email: 'pat' + id + '@example.org', url: '', status: status === 'unapproved' ? '0' : '1' },
		date: { text: '2026/11/19 at 9:00 am', url: 'https://example.org/p/#comment-' + id },
		response: { title: 'Post', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/', viewLabel: 'View Post', thumbnailHtml: null, bubble: BUBBLE },
		actions: actionsOf( id, status ), actionsHtml, actionsVisible: false, cells: {},
	};
}

export const VIEWS = [
	{ key: 'all', label: 'All', format: 'All <span class="count">(%s)</span>', countText: '3', countClass: 'all-count', count: 3, url: 'edit-comments.php?comment_status=all', current: true },
	{ key: 'spam', label: 'Spam', format: 'Spam <span class="count">(%s)</span>', countText: '1', countClass: 'spam-count', count: 1, url: 'edit-comments.php?comment_status=spam', current: false },
];

export const pagination = ( total, extra = {} ) => ( { total, totalText: total + ' items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null }, ...extra } );

const COLUMNS = [
	{ key: 'cb', label: '', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'author', label: 'Author', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'comment', label: 'Comment', primary: true, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'response', label: 'In response to', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'date', label: 'Submitted on', primary: false, hidden: false, core: true, sortable: null, sorted: null },
];

/** The page's data; `over` replaces top-level keys. */
export function commentsData( over = {} ) {
	return {
		query: { comment_status: 'all', mode: 'list' },
		title: 'Comments',
		heading: { post: null, search: null },
		messages: [], error: null,
		columns: COLUMNS,
		caption: null, classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'comments' ],
		views: VIEWS, viewsHtml: null,
		bulkActions: [ { value: 'approve', label: 'Approve' }, { value: 'spam', label: 'Mark as spam' }, { value: 'trash', label: 'Move to Trash' } ],
		filters: { commentTypes: [], restrictHtml: null, filterButton: false, empty: null, navHtml: { top: null, bottom: null } },
		search: { shown: true, value: '', label: 'Search Comments', inputId: 'comment-search-input', keep: [] },
		pagination: pagination( 3 ),
		items: [ row( 7, { status: 'unapproved' } ), row( 8 ), row( 9 ) ],
		extra: [],
		noItems: 'No comments found.',
		replyForm: { quicktags: { id: 'replycontent', buttons: 'strong,em' }, unfilteredHtml: true },
		hotkeys: { enabled: false, highlightFirst: false, highlightLast: false },
		screenOptions: null,
		menuCounts: { 'edit-comments.php': 1 },
		...over,
	};
}

/** The answer of a moderation route; `over` replaces keys. */
export function answer( over = {} ) {
	return { id: 7, postId: 40, status: 'approved', changed: true, row: null, undo: null, views: VIEWS, viewsHtml: null, pagination: pagination( 3 ), bubble: BUBBLE, title: 'Comments', menuCounts: { 'edit-comments.php': 0 }, extra: [], ...over };
}

/** An undo notice as the answer of Trash and Spam gives it. */
export const undoNotice = ( id, kind = 'trash', author = 'Pat ' + id ) => ( {
	kind, author, message: kind === 'spam' ? 'Comment by %s marked as spam.' : 'Comment by %s moved to the Trash.', request: STATUS( id, kind === 'spam' ? 'unspam' : 'untrash' ),
} );

/** An editor double: records its mounting and gives a textarea in the host, as mountQuicktagsEditor() does. */
export function textareaEditor( host, options ) {
	const textarea = document.createElement( 'textarea' );
	textarea.id = options.id;
	textarea.value = options.value ?? '';
	textarea.addEventListener( 'input', () => options.onInput?.( textarea.value ) );
	host.appendChild( textarea );
	return { started: Promise.resolve(), setValue: ( value ) => { textarea.value = value; }, focus: () => textarea.focus(), destroy: () => textarea.remove() };
}

/** What the page injects. `over` replaces (or adds) values. */
export function provided( over = {} ) {
	return {
		router: { navigate: async () => true, follow: async () => true, refresh: async () => {} },
		speak: () => {},
		notices: { add: () => 'n1' },
		screenOptions: { set: () => () => {} },
		frameChannel: { setMenuCounts: () => {}, setTitle: () => {} },
		quicktagsEditor: textareaEditor,
		confirm: () => true,
		formEntries: () => [],
		hotkeysTarget: { addEventListener: () => {}, removeEventListener: () => {} },
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/edit-comments.php', search: '?comment_status=all' },
		...over,
	};
}

export const CONTRACTS = [ 'edit-comments', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav' ];
export const loadContracts = () => fillContracts( CONTRACTS );

/** Lets promises and Vue's flush settle (the page awaits several turns). */
export async function settle( turns = 8 ) {
	for ( let i = 0; i < turns; i++ ) {
		await flushPromises();
	}
}

/** Mounts the Comments page with `data`, as the app does, and waits for the rows. */
export async function mountComments( data = commentsData(), over = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/edit-comments', data, page: { path: 'edit-comments.php', title: 'Comments' } } ) }, { provide: provided( over ) } );
	await settle();
	return wrapper;
}
