import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { FakeDOMParser } from './helpers/html-parser.mjs';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
const flush = async () => {
	for ( let i = 0; i < 8; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );
const state = await import( '../site/components/core/edit-comments/state.js' );
const hotkeys = await import( '../site/components/core/edit-comments/hotkeys.js' );
const { deleteRoute } = await import( '../site/components/core/edit-comments.js' );

const { h } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'edit-comments', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const pageModule = globalThis.__modules[ '/components/core/edit-comments.js' ];
const contract = globalThis.__modules[ '/contracts/core/edit-comments.js' ].default;

// Fixtures, as wp_admin_get_comments_list() gives them -------------------------------------

const STATUS = ( id, status ) => ( { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/status', body: { status } } );
const ACTION = ( id, action, extra = {} ) => {
	const vim = { approve: [ 'vim-a', 'aria-button-if-js' ], unapprove: [ 'vim-u', 'aria-button-if-js' ], spam: [ 'vim-s', 'vim-destructive', 'aria-button-if-js' ], trash: [ 'delete', 'vim-d', 'vim-destructive', 'aria-button-if-js' ], reply: [ 'vim-r', 'comment-inline', 'button-link' ], quickedit: [ 'vim-q', 'comment-inline', 'button-link' ], edit: [] };
	const request = action === 'reply' ? { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/reply', body: [] }
		: action === 'quickedit' ? { method: 'POST', route: 'wp-admin/v1/comments/' + id, body: [] }
			: action === 'edit' ? null : STATUS( id, action );
	return {
		action, text: action[ 0 ].toUpperCase() + action.slice( 1 ), ariaLabel: action + ' this comment', classes: [ action ], linkClasses: vim[ action ], request,
		url: action === 'edit' ? 'comment.php?action=editcomment&c=' + id : request && ! [ 'reply', 'quickedit' ].includes( action ) ? 'comment.php?action=' + action + 'comment&c=' + id + '&_wpnonce=n' : null,
		removes: [ 'spam', 'trash' ].includes( action ), dims: [ 'approve', 'unapprove' ].includes( action ), separator: action !== 'approve', ...extra,
	};
};
const BUBBLE = ( postId, approved, pending ) => ( { postId, kind: approved ? 'approved' : 'no-approved', approved, approvedText: String( approved ), approvedLabel: approved + ' comments', approvedUrl: 'edit-comments.php?p=' + postId + '&comment_status=approved', pending, pendingText: String( pending ), pendingLabel: pending + ' pending', pendingUrl: pending ? 'edit-comments.php?p=' + postId + '&comment_status=moderated' : null } );
const ROW = ( id, extra = {} ) => ( {
	id, postId: 40, status: 'approved', type: 'comment', classes: [ 'comment', 'depth-1', 'approved' ], canEdit: true,
	author: { name: 'Pat ' + id, nameHtml: null, avatar: 'https://example.org/a.png', avatarHtml: null, url: 'https://pat.example', urlDisplay: 'pat.example', email: 'pat@example.org', ip: '1.2.3.4', ipUrl: 'edit-comments.php?s=1.2.3.4&mode=detail' },
	parent: null,
	contentHtml: '<p>Words of ' + id + '</p>',
	inline: { content: 'Words of ' + id, author: 'Pat ' + id, email: 'pat@example.org', url: 'https://pat.example', status: '1' },
	date: { text: '2026/11/19 at 9:00 am', url: 'https://example.org/p/#comment-' + id },
	response: { title: 'Post', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/', viewLabel: 'View Post', thumbnailHtml: null, bubble: BUBBLE( 40, 2, 1 ) },
	actions: [ 'approve', 'unapprove', 'reply', 'quickedit', 'edit', 'spam', 'trash' ].map( ( action ) => ACTION( id, action, action === 'reply' ? { approveParent: false } : {} ) ),
	actionsHtml: null, actionsVisible: false, cells: {},
	...extra,
} );
const COLUMNS = [
	{ key: 'cb', label: '', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'author', label: 'Author', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'comment', label: 'Comment', primary: true, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'response', label: 'In response to', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'date', label: 'Submitted on', primary: false, hidden: false, core: true, sortable: null, sorted: null },
	{ key: 'acme', label: 'Acme', primary: false, hidden: false, core: false, sortable: null, sorted: null },
];
const VIEWS = ( all = 3, pending = 1 ) => [
	{ key: 'all', label: 'All', format: 'All <span class="count">(%s)</span>', countText: String( all ), countClass: 'all-count', count: all, url: 'edit-comments.php?comment_status=all', current: true },
	{ key: 'moderated', label: 'Pending', format: 'Pending <span class="count">(%s)</span>', countText: String( pending ), countClass: 'pending-count', count: pending, url: 'edit-comments.php?comment_status=moderated', current: false },
	{ key: 'spam', label: 'Spam', format: 'Spam <span class="count">(%s)</span>', countText: '0', countClass: 'spam-count', count: 0, url: 'edit-comments.php?comment_status=spam', current: false },
];
const PAGINATION = ( total = 3 ) => ( { total, totalText: total + ' items', perPage: 2, page: 1, pages: 2, pagesText: '2', links: { first: null, prev: null, next: 'edit-comments.php?comment_status=all&paged=2', last: 'edit-comments.php?comment_status=all&paged=2' } } );
const DATA = ( extra = {} ) => ( {
	query: { comment_status: 'all', mode: 'list' },
	title: 'Comments (1)',
	heading: { post: null, search: null },
	messages: [], error: null,
	columns: COLUMNS, caption: 'Ordered by Comment Date, descending.', classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'comments' ],
	views: VIEWS(), viewsHtml: null,
	bulkActions: [ { value: 'unapprove', label: 'Unapprove' }, { value: 'approve', label: 'Approve' }, { value: 'spam', label: 'Mark as spam' }, { value: 'trash', label: 'Move to Trash' } ],
	filters: { commentTypes: [ { value: 'comment', label: 'Comments', selected: false } ], restrictHtml: { html: '<select name="fixture_filter"><option value="fixture">F</option></select>', error: null }, filterButton: true, empty: null, navHtml: { top: { html: '<button class="nav">Nav</button>', error: null }, bottom: null } },
	search: { shown: true, value: '', label: 'Search Comments', inputId: 'comment-search-input', keep: [] },
	pagination: PAGINATION(),
	items: [ ROW( 7 ), ROW( 8 ) ],
	extra: [ ROW( 9 ), ROW( 10 ) ],
	noItems: 'No comments found.',
	replyForm: { quicktags: { id: 'replycontent', buttons: 'strong,em' }, unfilteredHtml: true },
	hotkeys: { enabled: false, highlightFirst: false, highlightLast: false },
	screenOptions: { tableColumns: [ { key: 'author', label: 'Author', hidden: false }, { key: 'response', label: 'In response to', hidden: false } ], perPage: { option: 'edit_comments_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 }, viewMode: { value: 'list', choices: [] }, settingsHtml: null },
	menuCounts: { 'edit-comments.php': 1 },
	...extra,
} );
const ANSWER = ( extra = {} ) => ( { id: 7, postId: 40, status: 'approved', changed: true, row: null, undo: null, views: VIEWS( 3, 0 ), viewsHtml: null, pagination: PAGINATION( 2 ), bubble: BUBBLE( 40, 3, 0 ), title: 'Comments', menuCounts: { 'edit-comments.php': 0 }, extra: [ ROW( 10 ) ], ...extra } );

// Page harness ----------------------------------------------------------------------------

let editors;
let titles;
let menuCounts;
let added;
let spoken;
let navigated;
let followed;
let refreshed;
let confirms;
let screenOptions;
let keyListeners;
let formEntries;
const LOCATION = { origin: 'http://localhost', pathname: '/wp-admin/edit-comments.php', search: '?comment_status=all' };

function stubEditor( host, options ) {
	const editor = { host, options, focused: 0, destroyed: false };
	editors.push( editor );
	return { started: Promise.resolve(), setValue: () => {}, focus: () => {
		editor.focused++;
	}, destroy: () => {
		editor.destroyed = true;
	} };
}

let savedParser;
before( () => {
	savedParser = globalThis.DOMParser;
	globalThis.DOMParser = FakeDOMParser;
} );
after( () => {
	globalThis.DOMParser = savedParser;
} );

beforeEach( () => {
	editors = [];
	titles = [];
	menuCounts = [];
	added = [];
	spoken = [];
	navigated = [];
	followed = [];
	refreshed = 0;
	confirms = { answer: true, asked: [] };
	screenOptions = null;
	keyListeners = {};
	formEntries = [];
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( unmountAll );

const router = {
	navigate: async ( url, options ) => {
		navigated.push( [ url, options ?? null ] );
		return true;
	},
	follow: async ( target ) => {
		followed.push( target );
		return true;
	},
	refresh: async () => {
		refreshed++;
	},
};

const provide = ( extra = {} ) => ( {
	router,
	speak: ( message ) => spoken.push( message ),
	notices: { add: ( notice ) => added.push( notice ) },
	screenOptions: { set: ( options ) => {
		screenOptions = options;
		return () => {
			screenOptions = null;
		};
	} },
	frameChannel: { setMenuCounts: ( counts ) => menuCounts.push( counts ), setTitle: ( title ) => titles.push( title ) },
	quicktagsEditor: stubEditor,
	confirm: ( message ) => {
		confirms.asked.push( message );
		return confirms.answer;
	},
	formEntries: () => formEntries,
	hotkeysTarget: {
		addEventListener: ( type, fn ) => {
			keyListeners[ type ] = fn;
		},
		removeEventListener: ( type ) => {
			delete keyListeners[ type ];
		},
	},
	pageLocation: LOCATION,
	...extra,
} );

async function page( data = DATA(), { listeners = {}, provided = {} } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/edit-comments', data, page: { path: 'edit-comments.php', title: 'Comments' }, ...listeners } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const clean = ( node ) => textOf( node ).replace( /\s+/g, ' ' ).trim();
const rowOf = ( view, id ) => byId( view.container, 'comment-' + id );
const actionOf = ( view, id, action ) => {
	const span = find( rowOf( view, id ), ( el ) => el.tag === 'span' && hasClass( el, action ) && find( el, ( child ) => child.tag === 'a' || child.tag === 'button' ) );
	return span ? find( span, ( child ) => child.tag === 'a' || child.tag === 'button' ) : null;
};
const listIds = ( view ) => byId( view.container, 'the-comment-list' ).children.filter( ( el ) => el.tag === 'tr' ).map( ( el ) => el.props.id );
const prevent = { preventDefault() {} };

// Contract and module ---------------------------------------------------------------------

test( 'the Comments page contract: page tier, data and page, the table slots and `moderated`', () => {
	assert.equal( contract.id, 'core/edit-comments' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-table', 'after-table' ] );
	assert.deepEqual( contract.slots[ 'before-table' ].props, { query: { type: 'Object', required: true } } );
	assert.deepEqual( contract.emits, [ 'moderated' ] );
} );

test( 'the page module exports the classic help (edit-comments.php:205-233) and its stylesheet', async () => {
	assert.deepEqual( pageModule.stylesheets, [ 'list-tables' ] );
	const tabs = mergeHelp( pageModule.help, [] ).tabs;
	assert.deepEqual( tabs.map( ( tab ) => [ tab.id, tab.title ] ), [ [ 'overview', 'Overview' ], [ 'moderating-comments', 'Moderating Comments' ] ] );
	const moderating = mount( () => h( 'div', null, [ h( tabs[ 1 ].component ) ] ) );
	await flush();
	const paragraphs = findAll( moderating.container, byTag( 'p' ) );
	assert.equal( paragraphs.length, 6 );
	assert.equal( clean( paragraphs[ 1 ] ), 'In the Author column, in addition to the author’s name, email address, and site URL, the commenter’s IP address is shown. Clicking on this link will show you all the comments made from this IP address.' );
	assert.equal( clean( find( paragraphs[ 1 ], byTag( 'strong' ) ) ), 'Author' );
	const sidebar = mount( () => h( 'div', null, [ h( pageModule.help.sidebar ) ] ) );
	await flush();
	assert.deepEqual( findAll( sidebar.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [
		'https://wordpress.org/documentation/article/comments-screen/',
		'https://wordpress.org/documentation/article/understand-comment-spam/',
		'https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments',
		'https://wordpress.org/support/forums/',
	] );
} );

// State: pure updates from answers ----------------------------------------------------------

test( 'state: an action that dims (Approve in All) toggles `unapproved` in place, then takes the answer\'s row', () => {
	const pending = ROW( 7, { classes: [ 'comment', 'unapproved' ] } );
	let s = state.listState( DATA( { items: [ pending, ROW( 8 ) ] } ) );
	s = state.dimRow( s, 7 );
	assert.deepEqual( s.items[ 0 ].classes, [ 'comment' ] );
	const approved = ROW( 7, { contentHtml: '<p>Now</p>' } );
	s = state.afterModeration( s, { row: pending, action: ACTION( 7, 'approve' ), answer: ANSWER( { row: approved } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 7, 8 ], 'No row leaves, none comes in.' );
	assert.equal( s.items[ 0 ].contentHtml, '<p>Now</p>' );
	assert.deepEqual( s.extra.map( ( item ) => item.id ), [ 10 ] );
	assert.deepEqual( state.toggleUnapproved( { classes: [ 'a' ] } ).classes, [ 'a', 'unapproved' ] );
} );

test( 'state: an action that removes (Approve in Pending) takes the row out and the first extra row comes in', () => {
	let s = state.listState( DATA() );
	s = state.hideRow( s, 7 );
	assert.deepEqual( s.hidden, [ 7 ] );
	s = state.afterModeration( s, { row: ROW( 7 ), action: ACTION( 7, 'approve', { removes: true, dims: false } ), answer: ANSWER( { row: null, extra: [ ROW( 10 ), ROW( 11 ) ] } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 8, 9 ], 'Row 9, the first extra row, slides in.' );
	assert.deepEqual( s.extra.map( ( item ) => item.id ), [ 10, 11 ] );
	assert.deepEqual( s.hidden, [] );
	assert.deepEqual( s.undos, {} );
} );

test( 'state: Trash keeps the row hidden with its undo notice; the refill skips rows already shown; Undo brings it back', () => {
	const undo = { kind: 'trash', message: 'Comment by %s moved to the Trash.', author: 'Pat 7', request: STATUS( 7, 'untrash' ) };
	let s = state.listState( DATA( { extra: [ ROW( 8 ), ROW( 9 ) ] } ) );
	s = state.afterModeration( state.hideRow( s, 7 ), { row: ROW( 7 ), action: ACTION( 7, 'trash' ), answer: ANSWER( { status: 'trash', undo, extra: [ ROW( 9 ), ROW( 10 ) ] } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 7, 8, 9 ], 'Row 8 is already shown: 9 comes in.' );
	assert.deepEqual( s.hidden, [ 7 ] );
	assert.equal( s.undos[ 7 ].request.body.status, 'untrash' );
	assert.equal( s.undos[ 7 ].avatar, 'https://example.org/a.png' );
	assert.deepEqual( s.extra.map( ( item ) => item.id ), [ 10 ] );

	s = state.restoring( s, 7 );
	assert.deepEqual( s.hidden, [] );
	assert.equal( s.undos[ 7 ], undefined );
	s = state.afterUndo( s, { id: 7, answer: ANSWER( { row: ROW( 7, { contentHtml: '<p>Back</p>' } ) } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 7, 8, 9 ], 'No extra row goes back, as edit-comments.js.' );
	assert.equal( s.items[ 0 ].contentHtml, '<p>Back</p>' );
} );

test( 'state: every answer gives the views, the total, the title and the post\'s bubble', () => {
	let s = state.listState( DATA() );
	s = state.afterModeration( s, { row: ROW( 7 ), action: ACTION( 7, 'approve' ), answer: ANSWER( { row: ROW( 7 ) } ) } );
	assert.equal( s.views[ 1 ].count, 0 );
	assert.equal( s.pagination.totalText, '2 items' );
	assert.equal( s.title, 'Comments' );
	assert.ok( s.items.every( ( item ) => item.response.bubble.approved === 3 && item.response.bubble.pending === 0 ) );
	const other = ROW( 8, { response: { ...ROW( 8 ).response, bubble: BUBBLE( 41, 5, 5 ) } } );
	assert.equal( state.withBubble( [ other ], BUBBLE( 40, 1, 1 ) )[ 0 ].response.bubble.postId, 41, 'Another post\'s bubble stays.' );
} );

test( 'state: Quick Edit\'s row replaces the comment\'s; a reply\'s row comes after the comment, or not when the parent left Pending', () => {
	let s = state.afterEdit( state.listState( DATA() ), { id: 8, answer: ANSWER( { row: ROW( 8, { contentHtml: '<p>Edited</p>' } ) } ) } );
	assert.equal( s.items[ 1 ].contentHtml, '<p>Edited</p>' );
	s = state.afterReply( state.listState( DATA() ), { parentId: 7, view: 'all', answer: ANSWER( { id: 12, row: ROW( 12 ), replyRow: ROW( 12 ), parent: { id: 7, approved: true, row: ROW( 7, { contentHtml: '<p>P</p>' } ) } } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 7, 12, 8 ] );
	assert.equal( s.items[ 0 ].contentHtml, '<p>P</p>' );
	s = state.afterReply( state.listState( DATA() ), { parentId: 7, view: 'moderated', answer: ANSWER( { id: 12, replyRow: ROW( 12 ), parent: { id: 7, approved: true, row: null } } ) } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 8 ] );
} );

test( 'listQuery: the list form\'s fields with a plugin\'s input, less the bulk, wp-lists and inline form fields', () => {
	const entries = [
		[ 's', '' ], [ 'comment_status', 'all' ], [ 'pagegen_timestamp', '2026-11-19 10:00:00' ], [ '_total', '3' ], [ '_per_page', '20' ], [ '_page', '1' ],
		[ 'action', '-1' ], [ 'comment_type', 'comment' ], [ 'fixture_filter', 'fixture' ], [ 'delete_comments[]', '7' ], [ 'action2', '-1' ], [ 'replycontent', 'x' ],
	];
	assert.equal( state.listQuery( entries ), 's=&comment_status=all&pagegen_timestamp=2026-11-19+10%3A00%3A00&comment_type=comment&fixture_filter=fixture' );
	assert.equal( state.listQuery( [ [ 's', 'old' ], [ 'comment_status', 'all' ] ], { s: 'new term' } ), 's=new+term&comment_status=all' );
	assert.equal( state.listQuery( [ [ 'comment_status', 'spam' ] ], { s: 'x' } ), 'comment_status=spam&s=x' );
} );

test( 'bulkCheck: common.js\'s two checks before a bulk action', () => {
	assert.deepEqual( state.bulkCheck( '-1', 2 ), { id: 'no-bulk-action-selected', kind: 'action' } );
	assert.deepEqual( state.bulkCheck( '-1', 0 ), { id: 'no-bulk-action-selected', kind: 'action' } );
	assert.deepEqual( state.bulkCheck( 'spam', 0 ), { id: 'no-items-selected', kind: 'items' } );
	assert.equal( state.bulkCheck( 'spam', 1 ), null );
} );

test( 'addresses: the same address, Screen Options\' redirect without paged, hidden columns, DELETE with the list', () => {
	assert.equal( state.isCurrentAddress( '/wp-admin/edit-comments.php?comment_status=all', LOCATION ), true );
	assert.equal( state.isCurrentAddress( '/wp-admin/edit-comments.php?comment_status=all&spammed=1', LOCATION ), false );
	assert.equal( state.afterScreenOptions( { pathname: '/wp-admin/edit-comments.php', search: '?comment_status=all&paged=3' } ), '/wp-admin/edit-comments.php?comment_status=all' );
	assert.equal( state.afterScreenOptions( { pathname: '/wp-admin/edit-comments.php', search: '?paged=2' } ), '/wp-admin/edit-comments.php' );
	assert.deepEqual( state.hiddenColumns( [ 'date' ], 'author', true ), [ 'date', 'author' ] );
	assert.deepEqual( state.hiddenColumns( [ 'date', 'author' ], 'date', false ), [ 'author' ] );
	assert.equal( deleteRoute( 'wp-admin/v1/comments/8', { comment_status: 'trash', paged: '2' } ), 'wp-admin/v1/comments/8?screen=edit-comments&list%5Bcomment_status%5D=trash&list%5Bpaged%5D=2' );
} );

// Keyboard shortcuts ---------------------------------------------------------------------

test( 'hotkeys: j and k move through the rows and wrap to the next or previous page; keys run the current row\'s actions', () => {
	const rows = { 7: ROW( 7 ).actions, 8: ROW( 8 ).actions, 9: ROW( 9 ).actions };
	const context = ( current ) => ( { ids: [ 7, 8, 9 ], current, actionOf: ( id, key ) => hotkeys.rowActionForKey( rows[ id ], key ) } );
	const key = ( k, extra = {} ) => ( { key: k, ...extra } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'j' ), context( null ) ), { type: 'current', id: 7 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'k' ), context( null ) ), { type: 'current', id: 7 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'j' ), context( 7 ) ), { type: 'current', id: 8 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'j' ), context( 9 ) ), { type: 'page', which: 'next' } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'k' ), context( 7 ) ), { type: 'page', which: 'prev' } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'x' ), context( 8 ) ), { type: 'check', id: 8 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'a' ), context( 8 ) ), { type: 'action', id: 8, action: 'approve', current: 8 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'd' ), context( 8 ) ), { type: 'action', id: 8, action: 'trash', current: 9 }, 'A destructive action moves on first.' );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 's' ), context( 9 ) ), { type: 'action', id: 9, action: 'spam', current: 8 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'q' ), context( 7 ) ), { type: 'action', id: 7, action: 'quickedit', current: 7 } );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'e' ), context( 7 ) ), { type: 'edit', id: 7 } );
	assert.equal( hotkeys.hotkeyCommand( key( 'z' ), context( 7 ) ), null, 'No Not Spam or Restore on this row.' );
	assert.equal( hotkeys.hotkeyCommand( key( 'a' ), context( null ) ), null );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'X', { shiftKey: true } ), context( 7 ) ), { type: 'check-all' } );
	for ( const [ k, value ] of [ [ 'A', 'approve' ], [ 'U', 'unapprove' ], [ 'S', 'spam' ], [ 'D', 'delete' ], [ 'T', 'trash' ], [ 'Z', 'untrash' ] ] ) {
		assert.deepEqual( hotkeys.hotkeyCommand( key( k, { shiftKey: true } ), context( 7 ) ), { type: 'bulk', value } );
	}
	assert.equal( hotkeys.hotkeyCommand( key( 'j', { ctrlKey: true } ), context( 7 ) ), null );
	assert.equal( hotkeys.hotkeyCommand( key( 'j', { target: { tagName: 'TEXTAREA' } } ), context( 7 ) ), null );
	assert.equal( hotkeys.hotkeyCommand( key( 'j', { target: { tagName: 'INPUT', type: 'text' } } ), context( 7 ) ), null );
	assert.deepEqual( hotkeys.hotkeyCommand( key( 'x', { target: { tagName: 'INPUT', type: 'checkbox', closest: () => ( {} ) } } ), context( 7 ) ), { type: 'check', id: 7 }, 'A row checkbox is not a field.' );
} );

test( 'hotkeys: the page links ask for the first or last row; the row to start on', () => {
	const links = { next: 'edit-comments.php?comment_status=all&paged=2&hotkeys_highlight_last=1', prev: 'edit-comments.php?paged=1' };
	assert.equal( hotkeys.hotkeyPage( links, 'next' ), 'edit-comments.php?comment_status=all&paged=2&hotkeys_highlight_first=1' );
	assert.equal( hotkeys.hotkeyPage( links, 'prev' ), 'edit-comments.php?paged=1&hotkeys_highlight_last=1' );
	assert.equal( hotkeys.hotkeyPage( { next: null }, 'next' ), null );
	assert.equal( hotkeys.initialRow( [ 7, 8 ], { enabled: true, highlightFirst: true } ), 7 );
	assert.equal( hotkeys.initialRow( [ 7, 8 ], { enabled: true, highlightLast: true } ), 8 );
	assert.equal( hotkeys.initialRow( [ 7, 8 ], { enabled: false, highlightFirst: true } ), null );
} );

// The page --------------------------------------------------------------------------------

test( 'the page: the classic markup of the list, its rows and cells, with the comment text inert', async () => {
	const evil = ROW( 8, { contentHtml: '<p>Hi <img src="x" onerror="alert(1)"><script>alert(2)</script></p>', cells: { acme: { html: '<em>plugin</em>', error: null } } } );
	const view = await page( DATA( { items: [ ROW( 7 ), evil ] } ) );
	assert.ok( byId( view.container, 'comments-form' ) );
	assert.equal( byId( view.container, 'comments-form' ).props.method, 'get' );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-8' ] );
	assert.deepEqual( rowOf( view, 7 ).props.class.split( ' ' ).slice( 0, 3 ), [ 'comment', 'depth-1', 'approved' ] );
	const comment = find( rowOf( view, 8 ), byClass( 'column-comment' ) );
	const inert = find( comment, byClass( 'wp-admin-inert-html' ) );
	assert.ok( inert, 'The comment text is InertHtml.' );
	assert.ok( ! find( comment, byClass( 'wp-admin-legacy-html' ) ), 'Never LegacyHtml for the comment text.' );
	assert.ok( find( rowOf( view, 8 ), byClass( 'column-acme' ) ) && find( find( rowOf( view, 8 ), byClass( 'column-acme' ) ), byClass( 'wp-admin-legacy-html' ) ), 'A plugin cell is LegacyHtml.' );
	assert.equal( byId( comment, 'inline-8' ).props.class, 'hidden' );
	assert.deepEqual( findAll( find( comment, byClass( 'row-actions' ) ), byTag( 'span' ) ).map( ( span ) => span.props.class ), [ 'approve', 'unapprove', 'reply', 'quickedit', 'edit', 'spam', 'trash' ] );
	assert.equal( actionOf( view, 7, 'approve' ).props.role, 'button' );
	assert.equal( actionOf( view, 7, 'quickedit' ).tag, 'button' );
	assert.equal( actionOf( view, 7, 'edit' ).props.href, '/wp-admin/comment.php?action=editcomment&c=7' );
	const response = find( rowOf( view, 7 ), byClass( 'post-com-count-40' ) );
	assert.ok( hasClass( response, 'post-com-count-wrapper' ) );
	assert.equal( clean( find( response, byClass( 'comment-count-approved' ) ) ), '2' );
	assert.equal( clean( find( response, byClass( 'comment-count-pending' ) ) ), '1' );
	assert.equal( clean( find( view.container, byClass( 'subsubsub' ) ) ), 'All (3) |Pending (1) |Spam (0)' );
	assert.ok( byId( view.container, 'com-reply' ), 'The reply form\'s holder, with the closed form.' );
	assert.ok( byId( byId( view.container, 'com-reply' ), 'replyrow' ) );
	assert.ok( byId( view.container, 'trash-undo-holder' ) && byId( view.container, 'spam-undo-holder' ) );
	assert.deepEqual( titles, [ 'Comments (1)' ], 'The document title is the list\'s.' );
} );

test( 'the page: Approve in All calls its route for the list, dims in place, and the answer updates counts, title and menu', async () => {
	const moderated = [];
	const pending = ROW( 7, { classes: [ 'comment', 'unapproved' ] } );
	let answer;
	api.respondWith( () => new Promise( ( resolve ) => {
		answer = resolve;
	} ) );
	const view = await page( DATA( { items: [ pending, ROW( 8 ) ] } ), { listeners: { onModerated: ( value ) => moderated.push( value ) } } );
	actionOf( view, 7, 'approve' ).props.onClick( prevent );
	await flush();
	assert.ok( ! hasClass( rowOf( view, 7 ), 'unapproved' ), 'Dimmed at once.' );
	assert.deepEqual( api.calls.map( ( c ) => [ c.method, c.route, c.payload ] ), [ [ 'POST', 'wp-admin/v1/comments/7/status', { status: 'approve', screen: 'edit-comments', list: { comment_status: 'all', mode: 'list' } } ] ] );
	answer( ANSWER( { row: ROW( 7 ) } ) );
	await flush();
	assert.ok( hasClass( rowOf( view, 7 ), 'approved' ) );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-8' ] );
	assert.equal( clean( find( view.container, byClass( 'subsubsub' ) ) ), 'All (3) |Pending (0) |Spam (0)' );
	assert.equal( clean( find( view.container, byClass( 'displaying-num' ) ) ), '2 items' );
	assert.equal( clean( find( find( rowOf( view, 8 ), byClass( 'post-com-count-40' ) ), byClass( 'comment-count-approved' ) ) ), '3', 'The post\'s bubble, on every row of the post.' );
	assert.deepEqual( titles.at( -1 ), 'Comments' );
	assert.deepEqual( menuCounts, [ { 'edit-comments.php': 0 } ] );
	assert.equal( moderated.length, 1 );
} );

test( 'the page: Trash hides the row and shows the undo row; Undo calls its request; Delete sends the list in its query', async () => {
	const undo = { kind: 'trash', message: 'Comment by %s moved to the Trash.', author: 'Pat 7', request: STATUS( 7, 'untrash' ) };
	api.respondWith( async ( method, route, payload ) => ( payload?.status === 'trash' ? ANSWER( { status: 'trash', undo } ) : ANSWER( { row: ROW( 7 ) } ) ) );
	const view = await page();
	await actionOf( view, 7, 'trash' ).props.onClick( prevent );
	await flush();
	assert.ok( hasClass( rowOf( view, 7 ), 'hidden' ) );
	const notice = byId( view.container, 'undo-7' );
	assert.equal( notice.props.class, 'undo untrash' );
	assert.equal( find( notice, byTag( 'td' ) ).props.colspan, '6' );
	assert.equal( clean( notice ), 'Comment by Pat 7 moved to the Trash. Undo' );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'undo-7', 'comment-8', 'comment-9' ], 'The first extra row slid in.' );

	const link = find( find( notice, byClass( 'untrash' ) ), byTag( 'a' ) );
	assert.equal( link.props.role, 'button' );
	await link.props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls.at( -1 ).payload, { status: 'untrash', screen: 'edit-comments', list: { comment_status: 'all', mode: 'list' } } );
	assert.equal( byId( view.container, 'undo-7' ), null );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'hidden' ) );

	const deletable = ROW( 11, { actions: [ { ...ACTION( 11, 'trash' ), action: 'delete', classes: [ 'delete' ], request: { method: 'DELETE', route: 'wp-admin/v1/comments/11', body: [] } } ] } );
	api.respondWith( async () => ANSWER( { id: 11, status: 'deleted' } ) );
	const second = await page( DATA( { items: [ deletable ] } ) );
	await actionOf( second, 11, 'delete' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( [ api.calls.at( -1 ).method, api.calls.at( -1 ).route ], [ 'DELETE', 'wp-admin/v1/comments/11?screen=edit-comments&list%5Bcomment_status%5D=all&list%5Bmode%5D=list' ] );
} );

test( 'the page: Filter and Search navigate with the form\'s fields, a plugin\'s input among them', async () => {
	const view = await page();
	formEntries = [ [ 'comment_status', 'all' ], [ 'comment_type', '' ], [ 'fixture_filter', 'fixture' ], [ 'action', '-1' ], [ 's', '' ] ];
	find( view.container, byProp( 'id', 'post-query-submit' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( navigated.at( -1 ), [ '/wp-admin/edit-comments.php?comment_status=all&comment_type=&fixture_filter=fixture&s=', null ] );
	assert.ok( find( view.container, ( el ) => hasClass( el, 'wp-admin-legacy-html' ) && el.tag === 'span' ), 'The plugin\'s select is its HTML.' );

	const search = find( view.container, byProp( 'id', 'search-submit' ) );
	find( view.container, byProp( 'id', 'comment-search-input' ) ).props.onInput( { target: { value: 'needle' } } );
	await search.props.onClick( prevent );
	await flush();
	assert.deepEqual( navigated.at( -1 ), [ '/wp-admin/edit-comments.php?comment_status=all&comment_type=&fixture_filter=fixture&s=needle', null ] );
} );

test( 'the page: Apply checks as common.js, then posts the bulk route and follows its answer', async () => {
	const view = await page();
	const apply = byId( view.container, 'doaction' );
	await apply.props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select a bulk action to perform.' );
	assert.equal( added.at( -1 ).type, 'error' );
	assert.deepEqual( spoken, [ 'Please select a bulk action to perform.' ] );

	byId( view.container, 'bulk-action-selector-top' ).props.onChange( { target: { value: 'spam' } } );
	await flush();
	assert.equal( byId( view.container, 'bulk-action-selector-bottom' ).props.value, 'spam', 'The bottom select follows the top one.' );
	await byId( view.container, 'doaction' ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select at least one item to perform this action on.' );
	assert.equal( api.calls.length, 0 );

	byId( view.container, 'cb-select-7' ).props.onClick( { target: { checked: true } } );
	byId( view.container, 'cb-select-8' ).props.onClick( { target: { checked: true } } );
	await flush();
	api.respondWith( async () => ( { redirect: 'edit-comments.php?comment_status=all&paged=1&spammed=2&ids=7%2C8', location: null } ) );
	await byId( view.container, 'doaction2' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls.map( ( c ) => [ c.route, c.payload ] ), [ [ 'wp-admin/v1/comments/bulk', { action: 'spam', ids: [ 7, 8 ], list: { comment_status: 'all', mode: 'list' } } ] ] );
	assert.deepEqual( followed, [ { redirect: 'edit-comments.php?comment_status=all&paged=1&spammed=2&ids=7%2C8', location: null } ] );
	assert.equal( refreshed, 0, 'Another address: following it reads the list.' );
} );

test( 'the page: a bulk answer back to the address shown reloads the list; a location is followed as a location', async () => {
	const view = await page();
	byId( view.container, 'bulk-action-selector-top' ).props.onChange( { target: { value: 'detached_fixture_bulk' } } );
	byId( view.container, 'cb-select-7' ).props.onClick( { target: { checked: true } } );
	await flush();
	api.respondWith( async () => ( { redirect: 'edit-comments.php?comment_status=all', location: null } ) );
	await byId( view.container, 'doaction' ).props.onClick( prevent );
	await flush();
	assert.equal( followed.length, 1 );
	assert.equal( refreshed, 1, 'follow() to the URL shown does not reload: the page does.' );

	api.respondWith( async () => ( { redirect: null, location: 'https://elsewhere.example/done' } ) );
	byId( view.container, 'cb-select-8' ).props.onClick( { target: { checked: true } } );
	await flush();
	await byId( view.container, 'doaction' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( followed.at( -1 ), { redirect: null, location: 'https://elsewhere.example/done' } );
	assert.equal( refreshed, 1 );
} );

test( 'the page: Empty Spam posts delete_all with the status and the time of the page', async () => {
	const data = DATA( { query: { comment_status: 'spam' }, filters: { ...DATA().filters, empty: { label: 'Empty Spam', status: 'spam', pagegenTimestamp: '2026-11-19 10:00:00' } }, views: VIEWS().map( ( v ) => ( v.key === 'spam' ? { ...v, count: 2, countText: '2' } : v ) ) } );
	api.respondWith( async () => ( { redirect: 'edit-comments.php?comment_status=spam&paged=1&deleted=2', location: null } ) );
	const view = await page( data );
	const empty = byId( view.container, 'delete_all' );
	assert.equal( empty.props.value, 'Empty Spam' );
	assert.ok( byId( view.container, 'delete_all2' ) );
	await empty.props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { action: 'delete_all', emptyStatus: 'spam', pagegenTimestamp: '2026-11-19 10:00:00', list: { comment_status: 'spam' } } );
	assert.equal( followed.length, 1 );
} );

test( 'the page: the messages notice, and its Undo calls the request and follows the answer', async () => {
	const undoRequest = { method: 'POST', route: 'wp-admin/v1/comments/bulk', body: { action: 'untrash', ids: [ 7, 8 ] } };
	const data = DATA( { messages: [ { markup: '2 comments moved to the Trash.', undo: undoRequest }, { markup: 'This comment is already approved. <a href="https://example.org/wp-admin/comment.php?action=editcomment&amp;c=5">Edit comment</a>', undo: null } ] } );
	api.respondWith( async () => ( { redirect: 'edit-comments.php?comment_status=all&untrashed=2', location: null } ) );
	const view = await page( data );
	const notice = byId( view.container, 'moderated' );
	assert.equal( notice.props.class, 'notice is-dismissible updated' );
	assert.equal( clean( find( notice, byTag( 'p' ) ) ), '2 comments moved to the Trash. UndoThis comment is already approved. Edit comment' );
	assert.equal( find( notice, ( el ) => el.tag === 'a' && clean( el ) === 'Edit comment' ).props.href, 'https://example.org/wp-admin/comment.php?action=editcomment&c=5', 'The message\'s core link.' );
	assert.equal( findAll( notice, byTag( 'br' ) ).length, 1 );
	await find( notice, ( el ) => el.tag === 'a' && clean( el ) === 'Undo' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/comments/bulk', payload: { action: 'untrash', ids: [ 7, 8 ], list: { comment_status: 'all', mode: 'list' } } } );
	assert.deepEqual( followed, [ { redirect: 'edit-comments.php?comment_status=all&untrashed=2', location: null } ] );
	find( notice, byClass( 'notice-dismiss' ) ).props.onClick();
	await flush();
	assert.equal( byId( view.container, 'moderated' ), null );
} );

test( 'the page: Quick Edit opens the core form with the row\'s fields and posts them; Escape and Cancel close it', async () => {
	const view = await page();
	await actionOf( view, 7, 'quickedit' ).props.onClick( prevent );
	await flush();
	assert.ok( hasClass( rowOf( view, 7 ), 'hidden' ), 'The row hides while Quick Edit is open.' );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'replyrow', 'comment-8' ] );
	const form = byId( byId( view.container, 'the-comment-list' ), 'replyrow' );
	assert.equal( clean( find( form, byTag( 'legend' ) ) ), 'Edit Comment' );
	assert.equal( byId( form, 'author-name' ).props.value, 'Pat 7' );
	assert.equal( byId( form, 'author-email' ).props.value, 'pat@example.org' );
	assert.equal( byId( form, 'author-url' ).props.value, 'https://pat.example' );
	assert.equal( clean( byId( form, 'savebtn' ) ), 'Update Comment' );
	assert.equal( editors.length, 1 );
	assert.equal( editors[ 0 ].options.value, 'Words of 7', 'The raw content, as a textarea value.' );
	assert.deepEqual( editors[ 0 ].options.settings, { id: 'replycontent', buttons: 'strong,em' } );

	editors[ 0 ].options.onInput( 'Edited words' );
	byId( form, 'author-name' ).props.onInput( { target: { value: 'Pat Q' } } );
	api.respondWith( async () => ANSWER( { row: ROW( 7, { contentHtml: '<p>Edited words</p>' } ) } ) );
	await find( form, byClass( 'save' ) ).props.onClick();
	await flush();
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/comments/7', payload: { author: 'Pat Q', email: 'pat@example.org', url: 'https://pat.example', content: 'Edited words', screen: 'edit-comments', list: { comment_status: 'all', mode: 'list' } } } );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'hidden' ) );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-8' ] );
	assert.equal( editors[ 0 ].destroyed, true );

	await actionOf( view, 8, 'quickedit' ).props.onClick( prevent );
	await flush();
	byId( view.container, 'wp-replycontent-editor-container' ).props.onKeyup( { key: 'Escape', isComposing: false } );
	await flush();
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-8' ] );
	await actionOf( view, 8, 'quickedit' ).props.onClick( prevent );
	await flush();
	find( byId( view.container, 'the-comment-list' ), byClass( 'cancel' ) ).props.onClick();
	await flush();
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-8' ] );
} );

test( 'the page: Reply posts the content for the list; the reply comes after the comment; an error is shown and spoken', async () => {
	const view = await page( DATA( { items: [ ROW( 7, { classes: [ 'comment', 'unapproved' ] } ), ROW( 8 ) ] } ) );
	await actionOf( view, 7, 'reply' ).props.onClick( prevent );
	await flush();
	const form = byId( byId( view.container, 'the-comment-list' ), 'replyrow' );
	assert.equal( clean( find( form, byTag( 'legend' ) ) ), 'Reply to Comment' );
	assert.equal( clean( byId( form, 'replybtn' ) ), 'Approve and Reply' );
	assert.equal( byId( form, 'author-name' ), null );
	assert.equal( actionOf( view, 7, 'reply' ).props[ 'aria-expanded' ], 'true' );

	api.respondWith( async () => {
		throw Object.assign( new Error( 'Please type your comment text.' ), { status: 400 } );
	} );
	await find( form, byClass( 'save' ) ).props.onClick();
	await flush();
	assert.equal( clean( find( byId( view.container, 'replyrow' ), byClass( 'error' ) ) ), 'Please type your comment text.' );
	assert.deepEqual( spoken, [ 'Please type your comment text.' ] );

	editors.at( -1 ).options.onInput( 'Thanks' );
	api.respondWith( async () => ANSWER( { id: 12, row: ROW( 12 ), replyRow: ROW( 12 ), parent: { id: 7, approved: true, row: ROW( 7 ) } } ) );
	await find( byId( view.container, 'replyrow' ), byClass( 'save' ) ).props.onClick();
	await flush();
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/comments/7/reply', payload: { content: 'Thanks', screen: 'edit-comments', list: { comment_status: 'all', mode: 'list' } } } );
	assert.deepEqual( listIds( view ), [ 'comment-7', 'comment-12', 'comment-8' ] );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'unapproved' ) );
} );

test( 'the page: double-clicking a comment opens Quick Edit; another form asks first, with edit-comments.js\'s messages', async () => {
	const view = await page();
	const text = ( id ) => find( find( rowOf( view, id ), byClass( 'column-comment' ) ), byClass( 'wp-admin-inert-html' ) );
	text( 7 ).props.onDblclick();
	await flush();
	assert.equal( clean( find( byId( view.container, 'replyrow' ), byTag( 'legend' ) ) ), 'Edit Comment' );
	assert.deepEqual( confirms.asked, [], 'No form was open.' );

	editors.at( -1 ).options.onInput( 'Changed' );
	confirms.answer = false;
	text( 8 ).props.onDblclick();
	await flush();
	assert.deepEqual( confirms.asked, [ 'Are you sure you want to edit this comment?\nThe changes you made will be lost.' ] );
	assert.ok( hasClass( rowOf( view, 7 ), 'hidden' ), 'Refused: the form stays on comment 7.' );

	confirms.answer = true;
	text( 8 ).props.onDblclick();
	await flush();
	assert.deepEqual( confirms.asked.slice( 1 ), [ 'Are you sure you want to edit this comment?\nThe changes you made will be lost.', 'Are you sure you want to do this?\nThe comment changes you made will be lost.' ] );
	assert.ok( hasClass( rowOf( view, 8 ), 'hidden' ) );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'hidden' ) );
} );

test( 'the page: Screen Options gives the table\'s options; a column hides at once and is saved; Apply saves, then reads the list again', async () => {
	const view = await page();
	assert.deepEqual( screenOptions.tableColumns, [ { key: 'author', label: 'Author', hidden: false }, { key: 'response', label: 'In response to', hidden: false } ] );
	assert.equal( screenOptions.pagination.option, 'edit_comments_per_page' );
	await screenOptions.onChange( 'hide-column', { key: 'author', hidden: true } );
	await flush();
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/screen-preferences/edit-comments', payload: { columnsHidden: [ 'author' ] } } );
	assert.ok( hasClass( find( rowOf( view, 7 ), byClass( 'column-author' ) ), 'hidden' ) );
	assert.ok( hasClass( byId( view.container, 'author' ), 'hidden' ) );
	assert.equal( screenOptions.tableColumns[ 0 ].hidden, true, 'The panel shows it hidden.' );

	await screenOptions.onApply( { perPage: 5, mode: 'excerpt' } );
	await flush();
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/screen-preferences/edit-comments', payload: { perPage: 5, mode: 'excerpt' } } );
	assert.equal( refreshed, 1, 'The address has no paged: the list is read again.' );

	unmountAll();
	await page( DATA(), { provided: { pageLocation: { ...LOCATION, search: '?comment_status=all&paged=2' } } } );
	await screenOptions.onApply( { perPage: 5, mode: null } );
	await flush();
	assert.deepEqual( api.calls.at( -1 ).payload, { perPage: 5 } );
	assert.deepEqual( navigated.at( -1 ), [ '/wp-admin/edit-comments.php?comment_status=all', { replace: true } ] );
} );

test( 'the page: keyboard shortcuts move the current row, run its actions and wrap to the next page', async () => {
	const off = await page();
	assert.equal( keyListeners.keypress, undefined, 'Off unless the user turned them on.' );
	unmountAll();

	api.respondWith( async ( method, route ) => ANSWER( { row: ROW( Number( route.split( '/' )[ 3 ] ) ) } ) );
	const view = await page( DATA( { hotkeys: { enabled: true, highlightFirst: true, highlightLast: false } } ) );
	assert.ok( hasClass( rowOf( view, 7 ), 'vim-current' ), 'highlightFirst: the first row.' );
	const press = async ( key, extra = {} ) => {
		keyListeners.keypress( { key, preventDefault() {}, ...extra } );
		await flush();
	};
	await press( 'j' );
	assert.ok( hasClass( rowOf( view, 8 ), 'vim-current' ) );
	await press( 'x' );
	assert.equal( byId( view.container, 'cb-select-8' ).props.checked, true );
	await press( 'a' );
	assert.deepEqual( api.calls.at( -1 ).route, 'wp-admin/v1/comments/8/status' );
	await press( 'j' );
	assert.deepEqual( navigated.at( -1 ), [ '/wp-admin/edit-comments.php?comment_status=all&paged=2&hotkeys_highlight_first=1', null ] );
	await press( 'q' );
	assert.ok( byId( byId( view.container, 'the-comment-list' ), 'replyrow' ), 'q opens Quick Edit.' );
	void off;
} );

test( 'the page: an Author\'s rows (no checkbox, no actions) and the plugins\' row actions HTML, whose core actions work', async () => {
	const author = ROW( 7, { canEdit: false, actions: null, inline: null, author: { ...ROW( 7 ).author, email: null, ip: null, ipUrl: null } } );
	const filtered = ROW( 8, { actionsHtml: '<span class="approve"><a href="#">Approve</a></span><span class="acme"><a href="#x">Acme</a></span>' } );
	const view = await page( DATA( { items: [ author, filtered ], bulkActions: [] } ) );
	assert.equal( byId( view.container, 'cb-select-7' ), null );
	assert.equal( find( rowOf( view, 7 ), byClass( 'row-actions' ) ), null );
	assert.ok( ! clean( rowOf( view, 7 ) ).includes( 'pat@example.org' ) );
	assert.equal( byId( view.container, 'bulk-action-selector-top' ), null, 'No bulk actions, no select.' );

	const actions = find( rowOf( view, 8 ), byClass( 'row-actions' ) );
	assert.ok( hasClass( actions, 'wp-admin-legacy-html' ) );
	api.respondWith( async () => ANSWER( { id: 8, row: ROW( 8 ) } ) );
	let prevented = false;
	const span = { classList: { contains: ( name ) => name === 'approve' } };
	actions.props.onClick( { target: { closest: ( selector ) => ( selector === 'span' ? span : {} ) }, preventDefault() {
		prevented = true;
	} } );
	await flush();
	assert.ok( prevented );
	assert.equal( api.calls.at( -1 ).route, 'wp-admin/v1/comments/8/status' );
} );
