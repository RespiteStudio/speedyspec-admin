/** @jest-environment jsdom */
// Quick Edit opened from plugin-rewritten row actions: inline-edit-post.js binds a click on
// #the-list delegated to `.editinline`, so markup a plugin printed that keeps the class opens
// Quick Edit for its row. The native rows do the same, unless the plugin's own handler prevented
// the click, and the focus goes back to that element when the form closes.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { settle } from './data.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const REQUEST = ( id, action ) => ( { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/' + action, body: [] } );
const ACTIONS = ( id ) => [
	{ action: 'edit', text: 'Edit', ariaLabel: 'Edit', classes: [ 'edit' ], request: null, url: 'post.php?post=' + id + '&action=edit', newTab: false },
	{ action: 'inline', text: 'Quick Edit', ariaLabel: 'Quick edit inline', classes: [ 'inline', 'hide-if-no-js' ], request: REQUEST( id, 'inline' ), url: null, newTab: false },
	{ action: 'trash', text: 'Trash', ariaLabel: 'Move to the Trash', classes: [ 'trash' ], request: REQUEST( id, 'trash' ), url: null, newTab: false },
];
// As the fixture's `quick_edit_rewrite` mode prints it: the Quick Edit entry replaced by the
// plugin's own button, which keeps `.editinline`. WordPress no longer names it a core action.
const REWRITTEN = '<span class="edit"><a href="post.php?post=7&amp;action=edit">Edit</a> | </span><span class="inline hide-if-no-js"><button type="button" class="button-link editinline detached-fixture-quick">Fixture Quick Edit</button> | </span><span class="trash"><a href="#" class="submitdelete">Trash</a></span>';
const INLINE = {
	post_title: 'Post 7', post_name: 'post-7', post_author: '1', comment_status: 'open', ping_status: 'open', _status: 'publish',
	jj: '01', mm: '02', aa: '2020', hh: '10', mn: '00', ss: '00', post_password: '', post_parent: null, page_template: 'default', menu_order: null,
	terms: {}, tags: {}, sticky: false, post_format: '',
};
const ROW = ( id ) => ( {
	id, classes: [ 'iedit', 'post-' + id ], level: 0, selectable: true,
	checkboxLabel: 'Select Post ' + id, lockedLabel: 'locked', rowHeaderLabel: 'Post ' + id, lock: null,
	title: { html: 'Post ' + id, editUrl: 'post.php?post=' + id + '&action=edit', pad: 0, parentText: null, childOf: null, noTitleExcerpt: null },
	states: [], statesHtml: null, excerpt: null,
	date: { status: 'Published', statusHtml: null, missed: false, time: '2020/02/01 at 10:00 am', timeHtml: null },
	actions: ACTIONS( id ), actionsHtml: REWRITTEN.replaceAll( 'post=7', 'post=' + id ), actionsVisible: false,
	coreActions: [ 'edit', 'trash' ],
	inline: { ...INLINE, post_title: 'Post ' + id }, inlineHtml: null, cells: {},
} );
const COLUMN = ( key, label, extra = {} ) => ( { key, label, labelHtml: null, primary: false, hidden: false, num: false, core: true, sortable: null, sorted: null, ...extra } );
const INLINE_EDIT = {
	quick: true, bulk: false,
	classes: { quick: [ 'inline-edit-row', 'quick-edit-row' ], bulk: [] },
	hierarchicalTaxonomies: false,
	fields: {
		title: { quick: true, bulk: false }, slug: { quick: true, bulk: false }, date: { quick: false, bulk: false, months: [] },
		author: { quick: false, bulk: false, largeUserCount: false, choices: { quick: [], bulk: [] }, html: null },
		password: { quick: false, bulk: false }, private: { quick: false, bulk: false },
		taxonomies: [], flatTaxonomies: [],
		comments: { quick: false, bulk: false }, pings: { quick: false, bulk: false },
		statuses: { quick: [ { value: 'publish', label: 'Published' } ], bulk: [] },
		sticky: { quick: false, bulk: false },
		format: { quick: false, bulk: false, choices: [] },
	},
	customBoxes: { quick: [], bulk: [] },
	hidden: { post_view: 'list', screen: 'edit-post', post_author: null },
};
const DATA = {
	query: { post_type: 'post', mode: 'list' },
	postType: { name: 'post', hierarchical: false, hierarchicalDisplay: false },
	error: null,
	title: 'Posts',
	headings: { views: 'Filter posts list', pagination: 'Posts list navigation', list: 'Posts list' },
	heading: { title: 'Posts', addNew: null, search: null },
	messages: [],
	columns: [ COLUMN( 'cb', '' ), COLUMN( 'title', 'Title', { primary: true } ), COLUMN( 'date', 'Date' ) ],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'posts' ],
	views: [], viewsHtml: null,
	bulkActions: [],
	search: null,
	pagination: { total: 2, totalText: '2 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	filters: null,
	items: [ ROW( 7 ), ROW( 8 ) ],
	noItems: 'No posts found.',
	inlineEdit: INLINE_EDIT,
	screenOptions: null,
	lockedPostStatus: null,
};
const NO_TIMERS = { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} };

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'edit-posts', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav', 'inline-edit', 'terms-checklist', 'tags-suggest' ] );
} );

afterEach( () => resetContracts() );

async function postsPage() {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/edit-posts', data: DATA, page: { path: 'edit.php', title: 'Posts' } } ) }, {
		provide: { lockTimers: NO_TIMERS, documentShown: () => false, frameChannel: null },
	} );
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
	expect( wrapper.find( '#post-7 .detached-fixture-quick' ).exists() ).toBe( true );
	return wrapper;
}

test( 'a click on .editinline in plugin row actions opens that row\'s Quick Edit', async () => {
	const wrapper = await postsPage();
	await wrapper.find( '#post-8 .detached-fixture-quick' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-8' ).exists() ).toBe( true );
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );
	expect( wrapper.find( '#post-8 .detached-fixture-quick' ).attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( api.calls ).toEqual( [] );
} );

test( 'a defaultPrevented click does not', async () => {
	const wrapper = await postsPage();
	const button = wrapper.find( '#post-7 .detached-fixture-quick' );
	// The plugin's own handler on its button, as `return false;` would.
	button.element.addEventListener( 'click', ( event ) => event.preventDefault() );
	await button.trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );
} );

test( 'focus returns to the plugin element on Cancel', async () => {
	const wrapper = await postsPage();
	await wrapper.find( '#post-7 .detached-fixture-quick' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( true );
	await wrapper.find( '#edit-7 .cancel' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7' ).exists() ).toBe( false );
	expect( document.activeElement ).toBe( wrapper.find( '#post-7 .detached-fixture-quick' ).element );
	expect( wrapper.find( '#post-7 .detached-fixture-quick' ).attributes( 'aria-expanded' ) ).toBe( 'false' );
} );
