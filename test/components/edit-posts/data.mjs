// What wp_admin_get_posts_list() answers, built for the Posts list's component tests: rows with
// the row actions WordPress describes, the Quick Edit and Bulk Edit form data, and the page
// mounted the way the router mounts it. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { column, settle };

const REQUEST = ( id, action ) => ( { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/' + action, body: [] } );

/** The row actions of a post (handle_row_actions()): the route each calls, or its address. */
export const actionsOf = ( id, status = 'publish' ) => ( status === 'trash'
	? [
		{ action: 'untrash', text: 'Restore', ariaLabel: 'Restore “Post ' + id + '” from the Trash', classes: [ 'untrash' ], request: REQUEST( id, 'untrash' ), url: null, newTab: false },
		{ action: 'delete', text: 'Delete Permanently', ariaLabel: 'Delete “Post ' + id + '” permanently', classes: [ 'delete' ], request: REQUEST( id, 'delete' ), url: null, newTab: false },
	]
	: [
		{ action: 'edit', text: 'Edit', ariaLabel: 'Edit “Post ' + id + '”', classes: [ 'edit' ], request: null, url: 'post.php?post=' + id + '&action=edit', newTab: false },
		{ action: 'inline', text: 'Quick Edit', ariaLabel: 'Quick edit “Post ' + id + '” inline', classes: [ 'inline', 'hide-if-no-js' ], request: REQUEST( id, 'inline' ), url: null, newTab: false },
		{ action: 'trash', text: 'Trash', ariaLabel: 'Move “Post ' + id + '” to the Trash', classes: [ 'trash' ], request: REQUEST( id, 'trash' ), url: null, newTab: false },
		{ action: 'view', text: status === 'draft' ? 'Preview' : 'View', ariaLabel: 'View “Post ' + id + '”', classes: [ 'view' ], request: null, url: 'https://example.test/?p=' + id, newTab: true },
	] );

export const INLINE = {
	post_title: 'Post 7', post_name: 'post-7', post_author: '1', comment_status: 'open', ping_status: 'open', _status: 'publish',
	jj: '01', mm: '02', aa: '2020', hh: '10', mn: '00', ss: '00', post_password: '', post_parent: null, page_template: 'default', menu_order: null,
	terms: {}, tags: {}, sticky: false, post_format: '',
};

/** A row of the list. `over` replaces any of its keys; `inline` merges into the Quick Edit values. */
export const row = ( id, { inline = {}, ...over } = {} ) => ( {
	id, classes: [ 'iedit', 'post-' + id ], level: 0, selectable: true,
	checkboxLabel: 'Select Post ' + id, lockedLabel: 'locked', rowHeaderLabel: 'Post ' + id, lock: null,
	title: { html: 'Post ' + id, editUrl: 'post.php?post=' + id + '&action=edit', pad: 0, parentText: null, childOf: null, noTitleExcerpt: null },
	author: { name: 'admin', url: 'edit.php?post_type=post&author=1' },
	states: [], statesHtml: null, excerpt: null,
	date: { status: 'Published', statusHtml: null, missed: false, time: '2020/02/01 at 10:00 am', timeHtml: null },
	actions: actionsOf( id ), actionsHtml: null, actionsVisible: false,
	coreActions: [ 'edit', 'trash' ],
	inline: { ...INLINE, post_title: 'Post ' + id, post_name: 'post-' + id, ...inline }, inlineHtml: null, cells: {}, terms: {},
	bubble: { kind: 'none', approvedLabel: 'No comments', pending: 0 },
	...over,
} );

/** What `inlineEdit.fields` says: every Quick Edit and Bulk Edit field of Posts on. */
export const FIELDS = {
	title: { quick: true, bulk: true }, slug: { quick: true, bulk: false }, date: { quick: false, bulk: false, months: [] },
	author: { quick: true, bulk: true, largeUserCount: false, choices: { quick: [ { value: '1', label: 'admin' }, { value: '2', label: 'editor' } ], bulk: [ { value: '-1', label: '— No Change —' }, { value: '1', label: 'admin' }, { value: '2', label: 'editor' } ] }, html: null },
	password: { quick: true, bulk: false }, private: { quick: true, bulk: false },
	taxonomies: [
		{ name: 'category', field: 'post_category[]', label: 'Categories', quick: true, bulk: true, tree: [ { id: 3, name: 'Alpha', children: [] }, { id: 4, name: 'Beta', children: [] } ], html: null, disabled: false },
	],
	flatTaxonomies: [],
	comments: { quick: true, bulk: true }, pings: { quick: true, bulk: true },
	statuses: { quick: [ { value: 'publish', label: 'Published' }, { value: 'private', label: 'Private' } ], bulk: [ { value: '-1', label: '— No Change —' }, { value: 'publish', label: 'Published' } ] },
	sticky: { quick: true, bulk: true },
	format: { quick: false, bulk: true, choices: [ { value: 'aside', label: 'Aside' } ] },
};

export const INLINE_EDIT = {
	quick: true, bulk: true,
	classes: { quick: [ 'inline-edit-row', 'inline-edit-row-post', 'quick-edit-row', 'quick-edit-row-post' ], bulk: [ 'inline-edit-row', 'bulk-edit-row' ] },
	hierarchicalTaxonomies: true,
	fields: FIELDS,
	customBoxes: { quick: [], bulk: [] },
	hidden: { post_view: 'list', screen: 'edit-post', post_author: null },
};

/** The page's data. `over` replaces any of its keys. */
export const postsData = ( over = {} ) => ( {
	query: { post_type: 'post', mode: 'list' },
	postType: { name: 'post', hierarchical: false, hierarchicalDisplay: false },
	error: null,
	title: 'Posts',
	headings: { views: 'Filter posts list', pagination: 'Posts list navigation', list: 'Posts list' },
	heading: { title: 'Posts', addNew: { path: 'post-new.php', label: 'Add Post' }, search: null },
	messages: [],
	columns: [ column( 'cb', '' ), column( 'title', 'Title', { primary: true } ), column( 'author', 'Author' ), column( 'comments', 'Comments' ), column( 'date', 'Date' ) ],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'posts' ],
	views: [], viewsHtml: null,
	bulkActions: [ { value: '-1', label: 'Bulk actions' }, { value: 'edit', label: 'Edit' }, { value: 'trash', label: 'Move to Trash' } ],
	search: null,
	pagination: { total: 3, totalText: '3 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	filters: null,
	items: [ row( 7 ), row( 8 ), row( 9 ) ],
	noItems: 'No posts found.',
	inlineEdit: INLINE_EDIT,
	screenOptions: null,
	lockedPostStatus: null,
	...over,
} );

/** What the page injects: no timers, the document shown, no frame. */
export const NO_TIMERS = { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} };

export const loadContracts = () => fillContracts( [ 'edit-posts', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav', 'inline-edit', 'terms-checklist', 'tags-suggest' ] );

/** Mounts the Posts page (`core/edit-posts`) with `data`; `provide` adds to what it injects. */
export async function mountPosts( data = postsData(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/edit-posts', data, page: { path: 'edit.php', title: 'Posts' } } ) }, {
		provide: { lockTimers: NO_TIMERS, documentShown: () => false, frameChannel: null, ...provide },
	} );
	await settle();
	return wrapper;
}
