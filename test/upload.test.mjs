import test, { after, afterEach, before, beforeEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { FakeDOMParser, FakeElement, FakeNode, fakeTemplateDocument } from './helpers/html-parser.mjs';


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
const { attachIds, SKIPPED_FIELDS, actionSpan, spanAction, buttonRoles } = await import( '../site/components/core/upload.js' );
const { thumbImage } = await import( '../site/components/core/upload/rows.js' );
const { currentMode, filterLinks } = await import( '../site/components/core/upload/filter-bar.js' );
const { foundRows } = await import( '../site/components/core/upload/find-posts.js' );
const rowActions = await import( '../site/components/core/list-table-parts/row-actions.js' );

const { h } = Vue;
enableQueries();

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'upload', 'list-table', 'list-table-nav' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const pageModule = globalThis.__modules[ '/components/core/upload.js' ];
const contract = globalThis.__modules[ '/contracts/core/upload.js' ].default;

// Fixtures, as wp_admin_get_media_list() gives them ---------------------------------------------

const WARN = 'You are about to permanently delete these items from your site.\nThis action cannot be undone.\n\'Cancel\' to stop, \'OK\' to delete.';
const REQUEST = ( id, action ) => ( { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/' + action, body: [] } );
const FILE = ( id ) => 'http://localhost:8889/wp-content/uploads/2026/11/file-' + id + '.jpg';
const ACTION = ( action, text, extra = {} ) => ( { action, text, ariaLabel: text + ' it', classes: [ action ], request: null, url: null, newTab: false, confirm: false, ...extra } );
const ACTIONS = ( id ) => [
	ACTION( 'edit', 'Edit', { url: 'post.php?post=' + id + '&action=edit' } ),
	ACTION( 'delete', 'Delete Permanently', { request: REQUEST( id, 'delete' ), confirm: true } ),
	ACTION( 'view', 'View', { url: 'http://localhost:8889/file-' + id + '/', newTab: true } ),
	ACTION( 'copy', 'Copy URL' ),
	ACTION( 'download', 'Download file', { url: FILE( id ) } ),
];
const ROW = ( id, extra = {} ) => ( {
	id, classes: [ 'author-self', 'status-inherit' ], selectable: true, checkboxLabel: 'Select File ' + id, rowHeaderLabel: 'File ' + id,
	title: { html: 'File ' + id, editUrl: 'post.php?post=' + id + '&action=edit', thumbHtml: '<img alt="" class="attachment-60x60" src="' + FILE( id ) + '" width="60" height="60">', thumb: { src: FILE( id ), srcset: FILE( id ) + ' 60w, ' + FILE( id ) + ' 120w', sizes: '60px', alt: '', width: 60, height: 60, loading: 'lazy' }, iconClass: 'image-icon', filename: 'file-' + id + '.jpg' },
	states: [],
	author: { name: 'admin', url: 'upload.php?author=1' },
	terms: [],
	bubble: null,
	parent: { unattached: false, title: 'Hello &amp; world', url: 'post.php?post=1&action=edit', private: false, detach: { method: 'POST', route: 'wp-admin/v1/media/attach', body: { action: 'detach', parentId: 1, ids: [ id ] } }, detachAriaLabel: 'Detach from “Hello & world”' },
	date: { text: '2026/11/01', timeHtml: null },
	actions: ACTIONS( id ),
	copyUrl: FILE( id ),
	download: FILE( id ),
	actionsHtml: null,
	actionsVisible: false,
	cells: [],
	...extra,
} );
const UNATTACHED = ( id ) => ROW( id, {
	parent: { unattached: true, attach: true, attachAriaLabel: 'Attach “File ' + id + '” to existing content' },
	actions: [ ...ACTIONS( id ), ACTION( 'attach', 'Attach' ) ],
} );
const COLUMN = ( key, label, extra = {} ) => ( { key, label, labelHtml: null, primary: false, hidden: false, num: false, core: true, sortable: null, sorted: null, ...extra } );
const COLUMNS = [ COLUMN( 'cb', '' ), COLUMN( 'title', 'File', { primary: true } ), COLUMN( 'author', 'Author' ), COLUMN( 'parent', 'Uploaded to' ), COLUMN( 'date', 'Date' ), COLUMN( 'acme', 'Acme', { core: false } ) ];
const FILTER_BAR = ( extra = {} ) => ( {
	modes: [ { mode: 'list', label: 'List view', path: 'upload.php?mode=list', current: true }, { mode: 'grid', label: 'Grid view', path: 'upload.php?mode=grid', current: false } ],
	types: { options: [ { key: 'all', value: '', label: 'All media items' }, { key: 'image', value: 'post_mime_type:image', label: 'Images' }, { key: 'detached', value: 'detached', label: 'Unattached' }, { key: 'mine', value: 'mine', label: 'Mine' } ], value: '' },
	months: { label: 'Filter by date', options: [ { value: '202611', label: 'November 2026' } ], value: '0' },
	restrictHtml: { html: '<select name="fixture_filter"><option value="noted">Noted</option></select>', error: null },
	emptyTrash: null,
	search: { label: 'Search Media', inputId: 'media-search-input', value: '' },
	filterLinksHtml: null,
	...extra,
} );
const DATA = ( extra = {} ) => ( {
	query: { mode: 'list' },
	error: null,
	title: 'Media Library',
	headings: { views: 'Filter media items list', pagination: 'Media items list navigation', list: 'Media items list' },
	heading: { title: 'Media Library', addNew: { label: 'Add Media File', path: 'media-new.php' }, search: null },
	messages: [],
	filterBar: FILTER_BAR(),
	columns: COLUMNS,
	caption: 'Table ordered by Date. Descending.',
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'media' ],
	bulkActions: [ { value: 'delete', label: 'Delete permanently' } ],
	pagination: { total: 2, totalText: '2 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	items: [ ROW( 7 ), ROW( 8 ) ],
	noItems: 'No media files found.',
	screenOptions: { tableColumns: [ { key: 'author', label: 'Author', hidden: false } ], legend: 'Columns', perPage: { option: 'upload_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 }, viewMode: null, settingsHtml: null },
	confirmDelete: true,
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
let asked;
let answerConfirm;
let copied;
let timers;
const LOCATION = { origin: 'http://localhost', pathname: '/wp-admin/upload.php', search: '?mode=list' };

function fakeTimers() {
	const pending = new Map();
	let next = 1;
	return {
		pending,
		setTimeout: ( fn, ms ) => {
			pending.set( next, { fn, ms } );
			return next++;
		},
		clearTimeout: ( handle ) => pending.delete( handle ),
		run: () => {
			for ( const [ handle, { fn } ] of [ ...pending ] ) {
				pending.delete( handle );
				fn();
			}
		},
	};
}

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
/** The elements InertHtml put anywhere under a rendered node, as `[ tag, attributes ]`. */
function inertElements( node, out = [] ) {
	if ( node?.type === 'element' ) {
		node.children.forEach( ( child ) => inertElements( child, out ) );
	} else if ( node?.nodeType === 1 || node?.nodeType === 11 ) {
		if ( node.nodeType === 1 && ! String( node.localName ).startsWith( '#' ) ) {
			out.push( [ node.localName, Object.fromEntries( ( node.getAttributeNames?.() ?? [] ).map( ( name ) => [ name, node.getAttribute( name ) ] ) ) ] );
		}
		[ ...( node.childNodes ?? [] ) ].forEach( ( child ) => inertElements( child, out ) );
	}
	return out;
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
	asked = [];
	answerConfirm = true;
	copied = [];
	timers = fakeTimers();
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
	confirm: ( message ) => {
		asked.push( message );
		return answerConfirm;
	},
	clipboard: { writeText: async ( text ) => copied.push( text ) },
	copyTimers: timers,
	...extra,
} );

async function page( data = DATA(), { listeners = {}, provided = {}, pagePath = 'upload.php?mode=list' } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/upload', data, page: { path: pagePath, title: 'Media Library' }, ...listeners } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const clean = ( node ) => allText( node ).replace( /\s+/g, ' ' ).trim();
const rowOf = ( view, id ) => byId( view.container, 'post-' + id );
const cellOf = ( view, id, key ) => find( rowOf( view, id ), byClass( 'column-' + key ) );
const actionOf = ( view, id, action ) => {
	const span = find( find( rowOf( view, id ), byClass( 'row-actions' ) ), ( el ) => el.tag === 'span' && hasClass( el, action ) );
	return span ? find( span, ( child ) => child.tag === 'a' || child.tag === 'button' ) : null;
};
const prevent = { preventDefault() {} };
const click = ( el ) => el.props.onClick( { currentTarget: el, target: el, preventDefault() {}, stopPropagation() {} } );
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise( ( yes, no ) => {
		resolve = yes;
		reject = no;
	} );
	return { promise, resolve, reject };
};
const nav = ( view, index = 0 ) => findAll( view.container, byClass( 'tablenav' ) )[ index ];
const chooseBulk = async ( view, value ) => {
	find( nav( view ), byTag( 'select' ) ).props.onChange?.( { target: { value } } );
	await flush();
};
const check = async ( view, id ) => {
	find( rowOf( view, id ), byProp( 'type', 'checkbox' ) ).props.onClick( { target: { checked: true }, shiftKey: false } );
	await flush();
};
const FOUND = { rows: [ { id: 1, title: 'Hello <b>world</b>', type: 'Post', date: '2026/11/01', status: 'Published' }, { id: 2, title: 'About', type: 'Page', date: '2026/10/01', status: 'Published' } ] };

// Contract and module ---------------------------------------------------------------------------

test( 'the Media contract: page tier, data and page, the table slots with query, and `saved`', () => {
	assert.equal( contract.id, 'core/upload' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-table', 'after-table' ] );
	assert.deepEqual( Object.keys( contract.slots[ 'before-table' ].props ), [ 'query' ] );
	assert.deepEqual( contract.emits, [ 'saved' ] );
	assert.deepEqual( pageModule.stylesheets, [ 'list-tables', 'media' ] );
} );

// The page and its rows ------------------------------------------------------------------------

test( 'the page: Add Media File, #posts-filter with the classic filter bar, #the-list, the media icon and the file name', async () => {
	const view = await page();
	const add = find( view.container, byClass( 'page-title-action' ) );
	assert.equal( add.props.href, '/wp-admin/media-new.php' );
	assert.equal( textOf( add ), 'Add Media File' );
	const form = byId( view.container, 'posts-filter' );
	assert.equal( form.props.method, 'get' );
	const bar = find( form, byClass( 'wp-filter' ) );
	assert.ok( bar, 'div.wp-filter' );
	const mode = find( bar, ( el ) => el.tag === 'input' && el.props.name === 'mode' );
	assert.equal( mode.props.value, 'list' );
	const switches = findAll( find( bar, byClass( 'view-switch' ) ), byTag( 'a' ) );
	assert.deepEqual( switches.map( ( a ) => [ a.props.id, a.props.href, hasClass( a, 'current' ), a.props[ 'aria-current' ] ?? null, textOf( a ) ] ), [
		[ 'view-switch-list', '/wp-admin/upload.php?mode=list', true, 'page', 'List view' ],
		[ 'view-switch-grid', '/wp-admin/upload.php?mode=grid', false, null, 'Grid view' ],
	] );
	assert.ok( hasClass( switches[ 1 ], 'view-grid' ) );
	const types = byId( bar, 'attachment-filter' );
	assert.equal( types.props.name, 'attachment-filter' );
	assert.deepEqual( findAll( types, byTag( 'option' ) ).map( ( o ) => [ o.props.value, textOf( o ) ] ), [ [ '', 'All media items' ], [ 'post_mime_type:image', 'Images' ], [ 'detached', 'Unattached' ], [ 'mine', 'Mine' ] ] );
	assert.deepEqual( findAll( byId( bar, 'filter-by-date' ), byTag( 'option' ) ).map( ( o ) => o.props.value ), [ '0', '202611' ] );
	assert.equal( byId( bar, 'post-query-submit' ).props.type, 'submit' );
	assert.equal( byId( bar, 'post-query-submit' ).props.name, 'filter_action' );
	assert.equal( byId( bar, 'delete_all' ), null, 'no Empty Trash outside the Trash' );
	const search = find( bar, byClass( 'search-box' ) );
	assert.equal( search.tag, 'p' );
	assert.equal( byId( search, 'media-search-input' ).props.name, 's' );
	assert.equal( byId( search, 'search-submit' ).props.value, 'Search Media' );
	assert.deepEqual( byId( view.container, 'the-list' ).children.filter( ( el ) => el.tag === 'tr' ).map( ( el ) => el.props.id ), [ 'post-7', 'post-8' ] );
	assert.equal( find( rowOf( view, 7 ), byProp( 'type', 'checkbox' ) ).props.name, 'media[]' );
	const title = cellOf( view, 7, 'title' );
	assert.ok( hasClass( find( title, byTag( 'strong' ) ), 'has-media-icon' ) );
	const icon = find( title, byClass( 'media-icon' ) );
	assert.ok( hasClass( icon, 'image-icon' ) );
	// Rendered from the thumbnail's data, lazy-loaded as the classic list's (never widened InertHtml).
	const img = find( icon, byTag( 'img' ) );
	assert.deepEqual( [ img.props.src, img.props.srcset, img.props.sizes, img.props.width, img.props.height, img.props.alt, img.props.loading ], [ FILE( 7 ), FILE( 7 ) + ' 60w, ' + FILE( 7 ) + ' 120w', '60px', 60, 60, '', 'lazy' ] );
	assert.deepEqual( Object.keys( img.props ).filter( ( name ) => name !== 'key' ).slice( 0, 1 ), [ 'loading' ], 'loading before src' );
	assert.deepEqual( inertElements( icon ), [], 'not through InertHtml' );
	assert.equal( clean( find( title, byClass( 'filename' ) ) ), 'File name: file-7.jpg' );
	assert.equal( find( title, byTag( 'a' ) ).props.href, '/wp-admin/post.php?post=7&action=edit' );
	assert.deepEqual( titles, [ 'Media Library' ] );
	assert.ok( findAll( view.container, ( el ) => el.tag === 'h2' && hasClass( el, 'screen-reader-text' ) ).some( ( el ) => textOf( el ) === 'Media items list' ) );
	assert.ok( byId( view.container, 'find-posts' ), 'the Find Posts dialog is in the form, hidden' );
	assert.equal( byId( view.container, 'find-posts' ).props.style, 'display: none;' );
} );

test( 'the cells: author, Uploaded To with Detach, (Unattached) with Attach, (Private post), the date, a plugin cell, states', async () => {
	const priv = ROW( 9, { parent: { unattached: false, title: null, url: null, private: true, detach: null, detachAriaLabel: null }, author: null, date: { text: '3 hours ago', timeHtml: null }, states: [ { key: 'site_icon', html: 'Site Icon' }, { key: 'x', html: 'X <em>y</em>' } ], cells: { acme: { html: '<b>A</b>' } } } );
	const unread = ROW( 10, { parent: { unattached: false, title: 'Draft', url: null, private: false, detach: null, detachAriaLabel: null } } );
	const view = await page( DATA( { items: [ ROW( 7 ), UNATTACHED( 8 ), priv, unread ] } ) );
	assert.equal( find( cellOf( view, 7, 'author' ), byTag( 'a' ) ).props.href, '/wp-admin/upload.php?author=1' );
	assert.equal( clean( cellOf( view, 9, 'author' ) ), '—(no author)' );
	const parent = cellOf( view, 7, 'parent' );
	assert.equal( find( find( parent, byTag( 'strong' ) ), byTag( 'a' ) ).props.href, '/wp-admin/post.php?post=1&action=edit' );
	const detach = find( parent, byClass( 'detach-from-parent' ) );
	assert.equal( textOf( detach ), 'Detach' );
	assert.equal( detach.props[ 'aria-label' ], 'Detach from “Hello & world”' );
	assert.equal( clean( parent ), 'Hello & worldDetach' );
	const unattached = cellOf( view, 8, 'parent' );
	assert.equal( clean( unattached ), '(Unattached) Attach', 'with the space column_parent() prints' );
	assert.equal( find( unattached, byTag( 'a' ) ).props[ 'aria-label' ], 'Attach “File 8” to existing content' );
	assert.equal( clean( cellOf( view, 9, 'parent' ) ), '(Private post)' );
	assert.equal( clean( cellOf( view, 10, 'parent' ) ), 'Draft' );
	assert.equal( find( cellOf( view, 10, 'parent' ), byTag( 'a' ) ), null );
	assert.equal( clean( cellOf( view, 9, 'date' ) ), '3 hours ago' );
	assert.equal( clean( find( cellOf( view, 9, 'title' ), byTag( 'strong' ) ) ), 'File 9 — Site Icon, X y' );
	assert.ok( find( cellOf( view, 9, 'acme' ), byClass( 'wp-admin-legacy-html' ) ) || cellOf( view, 9, 'acme' ), 'a plugin cell is LegacyHtml' );
} );

test( 'the row actions: Edit, Delete Permanently, View in a new tab, Copy URL with its hidden "Copied!", Download file with download', async () => {
	const view = await page( DATA( { items: [ ROW( 7, { actionsVisible: true } ) ] } ) );
	assert.equal( clean( find( rowOf( view, 7 ), byClass( 'row-actions' ) ) ), 'Edit | Delete Permanently | View | Copy URLCopied! | Download file' );
	assert.ok( hasClass( find( rowOf( view, 7 ), byClass( 'row-actions' ) ), 'visible' ) );
	assert.equal( actionOf( view, 7, 'edit' ).props.href, '/wp-admin/post.php?post=7&action=edit' );
	assert.ok( hasClass( actionOf( view, 7, 'delete' ), 'submitdelete' ) );
	assert.equal( actionOf( view, 7, 'delete' ).props.role, 'button', 'aria-button-if-js, as common.js makes it' );
	assert.equal( actionOf( view, 7, 'edit' ).props.role ?? null, null );
	assert.equal( actionOf( view, 7, 'view' ).props.target, '_blank' );
	const copy = actionOf( view, 7, 'copy' );
	assert.equal( copy.tag, 'button' );
	assert.ok( hasClass( copy, 'copy-attachment-url' ) );
	assert.equal( copy.props[ 'data-clipboard-text' ], FILE( 7 ) );
	const success = find( rowOf( view, 7 ), byClass( 'success' ) );
	assert.ok( hasClass( success, 'hidden' ) );
	assert.equal( success.props[ 'aria-hidden' ], 'true' );
	const download = actionOf( view, 7, 'download' );
	assert.equal( download.props.href, FILE( 7 ) );
	assert.ok( 'download' in download.props );
	// The file is on WordPress's origin: a new tab, so that the admin is never replaced (I1).
	assert.equal( download.props.target, '_blank' );
	assert.equal( download.props.rel, 'noopener' );
	// In the Trash: no Copy URL (copyUrl is null).
	const trashed = ROW( 9, { copyUrl: null, actions: [ ACTION( 'untrash', 'Restore', { request: REQUEST( 9, 'untrash' ) } ), ACTION( 'copy', 'Copy URL' ) ] } );
	const other = await page( DATA( { items: [ trashed ] } ) );
	assert.equal( clean( find( rowOf( other, 9 ), byClass( 'row-actions' ) ) ), 'Restore' );
} );

test( 'a title and the parent title with onerror stay inert: escaped text, no element', async () => {
	const evil = ROW( 7, { title: { html: '&lt;img src=x onerror=alert(1)&gt;', editUrl: null, thumbHtml: '<img src=x onerror="window.__ran=1">', thumb: null, iconClass: 'image-icon', filename: '<img onerror=x>.jpg' }, parent: { unattached: false, title: '&lt;img src=x onerror=alert(2)&gt;', url: 'post.php?post=1&action=edit', private: false, detach: null, detachAriaLabel: null } } );
	const view = await page( DATA( { items: [ evil ] } ) );
	const title = cellOf( view, 7, 'title' );
	assert.ok( clean( title ).includes( '<img src=x onerror=alert(1)>' ) );
	assert.ok( clean( title ).includes( 'File name: <img onerror=x>.jpg' ) );
	for ( const [ , attributes ] of [ ...inertElements( title ), ...inertElements( cellOf( view, 7, 'parent' ) ) ] ) {
		assert.ok( ! Object.keys( attributes ).some( ( name ) => name.startsWith( 'on' ) ), 'no event handler attribute' );
	}
	assert.deepEqual( inertElements( find( title, byTag( 'strong' ) ) ).map( ( [ tag ] ) => tag ), [ 'img' ], 'only the thumbnail is an element' );
	assert.ok( clean( cellOf( view, 7, 'parent' ) ).includes( '<img src=x onerror=alert(2)>' ) );
} );

// Row actions -------------------------------------------------------------------------------

test( 'Delete Permanently asks showNotice.warn()\'s question when confirmDelete; declined, nothing is sent; accepted, the route with the referer', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&deleted=1', location: null } ) );
	const saves = [];
	const view = await page( DATA(), { listeners: { onSaved: ( answer ) => saves.push( answer ) } } );
	answerConfirm = false;
	click( actionOf( view, 7, 'delete' ) );
	await flush();
	assert.deepEqual( asked, [ WARN ] );
	assert.equal( api.calls.length, 0 );
	answerConfirm = true;
	click( actionOf( view, 7, 'delete' ) );
	await flush();
	assert.equal( asked.length, 2 );
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/posts/7/delete', payload: { referer: 'upload.php?mode=list' } } ] );
	assert.deepEqual( followed, [ { redirect: 'upload.php?mode=list&deleted=1', location: null } ] );
	assert.equal( saves.length, 1 );
} );

test( 'without confirmDelete (the Trash) Delete Permanently asks nothing; Trash and Restore never ask', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?attachment-filter=trash&deleted=1', location: null } ) );
	const view = await page( DATA( { confirmDelete: false, items: [ ROW( 7, { actions: [ ACTION( 'untrash', 'Restore', { request: REQUEST( 7, 'untrash' ) } ), ACTION( 'delete', 'Delete Permanently', { request: REQUEST( 7, 'delete' ) } ) ] } ), ROW( 8, { actions: [ ACTION( 'trash', 'Trash', { request: REQUEST( 8, 'trash' ) } ) ] } ) ] } ) );
	click( actionOf( view, 7, 'delete' ) );
	click( actionOf( view, 7, 'untrash' ) );
	click( actionOf( view, 8, 'trash' ) );
	await flush();
	assert.deepEqual( asked, [] );
	assert.deepEqual( api.calls.map( ( call ) => call.route ), [ 'wp-admin/v1/posts/7/delete', 'wp-admin/v1/posts/7/untrash', 'wp-admin/v1/posts/8/trash' ] );
} );

test( 'Copy URL writes the file URL to the clipboard, shows "Copied!" for 3 seconds since the last copy, hides the previous one and says so', async () => {
	const view = await page();
	click( actionOf( view, 7, 'copy' ) );
	await flush();
	assert.deepEqual( copied, [ FILE( 7 ) ] );
	assert.ok( ! hasClass( find( rowOf( view, 7 ), byClass( 'success' ) ), 'hidden' ) );
	assert.deepEqual( [ ...timers.pending.values() ].map( ( timer ) => timer.ms ), [ 3000 ] );
	assert.deepEqual( spoken, [ 'The file URL has been copied to your clipboard' ] );
	assert.ok( render.focused === actionOf( view, 7, 'copy' ), 'the focus stays on the button' );
	click( actionOf( view, 8, 'copy' ) );
	await flush();
	assert.ok( hasClass( find( rowOf( view, 7 ), byClass( 'success' ) ), 'hidden' ), 'the previous "Copied!" hides' );
	assert.ok( ! hasClass( find( rowOf( view, 8 ), byClass( 'success' ) ), 'hidden' ) );
	assert.equal( timers.pending.size, 1, 'one timer, from the last copy' );
	timers.run();
	await flush();
	assert.ok( hasClass( find( rowOf( view, 8 ), byClass( 'success' ) ), 'hidden' ) );
	unmountAll();
	assert.equal( timers.pending.size, 0 );
} );

// Final review minor: no timer and no speak() after the page has gone.
test( 'Copy URL whose clipboard write ends after the page unmounted does nothing', async () => {
	let finish;
	const view = await page( DATA(), { provided: { clipboard: { writeText: () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) } } } );
	click( actionOf( view, 7, 'copy' ) );
	await flush();
	unmountAll();
	finish();
	await flush();
	assert.equal( timers.pending.size, 0, 'no "Copied!" timer' );
	assert.deepEqual( spoken, [], 'nothing said' );
} );

test( 'Copy URL that the clipboard refuses shows nothing and says nothing', async () => {
	const view = await page( DATA(), { provided: { clipboard: { writeText: async () => {
		throw new Error( 'denied' );
	} } } } );
	click( actionOf( view, 7, 'copy' ) );
	await flush();
	assert.ok( hasClass( find( rowOf( view, 7 ), byClass( 'success' ) ), 'hidden' ) );
	assert.deepEqual( spoken, [] );
} );

/** A fake element of filtered row actions: tag, class attribute, attributes, parent. */
function fakeEl( tag, cls = null, attributes = {}, parent = null ) {
	const el = { tagName: tag.toUpperCase(), parentElement: parent, attrs: { ...( cls === null ? {} : { class: cls } ), ...attributes }, focus() {} };
	el.getAttribute = ( name ) => el.attrs[ name ] ?? null;
	el.closest = ( selector ) => {
		for ( let node = el; node; node = node.parentElement ) {
			if ( selector === 'a, button' ? [ 'A', 'BUTTON' ].includes( node.tagName ) : selector === '.copy-to-clipboard-container' && node.attrs.class === 'copy-to-clipboard-container' ) {
				return node;
			}
		}
		return null;
	};
	return el;
}
const filtered = ( root, control, extra = {} ) => ( { target: control, currentTarget: root, defaultPrevented: false, preventDefault() {
	this.defaultPrevented = true;
}, ...extra } );

test( 'a core action inside the row actions plugins filtered still runs (Delete asks, Copy URL copies)', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?deleted=1', location: null } ) );
	const view = await page( DATA( { items: [ ROW( 7, { actionsHtml: '<span class="delete"><a href="x">Delete Permanently</a></span>' } ) ] } ) );
	const actions = find( rowOf( view, 7 ), byClass( 'row-actions' ) );
	const root = fakeEl( 'div', 'row-actions' );
	actions.props.onClick( filtered( root, fakeEl( 'a', null, {}, fakeEl( 'span', 'delete', {}, root ) ) ) );
	await flush();
	assert.deepEqual( asked, [ WARN ] );
	assert.equal( api.calls[ 0 ].route, 'wp-admin/v1/posts/7/delete' );
	// Copy URL: its "Copied!" is the one in the plugin's HTML, shown for 3 seconds.
	const success = new Set( [ 'success', 'hidden' ] );
	const successEl = { classList: { add: ( name ) => success.add( name ), remove: ( name ) => success.delete( name ) } };
	const container = fakeEl( 'span', 'copy-to-clipboard-container', {}, fakeEl( 'span', 'copy', {}, root ) );
	container.querySelector = ( q ) => ( q === '.success' ? successEl : null );
	actions.props.onClick( filtered( root, fakeEl( 'button', 'button-link copy-attachment-url', {}, container ) ) );
	await flush();
	assert.deepEqual( copied, [ FILE( 7 ) ] );
	assert.equal( success.has( 'hidden' ), false );
	timers.run();
	assert.equal( success.has( 'hidden' ), true );
} );

test( 'filtered row actions: only a span the data names runs core; a prevented click and an inline warn are respected (I2, M1)', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?deleted=1', location: null } ) );
	const view = await page( DATA( { confirmDelete: false, items: [ ROW( 7, { actionsHtml: '<span class="wipe"><a class="delete">Wipe</a></span>' } ) ] } ) );
	const actions = find( rowOf( view, 7 ), byClass( 'row-actions' ) );
	const root = fakeEl( 'div', 'row-actions' );
	// A plugin's own link styled `delete`, in its own span: not the core delete, even in the Trash.
	actions.props.onClick( filtered( root, fakeEl( 'a', 'delete', {}, fakeEl( 'span', 'wipe', {}, root ) ) ) );
	// A span whose class is not exactly the key: not core either.
	actions.props.onClick( filtered( root, fakeEl( 'a', null, {}, fakeEl( 'span', 'delete extra', {}, root ) ) ) );
	// A click its own handler prevented (a declined `return showNotice.warn();`).
	actions.props.onClick( filtered( root, fakeEl( 'a', null, {}, fakeEl( 'span', 'delete', {}, root ) ), { defaultPrevented: true } ) );
	await flush();
	assert.equal( api.calls.length, 0 );

	// The core delete whose inline onclick asked already is not asked a second time.
	const asking = await page( DATA( { items: [ ROW( 8, { actionsHtml: 'x' } ) ] } ) );
	find( rowOf( asking, 8 ), byClass( 'row-actions' ) ).props.onClick( filtered( root, fakeEl( 'a', 'submitdelete', { onclick: 'return showNotice.warn();' }, fakeEl( 'span', 'delete', {}, root ) ) ) );
	await flush();
	assert.deepEqual( asked, [] );
	assert.equal( api.calls[ 0 ].route, 'wp-admin/v1/posts/8/delete' );
	assert.equal( actionSpan( fakeEl( 'a', null, {}, root ), root ), null, 'no span' );
	assert.equal( spanAction( fakeEl( 'span', 'view' ), [ { action: 'view' } ] ).action, 'view' );
} );

test( 'filtered row actions: a plugin\'s replacement in span.delete, which WordPress does not name a core action, does not run the core delete', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?deleted=1', location: null } ) );
	const view = await page( DATA( { confirmDelete: false, items: [ ROW( 7, { actionsHtml: 'x', coreActions: [ 'edit', 'view', 'copy' ] } ) ] } ) );
	const root = fakeEl( 'div', 'row-actions' );
	find( rowOf( view, 7 ), byClass( 'row-actions' ) ).props.onClick( filtered( root, fakeEl( 'a', null, {}, fakeEl( 'span', 'delete', {}, root ) ) ) );
	await flush();
	assert.equal( api.calls.length, 0 );
} );

test( 'the classic globals, while the page is shown: showNotice.warn() asks and returns the answer; findPosts.open() opens Find Posts for the row', async () => {
	api.respondWith( async () => FOUND );
	const before = Object.hasOwn( globalThis, 'showNotice' );
	const view = await page( DATA( { items: [ UNATTACHED( 7 ) ] } ) );
	answerConfirm = false;
	assert.equal( globalThis.showNotice.warn(), false, 'a plugin link with onclick="return showNotice.warn()" is not followed' );
	answerConfirm = true;
	assert.equal( globalThis.showNotice.warn(), true );
	assert.deepEqual( asked, [ WARN, WARN ] );
	assert.equal( globalThis.findPosts.open( 'media[]', '7' ), false );
	await flush();
	assert.equal( byId( view.container, 'find-posts' ).props.style ?? null, null, 'the native dialog' );
	api.respondWith( async () => ( { redirect: 'upload.php?attached=1', location: null } ) );
	find( byId( view.container, 'find-posts' ), byProp( 'type', 'radio' ) ).props.onChange();
	await flush();
	byId( view.container, 'find-posts-submit' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls.at( -1 ).payload.ids, [ 7 ] );
	unmountAll();
	assert.equal( Object.hasOwn( globalThis, 'showNotice' ), before );
	assert.equal( Object.hasOwn( globalThis, 'findPosts' ), false );
} );

test( 'buttonRoles: the aria-button-if-js links of a fill become buttons; thumbImage accepts only http(s)', () => {
	const roles = [];
	buttonRoles( { querySelectorAll: ( selector ) => ( selector === 'a.aria-button-if-js' ? [ { setAttribute: ( name, value ) => roles.push( [ name, value ] ) } ] : [] ) } );
	assert.deepEqual( roles, [ [ 'role', 'button' ] ] );
	assert.equal( thumbImage( { src: 'javascript:alert(1)' } ), null );
	assert.equal( thumbImage( null ), null );
	assert.deepEqual( thumbImage( { src: 'https://x/a.jpg', srcset: 'javascript:x 1w', sizes: '60px', width: 60, height: 0, loading: null } ), { src: 'https://x/a.jpg', srcset: null, sizes: null, alt: '', width: 60, height: null, loading: 'lazy' } );
} );

test( 'Detach posts its request with the list and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&detach=1', location: null } ) );
	const view = await page();
	click( find( cellOf( view, 7, 'parent' ), byClass( 'detach-from-parent' ) ) );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/media/attach', payload: { action: 'detach', parentId: 1, ids: [ 7 ], list: { mode: 'list' } } } ] );
	assert.deepEqual( followed, [ { redirect: 'upload.php?mode=list&detach=1', location: null } ] );
} );

// Find Posts --------------------------------------------------------------------------------

test( 'Attach opens Find Posts focused, lists the latest content as text; a row click checks it; Select posts media/attach and follows', async () => {
	api.respondWith( async ( method, route ) => ( route === 'wp-admin/v1/posts/find' ? FOUND : { redirect: 'upload.php?attachment-filter=detached&attached=1', location: null } ) );
	const view = await page( DATA( { query: { 'attachment-filter': 'detached', mode: 'list' }, items: [ UNATTACHED( 7 ), UNATTACHED( 8 ) ] } ) );
	const opener = find( cellOf( view, 8, 'parent' ), byTag( 'a' ) );
	click( opener );
	await flush();
	const dialog = byId( view.container, 'find-posts' );
	assert.equal( dialog.props.style ?? null, null, 'shown' );
	assert.ok( find( view.container, byClass( 'ui-find-overlay' ) ) );
	assert.ok( render.focused === byId( dialog, 'find-posts-input' ) );
	assert.deepEqual( api.calls, [ { method: 'GET', route: 'wp-admin/v1/posts/find', payload: { ps: '' } } ] );
	assert.equal( clean( byId( dialog, 'find-posts-head' ) ), 'Attach to existing content Close media attachment panel' );
	const table = find( byId( dialog, 'find-posts-response' ), byTag( 'table' ) );
	assert.deepEqual( findAll( table, byTag( 'th' ) ).map( textOf ), [ '', 'Title', 'Type', 'Date', 'Status' ] );
	const rows = findAll( find( table, byTag( 'tbody' ) ), byTag( 'tr' ) );
	assert.deepEqual( rows.map( ( tr ) => [ hasClass( tr, 'found-posts' ), hasClass( tr, 'alternate' ) ] ), [ [ true, true ], [ true, false ] ] );
	assert.equal( textOf( find( rows[ 0 ], byTag( 'label' ) ) ), 'Hello <b>world</b>', 'the title is text' );
	const radio = find( rows[ 0 ], byProp( 'type', 'radio' ) );
	assert.deepEqual( [ radio.props.name, radio.props.value, radio.props.id ], [ 'found_post_id', '1', 'found-1' ] );

	// Select without a checked post does nothing.
	byId( dialog, 'find-posts-submit' ).props.onClick( prevent );
	await flush();
	assert.equal( api.calls.length, 1 );

	rows[ 1 ].props.onClick();
	await flush();
	assert.equal( find( findAll( find( byId( view.container, 'find-posts' ), byTag( 'tbody' ) ), byTag( 'tr' ) )[ 1 ], byProp( 'type', 'radio' ) ).props.checked, true );
	byId( byId( view.container, 'find-posts' ), 'find-posts-submit' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 1 ], { method: 'POST', route: 'wp-admin/v1/media/attach', payload: { action: 'attach', parentId: 2, ids: [ 8 ], list: { 'attachment-filter': 'detached', mode: 'list' } } } );
	assert.deepEqual( followed, [ { redirect: 'upload.php?attachment-filter=detached&attached=1', location: null } ] );
} );

test( 'Find Posts: Search and Enter ask again with the term; no rows says "No items found."; a failure says the classic error', async () => {
	let answer = { rows: [] };
	api.respondWith( async () => {
		if ( answer instanceof Error ) {
			throw answer;
		}
		return answer;
	} );
	const view = await page( DATA( { items: [ UNATTACHED( 7 ) ] } ) );
	click( actionOf( view, 7, 'attach' ) );
	await flush();
	const dialog = () => byId( view.container, 'find-posts' );
	assert.equal( clean( byId( dialog(), 'find-posts-response' ) ), 'No items found.' );
	byId( dialog(), 'find-posts-input' ).props.onInput( { target: { value: 'hello' } } );
	byId( dialog(), 'find-posts-search' ).props.onClick();
	await flush();
	assert.deepEqual( api.calls.at( -1 ), { method: 'GET', route: 'wp-admin/v1/posts/find', payload: { ps: 'hello' } } );
	answer = new Error( 'nope' );
	let prevented = false;
	byId( dialog(), 'find-posts-input' ).props.onKeydown( { key: 'Enter', preventDefault: () => {
		prevented = true;
	} } );
	await flush();
	assert.ok( prevented, 'Enter does not submit the list form' );
	assert.equal( api.calls.length, 3 );
	assert.equal( clean( byId( dialog(), 'find-posts-response' ) ), 'An error has occurred. Please reload the page and try again.' );
} );

test( 'Find Posts: Escape, the close button and the overlay close it, and the focus goes back to what opened it', async () => {
	api.respondWith( async () => FOUND );
	const view = await page( DATA( { items: [ UNATTACHED( 7 ) ] } ) );
	const opener = actionOf( view, 7, 'attach' );
	click( opener );
	await flush();
	byId( view.container, 'find-posts' ).props.onKeydown( { key: 'Escape', preventDefault() {}, stopPropagation() {} } );
	await flush();
	assert.equal( byId( view.container, 'find-posts' ).props.style, 'display: none;' );
	assert.equal( find( view.container, byClass( 'ui-find-overlay' ) ), null );
	assert.ok( render.focused === opener, 'the focus is back on Attach' );
	click( opener );
	await flush();
	byId( view.container, 'find-posts-close' ).props.onClick();
	await flush();
	assert.equal( byId( view.container, 'find-posts' ).props.style, 'display: none;' );
	click( opener );
	await flush();
	find( view.container, byClass( 'ui-find-overlay' ) ).props.onClick();
	await flush();
	assert.equal( byId( view.container, 'find-posts' ).props.style, 'display: none;' );
	// The rows are emptied on close and asked anew on open, as findPosts.close() and open().
	assert.equal( api.calls.filter( ( call ) => call.method === 'GET' ).length, 3 );
} );

test( 'the Attach bulk action opens Find Posts for the checked rows; a row\'s Attach adds the checked rows, as the classic form posts media[]', async () => {
	api.respondWith( async ( method, route ) => ( route === 'wp-admin/v1/posts/find' ? FOUND : { redirect: 'upload.php?attached=2', location: null } ) );
	const view = await page( DATA( { bulkActions: [ { value: 'delete', label: 'Delete permanently' }, { value: 'attach', label: 'Attach' } ], items: [ UNATTACHED( 7 ), UNATTACHED( 8 ), UNATTACHED( 9 ) ] } ) );
	await chooseBulk( view, 'attach' );
	// No row checked: the dialog opens all the same (media.js opens it before common.js checks).
	find( nav( view ), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.equal( byId( view.container, 'find-posts' ).props.style ?? null, null );
	assert.deepEqual( added, [] );
	await check( view, 7 );
	await check( view, 9 );
	const select = async () => {
		find( findAll( byId( view.container, 'find-posts' ), byTag( 'tr' ) ).filter( ( tr ) => hasClass( tr, 'found-posts' ) )[ 0 ], byProp( 'type', 'radio' ) ).props.onChange();
		await flush();
		byId( view.container, 'find-posts-submit' ).props.onClick( prevent );
		await flush();
	};
	await select();
	assert.deepEqual( api.calls.at( -1 ).payload, { action: 'attach', parentId: 1, ids: [ 7, 9 ], list: { mode: 'list' } } );
	assert.deepEqual( attachIds( [ 7, 9 ], 8 ), [ 7, 9, 8 ] );
	assert.deepEqual( attachIds( [ 7, 9 ], 9 ), [ 7, 9 ] );
	assert.deepEqual( attachIds( [], null ), [] );
} );

test( 'Find Posts: a refused attach is a page notice with the API\'s text as it is; the dialog stays open', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === 'wp-admin/v1/posts/find' ) {
			return FOUND;
		}
		throw Object.assign( new Error( 'Sorry, you are not allowed to edit this post. &amp;' ), { status: 403 } );
	} );
	const view = await page( DATA( { items: [ UNATTACHED( 7 ) ] } ) );
	click( actionOf( view, 7, 'attach' ) );
	await flush();
	find( byId( view.container, 'find-posts' ), byProp( 'type', 'radio' ) ).props.onChange();
	await flush();
	byId( view.container, 'find-posts-submit' ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Sorry, you are not allowed to edit this post. &amp;' );
	assert.equal( spoken.at( -1 ), 'Sorry, you are not allowed to edit this post. &amp;' );
	assert.equal( byId( view.container, 'find-posts' ).props.style ?? null, null );
	assert.equal( byId( view.container, 'find-posts-submit' ).props.disabled, false );
} );

test( 'Find Posts: an answer that comes after the page unmounted is dropped', async () => {
	const reply = deferred();
	api.respondWith( () => reply.promise );
	const view = await page( DATA( { items: [ UNATTACHED( 7 ) ] } ) );
	click( actionOf( view, 7, 'attach' ) );
	await flush();
	unmountAll();
	reply.resolve( FOUND );
	await flush();
	assert.ok( view );
	assert.deepEqual( foundRows( { rows: [ { id: 3, title: 7 }, { title: 'x' }, null ] } ), [ { id: 3, title: '7', type: '', date: '', status: '' } ] );
} );

// Bulk actions, Empty Trash, messages, the list form ------------------------------------------

test( 'the bulk Delete permanently always asks first (media.js), whatever confirmDelete; then common.js\'s checks; then media/bulk', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&deleted=1', location: null } ) );
	const view = await page( DATA( { confirmDelete: false } ) );
	find( nav( view ), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select a bulk action to perform.' );
	assert.deepEqual( asked, [] );
	await chooseBulk( view, 'delete' );
	answerConfirm = false;
	await check( view, 8 );
	find( nav( view ), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( asked, [ WARN ] );
	assert.equal( api.calls.length, 0 );
	answerConfirm = true;
	find( nav( view, 1 ), byProp( 'id', 'doaction2' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/media/bulk', payload: { action: 'delete', ids: [ 8 ], list: { mode: 'list' } } } ] );
	assert.deepEqual( followed, [ { redirect: 'upload.php?mode=list&deleted=1', location: null } ] );
} );

test( 'the bulk Move to Trash asks nothing; without a checked row common.js says so', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?trashed=1&ids=7', location: null } ) );
	const view = await page( DATA( { bulkActions: [ { value: 'trash', label: 'Move to Trash' } ] } ) );
	await chooseBulk( view, 'trash' );
	find( nav( view ), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'Please select at least one item to perform this action on.' );
	await check( view, 7 );
	find( nav( view ), byProp( 'id', 'doaction' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( asked, [] );
	assert.deepEqual( api.calls[ 0 ].payload, { action: 'trash', ids: [ 7 ], list: { mode: 'list' } } );
} );

test( 'Empty Trash, in the filter bar of the Trash, posts delete_all and follows the answer', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?attachment-filter=trash&deleted=2', location: null } ) );
	const view = await page( DATA( { query: { 'attachment-filter': 'trash', mode: 'list' }, filterBar: FILTER_BAR( { emptyTrash: { label: 'Empty Trash' }, months: null } ) } ) );
	const buttons = findAll( view.container, byProp( 'id', 'delete_all' ) );
	assert.equal( buttons.length, 1, 'once, in the bar, as extra_tablenav( \'bar\' ) prints it' );
	assert.ok( hasClass( buttons[ 0 ], 'button-compact' ) && hasClass( buttons[ 0 ], 'apply' ) );
	assert.equal( byId( view.container, 'filter-by-date' ), null );
	buttons[ 0 ].props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/media/bulk', payload: { action: 'delete_all', ids: [], list: { 'attachment-filter': 'trash', mode: 'list' } } } );
	assert.equal( followed.length, 1 );
} );

test( 'the messages: #message; Undo calls its request with the list and follows the answer; dismissible', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?untrashed=2', location: null } ) );
	const undo = { method: 'POST', route: 'wp-admin/v1/media/bulk', body: { action: 'untrash', ids: [ 7, 8 ], undo: true } };
	const view = await page( DATA( { messages: [ { markup: '2 media files moved to the Trash.', undo } ] } ) );
	const message = byId( view.container, 'message' );
	assert.ok( hasClass( message, 'updated' ) && hasClass( message, 'is-dismissible' ) );
	assert.equal( clean( find( message, byTag( 'p' ) ) ), '2 media files moved to the Trash. Undo' );
	find( message, ( el ) => el.tag === 'a' && textOf( el ) === 'Undo' ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls[ 0 ], { method: 'POST', route: 'wp-admin/v1/media/bulk', payload: { action: 'untrash', ids: [ 7, 8 ], undo: true, list: { mode: 'list' } } } );
	assert.deepEqual( followed, [ { redirect: 'upload.php?untrashed=2', location: null } ] );
	find( message, byClass( 'notice-dismiss' ) ).props.onClick();
	await flush();
	assert.ok( byId( view.container, 'message' ) === null );
} );

test( 'an answer that leads to the address shown reads the list again', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list', location: null } ) );
	const view = await page();
	click( find( cellOf( view, 7, 'parent' ), byClass( 'detach-from-parent' ) ) );
	await flush();
	assert.equal( refreshed, 1 );
} );

test( 'the filter bar builds the query: Filter and Search Media navigate to upload.php with the form\'s fields, less the bulk and dialog fields', async () => {
	const view = await page();
	formEntries = [
		[ 'mode', 'list' ], [ 'attachment-filter', 'detached' ], [ 'm', '202611' ], [ 'fixture_filter', 'noted' ], [ 'filter_action', 'Filter' ], [ 's', 'cat' ],
		[ 'action', 'delete' ], [ 'paged', '1' ], [ 'media[]', '7' ], [ 'action2', '-1' ], [ 'affected', '' ], [ '_ajax_nonce', 'x' ], [ 'ps', 'hello' ], [ 'found_post_id', '2' ],
	];
	byId( view.container, 'posts-filter' ).props.onSubmit( prevent );
	await flush();
	assert.deepEqual( navigated, [ [ '/wp-admin/upload.php?mode=list&attachment-filter=detached&m=202611&fixture_filter=noted&s=cat&paged=1', null ] ] );
	for ( const name of [ 'action', 'action2', 'media[]', 'delete_all', 'filter_action', 'found_post_id', 'ps', 'affected', '_ajax_nonce' ] ) {
		assert.ok( SKIPPED_FIELDS.has( name ), name );
	}
	assert.equal( currentMode( { modes: [ { mode: 'grid', current: false } ] } ), 'list' );
	assert.deepEqual( filterLinks( { filterLinksHtml: { acme: '<a>x</a>', bad: 3 } } ), [ { key: 'acme', html: '<a>x</a>' } ] );
	assert.deepEqual( filterLinks( { filterLinksHtml: [] } ), [] );
} );

test( 'the plugins\' filter links and restrict_manage_posts output are LegacyHtml; the search value and the selected type come from the data', async () => {
	const view = await page( DATA( { filterBar: FILTER_BAR( { filterLinksHtml: { acme: '<a href="#">Acme</a>' }, types: { ...FILTER_BAR().types, value: 'detached' }, search: { label: 'Search Media', inputId: 'media-search-input', value: 'cat' } } ), heading: { title: 'Media Library', addNew: null, search: 'cat' } } ) );
	const links = find( view.container, byClass( 'filter-links' ) );
	assert.ok( hasClass( find( links, byTag( 'li' ) ), 'acme' ) );
	assert.equal( byId( view.container, 'media-search-input' ).props.value, 'cat' );
	const selected = findAll( byId( view.container, 'attachment-filter' ), byTag( 'option' ) ).filter( ( o ) => o.props.selected === true || o.props.selected === '' );
	assert.deepEqual( selected.map( ( o ) => o.props.value ), [ 'detached' ] );
	assert.equal( clean( find( view.container, byClass( 'subtitle' ) ) ), 'Search results for: cat' );
	assert.equal( find( view.container, byClass( 'page-title-action' ) ), null );
} );

// Screen Options, body classes, failures, the shared helpers ----------------------------------

test( 'Screen Options: upload_per_page and the columns; a column checkbox hides its cells and saves for upload', async () => {
	const view = await page();
	assert.equal( screenOptions.pagination.option, 'upload_per_page' );
	assert.equal( screenOptions.viewMode, null );
	await screenOptions.onChange( 'hide-column', { key: 'author', hidden: true } );
	await flush();
	assert.ok( hasClass( cellOf( view, 7, 'author' ), 'hidden' ) );
	assert.deepEqual( api.calls.at( -1 ), { method: 'POST', route: 'wp-admin/v1/screen-preferences/upload', payload: { columnsHidden: [ 'author' ] } } );
	await screenOptions.onApply( { perPage: 5 } );
	assert.deepEqual( api.calls.at( -1 ).payload, { perPage: 5, referer: 'upload.php?mode=list' } );
	assert.equal( refreshed, 1 );
} );

test( 'the body has upload-php while shown; the die screen and a failed list', async () => {
	const fakeBody = new Set();
	const savedDocument = globalThis.document;
	globalThis.document = { body: { classList: { add: ( ...names ) => names.forEach( ( n ) => fakeBody.add( n ) ), remove: ( ...names ) => names.forEach( ( n ) => fakeBody.delete( n ) ) } }, visibilityState: 'visible' };
	try {
		await page();
		assert.deepEqual( [ ...fakeBody ].sort(), [ 'post-type-attachment', 'upload-php' ] );
		unmountAll();
		assert.deepEqual( [ ...fakeBody ], [] );
	} finally {
		globalThis.document = savedDocument;
	}
	const die = await page( { query: {}, error: { kind: 'die', status: 500, heading: null, message: 'Sorry, you are not allowed to upload files.' } } );
	assert.equal( clean( find( die.container, byClass( 'wp-admin-upload-error' ) ) ), 'Sorry, you are not allowed to upload files.' );
	assert.ok( byId( die.container, 'posts-filter' ) === null );
	const broken = await page( { failed: true } );
	assert.equal( clean( find( broken.container, byClass( 'wp-admin-upload-failed' ) ) ), 'The media files could not be loaded.' );
} );

test( 'the shared row action helpers: requests, shown actions with local ones, links, bodies', () => {
	assert.equal( rowActions.isRequest( { method: 'POST', route: 'x' } ), true );
	assert.equal( rowActions.isRequest( { method: 'GET', route: 'x' } ), false );
	assert.deepEqual( rowActions.shownActions( [ { action: 'copy' }, { action: 'edit', url: 'a' }, { action: 'none' } ], [ 'copy' ] ).map( ( a ) => a.action ), [ 'copy', 'edit' ] );
	assert.equal( rowActions.actionHref( { url: 'https://x/y' } ), 'https://x/y' );
	assert.equal( rowActions.actionHref( { url: null } ), '#' );
	assert.equal( rowActions.actionHref( { url: 'javascript:alert(1)' } ), '#', 'M3: only http(s) and relative addresses' );
	assert.equal( rowActions.actionHref( { url: ' JavaScript:alert(1)' } ), '#' );
	assert.equal( rowActions.actionHref( { url: 'data:text/html,x' } ), '#' );
	assert.equal( rowActions.actionHref( { url: '//evil.example/x' } ), '#' );
	assert.equal( rowActions.actionHref( { url: 'post.php?post=1' } ), '/wp-admin/post.php?post=1' );
	assert.deepEqual( rowActions.requestBody( { body: [] } ), {} );
	assert.deepEqual( rowActions.requestBody( { body: { a: 1 } } ), { a: 1 } );
} );
