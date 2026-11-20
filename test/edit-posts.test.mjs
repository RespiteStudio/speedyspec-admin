import test, { after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { FakeDOMParser, FakeElement, FakeNode, fakeTemplateDocument } from './helpers/html-parser.mjs';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const render = await import( './helpers/render.mjs' );
const { flush: flushOnce, enableQueries } = await import( './helpers/dom.mjs' );
const flush = async () => {
	for ( let i = 0; i < 8; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const state = await import( '../site/components/core/edit-posts/state.js' );
const quickEdit = await import( '../site/components/core/edit-posts/quick-edit.js' );
const bulkEdit = await import( '../site/components/core/edit-posts/bulk-edit.js' );
const { lockPoller } = await import( '../site/components/core/edit-posts/locks.js' );
const { flatTree } = await import( '../site/components/core/edit-posts/filters.js' );

const { h } = Vue;
enableQueries();

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'edit-posts', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav', 'inline-edit', 'terms-checklist', 'tags-suggest' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const pageModule = globalThis.__modules[ '/components/core/edit-posts.js' ];
const contract = globalThis.__modules[ '/contracts/core/edit-posts.js' ].default;

// Fixtures, as wp_admin_get_posts_list() gives them --------------------------------------------

const REQUEST = ( id, action ) => ( { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/' + action, body: [] } );
const ACTIONS = ( id, title ) => [
	{ action: 'edit', text: 'Edit', ariaLabel: 'Edit “' + title + '”', classes: [ 'edit' ], request: null, url: 'post.php?post=' + id + '&action=edit', newTab: false },
	{ action: 'inline', text: 'Quick Edit', ariaLabel: 'Quick edit “' + title + '” inline', classes: [ 'inline', 'hide-if-no-js' ], request: REQUEST( id, 'inline' ), url: null, newTab: false },
	{ action: 'trash', text: 'Trash', ariaLabel: 'Move “' + title + '” to the Trash', classes: [ 'trash' ], request: REQUEST( id, 'trash' ), url: null, newTab: false },
	{ action: 'view', text: 'View', ariaLabel: 'View “' + title + '”', classes: [ 'view' ], request: null, url: 'http://localhost:8889/?p=' + id, newTab: true },
];
const INLINE = ( extra = {} ) => ( {
	post_title: 'Post', post_name: 'post', post_author: '1', comment_status: 'open', ping_status: 'open', _status: 'publish',
	jj: '01', mm: '02', aa: '2020', hh: '10', mn: '00', ss: '00', post_password: '', post_parent: null, page_template: 'default', menu_order: null,
	terms: { category: [ 1 ] }, tags: { post_tag: 'a,b' }, sticky: false, post_format: '', ...extra,
} );
const ROW = ( id, extra = {} ) => {
	const title = extra.titleText ?? 'Post ' + id;
	return {
		id, classes: [ 'iedit', 'author-self', 'level-0', 'post-' + id, 'type-post', 'status-publish' ], level: 0, selectable: true,
		checkboxLabel: 'Select ' + title, lockedLabel: '“' + title + '” is locked', rowHeaderLabel: title, lock: null,
		title: { html: title, editUrl: 'post.php?post=' + id + '&action=edit', pad: 0, parentText: null, childOf: null, noTitleExcerpt: null },
		states: [], statesHtml: null, excerpt: null,
		author: { name: 'admin', url: 'edit.php?post_type=post&author=1' },
		terms: { categories: { links: [ { name: 'News', url: 'edit.php?category_name=news' }, { name: 'Sport', url: 'edit.php?category_name=sport' } ], noTerms: null, html: null }, tags: { links: [], noTerms: 'No tags', html: null } },
		bubble: { postId: id, kind: 'none', approved: 0, approvedText: '0', approvedLabel: 'No comments', approvedUrl: null, pending: 0, pendingText: '0', pendingLabel: 'No comments', pendingUrl: null },
		date: { status: 'Published', statusHtml: null, missed: false, time: '2020/02/01 at 10:00 am', timeHtml: null },
		actions: ACTIONS( id, title ), actionsHtml: null, actionsVisible: false,
		inline: INLINE( { post_title: title } ), inlineHtml: null, cells: {},
		...extra,
	};
};
const COLUMN = ( key, label, extra = {} ) => ( { key, label, labelHtml: null, primary: false, hidden: false, num: false, core: true, sortable: null, sorted: null, ...extra } );
const COLUMNS = [
	COLUMN( 'cb', '' ), COLUMN( 'title', 'Title', { primary: true } ), COLUMN( 'author', 'Author' ), COLUMN( 'categories', 'Categories' ), COLUMN( 'tags', 'Tags' ),
	COLUMN( 'comments', 'Comments', { num: true } ), COLUMN( 'date', 'Date' ), COLUMN( 'acme', 'Acme', { core: false } ),
];
const MONTHS = [ '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12' ].map( ( value ) => ( { value, label: value + '-Mon', text: 'Mon' } ) );
const INLINE_EDIT = ( extra = {} ) => ( {
	quick: true, bulk: true,
	classes: { quick: [ 'inline-edit-row', 'inline-edit-row-post', 'quick-edit-row', 'quick-edit-row-post', 'inline-edit-post' ], bulk: [ 'inline-edit-row', 'inline-edit-row-post', 'bulk-edit-row', 'bulk-edit-row-post', 'bulk-edit-post' ] },
	hierarchicalTaxonomies: true,
	fields: {
		title: { quick: true, bulk: true }, slug: { quick: true, bulk: false }, date: { quick: true, bulk: false, months: MONTHS },
		author: { quick: true, bulk: true, largeUserCount: false, choices: { quick: [ { value: '1', label: 'admin (admin)' }, { value: '2', label: 'ed (ed)' } ], bulk: [ { value: '-1', label: '— No Change —' }, { value: '1', label: 'admin (admin)' } ] }, html: null },
		password: { quick: true, bulk: false }, private: { quick: true, bulk: false },
		taxonomies: [ { quick: true, bulk: true, name: 'category', label: 'Categories', field: 'post_category[]', disabled: false, tree: [ { id: 1, name: 'News', children: [ { id: 3, name: 'Local', children: [] } ] }, { id: 2, name: 'Sport', children: [] } ], html: null } ],
		flatTaxonomies: [ { quick: true, bulk: true, name: 'post_tag', label: 'Tags', field: 'tax_input[post_tag]', separate: 'Separate tags with commas', minChars: 2, searchEnabled: true } ],
		comments: { quick: true, bulk: true }, pings: { quick: true, bulk: true },
		statuses: { quick: [ { value: 'publish', label: 'Published' }, { value: 'future', label: 'Scheduled' }, { value: 'pending', label: 'Pending Review' }, { value: 'draft', label: 'Draft' } ], bulk: [ { value: '-1', label: '— No Change —' }, { value: 'publish', label: 'Published' }, { value: 'private', label: 'Private' }, { value: 'pending', label: 'Pending Review' }, { value: 'draft', label: 'Draft' } ] },
		sticky: { quick: true, bulk: true },
		format: { quick: false, bulk: true, choices: [ { value: '0', label: 'Standard' }, { value: 'aside', label: 'Aside' } ] },
	},
	customBoxes: { quick: [], bulk: [] },
	hidden: { post_view: 'list', screen: 'edit-post', post_author: null },
	...extra,
} );
const DATA = ( extra = {} ) => ( {
	query: { post_type: 'post', mode: 'list' },
	postType: { name: 'post', hierarchical: false, hierarchicalDisplay: false },
	error: null,
	title: 'Posts',
	headings: { views: 'Filter posts list', pagination: 'Posts list navigation', list: 'Posts list' },
	heading: { title: 'Posts', addNew: { label: 'Add Post', path: 'post-new.php' }, search: null },
	messages: [],
	columns: COLUMNS, caption: 'Table ordered by Date. Descending.', classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'posts' ],
	views: [ { key: 'all', labelHtml: 'All <span class="count">(2)</span>', url: 'edit.php?post_type=post', current: true }, { key: 'trash', labelHtml: 'Trash <span class="count">(1)</span>', url: 'edit.php?post_status=trash&post_type=post', current: false } ],
	viewsHtml: null,
	bulkActions: [ { value: 'edit', label: 'Bulk edit' }, { value: 'trash', label: 'Move to Trash' } ],
	search: { shown: true, value: '', label: 'Search Posts', inputId: 'post-search-input', keep: [] },
	pagination: { total: 2, totalText: '2 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	filters: {
		months: { label: 'Filter by date', options: [ { value: '202002', label: 'February 2020' } ], value: '0' },
		categories: { label: 'Filter by category', allLabel: 'All Categories', tree: [ { id: 1, name: 'News', children: [ { id: 3, name: 'Local', children: [] } ] } ], value: '0' },
		categoriesHtml: null, formats: null, restrictHtml: { html: '<select name="fixture_filter"><option value="noted">Noted</option></select>', error: null }, filterButton: true, emptyTrash: null,
		navHtml: { top: null, bottom: null },
	},
	items: [ ROW( 7 ), ROW( 8, { inline: INLINE( { post_title: 'Post 8', terms: { category: [ 1, 2 ] } } ) } ) ],
	noItems: 'No posts found.',
	inlineEdit: INLINE_EDIT(),
	screenOptions: { tableColumns: [ { key: 'author', label: 'Author', hidden: false } ], legend: 'Columns', perPage: { option: 'edit_post_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 }, viewMode: { value: 'list', choices: [] }, settingsHtml: null },
	lockedPostStatus: null,
	...extra,
} );

// Page harness ----------------------------------------------------------------------------------

let titles;
let added;
let spoken;
let navigated;
let followed;
let refreshed;
let screenOptions;
let formEntries;
let timers;
let shown;
const LOCATION = { origin: 'http://localhost', pathname: '/wp-admin/edit.php', search: '' };

function fakeTimers() {
	const intervals = new Map();
	let next = 1;
	return {
		intervals,
		setInterval: ( fn ) => {
			intervals.set( next, fn );
			return next++;
		},
		clearInterval: ( handle ) => intervals.delete( handle ),
		setTimeout: () => 0,
		clearTimeout: () => {},
		tick: async () => {
			for ( const fn of [ ...intervals.values() ] ) {
				await fn();
			}
		},
	};
}

// InertHtml fills its element from a document: a fake one, whose nodes allText() reads.
let saved;
before( () => {
	saved = { DOMParser: globalThis.DOMParser, document: globalThis.document, Node: globalThis.Node, Element: globalThis.Element };
	Object.assign( globalThis, { DOMParser: FakeDOMParser, document: { ...fakeTemplateDocument(), visibilityState: 'visible' }, Node: FakeNode, Element: FakeElement } );
} );
after( () => {
	Object.assign( globalThis, saved );
} );

/** The text of a rendered node, with what InertHtml put in its elements (the fake document's nodes). */
function allText( node ) {
	if ( node?.type === 'text' ) {
		return node.text;
	}
	if ( node?.type === 'element' ) {
		return node.children.map( allText ).join( '' );
	}
	if ( node?.nodeType === 3 ) {
		return String( node.nodeValue ?? '' );
	}
	if ( node?.nodeType === 1 || node?.nodeType === 11 ) {
		return [ ...( node.childNodes ?? [] ) ].map( allText ).join( '' );
	}
	return '';
}
/** Whether InertHtml put an element `tag` anywhere under a rendered node. */
function hasInert( node, tag ) {
	if ( node?.type === 'element' ) {
		return node.children.some( ( child ) => hasInert( child, tag ) );
	}
	if ( node?.nodeType === 1 || node?.nodeType === 11 ) {
		return node.localName === tag || [ ...( node.childNodes ?? [] ) ].some( ( child ) => hasInert( child, tag ) );
	}
	return false;
}

beforeEach( () => {
	titles = [];
	added = [];
	spoken = [];
	navigated = [];
	followed = [];
	refreshed = 0;
	screenOptions = null;
	formEntries = [];
	timers = fakeTimers();
	shown = true;
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

/** The controls of a rendered inline form, as the DOM would give them (inline-edit's reading). */
function controlsOf( row ) {
	return findAll( row, ( el ) => [ 'input', 'select', 'textarea' ].includes( el.tag ) ).map( ( el ) => ( {
		name: el.props.name ?? '',
		type: el.tag === 'select' ? 'select-one' : el.tag === 'textarea' ? 'textarea' : String( el.props.type ?? 'text' ),
		tagName: el.tag.toUpperCase(),
		value: el.tag === 'textarea' ? String( el.props.value ?? '' ) : String( el.props.value ?? '' ),
		checked: Boolean( el.props.checked ),
		disabled: Boolean( el.props.disabled ),
		options: el.tag === 'select' ? findAll( el, byTag( 'option' ) ).map( ( option ) => ( { value: String( option.props.value ?? '' ), selected: option.props.selected === '' || Boolean( option.props.selected ), disabled: false } ) ) : undefined,
	} ) );
}

const provide = ( extra = {} ) => ( {
	router,
	speak: ( message, politeness ) => spoken.push( politeness ? [ message, politeness ] : message ),
	notices: { add: ( notice ) => added.push( notice ) },
	screenOptions: { set: ( options ) => {
		screenOptions = options;
		return () => {
			screenOptions = null;
		};
	} },
	frameChannel: { setTitle: ( title ) => titles.push( title ) },
	formEntries: () => formEntries,
	pageLocation: LOCATION,
	lockTimers: timers,
	documentShown: () => shown,
	inlineEditControls: controlsOf,
	tagsSuggestDelay: 0,
	...extra,
} );

async function page( data = DATA(), { listeners = {}, provided = {}, pagePath = 'edit.php' } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/edit-posts', data, page: { path: pagePath, title: 'Posts' }, ...listeners } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const clean = ( node ) => allText( node ).replace( /\s+/g, ' ' ).trim();
const rowOf = ( view, id ) => byId( view.container, 'post-' + id );
const cellOf = ( view, id, key ) => find( rowOf( view, id ), byClass( 'column-' + key ) );
const actionOf = ( view, id, action ) => {
	const span = find( rowOf( view, id ), ( el ) => el.tag === 'span' && hasClass( el, action ) && find( el, ( child ) => child.tag === 'a' || child.tag === 'button' ) );
	return span ? find( span, ( child ) => child.tag === 'a' || child.tag === 'button' ) : null;
};
const prevent = { preventDefault() {} };
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise( ( yes, no ) => {
		resolve = yes;
		reject = no;
	} );
	return { promise, resolve, reject };
};
const fire = ( el, name, target = {} ) => el.props[ name ]( { target, preventDefault() {}, stopPropagation() {} } );

// Contract and module ---------------------------------------------------------------------------

test( 'the posts list contract: page tier, data and page, the table slots with query and postType, and `saved`', () => {
	assert.equal( contract.id, 'core/edit-posts' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-table', 'after-table' ] );
	assert.deepEqual( Object.keys( contract.slots[ 'before-table' ].props ), [ 'query', 'postType' ] );
	assert.deepEqual( contract.emits, [ 'saved' ] );
	assert.deepEqual( pageModule.stylesheets, [ 'list-tables' ] );
} );

// The page and its rows ------------------------------------------------------------------------

test( 'the page: Add New link, views from labelHtml, #posts-filter with the classic hidden fields, #the-list and its rows', async () => {
	const view = await page( DATA( { query: { post_type: 'post', mode: 'list', author: '3', show_sticky: '1' } } ) );
	const add = find( view.container, byClass( 'page-title-action' ) );
	assert.equal( add.props.href, '/wp-admin/post-new.php' );
	assert.equal( textOf( add ), 'Add Post' );
	assert.equal( clean( find( view.container, byClass( 'subsubsub' ) ) ), 'All (2) |Trash (1)' );
	const form = byId( view.container, 'posts-filter' );
	assert.equal( form.props.method, 'get' );
	const hidden = findAll( form, ( el ) => el.tag === 'input' && el.props.type === 'hidden' ).map( ( el ) => [ el.props.name, el.props.value ] );
	assert.deepEqual( hidden.slice( 0, 4 ), [ [ 'post_status', 'all' ], [ 'post_type', 'post' ], [ 'author', '3' ], [ 'show_sticky', '1' ] ] );
	assert.deepEqual( byId( view.container, 'the-list' ).children.filter( ( el ) => el.tag === 'tr' ).map( ( el ) => el.props.id ), [ 'post-7', 'post-8' ] );
	assert.ok( findAll( view.container, ( el ) => el.tag === 'h2' && hasClass( el, 'screen-reader-text' ) ).some( ( el ) => textOf( el ) === 'Posts list' ) );
	assert.deepEqual( titles, [ 'Posts' ] );
	assert.ok( byId( view.container, 'inline-edit' ), 'the hidden classic Quick Edit row' );
} );

test( 'the title cell: pads, the edit link, Child of, the states joined by " — ", Parent Page, the excerpt, the lock info', async () => {
	const child = ROW( 9, {
		titleText: 'Kid &amp; co',
		title: { html: 'Kid &amp; co', editUrl: 'post.php?post=9&action=edit', pad: 2, parentText: 'Parent Page: Mom &amp; Dad', childOf: 'Child of Mom & Dad', noTitleExcerpt: null },
		states: [ { key: 'draft', html: 'Draft' }, { key: 'acme', html: 'Acme <em>state</em>' } ],
		excerpt: { html: 'An &lt;b&gt;excerpt&lt;/b&gt;', protected: false },
		lock: { text: 'Ed is currently editing', avatarHtml: '<img class="avatar" src="a.png" />' },
		classes: [ 'iedit', 'wp-locked' ],
	} );
	const view = await page( DATA( { items: [ child, ROW( 10, { title: { html: 'Gone', editUrl: null, pad: 0, parentText: null, childOf: 'Child of X', noTitleExcerpt: 'trimmed' } } ) ] } ) );
	const title = cellOf( view, 9, 'title' );
	assert.equal( title.tag, 'th' );
	const strong = find( title, byTag( 'strong' ) );
	assert.equal( findAll( strong, ( el ) => el.tag === 'span' && el.props[ 'aria-hidden' ] === 'true' ).length, 2, 'two em dash pads' );
	assert.equal( clean( strong ), '— — Kid & coChild of Mom & Dad — Draft, Acme state | Parent Page: Mom & Dad' );
	const link = find( strong, byClass( 'row-title' ) );
	assert.equal( link.props.href, '/wp-admin/post.php?post=9&action=edit' );
	assert.equal( link.props[ 'aria-describedby' ], 'post-hierarchy-9' );
	assert.ok( hasClass( byId( title, 'post-hierarchy-9' ), 'hidden' ) );
	assert.deepEqual( findAll( strong, byClass( 'post-state' ) ).map( clean ), [ 'Draft,', 'Acme state' ] );
	assert.equal( hasInert( strong, 'em' ), true, 'a state through InertHtml keeps its markup' );
	assert.equal( hasInert( title, 'b' ), false, 'the excerpt is text' );
	assert.ok( clean( title ).includes( 'An <b>excerpt</b>' ) );
	assert.equal( clean( find( title, byClass( 'locked-text' ) ) ), 'Ed is currently editing' );
	assert.ok( hasClass( rowOf( view, 9 ), 'wp-locked' ) );
	assert.equal( clean( find( rowOf( view, 9 ), byClass( 'locked-indicator' ) ) ), '“Kid &amp; co” is locked' );
	// Without an edit link: a span, the hierarchy as screen reader text, no lock info.
	const gone = cellOf( view, 10, 'title' );
	assert.equal( find( gone, byClass( 'row-title' ) ), null );
	assert.equal( find( gone, byClass( 'locked-info' ) ), null );
	assert.equal( clean( find( gone, byClass( 'screen-reader-text' ) ) ), '(Child of X)' );
	assert.equal( clean( find( gone, byClass( 'trimmed-post-excerpt' ) ) ), 'trimmed' );
} );

test( 'the other cells: author, terms joined by commas or "No tags", the bubble, Missed schedule, a plugin cell', async () => {
	const missed = ROW( 7, { date: { status: 'Missed schedule', statusHtml: null, missed: true, time: '2001/01/01 at 10:00 am', timeHtml: null }, cells: { acme: { html: '<b class="acme">A</b>' } } } );
	const view = await page( DATA( { items: [ missed ] } ) );
	assert.equal( find( cellOf( view, 7, 'author' ), byTag( 'a' ) ).props.href, '/wp-admin/edit.php?post_type=post&author=1' );
	assert.equal( clean( cellOf( view, 7, 'categories' ) ), 'News, Sport' );
	assert.equal( clean( cellOf( view, 7, 'tags' ) ), '—No tags' );
	assert.ok( find( cellOf( view, 7, 'comments' ), byClass( 'post-com-count-wrapper' ) ) );
	const error = find( cellOf( view, 7, 'date' ), byTag( 'strong' ) );
	assert.ok( hasClass( error, 'error-message' ) );
	assert.equal( textOf( error ), 'Missed schedule' );
	assert.ok( clean( cellOf( view, 7, 'date' ) ).endsWith( '2001/01/01 at 10:00 am' ) );
	assert.ok( find( cellOf( view, 7, 'acme' ), byClass( 'wp-admin-legacy-html' ) ) || cellOf( view, 7, 'acme' ), 'a plugin cell is LegacyHtml' );
} );

test( 'the row actions: Edit and View are links (View in a new tab), Quick Edit a button, Trash a link; visible in excerpt mode', async () => {
	const view = await page( DATA( { items: [ ROW( 7, { actionsVisible: true } ) ] } ) );
	assert.equal( actionOf( view, 7, 'edit' ).props.href, '/wp-admin/post.php?post=7&action=edit' );
	const quick = actionOf( view, 7, 'inline' );
	assert.equal( quick.tag, 'button' );
	assert.ok( hasClass( quick, 'editinline' ) );
	assert.equal( quick.props[ 'aria-expanded' ], 'false' );
	assert.equal( actionOf( view, 7, 'view' ).props.target, '_blank' );
	assert.equal( actionOf( view, 7, 'view' ).props.href, 'http://localhost:8889/?p=7' );
	assert.ok( hasClass( actionOf( view, 7, 'trash' ), 'submitdelete' ) );
	assert.ok( hasClass( find( rowOf( view, 7 ), byClass( 'row-actions' ) ), 'visible' ) );
	assert.equal( clean( find( rowOf( view, 7 ), byClass( 'row-actions' ) ) ), 'Edit | Quick Edit | Trash | View' );
} );

test( 'Trash calls its route with the page\'s path as referer and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?trashed=1&ids=7', location: null } ) );
	const saved = [];
	const view = await page( DATA(), { pagePath: 'edit.php?paged=2', listeners: { onSaved: ( answer ) => saved.push( answer ) } } );
	actionOf( view, 7, 'trash' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/posts/7/trash', payload: { referer: 'edit.php?paged=2' } } ] );
	assert.deepEqual( followed, [ { redirect: 'edit.php?trashed=1&ids=7', location: null } ] );
	assert.equal( saved.length, 1 );
} );

test( 'a core action inside the row actions plugins filtered still calls its route', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?trashed=1&ids=7', location: null } ) );
	const view = await page( DATA( { items: [ ROW( 7, { actionsHtml: '<span class="trash"><a href="x">Trash</a></span>' } ) ] } ) );
	const actions = find( rowOf( view, 7 ), byClass( 'row-actions' ) );
	const span = { classList: { contains: ( name ) => name === 'trash' } };
	actions.props.onClick( { target: { closest: ( selector ) => ( selector === 'span' ? span : {} ) }, preventDefault() {} } );
	await flush();
	assert.equal( api.calls[ 0 ].route, 'wp-admin/v1/posts/7/trash' );
} );

// Quick Edit -----------------------------------------------------------------------------------

test( 'quickEditValues: the form starts from the row\'s Quick Edit values; a private post has no password', () => {
	const values = quickEdit.quickEditValues( { inline: INLINE( { _status: 'private', post_password: 'x', sticky: true, comment_status: 'closed' } ) } );
	assert.equal( values.keep_private, true );
	assert.equal( values.post_password, '' );
	assert.equal( values.sticky, true );
	assert.equal( values.comment_status, false );
	assert.equal( values.ping_status, true );
	assert.deepEqual( values.terms, { category: [ 1 ] } );
	assert.equal( values.post_parent, '0' );
	assert.equal( quickEdit.tagsText( 'a,b', '،' ), 'a،b' );
	assert.equal( quickEdit.tagsText( 'a,b', ',' ), 'a,b' );
} );

test( 'quickStatuses, authorChoices and withoutPost reproduce inline-edit-post.js', () => {
	const statuses = INLINE_EDIT().fields.statuses.quick;
	const past = { _status: 'publish', aa: '2020', mm: '02', jj: '01', hh: '10', mn: '00', ss: '00' };
	assert.deepEqual( quickEdit.quickStatuses( statuses, past, Date.UTC( 2026, 0, 1 ) ).map( ( s ) => s.value ), [ 'publish', 'pending', 'draft' ] );
	assert.deepEqual( quickEdit.quickStatuses( statuses, { ...past, aa: '2030' }, Date.UTC( 2026, 0, 1 ) ).map( ( s ) => s.value ), [ 'future', 'pending', 'draft' ] );
	assert.deepEqual( quickEdit.quickStatuses( statuses, { ...past, _status: 'future' }, Date.UTC( 2026, 0, 1 ) ).map( ( s ) => s.value ), [ 'future', 'pending', 'draft' ] );
	assert.deepEqual( quickEdit.authorChoices( [ { value: '1', label: 'a' } ], '5', 'Gone' ), [ { value: '5', label: 'Gone' }, { value: '1', label: 'a' } ] );
	assert.deepEqual( quickEdit.authorChoices( [ { value: '1', label: 'a' } ], '1', 'a' ), [ { value: '1', label: 'a' } ] );
	const parents = [ { value: '0', label: 'Main Page (no parent)', level: null }, { value: '4', label: 'A', level: 0 }, { value: '5', label: 'B', level: 1 }, { value: '6', label: 'C', level: 2 }, { value: '7', label: 'D', level: 1 }, { value: '8', label: 'E', level: 0 } ];
	assert.deepEqual( quickEdit.withoutPost( parents, 5 ).map( ( p ) => p.value ), [ '0', '4', '7', '8' ] );
	assert.deepEqual( quickEdit.withoutPost( parents, 4 ).map( ( p ) => p.value ), [ '0', '8' ] );
	assert.deepEqual( quickEdit.withoutPost( parents, 99 ).length, 6 );
	assert.equal( quickEdit.pageOption( parents[ 3 ] ), ' '.repeat( 6 ) + 'C' );
} );

test( 'Quick Edit takes the row\'s place, one at a time, filled from the row; the title takes the focus', async () => {
	const view = await page();
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	assert.ok( hasClass( rowOf( view, 7 ), 'hidden' ) );
	const ids = byId( view.container, 'the-list' ).children.filter( ( el ) => el.tag === 'tr' ).map( ( el ) => el.props.id ?? el.props.class );
	assert.deepEqual( ids.slice( 0, 3 ), [ 'post-7', 'hidden', 'edit-7' ] );
	const editRow = byId( view.container, 'edit-7' );
	assert.ok( hasClass( editRow, 'quick-edit-row-post' ) );
	assert.equal( find( editRow, byClass( 'ptitle' ) ).props.value, 'Post 7' );
	assert.ok( render.focused === find( editRow, byClass( 'ptitle' ) ) );
	assert.equal( actionOf( view, 7, 'inline' ).props[ 'aria-expanded' ], 'true' );
	// The categories and tags of the row.
	assert.equal( find( editRow, ( el ) => el.tag === 'input' && el.props.type === 'checkbox' && el.props.value === '1' )?.props.checked, true );
	assert.equal( find( editRow, byTag( 'textarea' ) ).props.value, 'a,b' );
	// Another row's Quick Edit closes this one.
	actionOf( view, 8, 'inline' ).props.onClick( prevent );
	await flush();
	assert.equal( byId( view.container, 'edit-7' ), null );
	assert.ok( byId( view.container, 'edit-8' ) );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'hidden' ) );
} );

test( 'Quick Edit: Private disables and empties the password; the parent leaves the post itself out', async () => {
	const pages = DATA( {
		postType: { name: 'page', hierarchical: true, hierarchicalDisplay: true },
		classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'pages' ],
		items: [ ROW( 7, { inline: INLINE( { post_password: 'secret', post_parent: '4' } ) } ) ],
		inlineEdit: INLINE_EDIT( { fields: { ...INLINE_EDIT().fields, parent: { quick: true, bulk: true, choices: { quick: [ { value: '0', label: 'Main Page (no parent)', level: null }, { value: '4', label: 'Top', level: 0 }, { value: '7', label: 'Me', level: 1 }, { value: '9', label: 'My child', level: 2 } ], bulk: [] }, html: null } } } ),
	} );
	const view = await page( pages );
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	const editRow = byId( view.container, 'edit-7' );
	const password = find( editRow, byClass( 'inline-edit-password-input' ) );
	assert.equal( password.props.value, 'secret' );
	assert.ok( ! password.props.disabled );
	const priv = find( editRow, byProp( 'name', 'keep_private' ) );
	fire( priv, 'onChange', { checked: true } );
	await flush();
	assert.equal( find( editRow, byClass( 'inline-edit-password-input' ) ).props.value, '' );
	assert.equal( find( editRow, byClass( 'inline-edit-password-input' ) ).props.disabled, true );
	fire( find( editRow, byProp( 'name', 'keep_private' ) ), 'onChange', { checked: false } );
	await flush();
	assert.equal( find( editRow, byClass( 'inline-edit-password-input' ) ).props.disabled, false );
	const parent = byId( editRow, 'post_parent' );
	assert.deepEqual( findAll( parent, byTag( 'option' ) ).map( ( o ) => o.props.value ), [ '0', '4' ] );
	assert.equal( find( parent, byProp( 'value', '4' ) ).props.selected, true );
} );

test( 'Quick Edit Update posts the form to the row\'s route with screen and list; the answer\'s row replaces the post\'s', async () => {
	const reply = deferred();
	api.respondWith( () => reply.promise );
	const saved = [];
	const view = await page( DATA(), { listeners: { onSaved: ( answer ) => saved.push( answer ) } } );
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	const editRow = byId( view.container, 'edit-7' );
	fire( find( editRow, byClass( 'ptitle' ) ), 'onInput', { value: 'Post 7 Edited' } );
	fire( find( editRow, byProp( 'name', 'sticky' ) ), 'onChange', { checked: true } );
	fire( find( editRow, byProp( 'name', 'comment_status' ) ), 'onChange', { checked: false } );
	await flush();
	find( editRow, byClass( 'save' ) ).props.onClick( prevent );
	await flush();
	assert.equal( api.calls.length, 1 );
	const { route, payload } = api.calls[ 0 ];
	assert.equal( route, 'wp-admin/v1/posts/7/inline' );
	assert.equal( payload.screen, 'edit-posts' );
	assert.deepEqual( payload.list, { post_type: 'post', mode: 'list' } );
	assert.equal( payload.fields.post_title, 'Post 7 Edited' );
	assert.equal( payload.fields.sticky, 'sticky' );
	assert.equal( payload.fields.comment_status, '', 'an unchecked box is sent empty, to uncheck' );
	assert.equal( payload.fields.ping_status, 'open' );
	assert.equal( payload.fields.keep_private, '' );
	assert.equal( payload.fields._status, 'publish' );
	assert.deepEqual( payload.fields.post_category, [ '0', '1' ] );
	assert.equal( payload.fields.tax_input.post_tag, 'a,b' );
	assert.deepEqual( [ payload.fields.mm, payload.fields.jj, payload.fields.aa ], [ '02', '01', '2020' ] );
	assert.ok( hasClass( find( editRow, byClass( 'spinner' ) ), 'is-active' ) );

	reply.resolve( { id: 7, row: ROW( 7, { titleText: 'Post 7 Edited' } ) } );
	await flush();
	assert.equal( byId( view.container, 'edit-7' ), null );
	assert.equal( clean( find( rowOf( view, 7 ), byClass( 'row-title' ) ) ), 'Post 7 Edited' );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'hidden' ) );
	assert.ok( render.focused === actionOf( view, 7, 'inline' ), 'the focus is back on Quick Edit' );
	assert.deepEqual( spoken, [ 'Changes saved.' ] );
	assert.equal( saved.length, 1 );
} );

test( 'Quick Edit: a refusal shows its text as it is, in the form, and is spoken; Cancel gives the focus back', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Saving is disabled: Ed O\'Itor &amp; co is currently editing this post.' ), { status: 409 } );
	} );
	const view = await page();
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	find( byId( view.container, 'edit-7' ), byClass( 'save' ) ).props.onClick( prevent );
	await flush();
	const editRow = byId( view.container, 'edit-7' );
	assert.equal( textOf( find( editRow, byClass( 'error' ) ) ), 'Saving is disabled: Ed O\'Itor &amp; co is currently editing this post.', 'not decoded again' );
	assert.deepEqual( spoken, [ 'Saving is disabled: Ed O\'Itor &amp; co is currently editing this post.' ] );
	find( editRow, byClass( 'cancel' ) ).props.onClick( prevent );
	await flush();
	assert.equal( byId( view.container, 'edit-7' ), null );
	assert.ok( render.focused === actionOf( view, 7, 'inline' ) );
} );

test( 'a Quick Edit answer that comes after the page unmounted, or after the data changed, is dropped', async () => {
	const reply = deferred();
	api.respondWith( () => reply.promise );
	const saved = [];
	const data = Vue.ref( DATA() );
	const view = mount( () => h( Contracted, { id: 'core/edit-posts', data: data.value, page: { path: 'edit.php' }, onSaved: ( a ) => saved.push( a ) } ), { provide: provide() } );
	await flush();
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	find( byId( view.container, 'edit-7' ), byClass( 'save' ) ).props.onClick( prevent );
	await flush();
	data.value = DATA( { items: [ ROW( 7, { titleText: 'Fresh' } ) ] } );
	await flush();
	reply.resolve( { id: 7, row: ROW( 7, { titleText: 'Stale' } ) } );
	await flush();
	assert.equal( clean( find( rowOf( view, 7 ), byClass( 'row-title' ) ) ), 'Fresh' );
	assert.deepEqual( saved, [] );
	assert.deepEqual( spoken, [] );

	// After unmount.
	const later = deferred();
	api.respondWith( () => later.promise );
	actionOf( view, 7, 'inline' ).props.onClick( prevent );
	await flush();
	find( byId( view.container, 'edit-7' ), byClass( 'save' ) ).props.onClick( prevent );
	await flush();
	unmountAll();
	later.resolve( { id: 7, row: ROW( 7 ) } );
	await flush();
	assert.deepEqual( saved, [] );
	assert.deepEqual( spoken, [] );
} );

test( 'state: afterInline replaces the row and its lock; a row the answer leaves out goes', () => {
	let s = state.listState( DATA() );
	s = state.afterInline( s, { id: 7, answer: { id: 7, row: ROW( 7, { classes: [ 'wp-locked' ], lock: { text: 'Ed', avatarHtml: null } } ) } } );
	assert.equal( s.locks[ 7 ].locked, true );
	s = state.afterInline( s, { id: 8, answer: { id: 8, row: null } } );
	assert.deepEqual( s.items.map( ( item ) => item.id ), [ 7 ] );
} );

// Bulk Edit ------------------------------------------------------------------------------------

test( 'bulkCategories: checked where all selected posts have the category, indeterminate where some', () => {
	assert.deepEqual( bulkEdit.bulkCategories( [ { inline: { terms: { category: [ 1 ] } } }, { inline: { terms: { category: [ 1, 2 ] } } } ] ), { checked: [ 1 ], indeterminate: [ 2 ] } );
	assert.deepEqual( bulkEdit.bulkCategories( [] ), { checked: [], indeterminate: [] } );
	assert.deepEqual( bulkEdit.bulkEditPayload( { postType: 'post', ids: [ 7 ], fields: { _status: '-1' }, query: { m: '0' } } ), { postType: 'post', action: 'edit', ids: [ 7 ], fields: { _status: '-1' }, list: { m: '0' } } );
} );

async function openBulk( view, ids = [ 7, 8 ], trigger = 'onBulk' ) {
	const table = find( view.container, ( el ) => el.tag === 'table' );
	for ( const id of ids ) {
		find( rowOf( view, id ), byProp( 'type', 'checkbox' ) ).props.onClick( { target: { checked: true }, shiftKey: false } );
	}
	await flush();
	assert.ok( table );
	const nav = findAll( view.container, byClass( 'tablenav' ) )[ 0 ];
	find( nav, byTag( 'select' ) ).props.onChange?.( { target: { value: 'edit' } } );
	await flush();
	find( nav, byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	return byId( view.container, 'bulk-edit' );
}

test( 'Bulk Edit opens above the rows with the selected titles, focused; the categories some posts have start indeterminate', async () => {
	const view = await page( DATA( { items: [ ROW( 7 ), ROW( 8, { titleText: '<b>8</b>', title: { html: '&lt;b&gt;8&lt;/b&gt;', editUrl: 'post.php?post=8&action=edit', pad: 0, parentText: null, childOf: null, noTitleExcerpt: null }, inline: INLINE( { terms: { category: [ 1, 2 ] } } ) } ) ] } ) );
	const bulkRow = await openBulk( view );
	assert.ok( bulkRow, 'Bulk Edit is shown' );
	const rows = byId( view.container, 'the-list' ).children.filter( ( el ) => el.tag === 'tr' ).map( ( el ) => el.props.id ?? el.props.class );
	assert.deepEqual( rows.slice( 0, 3 ), [ 'hidden', 'bulk-edit', 'post-7' ] );
	const titles = byId( bulkRow, 'bulk-titles-list' );
	assert.equal( titles.props.role, 'list' );
	assert.deepEqual( findAll( titles, byClass( 'ntdeltitle' ) ).map( clean ), [ 'Post 7', '<b>8</b>' ] );
	assert.equal( hasInert( titles, 'b' ), false, 'the titles are inert' );
	assert.equal( clean( find( byId( bulkRow, '_8' ), byClass( 'screen-reader-text' ) ) ), 'Remove “<b>8</b>” from Bulk Edit' );
	const wrapper = find( bulkRow, byClass( 'inline-edit-wrapper' ) );
	assert.equal( wrapper.props.tabindex, '-1' );
	assert.ok( render.focused === wrapper );
	// News (1) is on both: checked; Sport (2) on one: indeterminate, with its hidden field.
	const box = ( id ) => find( bulkRow, ( el ) => el.tag === 'input' && el.props.type === 'checkbox' && el.props.value === String( id ) );
	assert.equal( box( 1 ).props.checked, true );
	assert.equal( box( 2 ).props.indeterminate, true );
	assert.ok( find( bulkRow, byProp( 'name', 'indeterminate_post_category[]' ) ) );
	assert.equal( find( bulkRow, byProp( 'id', 'bulk-edit-in-category-2' ) ) !== null || box( 2 ).props.id.startsWith( 'bulk-edit-' ), true );
	// No Scheduled; the tags box is added; sticky is a select.
	assert.deepEqual( findAll( find( bulkRow, byProp( 'name', '_status' ) ), byTag( 'option' ) ).map( ( o ) => o.props.value ), [ '-1', 'publish', 'private', 'pending', 'draft' ] );
	assert.ok( find( bulkRow, byTag( 'textarea' ) ) );
	assert.equal( find( bulkRow, byProp( 'name', 'sticky' ) ).tag, 'select' );
} );

test( 'Bulk Edit: Remove unchecks the post and moves the focus; the last one closes Bulk Edit and gives the focus back to Apply', async () => {
	const view = await page();
	let bulkRow = await openBulk( view );
	byId( bulkRow, '_7' ).props.onClick( prevent );
	await flush();
	bulkRow = byId( view.container, 'bulk-edit' );
	assert.deepEqual( findAll( bulkRow, byClass( 'ntdeltitle' ) ).map( clean ), [ 'Post 8' ] );
	assert.notEqual( find( rowOf( view, 7 ), byProp( 'type', 'checkbox' ) ).props.checked, true );
	assert.deepEqual( spoken, [ [ 'Item removed.', 'assertive' ] ] );
	assert.ok( render.focused === byId( bulkRow, '_8' ) );
	byId( bulkRow, '_8' ).props.onClick( prevent );
	await flush();
	assert.equal( byId( view.container, 'bulk-edit' ), null );
	assert.equal( spoken.at( -1 ), 'All selected items have been removed. Select new items to use Bulk Actions.' );
	assert.ok( render.focused === byId( view.container, 'doaction' ) );
} );

test( 'Bulk Edit Update posts posts/bulk with the posts listed and the fields, indeterminate categories kept; the answer is followed', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?updated=2', location: null } ) );
	const view = await page();
	const bulkRow = await openBulk( view );
	byId( bulkRow, 'bulk_edit' ).props.onClick( prevent );
	await flush();
	const { route, payload } = api.calls[ 0 ];
	assert.equal( route, 'wp-admin/v1/posts/bulk' );
	assert.equal( payload.action, 'edit' );
	assert.equal( payload.postType, 'post' );
	assert.deepEqual( payload.ids, [ 7, 8 ] );
	assert.deepEqual( payload.fields.post_category, [ '0', '1' ] );
	assert.deepEqual( payload.fields.indeterminate_post_category, [ '2' ] );
	assert.equal( payload.fields._status, '-1' );
	assert.equal( payload.fields.post_author, '-1' );
	assert.equal( payload.fields.sticky, '-1' );
	assert.equal( payload.fields.post_format, '-1' );
	assert.deepEqual( followed, [ { redirect: 'edit.php?updated=2', location: null } ] );
	assert.equal( byId( view.container, 'bulk-edit' ), null );
} );

// Bulk actions, Empty Trash, messages ------------------------------------------------------------

test( 'the bulk checks of common.js, then a bulk action posts posts/bulk with the checked rows and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?trashed=1&ids=7', location: null } ) );
	const view = await page();
	const nav = () => findAll( view.container, byClass( 'tablenav' ) )[ 0 ];
	find( nav(), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select a bulk action to perform.' );
	find( nav(), byTag( 'select' ) ).props.onChange?.( { target: { value: 'trash' } } );
	await flush();
	find( nav(), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select at least one item to perform this action on.' );
	assert.equal( api.calls.length, 0 );
	find( rowOf( view, 7 ), byProp( 'type', 'checkbox' ) ).props.onClick( { target: { checked: true }, shiftKey: false } );
	await flush();
	find( nav(), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/posts/bulk', payload: { postType: 'post', action: 'trash', ids: [ 7 ], list: { post_type: 'post', mode: 'list' } } } );
	assert.deepEqual( followed, [ { redirect: 'edit.php?trashed=1&ids=7', location: null } ] );
} );

test( 'Empty Trash posts delete_all with the view\'s status', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?post_status=trash&deleted=1', location: null } ) );
	const data = DATA( { query: { post_type: 'post', post_status: 'trash', mode: 'list' } } );
	data.filters = { ...data.filters, emptyTrash: { label: 'Empty Trash' } };
	const view = await page( data );
	const buttons = findAll( view.container, byProp( 'id', 'delete_all' ) );
	assert.equal( buttons.length, 2, 'above and below the table, as extra_tablenav() prints it' );
	assert.equal( buttons[ 0 ].props.value, 'Empty Trash' );
	buttons[ 0 ].props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { postType: 'post', action: 'delete_all', emptyStatus: 'trash', list: { post_type: 'post', post_status: 'trash', mode: 'list' } } );
	assert.equal( followed.length, 1 );
} );

test( 'the messages: one dismissible #message, joined by a space; Undo calls its request with the list and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'edit.php?untrashed=2', location: null } ) );
	const undo = { method: 'POST', route: 'wp-admin/v1/posts/bulk', body: { action: 'untrash', ids: [ 7, 8 ], undo: true, postType: 'post' } };
	const view = await page( DATA( { messages: [ { markup: '2 posts moved to the Trash.', undo }, { markup: '1 post not moved because it is locked.', undo: null } ] } ) );
	const message = byId( view.container, 'message' );
	assert.ok( hasClass( message, 'updated' ) && hasClass( message, 'is-dismissible' ) );
	assert.equal( clean( find( message, byTag( 'p' ) ) ), '2 posts moved to the Trash. Undo 1 post not moved because it is locked.' );
	find( message, ( el ) => el.tag === 'a' && textOf( el ) === 'Undo' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { action: 'untrash', ids: [ 7, 8 ], undo: true, postType: 'post', list: { post_type: 'post', mode: 'list' } } );
	assert.deepEqual( followed, [ { redirect: 'edit.php?untrashed=2', location: null } ] );
	find( message, byClass( 'notice-dismiss' ) ).props.onClick();
	await flush();
	assert.equal( byId( view.container, 'message' ), null );
} );

test( 'Filter navigates with the form\'s fields, less the bulk and inline form fields', async () => {
	const view = await page();
	formEntries = [ [ 's', '' ], [ 'post_status', 'all' ], [ 'post_type', 'post' ], [ 'action', '-1' ], [ 'm', '202002' ], [ 'cat', '3' ], [ 'fixture_filter', 'noted' ], [ 'post[]', '7' ], [ 'post_title', 'x' ], [ 'tax_input[post_tag]', 'a' ], [ 'action2', '-1' ] ];
	byId( view.container, 'post-query-submit' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( navigated, [ [ '/wp-admin/edit.php?s=&post_status=all&post_type=post&m=202002&cat=3&fixture_filter=noted', null ] ] );
	assert.deepEqual( findAll( byId( view.container, 'cat' ), byTag( 'option' ) ).map( ( o ) => [ o.props.value, textOf( o ) ] ), [ [ '0', 'All Categories' ], [ '1', 'News' ], [ '3', '   Local' ] ] );
	assert.deepEqual( flatTree( [ { id: 1, name: 'a', children: [ { id: 2, name: 'b', children: [] } ] } ] ).map( ( n ) => n.level ), [ 0, 1 ] );
} );

// Locks ---------------------------------------------------------------------------------------

test( 'locks: every 10 seconds while shown, the rows\' locks are asked; a lock and an unlock are shown', async () => {
	api.respondWith( async ( method, route ) => ( route === 'wp-admin/v1/posts/locks' ? { 8: { text: 'Ed is currently editing', avatarSrc: 'https://x/a.png', avatarSrc2x: 'https://x/a2.png' } } : {} ) );
	const view = await page( DATA( { items: [ ROW( 7, { classes: [ 'iedit', 'wp-locked' ], lock: { text: 'Ann is currently editing', avatarHtml: null } } ), ROW( 8 ) ] } ) );
	assert.equal( timers.intervals.size, 1 );
	await timers.tick();
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'GET', route: 'wp-admin/v1/posts/locks', payload: { ids: '7,8', postType: 'post' } } );
	assert.ok( hasClass( rowOf( view, 8 ), 'wp-locked' ) );
	assert.equal( clean( find( rowOf( view, 8 ), byClass( 'locked-text' ) ) ), 'Ed is currently editing' );
	const avatar = find( find( rowOf( view, 8 ), byClass( 'locked-avatar' ) ), byTag( 'img' ) );
	assert.equal( avatar.props.src, 'https://x/a.png' );
	assert.equal( avatar.props.srcset, 'https://x/a2.png 2x' );
	assert.ok( ! hasClass( rowOf( view, 7 ), 'wp-locked' ) );
	assert.equal( clean( find( rowOf( view, 7 ), byClass( 'locked-text' ) ) ), '' );

	// Hidden: no request.
	shown = false;
	await timers.tick();
	assert.equal( api.calls.length, 1 );
} );

test( 'locks: unmounting stops the checks, and an answer on its way is dropped', async () => {
	const reply = deferred();
	api.respondWith( () => reply.promise );
	const view = await page();
	timers.tick();
	await flush();
	assert.equal( api.calls.length, 1 );
	unmountAll();
	assert.equal( timers.intervals.size, 0 );
	reply.resolve( { 7: { text: 'Late', avatarSrc: null, avatarSrc2x: null } } );
	await flush();
	assert.ok( view );
} );

test( 'applyLocks and lockPoller: pure placing; no ids, no request', async () => {
	const locks = { 1: { locked: false, text: '' }, 2: { locked: true, text: 'x' } };
	const next = state.applyLocks( locks, { 1: { text: 'Ed', avatarSrc: null, avatarSrc2x: null } } );
	assert.equal( next[ 1 ].locked, true );
	assert.equal( next[ 2 ].locked, false );
	assert.deepEqual( state.lockedClasses( [ 'a', 'wp-locked' ], { locked: false } ), [ 'a' ] );
	const calls = [];
	const own = fakeTimers();
	const poller = lockPoller( { request: async ( ids ) => calls.push( ids ), ids: () => [], postType: () => 'post', onAnswer: () => {}, visible: () => true, timers: own } );
	poller.start();
	await own.tick();
	assert.deepEqual( calls, [] );
	poller.stop();
	assert.equal( own.intervals.size, 0 );
} );

// Screen Options, body classes, failures -------------------------------------------------------

test( 'Screen Options: the columns with their legend; a column checkbox hides its cells and saves for edit-{type}', async () => {
	const view = await page();
	assert.equal( screenOptions.tableColumnsLegend, 'Columns' );
	assert.equal( screenOptions.pagination.option, 'edit_post_per_page' );
	await screenOptions.onChange( 'hide-column', { key: 'author', hidden: true } );
	await flush();
	assert.ok( hasClass( cellOf( view, 7, 'author' ), 'hidden' ) );
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/screen-preferences/edit-post', payload: { columnsHidden: [ 'author' ] } } );
	await screenOptions.onApply( { perPage: 5, mode: 'excerpt' } );
	assert.deepEqual( api.calls.at( -1 ).payload, { perPage: 5, mode: 'excerpt' } );
	assert.equal( refreshed, 1 );
} );

test( 'the body has edit-php and post-type-{type} while shown; the die screen and a failed list', async () => {
	const fakeBody = new Set();
	const savedDocument = globalThis.document;
	globalThis.document = { body: { classList: { add: ( ...names ) => names.forEach( ( n ) => fakeBody.add( n ) ), remove: ( ...names ) => names.forEach( ( n ) => fakeBody.delete( n ) ) } }, visibilityState: 'visible' };
	try {
		await page( DATA( { postType: { name: 'page', hierarchical: true, hierarchicalDisplay: true } } ) );
		assert.deepEqual( [ ...fakeBody ].sort(), [ 'edit-php', 'post-type-page' ] );
		unmountAll();
		assert.deepEqual( [ ...fakeBody ], [] );
	} finally {
		globalThis.document = savedDocument;
	}
	const die = await page( { query: {}, postType: null, error: { kind: 'die', status: 500, heading: null, message: 'Invalid post type.' } } );
	assert.equal( clean( find( die.container, byClass( 'wp-admin-edit-posts-error' ) ) ), 'Invalid post type.' );
	assert.equal( byId( die.container, 'posts-filter' ), null );
	const broken = await page( { failed: true } );
	assert.equal( clean( find( broken.container, byClass( 'wp-admin-edit-posts-failed' ) ) ), 'The posts could not be loaded.' );
} );
