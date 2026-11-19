import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = render;
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
const timestamp = await import( '../site/components/core/comment-edit/timestamp.js' );
const parent = await import( '../site/components/core/comment-edit/parent.js' );

const { h } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
for ( const name of [ 'comment-edit', 'meta-box-holder', 'meta-box' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}
const pageModule = globalThis.__modules[ '/components/core/comment-edit.js' ];
const contract = globalThis.__modules[ '/contracts/core/comment-edit.js' ].default;

// Fixtures, as wp_admin_get_comment_edit() gives them -----------------------------------------

const MONTHS = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ].map( ( text, index ) => {
	const value = String( index + 1 ).padStart( 2, '0' );
	return { value, label: value + '-' + text, text };
} );
const DATE = () => ( {
	parts: { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05', ss: '30' },
	hidden: { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05' },
	months: MONTHS,
	submitted: 'Mar 7, 2024 at 09:05',
	text: 'Submitted on: Mar 7, 2024 at 09:05',
} );
const CHOICES = () => ( {
	current: null,
	choices: [ { id: 12, label: 'Bea: First words', author: 'Bea' }, { id: 13, label: 'Cy: Other words', author: '' } ],
} );
const DATA = ( extra = {} ) => ( {
	screen: 'comment',
	error: null,
	comment: { id: 5, postId: 40, author: 'Pat <img src=x onerror=alert(1)>', email: 'pat@example.org', url: 'https://pat.example', content: 'Hello <script>alert(1)</script> &amp; bye', parentId: 0 },
	permalink: 'https://example.org/p/#comment-5',
	status: '1',
	date: DATE(),
	response: { title: 'The <post>', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/' },
	parent: null,
	parentChoices: CHOICES(),
	miscActionsHtml: '<div class="misc-pub-section acme">Acme</div>',
	deleteAction: { action: 'trash', label: 'Move to Trash', request: { method: 'POST', route: 'wp-admin/v1/comments/5/status', body: { status: 'trash', screen: 'comment' } } },
	layout: { contexts: { normal: [ 'acme-note' ] } },
	boxes: [ { id: 'acme-note', title: 'Acme note', basename: 'Acme note', classes: [], closed: false, hidden: false, pinned: false, warning: false, html: '<p><input name="acme_note" value="n"></p>', error: false } ],
	screenOptions: { sections: [ { id: 'metabox-prefs', legend: 'Screen elements', description: 'Some screen elements can be shown or hidden by using the checkboxes.', items: [ { id: 'acme-note', label: 'Acme note', checked: true } ] } ], reordering: true, columns: null },
	quicktags: { id: 'content', buttons: 'strong,em,link,block,del,ins,img,ul,ol,li,code,close' },
	isMobile: false,
	referredby: null,
	...extra,
} );
const ERROR = ( error ) => ( { ...Object.fromEntries( Object.keys( DATA() ).map( ( key ) => [ key, null ] ) ), screen: 'comment', boxes: [], error } );
const ANSWER = ( extra = {} ) => ( { id: 5, postId: 40, status: 'approved', changed: true, redirect: 'edit-comments.php?comment_status=all#comment-5', location: null, ...extra } );

// Page harness ------------------------------------------------------------------------------

let editors;
let added;
let spoken;
let followed;
let screenOptions;
let previous;
let wentBack;
let bodyClasses;

function stubEditor( host, options ) {
	const editor = { host, options, focused: 0, destroyed: false, value: options.value };
	editors.push( editor );
	return { started: Promise.resolve(), setValue: ( value ) => {
		editor.value = value;
	}, focus: () => {
		editor.focused++;
	}, destroy: () => {
		editor.destroyed = true;
	} };
}

beforeEach( () => {
	editors = [];
	added = [];
	spoken = [];
	followed = [];
	screenOptions = null;
	previous = '/wp-admin/edit-comments.php?comment_status=all';
	wentBack = 0;
	bodyClasses = new Set();
	globalThis.document = { body: { classList: { add: ( name ) => bodyClasses.add( name ), remove: ( name ) => bodyClasses.delete( name ) } } };
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( () => {
	unmountAll();
	delete globalThis.document;
} );

const router = {
	follow: async ( target ) => {
		followed.push( target );
		return true;
	},
	previousUrl: () => previous,
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
	quicktagsEditor: stubEditor,
	historyBack: () => {
		wentBack++;
	},
	pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '?action=editcomment&c=5' },
	...extra,
} );

async function page( data = DATA(), { listeners = {}, provided = {} } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/comment-edit', data, page: { path: 'comment.php?action=editcomment&c=5', title: 'Edit Comment' }, ...listeners } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const clean = ( node ) => textOf( node ).replace( /\s+/g, ' ' ).trim();
const prevent = { preventDefault() {} };
const input = ( value ) => ( { target: { value }, preventDefault() {} } );

// Contract and module -------------------------------------------------------------------------

test( 'the Edit Comment contract: page tier, data and page, the side-after and normal-after slots, `saved`', () => {
	assert.equal( contract.id, 'core/comment-edit' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'side-after', 'normal-after' ] );
	assert.deepEqual( contract.slots[ 'side-after' ].props, { comment: { type: 'Object', required: true } } );
	assert.deepEqual( contract.emits, [ 'saved' ] );
} );

test( 'the page module exports the classic help (comment.php:61-75)', async () => {
	const help = mergeHelp( pageModule.help, [] );
	assert.deepEqual( help.tabs.map( ( tab ) => [ tab.id, tab.title ] ), [ [ 'overview', 'Overview' ] ] );
	const overview = mount( () => h( 'div', null, [ h( help.tabs[ 0 ].component ) ] ) );
	await flush();
	assert.deepEqual( findAll( overview.container, byTag( 'p' ) ).map( clean ), [
		'You can edit the information left in a comment if needed. This is often useful when you notice that a commenter has made a typographical error.',
		'You can also moderate the comment from this screen using the Status box, where you can also change the timestamp of the comment.',
	] );
	const sidebar = mount( () => h( 'div', null, [ h( help.sidebar ) ] ) );
	await flush();
	assert.equal( clean( find( sidebar.container, byTag( 'strong' ) ) ), 'For more information:' );
	assert.deepEqual( findAll( sidebar.container, byTag( 'a' ) ).map( ( a ) => [ a.props.href, clean( a ) ] ), [
		[ 'https://wordpress.org/documentation/article/comments-screen/', 'Documentation on Comments' ],
		[ 'https://wordpress.org/support/forums/', 'Support forums' ],
	] );
} );

// Pure parts --------------------------------------------------------------------------------

test( 'timestamp: the parts are checked with a JS Date, as comment.js does', () => {
	const parts = DATE().parts;
	assert.equal( timestamp.validDate( parts ), true );
	assert.equal( timestamp.validDate( { ...parts, mm: '02', jj: '29' } ), true, '2024 is a leap year.' );
	assert.equal( timestamp.validDate( { ...parts, mm: '02', jj: '30' } ), false );
	assert.equal( timestamp.validDate( { ...parts, mn: '60' } ), false );
	assert.equal( timestamp.validDate( { ...parts, jj: 'x' } ), false );
	assert.equal( timestamp.validDate( { ...parts, aa: '' } ), false );
	assert.equal( timestamp.validDate( { ...parts, hh: '25' } ), false, 'The hour is not checked, but it rolls the day over, which is.' );
} );

test( 'timestamp: the display is "%1$s %2$s, %3$s at %4$s:%5$s" with the month\'s data-text, the day as a number and two-digit hours and minutes', () => {
	assert.equal( timestamp.dateDisplay( { aa: '2025', mm: '11', jj: '09', hh: '7', mn: '3' }, MONTHS ), 'Nov 9, 2025 at 07:03' );
	assert.equal( timestamp.dateDisplay( { aa: '2025', mm: '01', jj: '31', hh: '23', mn: '59' }, MONTHS, '%3$s/%1$s/%2$s %4$s.%5$s' ), '2025/Jan/31 23.59' );
} );

test( 'parent: the dropdown is None, the choices, then the current parent; the display is the author, else the label', () => {
	const choices = { current: { id: 20, label: 'Old: gone', author: 'Old' }, choices: CHOICES().choices };
	const options = parent.parentOptions( choices );
	assert.deepEqual( options.map( ( option ) => [ option.value, option.label, option.author ] ), [ [ '0', 'None (top-level comment)', '' ], [ '12', 'Bea: First words', 'Bea' ], [ '13', 'Cy: Other words', '' ], [ '20', 'Old: gone', 'Old' ] ] );
	assert.equal( parent.parentDisplay( options, '0' ), 'None' );
	assert.equal( parent.parentDisplay( options, '12' ), 'Bea' );
	assert.equal( parent.parentDisplay( options, '13' ), 'Cy: Other words', 'No author: the option\'s text.' );
	assert.deepEqual( parent.parentOptions( null ), [] );
} );

test( 'referredBy: the previous admin address of the same site, relative to wp-admin/, else empty', () => {
	const site = { pathname: '/wp-admin/comment.php' };
	assert.equal( pageModule.referredBy( '/wp-admin/edit-comments.php?comment_status=moderated&paged=2', site ), 'edit-comments.php?comment_status=moderated&paged=2' );
	assert.equal( pageModule.referredBy( '/wp-admin/', site ), 'index.php' );
	assert.equal( pageModule.referredBy( null, site ), '' );
	assert.equal( pageModule.referredBy( '/wp-admin/network/sites.php', site ), '', 'Not the site admin.' );
	assert.equal( pageModule.referredBy( '/sites/3/wp-admin/edit-comments.php', site ), '', 'Another site.' );
	assert.equal( pageModule.referredBy( '/sites/3/wp-admin/edit-comments.php?p=1', { pathname: '/sites/3/wp-admin/comment.php' } ), 'edit-comments.php?p=1' );
} );

// The page ----------------------------------------------------------------------------------

test( 'the page: the classic markup of edit-form-comment.php, with the values as text and the content raw in the editor', async () => {
	const view = await page();
	const form = byId( view.container, 'post' );
	assert.equal( form.tag, 'form' );
	assert.equal( form.props.name, 'post' );
	assert.ok( bodyClasses.has( 'comment-php' ) );
	assert.ok( hasClass( byId( view.container, 'post-body' ), 'columns-2' ) );
	assert.equal( clean( byId( view.container, 'comment-link-box' ) ), 'Permalink: https://example.org/p/#comment-5' );
	assert.equal( find( byId( view.container, 'sample-permalink' ), byTag( 'a' ) ).props.href, 'https://example.org/p/#comment-5' );

	const namediv = byId( view.container, 'namediv' );
	assert.ok( hasClass( namediv, 'stuffbox' ) );
	assert.equal( clean( find( namediv, byTag( 'h2' ) ) ), 'Author' );
	assert.equal( byId( namediv, 'name' ).props.value, 'Pat <img src=x onerror=alert(1)>', 'A field\'s value, never HTML.' );
	assert.equal( byId( namediv, 'name' ).props.name, 'newcomment_author' );
	assert.equal( byId( namediv, 'email' ).props.value, 'pat@example.org' );
	assert.equal( byId( namediv, 'newcomment_author_url' ).props.value, 'https://pat.example' );
	assert.ok( ! find( view.container, byTag( 'img' ) ), 'Nothing of the author is markup.' );

	assert.ok( hasClass( byId( view.container, 'postdiv' ), 'postarea' ) );
	assert.equal( editors.length, 1 );
	assert.equal( editors[ 0 ].host, byId( view.container, 'wp-content-editor-container' ) );
	assert.deepEqual( { ...editors[ 0 ].options, onInput: null, ready: null }, { id: 'content', name: 'content', value: 'Hello <script>alert(1)</script> &amp; bye', settings: DATA().quicktags, onInput: null, ready: null } );
	assert.ok( ! find( view.container, byTag( 'script' ) ) );

	const submit = byId( view.container, 'submitdiv' );
	assert.equal( clean( find( submit, byTag( 'h2' ) ) ), 'Save' );
	assert.equal( clean( byId( submit, 'comment-status-display' ) ), 'Approved' );
	const radios = findAll( byId( submit, 'comment-status-radio' ), byTag( 'input' ) );
	assert.deepEqual( radios.map( ( radio ) => [ radio.props.value, radio.props.checked ] ), [ [ '1', true ], [ '0', false ], [ 'spam', false ] ] );
	assert.equal( clean( byId( submit, 'timestamp' ) ), 'Submitted on: Mar 7, 2024 at 09:05' );
	assert.equal( clean( find( byId( submit, 'timestamp' ), byTag( 'b' ) ) ), 'Mar 7, 2024 at 09:05' );
	const response = find( submit, byClass( 'misc-pub-response-to' ) );
	assert.equal( clean( response ), 'In response to: The <post>' );
	assert.equal( find( response, byTag( 'a' ) ).props.href, '/wp-admin/post.php?post=40&action=edit' );
	assert.equal( clean( byId( submit, 'comment-parent-display' ) ), 'In reply to: None' );
	assert.ok( find( submit, ( el ) => hasClass( el, 'wp-admin-legacy-html' ) ), 'The misc actions are their HTML.' );
	assert.equal( clean( find( byId( submit, 'delete-action' ), byTag( 'a' ) ) ), 'Move to Trash' );
	assert.ok( hasClass( find( byId( submit, 'delete-action' ), byTag( 'a' ) ), 'submitdelete' ) );
	const save = byId( submit, 'save' );
	assert.equal( save.props.value, 'Update' );
	assert.ok( hasClass( save, 'button-primary' ) && hasClass( save, 'button-large' ) );
	assert.ok( byId( view.container, 'postbox-container-1' ), 'The Save box\'s column.' );

	unmountAll();
	assert.ok( ! bodyClasses.has( 'comment-php' ) );
} );

test( 'the page: the response is text without a link when the user may not edit the post; no permalink unless approved', async () => {
	const view = await page( DATA( { permalink: null, status: '0', response: { title: 'Post', editUrl: null, viewUrl: null }, miscActionsHtml: null } ) );
	assert.equal( byId( view.container, 'comment-link-box' ), null );
	assert.equal( find( find( view.container, byClass( 'misc-pub-response-to' ) ), byTag( 'a' ) ), null );
	assert.equal( clean( byId( view.container, 'comment-status-display' ) ), 'Pending' );
	assert.ok( ! find( byId( view.container, 'misc-publishing-actions' ), ( el ) => hasClass( el, 'wp-admin-legacy-html' ) ) );
} );

test( 'the page: the Name field has focus, unless WordPress says the device is mobile', async () => {
	let view = await page();
	assert.equal( render.focused, byId( view.container, 'name' ) );
	unmountAll();
	view = await page( DATA( { isMobile: true } ) );
	assert.equal( render.focused, null );
} );

test( 'the timestamp editor: Edit opens it, OK checks the date (form-invalid) and rebuilds the display, Cancel restores the parts', async () => {
	const view = await page();
	const div = () => byId( view.container, 'timestampdiv' );
	const edit = () => find( view.container, byClass( 'edit-timestamp' ) );
	assert.equal( div().props.style.display, 'none' );
	edit().props.onClick( prevent );
	await flush();
	assert.equal( div().props.style.display, 'block' );
	assert.equal( edit().props.style.display, 'none', 'The Edit link hides while it is open.' );
	assert.equal( render.focused, byId( view.container, 'mm' ), 'Focus on the first field.' );
	assert.equal( clean( find( div(), byClass( 'timestamp-wrap' ) ) ).replace( /\d\d-\w\w\w/g, '' ).trim().startsWith( 'Month' ), true );
	const month = byId( view.container, 'mm' );
	assert.deepEqual( findAll( month, byTag( 'option' ) ).slice( 0, 2 ).map( ( option ) => [ option.props.value, option.props[ 'data-text' ], clean( option ) ] ), [ [ '01', 'Jan', '01-Jan' ], [ '02', 'Feb', '02-Feb' ] ] );
	assert.equal( month.props.value, '03' );
	assert.equal( byId( view.container, 'jj' ).props.value, '07' );
	assert.equal( byId( view.container, 'hidden_mm' ).props.value, '03' );

	byId( view.container, 'mm' ).props.onChange( input( '02' ) );
	byId( view.container, 'jj' ).props.onInput( input( '30' ) );
	await flush();
	find( div(), byClass( 'save-timestamp' ) ).props.onClick( prevent );
	await flush();
	assert.ok( hasClass( find( div(), byClass( 'timestamp-wrap' ) ), 'form-invalid' ) );
	assert.equal( div().props.style.display, 'block', 'An invalid date keeps it open.' );
	assert.equal( clean( byId( view.container, 'timestamp' ) ), 'Submitted on: Mar 7, 2024 at 09:05' );

	byId( view.container, 'jj' ).props.onInput( input( '9' ) );
	byId( view.container, 'hh' ).props.onInput( input( '7' ) );
	await flush();
	find( div(), byClass( 'save-timestamp' ) ).props.onClick( prevent );
	await flush();
	assert.ok( ! hasClass( find( div(), byClass( 'timestamp-wrap' ) ), 'form-invalid' ) );
	assert.equal( clean( byId( view.container, 'timestamp' ) ), 'Submitted on: Feb 9, 2024 at 07:05' );
	assert.equal( clean( find( byId( view.container, 'timestamp' ), byTag( 'b' ) ) ), 'Feb 9, 2024 at 07:05' );
	assert.equal( div().props.style.display, 'none' );
	assert.equal( render.focused, edit(), 'Focus back on Edit.' );

	edit().props.onClick( prevent );
	byId( view.container, 'aa' ).props.onInput( input( '1999' ) );
	await flush();
	find( div(), byClass( 'cancel-timestamp' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( [ 'aa', 'mm', 'jj', 'hh', 'mn' ].map( ( key ) => byId( view.container, key ).props.value ), [ '2024', '03', '07', '09', '05' ], 'The loaded parts, as the hidden_ fields hold them.' );
	assert.equal( clean( byId( view.container, 'timestamp' ) ), 'Submitted on: Mar 7, 2024 at 09:05', 'The display as loaded.' );
	assert.equal( div().props.style.display, 'none' );
	assert.equal( render.focused, edit() );
} );

test( 'the parent editor: "In reply to:" from the server\'s choices; OK shows the author, Cancel restores the parent and its link', async () => {
	const view = await page( DATA( { comment: { ...DATA().comment, parentId: 12 }, parent: { id: 12, title: 'Bea', url: 'https://example.org/p/#comment-12' } } ) );
	const display = () => byId( view.container, 'comment-parent-display' );
	assert.equal( clean( display() ), 'In reply to: Bea' );
	assert.equal( find( display(), byTag( 'a' ) ).props.href, 'https://example.org/p/#comment-12' );
	const select = () => byId( view.container, 'comment_parent' );
	assert.deepEqual( findAll( select(), byTag( 'option' ) ).map( ( option ) => [ option.props.value, option.props[ 'data-author' ] ?? null, clean( option ) ] ), [ [ '0', null, 'None (top-level comment)' ], [ '12', 'Bea', 'Bea: First words' ], [ '13', '', 'Cy: Other words' ] ] );
	assert.equal( select().props.value, '12' );
	assert.equal( byId( view.container, 'hidden_comment_parent' ).props.value, '12' );

	const fieldset = () => byId( view.container, 'comment-parent-div' );
	assert.equal( fieldset().props.style.display, 'none' );
	find( view.container, byClass( 'edit-comment-parent' ) ).props.onClick( prevent );
	await flush();
	assert.equal( fieldset().props.style.display, 'block' );
	assert.equal( render.focused, select() );
	select().props.onChange( input( '13' ) );
	await flush();
	find( fieldset(), byClass( 'save-comment-parent' ) ).props.onClick( prevent );
	await flush();
	assert.equal( clean( display() ), 'In reply to: Cy: Other words' );
	assert.equal( find( display(), byTag( 'a' ) ), null );
	assert.equal( render.focused, find( view.container, byClass( 'edit-comment-parent' ) ) );

	find( view.container, byClass( 'edit-comment-parent' ) ).props.onClick( prevent );
	select().props.onChange( input( '0' ) );
	await flush();
	find( fieldset(), byClass( 'save-comment-parent' ) ).props.onClick( prevent );
	await flush();
	assert.equal( clean( display() ), 'In reply to: None' );

	find( view.container, byClass( 'edit-comment-parent' ) ).props.onClick( prevent );
	await flush();
	find( fieldset(), byClass( 'cancel-comment-parent' ) ).props.onClick( prevent );
	await flush();
	assert.equal( select().props.value, '12' );
	assert.equal( clean( display() ), 'In reply to: Bea' );
	assert.ok( find( display(), byTag( 'a' ) ), 'The display as loaded.' );
} );

test( 'the parent editor is not offered without threading (parentChoices null)', async () => {
	const view = await page( DATA( { parentChoices: null } ) );
	assert.equal( clean( byId( view.container, 'comment-parent-display' ) ), 'In reply to: None' );
	assert.equal( find( view.container, byClass( 'edit-comment-parent' ) ), null );
	assert.equal( byId( view.container, 'comment_parent' ), null );
} );

test( 'Update posts the fields, the status, the date with the loaded date, the parent and referredby, then follows the answer', async () => {
	const saved = [];
	api.respondWith( async () => ANSWER() );
	const view = await page( DATA(), { listeners: { onSaved: ( answer ) => saved.push( answer ) } } );
	byId( view.container, 'name' ).props.onInput( input( 'Pat B' ) );
	byId( view.container, 'email' ).props.onInput( input( 'b@example.org' ) );
	byId( view.container, 'newcomment_author_url' ).props.onInput( input( '' ) );
	editors[ 0 ].options.onInput( 'New <b>words</b>' );
	findAll( byId( view.container, 'comment-status-radio' ), byTag( 'input' ) )[ 2 ].props.onChange( input( 'spam' ) );
	byId( view.container, 'aa' ).props.onInput( input( '2023' ) );
	byId( view.container, 'comment_parent' ).props.onChange( input( '12' ) );
	await flush();
	await byId( view.container, 'post' ).props.onSubmit( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/comments/5', payload: {
		author: 'Pat B', email: 'b@example.org', url: '', content: 'New <b>words</b>', status: 'spam',
		date: { aa: '2023', mm: '03', jj: '07', hh: '09', mn: '05', ss: '30', hidden: { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05' } },
		parent: 12,
		referredby: 'edit-comments.php?comment_status=all',
		screen: 'comment',
	} } ] );
	assert.deepEqual( followed, [ ANSWER() ] );
	assert.deepEqual( saved, [ ANSWER() ] );
} );

test( 'Update without threading sends no parent; without a previous page, an empty referredby; a location is followed too', async () => {
	previous = null;
	api.respondWith( async () => ANSWER( { redirect: null, location: 'https://example.org/thanks/' } ) );
	const view = await page( DATA( { parentChoices: null } ) );
	await byId( view.container, 'post' ).props.onSubmit( prevent );
	await flush();
	const body = api.calls[ 0 ].payload;
	assert.equal( Object.hasOwn( body, 'parent' ), false );
	assert.equal( body.referredby, '' );
	assert.equal( body.content, 'Hello <script>alert(1)</script> &amp; bye', 'The content as loaded, raw.' );
	assert.deepEqual( followed, [ ANSWER( { redirect: null, location: 'https://example.org/thanks/' } ) ] );
} );

test( 'Update: a refused save shows WordPress\'s message in a notice, says it, and the button works again', async () => {
	let answer = null;
	api.respondWith( async () => new Promise( ( resolve, reject ) => {
		answer = { resolve, reject };
	} ) );
	const view = await page();
	byId( view.container, 'post' ).props.onSubmit( prevent );
	await flush();
	assert.equal( byId( view.container, 'save' ).props.disabled, true );
	byId( view.container, 'post' ).props.onSubmit( prevent );
	await flush();
	assert.equal( api.calls.length, 1, 'One save at a time.' );
	answer.reject( Object.assign( new Error( 'Invalid parent comment.' ), { status: 400, code: 'comment_parent_invalid' } ) );
	await flush();
	assert.deepEqual( added.map( ( notice ) => [ notice.type, notice.message, notice.scope ] ), [ [ 'error', 'Invalid parent comment.', 'page' ] ] );
	assert.deepEqual( spoken, [ 'Invalid parent comment.' ] );
	assert.equal( byId( view.container, 'save' ).props.disabled, false );
	assert.deepEqual( followed, [] );
} );

test( 'Move to Trash posts the delete action\'s request with screen and referredby, then follows the answer', async () => {
	api.respondWith( async () => ANSWER( { status: 'trash', redirect: 'edit-comments.php?comment_status=all&trashed=1&ids=5' } ) );
	const view = await page();
	await find( byId( view.container, 'delete-action' ), byTag( 'a' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/comments/5/status', payload: { status: 'trash', screen: 'comment', referredby: 'edit-comments.php?comment_status=all' } } ] );
	assert.deepEqual( followed, [ ANSWER( { status: 'trash', redirect: 'edit-comments.php?comment_status=all&trashed=1&ids=5' } ) ] );
} );

test( 'Delete Permanently (no Trash) sends DELETE with screen and referredby in the query; a failure is shown', async () => {
	api.respondWith( async () => ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) );
	const deleting = { action: 'delete', label: 'Delete Permanently', request: { method: 'DELETE', route: 'wp-admin/v1/comments/5', body: { screen: 'comment' } } };
	let view = await page( DATA( { deleteAction: deleting } ) );
	const link = find( byId( view.container, 'delete-action' ), byTag( 'a' ) );
	assert.equal( clean( link ), 'Delete Permanently' );
	await link.props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'DELETE', route: 'wp-admin/v1/comments/5?screen=comment&referredby=edit-comments.php%3Fcomment_status%3Dall', payload: undefined } ] );
	assert.deepEqual( followed, [ ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) ] );

	unmountAll();
	api.reset();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.' ), { status: 400 } );
	} );
	view = await page();
	await find( byId( view.container, 'delete-action' ), byTag( 'a' ) ).props.onClick( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.' );
	assert.equal( followed.length, 1 );
} );

test( 'errors: `die` shows only the message; `footer` the message in a wrap, with Go back when given', async () => {
	let view = await page( ERROR( { kind: 'die', message: 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.' } ) );
	assert.equal( byId( view.container, 'post' ), null );
	assert.equal( clean( view.container ), 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.' );
	assert.ok( find( view.container, byClass( 'wp-die-message' ) ) );
	assert.equal( editors.length, 0 );
	assert.equal( screenOptions, null, 'No Screen Options.' );
	unmountAll();

	view = await page( ERROR( { kind: 'footer', message: 'Invalid comment ID.', link: { text: 'Go back', back: true } } ) );
	const wrap = find( view.container, byClass( 'wrap' ) );
	assert.equal( clean( find( wrap, byTag( 'p' ) ) ), 'Invalid comment ID. Go back.' );
	find( wrap, byTag( 'a' ) ).props.onClick( prevent );
	assert.equal( wentBack, 1, 'history.go( -1 ), without a javascript: address.' );
	assert.notEqual( String( find( wrap, byTag( 'a' ) ).props.href ).slice( 0, 11 ), 'javascript:' );
	unmountAll();

	view = await page( ERROR( { kind: 'footer', message: 'Sorry, you are not allowed to edit this comment.' } ) );
	assert.equal( clean( find( find( view.container, byClass( 'wrap' ) ), byTag( 'p' ) ) ), 'Sorry, you are not allowed to edit this comment.' );
	assert.equal( find( view.container, byTag( 'a' ) ), null );
} );

test( 'meta boxes: the normal boxes in #postbox-container-2 through core/meta-box-holder, their HTML, Screen Options for screen `comment`', async () => {
	const view = await page();
	const container = byId( view.container, 'postbox-container-2' );
	assert.ok( container && hasClass( container, 'postbox-container' ) );
	assert.ok( byId( container, 'normal-sortables' ) );
	const box = byId( container, 'acme-note' );
	assert.ok( box && hasClass( box, 'postbox' ) );
	assert.ok( find( box, byClass( 'wp-admin-legacy-html' ) ), 'A plugin box is its HTML.' );
	assert.equal( findAll( view.container, byProp( 'id', 'postbox-container-1' ) ).length, 1, 'Only the Save box\'s column has that id.' );
	assert.deepEqual( screenOptions.sections, DATA().screenOptions.sections );
	assert.equal( screenOptions.reordering, true );

	// Closing a box saves the comment screen's preferences.
	find( box, byClass( 'handlediv' ) ).props.onClick( prevent );
	await flush();
	assert.deepEqual( api.calls.map( ( call ) => [ call.method, call.route ] ), [ [ 'POST', 'wp-admin/v1/screen-preferences/comment' ] ] );
	unmountAll();

	await page( DATA( { screenOptions: null } ) );
	assert.equal( screenOptions, null, 'WordPress shows no Screen Options: none.' );
} );

test( 'meta boxes: a box whose callback failed says so; plugin box fields are shown but not saved (Q1)', async () => {
	api.respondWith( async () => ANSWER() );
	const view = await page( DATA( { boxes: [ { ...DATA().boxes[ 0 ], html: '', error: true } ] } ) );
	assert.equal( clean( find( byId( view.container, 'acme-note' ), byClass( 'wp-admin-legacy-failure' ) ) ), 'This box could not be displayed.' );
	await byId( view.container, 'post' ).props.onSubmit( prevent );
	await flush();
	assert.deepEqual( Object.keys( api.calls[ 0 ].payload ).sort(), [ 'author', 'content', 'date', 'email', 'parent', 'referredby', 'screen', 'status', 'url' ] );
} );

test( 'slots: side-after and normal-after get the comment', async () => {
	contracts.configure( { replacements: {}, slots: { 'core/comment-edit': { 'side-after': [ { module: '/m/side.js' } ], 'normal-after': [ { module: '/m/normal.js' } ] } } } );
	const got = [];
	globalThis.__modules[ '/m/side.js' ] = { default: { props: [ 'comment' ], setup: ( props ) => () => {
		got.push( [ 'side', props.comment.id ] );
		return h( 'p', { class: 'side-module' } );
	} } };
	globalThis.__modules[ '/m/normal.js' ] = { default: { props: [ 'comment' ], setup: ( props ) => () => {
		got.push( [ 'normal', props.comment.id ] );
		return h( 'p', { class: 'normal-module' } );
	} } };
	const view = await page();
	assert.ok( find( byId( view.container, 'postbox-container-1' ), byClass( 'side-module' ) ) );
	assert.ok( find( byId( view.container, 'post-body' ), byClass( 'normal-module' ) ) );
	assert.deepEqual( got.sort(), [ [ 'normal', 5 ], [ 'side', 5 ] ] );
} );
