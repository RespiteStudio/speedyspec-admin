import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
const flush = async () => {
	for ( let i = 0; i < 6; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const { formatParts } = await import( '../site/components/core/dashboard-parts/format.js' );
const { adminHref, widgetContract, WIDGET_CONTRACTS } = await import( '../site/components/core/dashboard-parts/links.js' );
const { rowActions, replaceRow, insertAfter } = await import( '../site/components/core/dashboard-recent-comments.js' );
const { failedView, timeZoneName, browserTimeZone } = await import( '../site/components/core/dashboard-events-news.js' );
const { linkClasses } = await import( '../site/components/core/dashboard-browser-nag.js' );
const { screenSections, glanceWidgets } = await import( '../site/components/core/dashboard.js' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, shallowRef } = Vue;

const WIDGETS = [ 'at-a-glance', 'activity', 'recent-comments', 'quick-draft', 'events-news', 'site-health', 'php-nag', 'browser-nag', 'welcome' ];

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'dashboard', 'meta-box-holder', 'meta-box', ...WIDGETS.map( ( widget ) => 'dashboard-' + widget ) ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const pageModule = globalThis.__modules[ '/components/core/dashboard.js' ];

let spoken = [];
let screenOptions = null;
let added = [];

beforeEach( () => {
	spoken = [];
	screenOptions = null;
	added = [];
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( unmountAll );

const provide = ( extra = {} ) => ( {
	speak: ( message ) => spoken.push( message ),
	notices: { add: ( notice ) => added.push( notice ) },
	screenOptions: { set: ( options ) => {
		screenOptions = options;
		return () => {};
	} },
	...extra,
} );

const BOX = ( id, title ) => ( { id, title, basename: title, classes: [], closed: false, hidden: false, pinned: false, warning: false } );

/** Renders one widget's contract with its data. */
async function widget( name, data, { box = BOX( 'box', 'Box' ), context = 'site', listeners = {}, provided = {} } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/dashboard-' + name, data, box, context, assets: {}, ...listeners } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const texts = ( nodes ) => nodes.map( ( node ) => textOf( node ).replace( /\s+/g, ' ' ).trim() );
const clean = ( node ) => textOf( node ).replace( /\s+/g, ' ' ).trim();

// Contracts ----------------------------------------------------------------------------

test( 'the Dashboard page and each widget have a contract of their own, all in the page tier', () => {
	const page = globalThis.__modules[ '/contracts/core/dashboard.js' ].default;
	assert.equal( page.id, 'core/dashboard' );
	assert.equal( page.version, '1.0.0' );
	assert.equal( page.page, true );
	assert.deepEqual( Object.keys( page.slots ), [ 'before-widgets', 'after-widgets' ] );
	assert.deepEqual( page.emits, [ 'saved' ] );

	for ( const name of WIDGETS ) {
		const contract = globalThis.__modules[ '/contracts/core/dashboard-' + name + '.js' ].default;
		assert.equal( contract.id, 'core/dashboard-' + name );
		assert.equal( contract.version, '1.0.0' );
		assert.equal( contract.page, true, name + ' is served with the page' );
		assert.ok( /^core\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test( contract.id ), 'two segments' );
		assert.deepEqual( Object.keys( contract.slots ), [ 'before-content', 'after-content' ] );
		assert.equal( contract.props.data.required, true );
	}
	assert.deepEqual( globalThis.__modules[ '/contracts/core/dashboard-quick-draft.js' ].default.emits, [ 'saved' ] );
	assert.deepEqual( globalThis.__modules[ '/contracts/core/dashboard-recent-comments.js' ].default.emits, [ 'moderated' ] );
	// Every core widget id has its contract.
	for ( const id of Object.keys( WIDGET_CONTRACTS ) ) {
		assert.ok( WIDGETS.includes( widgetContract( id ).slice( 'core/dashboard-'.length ) ), id );
	}
	assert.equal( widgetContract( 'acme_widget' ), null );
	assert.equal( widgetContract( 'constructor' ), null );
} );

test( 'the page module exports its help and its stylesheets', () => {
	assert.deepEqual( pageModule.stylesheets, [ 'dashboard', 'site-health' ] );
	assert.deepEqual( pageModule.help.tabs.map( ( tab ) => tab.id ), [ 'overview', 'help-navigation', 'help-layout', 'help-content' ] );
	assert.deepEqual( pageModule.help.tabs.map( ( tab ) => tab.title() ), [ 'Overview', 'Navigation', 'Layout', 'Content' ] );
	assert.ok( pageModule.help.sidebar );
	assert.equal( mergeHelp( pageModule.help, [] ).tabs.length, 4 );
} );

// Helpers --------------------------------------------------------------------------------

test( 'adminHref: admin paths become addresses of the site shown; absolute ones are kept', () => {
	assert.equal( adminHref( 'edit.php?post_status=publish', { pathname: '/wp-admin/' } ), '/wp-admin/edit.php?post_status=publish' );
	assert.equal( adminHref( 'site-health.php', { pathname: '/sites/3/wp-admin/index.php' } ), '/sites/3/wp-admin/site-health.php' );
	assert.equal( adminHref( 'network/update-core.php', { pathname: '/wp-admin/network/' } ), '/wp-admin/network/update-core.php' );
	assert.equal( adminHref( 'https://example.org/x', { pathname: '/wp-admin/' } ), 'https://example.org/x' );
	assert.equal( adminHref( '/wp-admin/index.php?edit=a', { pathname: '/wp-admin/' } ), '/wp-admin/index.php?edit=a' );
	assert.equal( adminHref( '', { pathname: '/wp-admin/' } ), '' );
	assert.equal( adminHref( null ), '' );
} );

test( 'formatParts: text between placeholders, numbered and in order, entities decoded', () => {
	assert.deepEqual( formatParts( 'From %1$s on %2$s %3$s' ), [ 'From ', { slot: 'arg1' }, ' on ', { slot: 'arg2' }, ' ', { slot: 'arg3' } ] );
	assert.deepEqual( formatParts( '%2$s auf %1$s' ), [ { slot: 'arg2' }, ' auf ', { slot: 'arg1' } ] );
	assert.deepEqual( formatParts( '%s and %s, 100%%' ), [ { slot: 'arg1' }, ' and ', { slot: 'arg2' }, ', 100', '%' ] );
	assert.deepEqual( formatParts( 'Near &#8220;%s&#8221; <b>' ), [ 'Near “', { slot: 'arg1' }, '” <b>' ] );
} );

test( 'screenSections: the Welcome checkbox follows the panel', () => {
	const sections = [ { id: 'metabox-prefs', legend: 'Screen elements', items: [ { id: 'dashboard_activity', label: 'Activity', checked: true }, { id: 'wp_welcome_panel', label: 'Welcome', checked: true } ] } ];
	const next = screenSections( sections, false );
	assert.deepEqual( next[ 0 ].items.map( ( item ) => item.checked ), [ true, false ] );
	assert.equal( sections[ 0 ].items[ 1 ].checked, true, 'Pure.' );
	assert.deepEqual( screenSections( null, true ), [] );
} );

// Widgets ---------------------------------------------------------------------------------

const GLANCE = {
	counts: [ { type: 'post', text: '2 Published posts', url: 'edit.php?post_status=publish&post_type=post' }, { type: 'page', text: '1 Published page', url: null } ],
	comments: { approved: { text: '3 Comments', url: 'edit-comments.php' }, moderated: { text: '0 Comments in moderation', url: 'edit-comments.php?comment_status=moderated', hidden: true } },
	glanceItems: [ '<a class="product-count" href="edit.php?post_type=product">4 Products</a>' ],
	version: { version: '7.3', theme: 'Twenty Twenty-One', themesUrl: 'themes.php', text: null, update: { text: 'Update to 7.4', url: 'update-core.php' } },
	searchEngines: { title: '', text: 'Search engines discouraged', url: 'options-reading.php' },
	quota: null,
	actions: null,
};

test( 'At a Glance: counts, comment counts, plugin items, the version line and the search engines line', async () => {
	const view = await widget( 'at-a-glance', GLANCE );
	const items = findAll( view.container, ( el ) => el.tag === 'li' );
	assert.deepEqual( items.map( ( li ) => li.props.class ?? '' ), [ 'post-count', 'page-count', 'comment-count', 'comment-mod-count hidden', '' ] );
	assert.deepEqual( texts( items.slice( 0, 4 ) ), [ '2 Published posts', '1 Published page', '3 Comments', '0 Comments in moderation' ] );
	assert.equal( find( items[ 0 ], byTag( 'a' ) ).props.href, '/wp-admin/edit.php?post_status=publish&post_type=post' );
	assert.equal( find( items[ 1 ], byTag( 'a' ) ), null, 'Text only, without the capability to edit.' );
	assert.equal( find( items[ 1 ], byTag( 'span' ) ) !== null, true );
	assert.equal( findAll( view.container, byTag( 'svg' ) ).length, 5, 'An icon per count and on the search engines line.' );
	assert.equal( find( items[ 4 ], byClass( 'wp-admin-legacy-html' ) ).tag, 'span', 'Glance items are the plugins\' HTML.' );

	const message = byId( view.container, 'wp-version-message' );
	assert.equal( clean( byId( view.container, 'wp-version' ) ), 'WordPress 7.3 running Twenty Twenty-One theme.' );
	assert.equal( find( byId( view.container, 'wp-version' ), byTag( 'a' ) ).props.href, '/wp-admin/themes.php' );
	const update = find( message, byClass( 'button' ) );
	assert.equal( update.props.href, '/wp-admin/update-core.php' );
	assert.equal( update.props[ 'aria-describedby' ], 'wp-version' );

	const engines = find( view.container, byClass( 'search-engines-info' ) );
	assert.equal( clean( engines ), 'Search engines discouraged' );
	assert.ok( ! find( engines, byTag( 'a' ) ).props.title, 'No title attribute for an empty title.' );
	assert.equal( find( view.container, byClass( 'sub' ) ), null );
} );

test( 'At a Glance: a theme the user may not switch is text; a filtered version line and plugin output are HTML; the quota', async () => {
	const view = await widget( 'at-a-glance', {
		...GLANCE,
		comments: null,
		glanceItems: null,
		searchEngines: null,
		version: { version: '7.3', theme: 'Twenty', themesUrl: null, text: null, update: null },
		quota: { allowed: { text: '100 MB Space Allowed' }, used: { text: '80.00 MB (80%) Space Used', warning: true }, url: 'upload.php' },
		actions: '<p class="acme">Acme</p>',
	} );
	assert.equal( clean( byId( view.container, 'wp-version-message' ) ), 'WordPress 7.3 running Twenty theme.' );
	assert.equal( find( byId( view.container, 'wp-version-message' ), byTag( 'a' ) ), null );
	const sub = find( view.container, byClass( 'sub' ) );
	assert.deepEqual( texts( findAll( sub, byClass( 'storage-count' ) ) ), [ '100 MB Space Allowed (Manage Uploads)', '80.00 MB (80%) Space Used (Manage Uploads)' ] );
	assert.ok( hasClass( findAll( sub, byClass( 'storage-count' ) )[ 1 ], 'warning' ) );
	assert.equal( find( sub, byClass( 'musublink' ) ).props.href, '/wp-admin/upload.php' );
	assert.equal( find( sub, byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<p class="acme">Acme</p>' );

	const filtered = await widget( 'at-a-glance', { ...GLANCE, version: { ...GLANCE.version, text: 'Running <strong>7.3</strong>' } } );
	assert.equal( find( byId( filtered.container, 'wp-version' ), byClass( 'wp-admin-legacy-html' ) ).innerHTML, 'Running <strong>7.3</strong>' );
} );

test( 'Activity: the three sections in the classic order, with their dates, links and names, or "No activity yet!"', async () => {
	const post = ( id, extra = {} ) => ( { id, date: 'Today, 9:00 am', title: 'Post ' + id, url: 'post.php?post=' + id + '&action=edit', ariaLabel: 'Edit “Post ' + id + '”', ...extra } );
	const view = await widget( 'activity', {
		future: [ post( 1, { date: 'Tomorrow, 9:00 am' } ) ],
		published: [ post( 2 ) ],
		onThisDay: [ post( 3, { date: 'Nov 19th, 2024', author: 'by Ann', url: 'http://example.org/post-3/', ariaLabel: 'View “Post 3”' } ), post( 4, { author: null } ) ],
		empty: false,
	} );
	const blocks = findAll( view.container, byClass( 'activity-block' ) );
	assert.deepEqual( blocks.map( ( block ) => block.props.id ), [ 'future-posts', 'published-posts', 'on-this-day-posts' ] );
	assert.deepEqual( blocks.map( ( block ) => clean( find( block, byTag( 'h3' ) ) ) ), [ 'Publishing Soon', 'Recently Published', 'Published On This Day' ] );
	assert.equal( clean( find( blocks[ 0 ], byTag( 'li' ) ) ), 'Tomorrow, 9:00 am Post 1' );
	const link = find( blocks[ 1 ], byTag( 'a' ) );
	assert.equal( link.props.href, '/wp-admin/post.php?post=2&action=edit' );
	assert.equal( link.props[ 'aria-label' ], 'Edit “Post 2”' );
	const [ first, second ] = findAll( blocks[ 2 ], byTag( 'li' ) );
	assert.equal( find( first, byTag( 'a' ) ).props.href, 'http://example.org/post-3/' );
	assert.equal( clean( find( first, byClass( 'wp-on-this-day-post-author' ) ) ), 'by Ann' );
	assert.equal( find( second, byClass( 'wp-on-this-day-post-author' ) ), null );
	assert.equal( find( view.container, byClass( 'no-activity' ) ), null );

	const empty = await widget( 'activity', { future: [], published: [], onThisDay: [], empty: true } );
	assert.equal( clean( find( empty.container, byClass( 'no-activity' ) ) ), 'No activity yet!' );
	assert.equal( findAll( empty.container, byClass( 'activity-block' ) ).length, 0 );
} );

const STATUS = ( id, status ) => ( { method: 'POST', route: 'wp-admin/v1/comments/' + id + '/status', body: { status } } );
const COMMENT_ROW = {
	id: 7,
	postId: 3,
	status: 'unapproved',
	classes: [ 'comment', 'even', 'thread-even', 'depth-1', 'comment-item', 'unapproved' ],
	type: 'comment',
	typeLabel: null,
	post: { title: 'Hello', url: 'http://example.org/hello/' },
	author: { name: 'Pat', url: 'https://pat.example', rel: 'external nofollow ugc', html: null },
	avatar: 'https://secure.gravatar.com/avatar/x?s=50&d=mm',
	avatarHtml: null,
	excerpt: 'Pending words',
	actions: [
		{ action: 'approve', url: 'comment.php?action=approvecomment&p=3&c=7&_wpnonce=a', hidden: false, separator: false, request: STATUS( 7, 'approve' ) },
		{ action: 'unapprove', url: 'comment.php?action=unapprovecomment&p=3&c=7&_wpnonce=a', hidden: false, separator: false, request: STATUS( 7, 'unapprove' ) },
		{ action: 'reply', url: null, hidden: false, separator: true, request: { method: 'POST', route: 'wp-admin/v1/comments/7/reply', body: [] }, approveParent: true },
		{ action: 'edit', url: 'comment.php?action=editcomment&c=7', hidden: false, separator: true, request: null },
		{ action: 'spam', url: 'comment.php?action=spamcomment&p=3&c=7&_wpnonce=d', hidden: false, separator: true, request: STATUS( 7, 'spam' ) },
		{ action: 'trash', url: 'comment.php?action=trashcomment&p=3&c=7&_wpnonce=d', hidden: false, separator: true, request: STATUS( 7, 'trash' ) },
		{ action: 'view', url: 'http://example.org/hello/#comment-7', hidden: true, separator: true, request: null },
	],
	actionsHtml: null,
};
const VIEWS = [
	{ key: 'all', label: 'All (2)', format: 'All <span class="count">(%s)</span>', countText: '2', countClass: 'all-count', count: 2, url: 'edit-comments.php?comment_status=all', current: false },
	{ key: 'moderated', label: 'Pending (1)', format: 'Pending <span class="count">(%s)</span>', countText: '1', countClass: 'pending-count', count: 1, url: 'edit-comments.php?comment_status=moderated', current: false },
];

test( 'rowActions: the actions with an address or a route, with the separators WordPress gives', () => {
	assert.deepEqual( rowActions( COMMENT_ROW.actions ).map( ( a ) => [ a.action, a.separator ] ), [ [ 'approve', false ], [ 'unapprove', false ], [ 'reply', true ], [ 'edit', true ], [ 'spam', true ], [ 'trash', true ], [ 'view', true ] ] );
	// Without a route or an address (Reply before WordPress gave one), an action is left out.
	assert.deepEqual( rowActions( [ { action: 'reply', url: null, separator: true }, { action: 'reply', url: null, request: { method: 'GET', route: 'x' } } ] ), [] );
	assert.equal( rowActions( [ { action: 'edit', url: 'x', request: { method: 'PUT', route: 'y' } } ] )[ 0 ].request, null );
	assert.deepEqual( rowActions( null ), [] );
	// The page decides none: a missing flag is no separator.
	assert.deepEqual( rowActions( [ { action: 'edit', url: 'x', separator: true }, { action: 'approve', url: 'y' } ] ).map( ( a ) => a.separator ), [ true, false ] );
} );

test( 'Recent Comments: a row as the classic widget prints it, with the classic actions, and the views', async () => {
	const view = await widget( 'recent-comments', { comments: [ COMMENT_ROW, { ...COMMENT_ROW, id: 8, type: 'pingback', typeLabel: 'Pingback', post: null, avatar: null, author: { name: 'Blog', url: null, rel: 'ugc', html: null }, actions: null, status: 'approved', classes: [ 'pingback' ] } ], views: VIEWS, viewsHtml: null } );
	const list = byId( view.container, 'the-comment-list' );
	const [ row, ping ] = findAll( list, byTag( 'li' ) );
	assert.equal( row.props.id, 'comment-7' );
	assert.deepEqual( row.props.class.split( ' ' ), COMMENT_ROW.classes );
	assert.equal( find( row, byClass( 'avatar' ) ).props.src, COMMENT_ROW.avatar );
	assert.ok( hasClass( find( row, byClass( 'dashboard-comment-wrap' ) ), 'has-avatar' ) );
	assert.equal( clean( find( row, byClass( 'comment-meta' ) ) ), 'From Pat on Hello [Pending]' );
	const author = find( find( row, byTag( 'cite' ) ), byTag( 'a' ) );
	assert.deepEqual( [ author.props.href, author.props.class, author.props.rel ], [ 'https://pat.example', 'url', 'external nofollow ugc' ] );
	assert.equal( clean( find( row, byTag( 'blockquote' ) ) ), 'Pending words' );

	const actions = find( row, byClass( 'row-actions' ) );
	assert.equal( clean( actions ), 'ApproveUnapprove | Reply | Edit | Spam | Trash | View' );
	const spans = findAll( actions, byTag( 'span' ) );
	assert.deepEqual( spans.map( ( span ) => span.props.class ), [ 'approve', 'unapprove', 'reply hide-if-no-js', 'edit', 'spam', 'trash', 'view hidden' ] );
	const links = findAll( actions, byTag( 'a' ) );
	assert.equal( links[ 0 ].props.href, '/wp-admin/comment.php?action=approvecomment&p=3&c=7&_wpnonce=a' );
	assert.equal( links[ 0 ].props.role, 'button' );
	assert.equal( links[ 0 ].props[ 'aria-label' ], 'Approve this comment' );
	assert.equal( links[ 2 ].props.role, undefined, 'Edit is a link.' );
	assert.equal( links[ 4 ].props.class, 'delete vim-d vim-destructive aria-button-if-js' );
	assert.equal( links[ 5 ].props.href, 'http://example.org/hello/#comment-7' );
	const replyButton = find( actions, byTag( 'button' ) );
	assert.deepEqual( [ replyButton.props.type, replyButton.props.class, replyButton.props[ 'aria-label' ], replyButton.props[ 'aria-expanded' ], clean( replyButton ) ], [ 'button', 'vim-r button-link hide-if-no-js', 'Reply to this comment', 'false', 'Reply' ] );

	assert.equal( clean( find( ping, byClass( 'comment-meta' ) ) ), 'Pingback [Pending]' );
	assert.equal( clean( find( ping, ( el ) => el.tag === 'p' && hasClass( el, 'comment-author' ) ) ), 'Blog' );
	assert.equal( find( ping, byClass( 'row-actions' ) ), null, 'No actions for a user who may not edit it.' );
	assert.equal( find( ping, byClass( 'has-avatar' ) ), null );

	assert.equal( clean( find( view.container, ( el ) => el.tag === 'h3' && hasClass( el, 'screen-reader-text' ) ) ), 'View more comments' );
	const views = find( view.container, byClass( 'subsubsub' ) );
	assert.equal( clean( views ), 'All (2) | Pending (1)' );
	const pending = findAll( views, byTag( 'li' ) )[ 1 ];
	assert.equal( pending.props.class, 'moderated' );
	assert.equal( find( pending, byTag( 'a' ) ).props.href, '/wp-admin/edit-comments.php?comment_status=moderated' );
	assert.equal( find( pending, byClass( 'count' ) ).tag, 'span' );
	assert.equal( clean( find( pending, byClass( 'pending-count' ) ) ), '1' );
} );

test( 'Recent Comments: none, filtered HTML, and no views for a user who may not edit posts', async () => {
	const none = await widget( 'recent-comments', { comments: [], views: [], viewsHtml: null } );
	assert.equal( clean( none.container ), 'No comments to show.' );

	const filtered = await widget( 'recent-comments', { comments: [ { ...COMMENT_ROW, actionsHtml: '<span class="approve"><a href="x">Approve</a></span>', author: { ...COMMENT_ROW.author, html: '<a href="y">Pat!</a>' } } ], views: [], viewsHtml: [ { key: 'all', html: '<a href="z">All</a>' } ] } );
	assert.equal( find( find( filtered.container, byClass( 'row-actions' ) ), byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<span class="approve"><a href="x">Approve</a></span>' );
	assert.equal( find( find( filtered.container, byTag( 'cite' ) ), byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<a href="y">Pat!</a>' );
	assert.equal( find( find( filtered.container, byClass( 'subsubsub' ) ), byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<a href="z">All</a>' );

	const reader = await widget( 'recent-comments', { comments: [ { ...COMMENT_ROW, actions: null } ], views: [], viewsHtml: null } );
	assert.equal( find( reader.container, byClass( 'subsubsub' ) ), null );
	assert.equal( find( reader.container, ( el ) => el.tag === 'h3' ), null );
} );

const APPROVED_ROW = { ...COMMENT_ROW, status: 'approved', classes: [ 'comment', 'depth-1', 'comment-item', 'approved' ], excerpt: 'Approved words' };
const NEW_VIEWS = [ { ...VIEWS[ 0 ] }, { ...VIEWS[ 1 ], label: 'Pending (0)', countText: '0', count: 0 } ];
const GLANCE_COMMENTS = { approved: { text: '3 Comments', url: 'edit-comments.php' }, moderated: { text: '0 Comments in moderation', url: 'edit-comments.php?comment_status=moderated', hidden: true } };
const ANSWER = ( extra = {} ) => ( { id: 7, postId: 3, status: 'approved', changed: true, row: APPROVED_ROW, undo: null, views: NEW_VIEWS, viewsHtml: null, glance: GLANCE_COMMENTS, pending: 0, ...extra } );
const rowOf = ( view, id ) => byId( view.container, 'comment-' + id );
const actionLink = ( view, id, name ) => find( find( find( rowOf( view, id ), byClass( 'row-actions' ) ), byClass( name ) ), ( el ) => el.tag === 'a' || el.tag === 'button' );

test( 'Recent Comments: Approve calls its route; the answer\'s row and views replace the widget\'s and are emitted', async () => {
	const moderated = [];
	api.respondWith( async () => ANSWER() );
	const view = await widget( 'recent-comments', { comments: [ COMMENT_ROW ], views: VIEWS, viewsHtml: null }, { listeners: { onModerated: ( answer ) => moderated.push( answer ) } } );
	let prevented = false;
	await actionLink( view, 7, 'approve' ).props.onClick( { preventDefault() {
		prevented = true;
	} } );
	await flush();

	assert.ok( prevented, 'The classic address is not followed.' );
	assert.deepEqual( api.calls.map( ( c ) => [ c.method, c.route, c.payload ] ), [ [ 'POST', 'wp-admin/v1/comments/7/status', { status: 'approve' } ] ] );
	assert.ok( hasClass( rowOf( view, 7 ), 'approved' ) );
	assert.equal( clean( find( rowOf( view, 7 ), byTag( 'blockquote' ) ) ), 'Approved words' );
	assert.equal( clean( find( view.container, byClass( 'subsubsub' ) ) ), 'All (2) | Pending (0)' );
	assert.equal( moderated.length, 1 );
	assert.equal( moderated[ 0 ].glance, GLANCE_COMMENTS );
} );

test( 'Recent Comments: Trash hides the row, shows the undo notice WordPress describes, and Undo restores it', async () => {
	const undo = { message: 'Comment by %s moved to the Trash.', author: 'Pat', request: STATUS( 7, 'untrash' ) };
	let answer;
	const answered = new Promise( ( resolve ) => {
		answer = resolve;
	} );
	api.respondWith( async ( method, route, payload ) => ( payload.status === 'trash' ? answered : ANSWER( { row: COMMENT_ROW, status: 'unapproved' } ) ) );
	const view = await widget( 'recent-comments', { comments: [ COMMENT_ROW ], views: VIEWS, viewsHtml: null } );
	const trash = actionLink( view, 7, 'trash' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.deepEqual( rowOf( view, 7 ).props.style, { display: 'none' }, 'Hidden at once, as wp-lists does.' );
	assert.equal( byId( view.container, 'undo-7' ), null );
	answer( ANSWER( { status: 'trash', row: null, undo } ) );
	await trash;
	await flush();

	const notice = byId( view.container, 'undo-7' );
	assert.equal( notice.props.class, 'undo untrash' );
	assert.ok( find( notice, byClass( 'trash-undo-inside' ) ) );
	assert.equal( clean( notice ), 'Comment by Pat moved to the Trash. Undo' );
	assert.equal( clean( find( notice, byTag( 'strong' ) ) ), 'Pat' );
	assert.equal( find( notice, byClass( 'avatar' ) ).props.src, COMMENT_ROW.avatar );
	const link = find( find( notice, byClass( 'untrash' ) ), byTag( 'a' ) );
	assert.equal( link.props.class, 'vim-z vim-destructive aria-button-if-js' );
	assert.deepEqual( rowOf( view, 7 ).props.style, { display: 'none' } );

	await link.props.onClick( { preventDefault() {} } );
	await flush();
	assert.deepEqual( api.calls.at( -1 ).payload, { status: 'untrash' } );
	assert.equal( byId( view.container, 'undo-7' ), null );
	assert.equal( rowOf( view, 7 ).props.style ?? null, null );
} );

test( 'Recent Comments: Spam\'s notice, a permanent delete, and a failed action', async () => {
	api.respondWith( async () => ANSWER( { status: 'spam', row: null, undo: { message: 'Comment by %s marked as spam.', author: 'Pat', request: STATUS( 7, 'unspam' ) } } ) );
	const view = await widget( 'recent-comments', { comments: [ COMMENT_ROW, { ...COMMENT_ROW, id: 8, actions: [ { action: 'delete', url: 'x', separator: false, request: { method: 'DELETE', route: 'wp-admin/v1/comments/8', body: [] } } ] }, { ...COMMENT_ROW, id: 9 } ], views: VIEWS, viewsHtml: null } );
	await actionLink( view, 7, 'spam' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.equal( byId( view.container, 'undo-7' ).props.class, 'undo unspam' );
	assert.ok( find( byId( view.container, 'undo-7' ), byClass( 'spam-undo-inside' ) ) );
	assert.equal( clean( byId( view.container, 'undo-7' ) ), 'Comment by Pat marked as spam. Undo' );

	api.respondWith( async () => ANSWER( { id: 8, status: 'deleted', row: null, undo: null } ) );
	await actionLink( view, 8, 'delete' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.deepEqual( [ api.calls.at( -1 ).method, api.calls.at( -1 ).route ], [ 'DELETE', 'wp-admin/v1/comments/8' ] );
	assert.equal( rowOf( view, 8 ), null, 'A deleted comment leaves; no other comes in, as on the classic Dashboard.' );

	api.respondWith( async () => {
		throw Object.assign( new Error( 'Sorry, you are not allowed to moderate or edit this comment.' ), { status: 403 } );
	} );
	await actionLink( view, 9, 'trash' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.deepEqual( rowOf( view, 9 ).props.style, { backgroundColor: '#faa' }, 'Shown again, as wp-lists shows a failed delete.' );
	await actionLink( view, 9, 'approve' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.deepEqual( rowOf( view, 9 ).props.style, { backgroundColor: '#FF3333' } );
} );

test( 'Recent Comments: Reply opens the form of wp_comment_reply(); its answer adds the reply after the comment', async () => {
	const moderated = [];
	const reply = { ...APPROVED_ROW, id: 12, excerpt: 'Thanks', actions: null };
	api.respondWith( async () => ANSWER( { id: 12, row: reply, parent: { id: 7, approved: true, row: APPROVED_ROW } } ) );
	const view = await widget( 'recent-comments', { comments: [ COMMENT_ROW, { ...COMMENT_ROW, id: 9 } ], views: VIEWS, viewsHtml: null }, { listeners: { onModerated: ( answer ) => moderated.push( answer ) } } );
	await actionLink( view, 7, 'reply' ).props.onClick();
	await flush();

	const form = byId( view.container, 'replyrow' );
	assert.ok( form, 'The form opens below the comment.' );
	const list = byId( view.container, 'the-comment-list' );
	assert.deepEqual( list.children.filter( ( el ) => el.tag ).map( ( el ) => el.props.id ), [ 'comment-7', 'replyrow', 'comment-9' ] );
	assert.equal( clean( find( form, byTag( 'legend' ) ) ), 'Reply to Comment' );
	assert.equal( clean( find( form, byTag( 'label' ) ) ), 'Comment' );
	assert.equal( clean( byId( form, 'replybtn' ) ), 'Approve and Reply', 'The comment awaits moderation.' );
	assert.equal( clean( find( form, byClass( 'cancel' ) ) ), 'Cancel' );
	assert.equal( actionLink( view, 7, 'reply' ).props[ 'aria-expanded' ], 'true' );
	assert.ok( hasClass( find( form, byClass( 'notice-error' ) ), 'hidden' ) );

	byId( form, 'replycontent' ).props.onInput( { target: { value: 'Thanks' } } );
	await flush();
	await find( form, byClass( 'save' ) ).props.onClick();
	await flush();

	assert.deepEqual( api.calls.map( ( c ) => [ c.method, c.route, c.payload ] ), [ [ 'POST', 'wp-admin/v1/comments/7/reply', { content: 'Thanks' } ] ] );
	assert.equal( byId( view.container, 'replyrow' ), null, 'The form closes.' );
	assert.deepEqual( byId( view.container, 'the-comment-list' ).children.filter( ( el ) => el.tag ).map( ( el ) => el.props.id ), [ 'comment-7', 'comment-12', 'comment-9' ] );
	assert.ok( hasClass( rowOf( view, 7 ), 'approved' ), 'The comment replied to was approved.' );
	assert.equal( moderated.length, 1 );
} );

test( 'Recent Comments: a reply that fails shows WordPress\'s message; Cancel and Escape close the form', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Please type your comment text.' ), { status: 400 } );
	} );
	const view = await widget( 'recent-comments', { comments: [ APPROVED_ROW ], views: VIEWS, viewsHtml: null } );
	await actionLink( view, 7, 'reply' ).props.onClick();
	await flush();
	await find( byId( view.container, 'replyrow' ), byClass( 'save' ) ).props.onClick();
	await flush();
	const notice = find( byId( view.container, 'replyrow' ), byClass( 'notice-error' ) );
	assert.ok( ! hasClass( notice, 'hidden' ) );
	assert.equal( clean( notice ), 'Please type your comment text.' );
	assert.deepEqual( spoken, [ 'Please type your comment text.' ] );

	byId( view.container, 'replycontent' ).props.onKeyup( { key: 'Escape', isComposing: false } );
	await flush();
	assert.equal( byId( view.container, 'replyrow' ), null );

	await actionLink( view, 7, 'reply' ).props.onClick();
	await flush();
	await find( byId( view.container, 'replyrow' ), byClass( 'cancel' ) ).props.onClick();
	await flush();
	assert.equal( byId( view.container, 'replyrow' ), null );
	assert.equal( actionLink( view, 7, 'reply' ).props[ 'aria-expanded' ], 'false' );
} );

test( 'Recent Comments: the reply button says Reply for an approved comment', async () => {
	const view = await widget( 'recent-comments', { comments: [ { ...APPROVED_ROW, actions: [ { ...COMMENT_ROW.actions[ 2 ], approveParent: false } ] } ], views: [], viewsHtml: null } );
	await actionLink( view, 7, 'reply' ).props.onClick();
	await flush();
	assert.equal( clean( byId( view.container, 'replybtn' ) ), 'Reply' );
} );

test( 'Recent Comments: the core actions in filtered row actions HTML call their routes', async () => {
	api.respondWith( async () => ANSWER() );
	const view = await widget( 'recent-comments', { comments: [ { ...COMMENT_ROW, actionsHtml: '<span class="approve"><a href="x">Approve</a></span> | <span class="acme"><a href="y">Acme</a></span>' } ], views: VIEWS, viewsHtml: null } );
	const actions = find( rowOf( view, 7 ), byClass( 'row-actions' ) );
	const element = ( name ) => ( { closest: ( selector ) => ( selector === 'span' ? { classList: { contains: ( value ) => value === name } } : {} ) } );
	let prevented = 0;
	actions.props.onClick( { target: element( 'acme' ), preventDefault() {
		prevented++;
	} } );
	assert.equal( api.calls.length, 0, 'A plugin action is left alone.' );
	actions.props.onClick( { target: element( 'approve' ), preventDefault() {
		prevented++;
	} } );
	await flush();
	assert.equal( prevented, 1 );
	assert.deepEqual( api.calls.map( ( c ) => c.payload ), [ { status: 'approve' } ] );
} );

test( 'replaceRow and insertAfter: the rows after an answer', () => {
	const rows = [ { id: 1 }, { id: 2 } ];
	assert.deepEqual( replaceRow( rows, 2, { id: 2, x: 1 } ), [ { id: 1 }, { id: 2, x: 1 } ] );
	assert.deepEqual( replaceRow( rows, 2, null ), [ { id: 1 } ] );
	assert.equal( replaceRow( rows, 2, null, true ), rows );
	assert.deepEqual( insertAfter( rows, 1, { id: 3 } ), [ { id: 1 }, { id: 3 }, { id: 2 } ] );
	assert.equal( insertAfter( rows, 1, { id: 2 } ), rows );
	assert.equal( insertAfter( rows, 1, null ), rows );
} );

const QUICK_DRAFT = {
	canEdit: true,
	postId: 5,
	titleLabel: 'Title',
	drafts: { items: [ { id: 9, title: 'Draft one', url: 'post.php?post=9&action=edit', ariaLabel: 'Edit “Draft one”', date: 'November 19, 2026', isoDate: '2026-11-19T10:00:00+00:00', excerpt: 'Some words' } ], viewAll: 'edit.php?post_status=draft' },
};

test( 'Quick Draft: the classic form and the recent drafts', async () => {
	const view = await widget( 'quick-draft', QUICK_DRAFT );
	const form = byId( view.container, 'quick-press' );
	assert.equal( form.props.action, '/wp-admin/post.php' );
	assert.equal( clean( find( form, ( el ) => el.tag === 'label' && el.props.for === 'title' ) ), 'Title' );
	assert.equal( byId( form, 'title' ).props.name, 'post_title' );
	assert.equal( byId( form, 'content' ).props.placeholder, 'What’s on your mind?' );
	assert.equal( byId( form, 'save-post' ).props.value, 'Save Draft' );

	const drafts = find( view.container, byClass( 'drafts' ) );
	assert.equal( find( find( drafts, byClass( 'view-all' ) ), byTag( 'a' ) ).props.href, '/wp-admin/edit.php?post_status=draft' );
	assert.equal( clean( find( drafts, byTag( 'h2' ) ) ), 'Your Recent Drafts' );
	const link = find( find( drafts, byClass( 'draft-title' ) ), byTag( 'a' ) );
	assert.deepEqual( [ link.props.href, link.props[ 'aria-label' ], clean( link ) ], [ '/wp-admin/post.php?post=9&action=edit', 'Edit “Draft one”', 'Draft one' ] );
	assert.equal( find( drafts, byTag( 'time' ) ).props.datetime, '2026-11-19T10:00:00+00:00' );
	assert.equal( clean( find( drafts, byClass( 'draft-content' ) ) ), 'Some words' );

	const empty = await widget( 'quick-draft', { ...QUICK_DRAFT, drafts: { items: [], viewAll: null } } );
	assert.equal( clean( find( empty.container, byClass( 'no-drafts' ) ) ), 'There are no recent drafts.' );

	const reader = await widget( 'quick-draft', { canEdit: false } );
	assert.equal( clean( reader.container ), '' );
} );

test( 'Quick Draft: a save posts the fields with the auto-draft, then shows the answer and empties the form', async () => {
	const saved = [];
	api.respondWith( async ( method, route, payload ) => {
		assert.deepEqual( [ method, route, payload ], [ 'POST', 'wp-admin/v1/dashboard/quick-draft', { title: 'My title', content: 'My words', postId: 5 } ] );
		return { notice: { type: 'success', message: 'Draft created successfully.' }, drafts: { items: [ { ...QUICK_DRAFT.drafts.items[ 0 ], id: 11, title: 'My title' } ], viewAll: null }, postId: 12 };
	} );
	const view = await widget( 'quick-draft', QUICK_DRAFT, { listeners: { onSaved: ( answer ) => saved.push( answer ) } } );
	const form = byId( view.container, 'quick-press' );
	byId( form, 'title' ).props.onInput( { target: { value: 'My title' } } );
	byId( form, 'content' ).props.onInput( { target: { value: 'My words' } } );
	await flush();
	await form.props.onSubmit( { preventDefault() {} } );
	await flush();

	const notice = find( view.container, byClass( 'notice' ) );
	assert.equal( notice.props.role, 'alert' );
	assert.ok( hasClass( notice, 'notice-success' ) );
	assert.equal( clean( notice ), 'Draft created successfully.' );
	assert.equal( byId( view.container, 'title' ).props.value, '' );
	assert.equal( clean( find( view.container, byClass( 'draft-title' ) ) ).startsWith( 'My title' ), true );
	assert.equal( find( view.container, byClass( 'view-all' ) ), null );
	assert.equal( saved.length, 1 );

	// The next save uses the auto-draft the answer named; an empty save shows the error WordPress sends.
	api.respondWith( async ( method, route, payload ) => {
		assert.equal( payload.postId, 12 );
		return { notice: { type: 'error', message: 'Cannot create a draft post with empty title and content.' }, drafts: { items: [], viewAll: null }, postId: 12 };
	} );
	await byId( view.container, 'quick-press' ).props.onSubmit( { preventDefault() {} } );
	await flush();
	assert.ok( hasClass( find( view.container, byClass( 'notice' ) ), 'notice-error' ) );
	assert.equal( clean( find( view.container, byClass( 'notice' ) ) ), 'Cannot create a draft post with empty title and content.' );
} );

test( 'Events: the time zone after a meetup\'s time is its name, else "GMT" and the offset (QUnit getTimeZoneAbbreviation)', () => {
	assert.equal( timeZoneName( { abbreviation: 'CDT', offset: '-5' }, 'GMT' ), 'CDT' );
	assert.equal( timeZoneName( { abbreviation: null, offset: '-5' }, 'GMT' ), 'GMT-5' );
	assert.equal( timeZoneName( { abbreviation: null, offset: '+0' }, 'GMT' ), 'GMT+0' );
	assert.equal( timeZoneName( { abbreviation: null, offset: '+5' }, 'UTC' ), 'UTC+5' );
	assert.equal( timeZoneName( { abbreviation: '', offset: '+5.75' }, 'GMT' ), 'GMT+5.75' );
} );

test( 'Events: the browser\'s time zone is asked for as dashboard.js reads it (QUnit getTimeZone)', () => {
	const intl = globalThis.Intl;
	try {
		globalThis.Intl = { DateTimeFormat: () => ( { resolvedOptions: () => ( { timeZone: 'America/Chicago' } ) } ) };
		assert.equal( browserTimeZone(), 'America/Chicago' );
		// Without Intl, WordPress uses the site's time zone (Q8: the dates are formatted on the server).
		globalThis.Intl = undefined;
		assert.equal( browserTimeZone(), '' );
	} finally {
		globalThis.Intl = intl;
	}
} );

test( 'Events: a failed request shows what dashboard.js shows', () => {
	assert.deepEqual( [ failedView( 'app' ).message, failedView( 'app' ).error, failedView( 'app' ).formOpen ], [ 'enter-city', false, true ] );
	assert.deepEqual( [ failedView( 'user' ).message, failedView( 'user' ).error ], [ null, true ] );
} );

const EVENTS = {
	initiatedBy: 'app',
	location: 'Chicago',
	message: 'near-city',
	results: 'list',
	events: [
		{ type: 'meetup', typeLabel: 'Meetup', title: 'WP Chicago', url: 'https://www.meetup.com/x/', city: 'Chicago, IL', date: 'Tuesday, Sep 15, 2020', time: '7:00 pm', timeZone: { abbreviation: null, offset: '-5' } },
		{ type: 'wordcamp', typeLabel: 'WordCamp', title: 'WordCamp Chicago', url: 'https://chicago.wordcamp.org/', city: 'Chicago', date: 'September 15–17, 2020', time: null, timeZone: { abbreviation: 'CDT', offset: '-5' } },
	],
	moreEvents: true,
	unknownCity: null,
	error: false,
	formOpen: false,
};
const NEWS = { feeds: [ { type: 'news', link: 'https://wordpress.org/news/', title: 'WordPress Blog', items: [ { title: 'WordPress 7.3', url: 'https://wordpress.org/news/7-3/' } ], error: null, empty: false }, { type: 'planet', link: 'https://planet.wordpress.org/', title: 'Other', items: [], error: 'Feed down', empty: false } ] };

test( 'Events and News: the events and news are asked for, then shown with the classic templates (QUnit populateDynamicEventFields)', async () => {
	const intl = globalThis.Intl;
	globalThis.Intl = { DateTimeFormat: () => ( { resolvedOptions: () => ( { timeZone: 'America/Chicago' } ) } ) };
	let releaseNews;
	api.respondWith( async ( method, route ) => {
		if ( route === 'wp-admin/v1/dashboard/news' ) {
			await new Promise( ( resolve ) => {
				releaseNews = resolve;
			} );
			return NEWS;
		}
		return EVENTS;
	} );
	try {
		const view = await widget( 'events-news', { eventsRoute: 'wp-admin/v1/dashboard/events', newsRoute: 'wp-admin/v1/dashboard/news' } );
		assert.deepEqual( api.calls.map( ( c ) => [ c.method, c.route, c.payload ] ), [
			[ 'GET', 'wp-admin/v1/dashboard/events', { timezone: 'America/Chicago' } ],
			[ 'GET', 'wp-admin/v1/dashboard/news', {} ],
		] );
		assert.equal( clean( find( view.container, byClass( 'widget-loading' ) ) ), 'Loading…' );

		const events = byId( view.container, 'community-events' );
		assert.equal( events.props[ 'aria-hidden' ], 'false' );
		const message = byId( events, 'community-events-location-message' );
		assert.equal( clean( message ), 'Attend an upcoming event near Chicago.' );
		assert.equal( clean( find( message, byTag( 'strong' ) ) ), 'Chicago' );
		assert.equal( find( events, byClass( 'community-events-toggle-location' ) ).props[ 'aria-expanded' ], 'false' );
		assert.equal( find( events, byClass( 'community-events-form' ) ).props[ 'aria-hidden' ], 'true' );
		assert.equal( find( view.container, byClass( 'community-events-errors' ) ).props[ 'aria-hidden' ], 'true' );

		const results = find( events, byClass( 'community-events-results' ) );
		assert.equal( results.props[ 'aria-hidden' ], 'false' );
		const [ meetup, wordcamp, more ] = findAll( results, byTag( 'li' ) );
		assert.equal( meetup.props.class, 'event event-meetup wp-clearfix' );
		assert.equal( clean( find( meetup, byClass( 'event-info-inner' ) ) ), 'WP Chicago Meetup Chicago, IL' );
		assert.equal( clean( find( meetup, byClass( 'event-date' ) ) ), 'Tuesday, Sep 15, 2020' );
		assert.equal( clean( find( meetup, byClass( 'event-time' ) ) ), '7:00 pm GMT-5' );
		assert.equal( find( wordcamp, byClass( 'event-time' ) ), null );
		assert.equal( clean( more ), 'Want more events? Help organize the next one!' );
		assert.equal( find( more, byTag( 'a' ) ).props.href, 'https://make.wordpress.org/community/organize-event-landing-page/' );

		releaseNews();
		await flush();
		const feeds = findAll( view.container, byClass( 'rss-widget' ) );
		assert.equal( find( feeds[ 0 ], byClass( 'rsswidget' ) ).props.href, 'https://wordpress.org/news/7-3/' );
		assert.equal( clean( feeds[ 1 ] ), 'RSS Error: Feed down' );
		assert.equal( find( view.container, byClass( 'widget-loading' ) ), null );

		assert.deepEqual( texts( findAll( find( view.container, byClass( 'community-events-footer' ) ), byTag( 'a' ) ) ), [ 'Meetups (opens in a new tab)', 'WordCamps (opens in a new tab)', 'News (opens in a new tab)' ] );
	} finally {
		globalThis.Intl = intl;
	}
} );

test( 'Events: a search posts the city, announces the result and focuses the location button; an empty city is not looked up', async () => {
	api.respondWith( async ( method ) => ( method === 'POST' ? { ...EVENTS, initiatedBy: 'user', results: 'none', events: [], moreEvents: false } : { ...EVENTS, location: null, message: 'enter-city', results: null, events: [], formOpen: true } ) );
	const view = await widget( 'events-news', { eventsRoute: 'wp-admin/v1/dashboard/events', newsRoute: '' }, { context: 'user' } );
	assert.equal( api.calls[ 0 ].payload.context, 'user' );
	assert.equal( clean( byId( view.container, 'community-events-location-message' ) ), 'Enter your closest city to find nearby events.' );
	const form = find( view.container, byClass( 'community-events-form' ) );
	assert.equal( form.props[ 'aria-hidden' ], 'false' );

	form.props.onSubmit( { preventDefault() {} } );
	await flush();
	assert.equal( api.calls.length, 1, 'Nothing is asked for an empty city.' );

	byId( view.container, 'community-events-location' ).props.onInput( { target: { value: '  Chicago ' } } );
	await flush();
	await find( view.container, byClass( 'community-events-form' ) ).props.onSubmit( { preventDefault() {} } );
	await flush();
	assert.deepEqual( [ api.calls[ 1 ].method, api.calls[ 1 ].payload.location, api.calls[ 1 ].payload.context ], [ 'POST', 'Chicago', 'user' ] );
	assert.deepEqual( spoken, [ 'City updated. Listing events near Chicago.' ] );
	const none = find( find( view.container, byClass( 'community-events-results' ) ), byClass( 'event-none' ) );
	assert.equal( clean( none ), 'There are no events scheduled near Chicago at the moment. Would you like to organize a WordPress event?' );
} );

test( 'Events: a city that cannot be located, and an error after a search', async () => {
	api.respondWith( async ( method ) => ( method === 'POST' ? { ...EVENTS, initiatedBy: 'user', location: null, message: null, results: null, events: [], unknownCity: 'Atlantis', formOpen: true } : failedView( 'app' ) ) );
	const view = await widget( 'events-news', { eventsRoute: 'wp-admin/v1/dashboard/events', newsRoute: '' } );
	byId( view.container, 'community-events-location' ).props.onInput( { target: { value: 'Atlantis' } } );
	await flush();
	await find( view.container, byClass( 'community-events-form' ) ).props.onSubmit( { preventDefault() {} } );
	await flush();
	const errors = find( view.container, byClass( 'community-events-errors' ) );
	assert.equal( errors.props[ 'aria-hidden' ], 'false' );
	assert.equal( clean( find( errors, byClass( 'community-events-could-not-locate' ) ) ), 'Atlantis could not be located. Please try another nearby city. For example: Kansas City; Springfield; Portland.' );
	assert.equal( find( errors, byClass( 'community-events-error-occurred' ) ).props[ 'aria-hidden' ], 'true' );
	assert.deepEqual( spoken, [ 'We couldn’t locate Atlantis. Please try another nearby city. For example: Kansas City; Springfield; Portland.' ] );

	api.respondWith( async () => {
		throw Object.assign( new Error( 'down' ), { status: 0 } );
	} );
	await find( view.container, byClass( 'community-events-form' ) ).props.onSubmit( { preventDefault() {} } );
	await flush();
	assert.equal( find( view.container, byClass( 'community-events-error-occurred' ) ).props[ 'aria-hidden' ], 'false' );
	assert.equal( spoken.at( -1 ), 'An error occurred. Please try again.' );
} );

const health = ( extra ) => ( { hasResults: true, counts: { good: 18, recommended: 5, critical: 0 }, issues: 5, message: 'recommended-many', issuesText: 'Take a look at the <strong>5 items</strong> on the <a href="site-health.php">Site Health screen</a>.', label: 'good', progress: { score: 89, status: 'good', dashOffset: 62.2 }, url: 'site-health.php', ...extra } );

test( 'Site Health: the score, label and messages WordPress decided', async () => {
	const view = await widget( 'site-health', health() );
	const wrapper = find( view.container, byClass( 'site-health-progress-wrapper' ) );
	assert.ok( hasClass( wrapper, 'green' ) );
	assert.ok( ! hasClass( wrapper, 'loading' ) );
	assert.equal( find( wrapper, byProp( 'id', 'bar' ) ).props.style.strokeDashoffset, '62.2px' );
	assert.equal( clean( find( wrapper, byClass( 'site-health-progress-label' ) ) ), 'Good' );
	const details = findAll( find( view.container, byClass( 'site-health-details' ) ), byTag( 'p' ) );
	// Without a DOMParser here, InlineMarkup shows the markup as text (see inline-markup.test.mjs).
	assert.deepEqual( texts( details ), [ 'Your site’s health is looking good, but there are still some things you can do to improve its performance and security.', 'Take a look at the <strong>5 items</strong> on the <a href="site-health.php">Site Health screen</a>.' ] );

	const improvable = await widget( 'site-health', health( { label: 'improvable', progress: { score: 50, status: 'improvable', dashOffset: 1 }, message: 'critical-one' } ) );
	assert.ok( hasClass( find( improvable.container, byClass( 'site-health-progress-wrapper' ) ), 'orange' ) );
	assert.equal( clean( find( improvable.container, byClass( 'site-health-progress-label' ) ) ), 'Should be improved' );

	const none = await widget( 'site-health', health( { hasResults: false, message: 'no-results', issuesText: null, label: 'no-information', progress: null } ) );
	assert.ok( hasClass( find( none.container, byClass( 'site-health-progress-wrapper' ) ), 'loading' ) );
	assert.ok( hasClass( find( none.container, byClass( 'site-health-progress' ) ), 'hidden' ) );
	assert.equal( clean( find( none.container, byClass( 'site-health-progress-label' ) ) ), 'No information yet…' );
	const link = find( find( none.container, byClass( 'site-health-details' ) ), byTag( 'a' ) );
	assert.equal( link.props.href, '/wp-admin/site-health.php' );
	assert.equal( clean( link ), 'visit the Site Health screen' );
} );

test( 'PHP nag: the message WordPress chose, the recommended version, the host\'s annotation and button', async () => {
	const view = await widget( 'php-nag', { message: 'insecure', phpVersion: '7.2.1', recommendedVersion: '8.3', updateUrl: 'https://host.example/php', defaultUpdateUrl: 'https://wordpress.org/support/update-php/', directUpdateUrl: 'https://host.example/update' } );
	assert.equal( clean( find( view.container, byClass( 'bigger-bolder-text' ) ) ), 'Your site is running on an outdated version of PHP (7.2.1), which does not receive security updates. It should be updated.' );
	const paragraphs = findAll( view.container, byTag( 'p' ) );
	assert.equal( clean( paragraphs[ 2 ] ), 'PHP is one of the programming languages used to build WordPress. Newer versions of PHP receive regular security updates and may increase your site’s performance. The minimum recommended version of PHP is 8.3.' );
	const buttons = findAll( view.container, byClass( 'button-primary' ) );
	assert.deepEqual( buttons.map( ( b ) => b.props.href ), [ 'https://host.example/php', 'https://host.example/update' ] );
	assert.deepEqual( texts( buttons ), [ 'Learn more about updating PHP (opens in a new tab)', 'Update PHP (opens in a new tab)' ] );
	const annotation = find( view.container, byClass( 'description' ) );
	assert.equal( find( annotation, byTag( 'a' ) ).props.target, '_blank' );

	const plain = await widget( 'php-nag', { message: 'outdated', phpVersion: '8.0', recommendedVersion: null, updateUrl: 'https://wordpress.org/support/update-php/', defaultUpdateUrl: null, directUpdateUrl: null } );
	assert.equal( find( plain.container, byClass( 'description' ) ), null );
	assert.equal( findAll( plain.container, byClass( 'button-primary' ) ).length, 1 );
	assert.ok( ! clean( plain.container ).includes( 'minimum recommended' ) );
} );

test( 'Browser nag: the message for the browser, Browse Happy and Dismiss; filtered HTML', async () => {
	const view = await widget( 'browser-nag', { message: 'outdated', name: 'Firefox', updateUrl: 'https://www.mozilla.org/firefox/', image: 'https://s.w.org/images/browsers/firefox.png', browseHappyUrl: 'https://browsehappy.com/?locale=de_DE', html: null } );
	const nag = find( view.container, byClass( 'browser-update-nag' ) );
	assert.ok( hasClass( nag, 'has-browser-icon' ) );
	assert.equal( clean( nag ), "It looks like you're using an old version of Firefox. For the best WordPress experience, please update your browser." );
	assert.equal( find( nag, byTag( 'a' ) ).props.href, 'https://www.mozilla.org/firefox/' );
	const happy = findAll( view.container, byTag( 'p' ) )[ 1 ];
	assert.deepEqual( findAll( happy, byTag( 'a' ) ).map( ( a ) => [ a.props.href, a.props.class ] ), [ [ 'https://www.mozilla.org/firefox/', 'update-browser-link' ], [ 'https://browsehappy.com/?locale=de_DE', 'browse-happy-link' ] ] );
	const dismiss = find( view.container, byClass( 'dismiss' ) );
	assert.equal( dismiss.props[ 'aria-label' ], 'Dismiss the browser warning panel' );

	const filtered = await widget( 'browser-nag', { message: 'outdated', name: 'X', updateUrl: '', image: null, browseHappyUrl: '', html: '<p>Upgrade!</p>' } );
	assert.equal( find( filtered.container, byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<p>Upgrade!</p>' );
	assert.equal( find( filtered.container, byClass( 'browser-update-nag' ) ), null );
} );

test( 'Browser nag: each link\'s class is the one its tag has in the translated string', async () => {
	assert.deepEqual( linkClasses( '<a href="%1$s" class="update-browser-link">Update %2$s</a> or learn how to <a href="%3$s" class="browse-happy-link">browse happy</a>' ), { 1: 'update-browser-link', 3: 'browse-happy-link' } );
	assert.deepEqual( linkClasses( 'Lerne <a class="browse-happy-link" href="%3$s">x</a> %2$s <a href="%1$s" class="update-browser-link">y</a>' ), { 3: 'browse-happy-link', 1: 'update-browser-link' } );
	assert.deepEqual( linkClasses( 'Learn how to <a href="%s" class="update-browser-link">browse happy</a>' ), { 1: 'update-browser-link' } );
	assert.deepEqual( linkClasses( '<a href="%1$s" class="x&quot;onclick">y</a>' ), {}, 'Only plain class names.' );

	// The same address for both links: each keeps its own class.
	const view = await widget( 'browser-nag', { message: 'outdated', name: 'Firefox', updateUrl: 'https://same.example/', image: null, browseHappyUrl: 'https://same.example/', html: null } );
	const happy = findAll( view.container, byTag( 'p' ) )[ 1 ];
	assert.deepEqual( findAll( happy, byTag( 'a' ) ).map( ( a ) => a.props.class ), [ 'update-browser-link', 'browse-happy-link' ] );
} );

test( 'Welcome: the columns for a classic theme and for a block theme', async () => {
	const view = await widget( 'welcome', { visible: true, displayVersion: '7.3', isBlockTheme: false, canCustomize: true, customizeUrl: 'customize.php', html: null } );
	assert.equal( clean( find( view.container, byTag( 'h2' ) ) ), 'Welcome to WordPress!' );
	assert.equal( find( find( view.container, byClass( 'welcome-panel-header' ) ), byTag( 'a' ) ).props.href, '/wp-admin/about.php' );
	assert.equal( clean( find( find( view.container, byClass( 'welcome-panel-header' ) ), byTag( 'a' ) ) ), 'Learn more about the 7.3 version.' );
	assert.deepEqual( texts( findAll( view.container, byTag( 'h3' ) ) ), [ 'Author rich content with blocks and patterns', 'Start Customizing', 'Discover a new way to build your site.' ] );
	assert.equal( find( view.container, byClass( 'load-customize' ) ).props.href, '/wp-admin/customize.php' );

	const block = await widget( 'welcome', { visible: true, displayVersion: '7.3', isBlockTheme: true, canCustomize: false, customizeUrl: '', html: null } );
	assert.deepEqual( texts( findAll( block.container, byTag( 'h3' ) ) ), [ 'Author rich content with blocks and patterns', 'Customize your entire site with block themes', 'Switch up your site’s look & feel with Styles' ] );
	assert.ok( findAll( block.container, byTag( 'a' ) ).some( ( a ) => a.props.href === '/wp-admin/site-editor.php?p=%2Fstyles' ) );
} );

test( 'a widget\'s slots are given its data and context', async () => {
	const Slot = { props: [ 'data', 'context' ], render() {
		return h( 'p', { class: 'slot' }, this.context + ':' + this.data.empty );
	} };
	globalThis.__modules[ '/modules/slot.js' ] = { default: Slot };
	contracts.configure( { replacements: {}, slots: { 'core/dashboard-activity': { 'after-content': [ { module: '/modules/slot.js' } ] } }, importMap: {} } );
	const view = await widget( 'activity', { future: [], published: [], onThisDay: [], empty: true }, { context: 'user' } );
	await flush();
	assert.equal( clean( find( view.container, byClass( 'slot' ) ) ?? { type: 'text', text: '' } ), 'user:true' );
} );

// The page --------------------------------------------------------------------------------

function dashboardData( extra = {} ) {
	return {
		context: 'site',
		screen: 'dashboard',
		layout: { contexts: { normal: [ 'dashboard_activity', 'acme_widget' ], side: [ 'dashboard_quick_press' ], column3: [], column4: [] } },
		boxes: {
			dashboard_activity: BOX( 'dashboard_activity', 'Activity' ),
			acme_widget: BOX( 'acme_widget', 'Acme <a href="/wp-admin/index.php?edit=acme_widget#acme_widget">Configure</a>' ),
			dashboard_quick_press: BOX( 'dashboard_quick_press', 'Quick Draft' ),
		},
		reordering: true,
		columns: 0,
		columnChoices: [],
		screenOptions: { sections: [ { id: 'metabox-prefs', legend: 'Screen elements', description: '', items: [ { id: 'dashboard_activity', label: 'Activity', checked: true }, { id: 'acme_widget', label: 'Acme', checked: true }, { id: 'wp_welcome_panel', label: 'Welcome', checked: true } ] } ], reordering: true, columns: null },
		widgets: { dashboard_activity: { future: [], published: [], onThisDay: [], empty: true }, dashboard_quick_press: { canEdit: false } },
		pluginWidgets: { acme_widget: { html: '<p class="acme">Acme content</p>', error: false, configurable: true } },
		assets: { scripts: [], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' },
		welcome: { visible: true, displayVersion: '7.3', isBlockTheme: false, canCustomize: true, customizeUrl: 'customize.php', html: null },
		help: {},
		remindLater: null,
		...extra,
	};
}

async function page( data = dashboardData() ) {
	const events = [];
	const view = mount( () => h( Contracted, { id: 'core/dashboard', data, page: { path: 'index.php', title: 'Dashboard' }, onSaved: ( answer ) => events.push( answer ) } ), { provide: provide() } );
	await flush();
	return { view, events };
}

test( 'the page: the Welcome panel, then each box with its widget (core contracts, plugin HTML)', async () => {
	const { view } = await page();
	const welcome = byId( view.container, 'welcome-panel' );
	assert.equal( welcome.props.class, 'welcome-panel' );
	assert.equal( clean( find( welcome, byClass( 'welcome-panel-close' ) ) ), 'Dismiss' );
	assert.equal( find( welcome, byClass( 'welcome-panel-close' ) ).props.href, '/wp-admin/?welcome=0' );
	assert.ok( find( welcome, byClass( 'welcome-panel-content' ) ) );

	const holder = byId( view.container, 'dashboard-widgets' );
	assert.ok( hasClass( holder, 'metabox-holder' ) );
	assert.ok( byId( view.container, 'dashboard-widgets-wrap' ) );
	assert.ok( find( byId( view.container, 'dashboard_activity' ), byClass( 'no-activity' ) ), 'Activity through its contract.' );
	const acme = byId( view.container, 'acme_widget' );
	assert.equal( find( acme, byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<p class="acme">Acme content</p>' );
	// The title is the box's, with its Configure link (InlineMarkup shows it as text without a DOMParser here).
	assert.ok( clean( find( acme, byClass( 'hndle' ) ) ).includes( 'href="/wp-admin/index.php?edit=acme_widget#acme_widget"' ), 'Configure opens the classic form.' );
	assert.equal( clean( find( byId( view.container, 'dashboard_quick_press' ), byClass( 'inside' ) ) ), '' );

	assert.ok( hasClass( find( view.container, byClass( 'wp-admin-dashboard' ) ), 'index-php' ) );
	assert.deepEqual( screenOptions.sections[ 0 ].items.map( ( item ) => item.id ), [ 'dashboard_activity', 'acme_widget', 'wp_welcome_panel' ] );
} );

test( 'the page: Dismiss and the Welcome checkbox hide or show the panel and save `welcome`', async () => {
	const { view } = await page();
	await find( view.container, byClass( 'welcome-panel-close' ) ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.ok( hasClass( byId( view.container, 'welcome-panel' ), 'hidden' ) );
	assert.deepEqual( api.calls.map( ( c ) => [ c.method, c.route, c.payload ] ), [ [ 'POST', 'wp-admin/v1/screen-preferences/dashboard', { welcome: false } ] ] );
	assert.deepEqual( spoken, [ 'Screen Options updated.' ] );
	assert.equal( screenOptions.sections[ 0 ].items[ 2 ].checked, false, 'The checkbox follows.' );

	screenOptions.onChange( 'wp_welcome_panel', true );
	await flush();
	assert.ok( ! hasClass( byId( view.container, 'welcome-panel' ), 'hidden' ) );
	assert.deepEqual( api.calls.at( -1 ).payload, { welcome: true } );
	assert.equal( screenOptions.sections[ 0 ].items[ 2 ].checked, true );
} );

test( 'the page: a hidden panel, a hooked panel, none, and the admin email reminder', async () => {
	const hidden = await page( dashboardData( { welcome: { ...dashboardData().welcome, visible: false } } ) );
	assert.ok( hasClass( byId( hidden.view.container, 'welcome-panel' ), 'hidden' ) );

	const hooked = await page( dashboardData( { welcome: { ...dashboardData().welcome, html: '<p>Our welcome</p>' } } ) );
	const panel = byId( hooked.view.container, 'welcome-panel' );
	assert.equal( find( panel, byClass( 'wp-admin-legacy-html' ) ).innerHTML, '<p>Our welcome</p>' );
	assert.equal( find( panel, byClass( 'welcome-panel-content' ) ), null );

	const none = await page( dashboardData( { welcome: null, remindLater: { message: 'The admin email verification page will reappear after 3 days.' } } ) );
	assert.equal( byId( none.view.container, 'welcome-panel' ), null );
	assert.deepEqual( added, [ { type: 'success', message: 'The admin email verification page will reappear after 3 days.', dismissible: true, scope: 'page' } ] );
} );

test( 'the page: a plugin widget whose callback failed shows a message', async () => {
	const { view } = await page( dashboardData( { pluginWidgets: { acme_widget: { html: '', error: true, configurable: false } } } ) );
	assert.equal( clean( find( byId( view.container, 'acme_widget' ), byClass( 'wp-admin-legacy-failure' ) ) ), 'This widget could not be displayed.' );
} );

test( 'the page: the body class is the classic screen\'s while it is shown', async () => {
	const classes = new Set();
	globalThis.document = { body: { classList: { add: ( name ) => classes.add( name ), remove: ( name ) => classes.delete( name ) } } };
	try {
		await page();
		assert.ok( classes.has( 'index-php' ) );
		unmountAll();
		assert.ok( ! classes.has( 'index-php' ) );
	} finally {
		delete globalThis.document;
	}
} );

test( 'the page: a Welcome save that fails puts the panel back and says so', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'down' ), { status: 500 } );
	} );
	const { view } = await page();
	await find( view.container, byClass( 'welcome-panel-close' ) ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.ok( ! hasClass( byId( view.container, 'welcome-panel' ), 'hidden' ) );
	assert.deepEqual( added, [ { type: 'error', message: 'Your changes could not be saved. Please try again.', dismissible: true, scope: 'page' } ] );
	assert.deepEqual( spoken, [] );
	assert.equal( screenOptions.sections[ 0 ].items[ 2 ].checked, true );
} );

test( 'the page: a Quick Draft save is raised as `saved`', async () => {
	api.respondWith( async () => ( { notice: { type: 'success', message: 'Draft created successfully.' }, drafts: { items: [], viewAll: null }, postId: 3 } ) );
	const { view, events } = await page( dashboardData( { widgets: { ...dashboardData().widgets, dashboard_quick_press: QUICK_DRAFT } } ) );
	await byId( view.container, 'quick-press' ).props.onSubmit( { preventDefault() {} } );
	await flush();
	assert.equal( events.length, 1 );
	assert.equal( events[ 0 ].postId, 3 );
} );

test( 'the page: a moderation in Recent Comments updates At a Glance\'s comment counts', async () => {
	const widgets = { dashboard_right_now: { counts: [], comments: { approved: { text: '2 Comments', url: 'edit-comments.php' }, moderated: { text: '1 Comment in moderation', url: 'x', hidden: false } } }, dashboard_recent_comments: { comments: [ COMMENT_ROW ], views: VIEWS, viewsHtml: null } };
	assert.equal( glanceWidgets( widgets, undefined ), widgets );
	assert.deepEqual( glanceWidgets( widgets, GLANCE_COMMENTS ).dashboard_right_now.comments, GLANCE_COMMENTS );
	assert.equal( glanceWidgets( widgets, GLANCE_COMMENTS ).dashboard_recent_comments, widgets.dashboard_recent_comments, 'The other widgets keep their data.' );
	assert.deepEqual( glanceWidgets( {}, GLANCE_COMMENTS ), {} );

	api.respondWith( async () => ANSWER() );
	const data = dashboardData( {
		layout: { contexts: { normal: [ 'dashboard_right_now', 'dashboard_recent_comments' ], side: [], column3: [], column4: [] } },
		boxes: { dashboard_right_now: BOX( 'dashboard_right_now', 'At a Glance' ), dashboard_recent_comments: BOX( 'dashboard_recent_comments', 'Recent Comments' ) },
		widgets: { dashboard_right_now: { counts: [], comments: widgets.dashboard_right_now.comments, glanceItems: null, version: { version: '7.3', theme: 'T', themesUrl: null, text: null, update: null }, searchEngines: null, quota: null, actions: null }, dashboard_recent_comments: widgets.dashboard_recent_comments },
	} );
	const { view } = await page( data );
	assert.equal( clean( find( view.container, byClass( 'comments-count-text' ) ) ), '2 Comments' );
	await actionLink( view, 7, 'approve' ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.equal( clean( find( view.container, byClass( 'comments-count-text' ) ) ), '3 Comments' );
	assert.ok( hasClass( find( view.container, byClass( 'comment-mod-count' ) ), 'hidden' ) );
} );

test( 'the page keeps the layout and boxes it gives the holder while the data stays the same', async () => {
	const data = shallowRef( dashboardData() );
	const view = mount( () => h( Contracted, { id: 'core/dashboard', data: data.value, page: { path: 'index.php', title: 'Dashboard' } } ), { provide: provide() } );
	await flush();
	const before = byId( view.container, 'dashboard_activity' );
	await find( view.container, byClass( 'welcome-panel-close' ) ).props.onClick( { preventDefault() {} } );
	await flush();
	assert.equal( byId( view.container, 'dashboard_activity' ), before, 'The boxes are not rebuilt by a Welcome save.' );
} );
