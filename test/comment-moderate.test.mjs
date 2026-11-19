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

const { h } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
globalThis.__modules[ '/contracts/core/comment-moderate.js' ] = await import( '../site/contracts/core/comment-moderate.js' );
globalThis.__modules[ '/components/core/comment-moderate.js' ] = await import( '../site/components/core/comment-moderate.js' );
const pageModule = globalThis.__modules[ '/components/core/comment-moderate.js' ];
const contract = globalThis.__modules[ '/contracts/core/comment-moderate.js' ].default;

// Fixtures, as wp_admin_get_comment_moderate() gives them ---------------------------------

const TEXTS = {
	approve: [ 'You are about to approve the following comment:', 'Approve comment' ],
	trash: [ 'You are about to move the following comment to the Trash:', 'Move to Trash' ],
	spam: [ 'You are about to mark the following comment as spam:', 'Mark as spam' ],
	delete: [ 'You are about to delete the following comment:', 'Permanently delete comment' ],
};
const CONFIRM = ( action ) => ( action === 'delete'
	? { method: 'DELETE', route: 'wp-admin/v1/comments/5', body: { screen: 'comment-moderate' } }
	: { method: 'POST', route: 'wp-admin/v1/comments/5/status', body: { status: action, screen: 'comment-moderate' } } );
const DATA = ( action = 'trash', extra = {} ) => ( {
	screen: 'comment',
	action,
	error: null,
	statusNotice: { markup: 'This comment is currently approved.' },
	caution: TEXTS[ action ][ 0 ],
	button: TEXTS[ action ][ 1 ],
	comment: {
		id: 5,
		author: 'Pat <img src=x onerror=alert(1)>',
		email: 'pat@example.org',
		url: 'https://pat.example/',
		contentHtml: '<p>Hi <b>there</b></p>',
		date: { text: '2024/03/07 at 9:05 am', url: 'https://example.org/p/#comment-5' },
	},
	response: { title: 'The <post>', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/' },
	parent: { id: 4, name: 'Bea', url: 'https://example.org/p/#comment-4' },
	editUrl: 'comment.php?action=editcomment&c=5',
	cancelUrl: 'edit-comments.php',
	confirm: CONFIRM( action ),
	...extra,
} );
const ANSWER = ( extra = {} ) => ( { id: 5, postId: 40, status: 'trash', changed: true, redirect: 'edit-comments.php?trashed=1&ids=5', location: null, ...extra } );

// Page harness ------------------------------------------------------------------------------

let added;
let spoken;
let followed;
let bodyClasses;

beforeEach( () => {
	added = [];
	spoken = [];
	followed = [];
	bodyClasses = new Set();
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
};

const provide = ( extra = {} ) => ( {
	router,
	speak: ( message ) => spoken.push( message ),
	notices: { add: ( notice ) => added.push( notice ) },
	pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '?action=trash&c=5' },
	...extra,
} );

async function page( data = DATA(), { provided = {} } = {} ) {
	const view = mount( () => h( Contracted, { id: 'core/comment-moderate', data, page: { path: 'comment.php?action=' + data.action + '&c=5', title: 'Moderate Comment' } } ), { provide: provide( provided ) } );
	await flush();
	return view;
}

const byId = ( root, id ) => find( root, byProp( 'id', id ) );
const clean = ( node ) => textOf( node ).replace( /\s+/g, ' ' ).trim();
const prevent = { preventDefault() {} };
const rows = ( view ) => findAll( find( view.container, byClass( 'comment-ays' ) ), byTag( 'tr' ) );
const rowNamed = ( view, name ) => rows( view ).find( ( row ) => clean( find( row, byTag( 'th' ) ) ) === name );
const form = ( view ) => find( view.container, byClass( 'comment-ays-submit' ) );
const submitButton = ( view ) => find( form( view ), byProp( 'type', 'submit' ) );

// Contract ----------------------------------------------------------------------------------

test( 'the confirmation contract: a page, with data and page', () => {
	assert.equal( contract.id, 'core/comment-moderate' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( contract.emits, [ 'confirmed' ] );
	assert.equal( typeof pageModule.default, 'object' );
} );

// Labels ------------------------------------------------------------------------------------

for ( const action of Object.keys( TEXTS ) ) {
	test( `the ${ action } confirmation: its caution and its button, as WordPress sends them`, async () => {
		const view = await page( DATA( action ) );
		const warning = find( view.container, ( el ) => hasClass( el, 'notice-warning' ) );
		assert.equal( clean( warning ), 'Caution: ' + TEXTS[ action ][ 0 ] );
		assert.equal( clean( find( warning, byTag( 'strong' ) ) ), 'Caution:' );
		assert.equal( submitButton( view ).props.value, TEXTS[ action ][ 1 ] );
	} );

	test( `the ${ action } confirmation without WordPress's texts shows neither, rather than a guess (W-I3)`, async () => {
		const view = await page( DATA( action, { caution: null, button: null } ) );
		assert.equal( find( view.container, ( el ) => hasClass( el, 'notice-warning' ) ), null, 'No warning.' );
		assert.equal( submitButton( view ), null, 'No button.' );
		assert.ok( find( form( view ), byClass( 'button-cancel' ) ), 'Cancel stays.' );
		assert.ok( ! textOf( view.container ).includes( TEXTS[ action ][ 0 ] ), 'No text of the page\'s own.' );
	} );
}

// Markup ------------------------------------------------------------------------------------

test( 'the page: comment.php\'s notices, table and form, the comment text through InertHtml', async () => {
	const view = await page( DATA( 'trash', { comment: { ...DATA().comment, contentHtml: '<p>Hi <img src="x" onerror="alert(1)"><script>alert(2)</script></p>' } } ) );

	const notices = findAll( view.container, ( el ) => hasClass( el, 'notice' ) );
	assert.deepEqual( notices.map( ( notice ) => [ notice.props.id, notice.props.class ] ), [ [ 'message', 'notice notice-info' ], [ 'message', 'notice notice-warning' ] ] );
	assert.equal( clean( notices[ 0 ] ), 'This comment is currently approved.' );

	const table = find( view.container, byClass( 'comment-ays' ) );
	assert.equal( table.tag, 'table' );
	assert.ok( hasClass( table, 'form-table' ) );
	assert.deepEqual( rows( view ).map( ( row ) => clean( find( row, byTag( 'th' ) ) ) ), [ 'Author', 'Email', 'URL', 'In response to', 'Submitted on', 'Comment' ] );
	assert.equal( clean( find( rowNamed( view, 'Author' ), byTag( 'td' ) ) ), 'Pat <img src=x onerror=alert(1)>', 'The author is text.' );
	assert.equal( clean( find( rowNamed( view, 'Email' ), byTag( 'td' ) ) ), 'pat@example.org' );
	const url = find( rowNamed( view, 'URL' ), byTag( 'a' ) );
	assert.equal( url.props.href, 'https://pat.example/' );
	assert.equal( clean( url ), 'https://pat.example/' );

	const response = find( rowNamed( view, 'In response to' ), byTag( 'td' ) );
	assert.equal( clean( response ), 'The <post> | In reply to Bea.' );
	const [ post, parent ] = findAll( response, byTag( 'a' ) );
	assert.equal( post.props.href, '/wp-admin/post.php?post=40&action=edit' );
	assert.equal( parent.props.href, 'https://example.org/p/#comment-4' );

	const submitted = find( rowNamed( view, 'Submitted on' ), byTag( 'a' ) );
	assert.equal( submitted.props.href, 'https://example.org/p/#comment-5' );
	assert.equal( clean( submitted ), '2024/03/07 at 9:05 am' );

	const content = find( rowNamed( view, 'Comment' ), byClass( 'comment-content' ) );
	assert.ok( find( content, byClass( 'wp-admin-inert-html' ) ), 'The comment text is InertHtml.' );
	assert.ok( ! find( content, byClass( 'wp-admin-legacy-html' ) ), 'Never LegacyHtml.' );
	assert.ok( ! find( view.container, byTag( 'script' ) ) );
	assert.ok( ! find( view.container, byTag( 'img' ) ) );
	const edit = find( find( content, byClass( 'edit-comment' ) ), byTag( 'a' ) );
	assert.equal( edit.props.href, '/wp-admin/comment.php?action=editcomment&c=5' );
	assert.equal( clean( edit ), 'Edit' );

	assert.equal( form( view ).tag, 'form' );
	assert.equal( form( view ).props.method, 'get' );
	assert.equal( submitButton( view ).props.id, 'submit' );
	assert.ok( hasClass( submitButton( view ), 'button-primary' ) );
	const cancel = find( form( view ), byClass( 'button-cancel' ) );
	assert.equal( cancel.props.href, '/wp-admin/edit-comments.php' );
	assert.equal( clean( cancel ), 'Cancel' );
	assert.equal( api.calls.length, 0, 'Nothing is done on load.' );
} );

test( 'the rows the classic screen leaves out: no email, no URL, no parent, an unlinked post and date, no status notice', async () => {
	const view = await page( DATA( 'approve', {
		statusNotice: null,
		comment: { ...DATA().comment, email: null, url: null, date: { text: '2024/03/07 at 9:05 am', url: null } },
		response: { title: 'Locked', editUrl: null, viewUrl: null },
		parent: null,
	} ) );
	assert.deepEqual( rows( view ).map( ( row ) => clean( find( row, byTag( 'th' ) ) ) ), [ 'Author', 'In response to', 'Submitted on', 'Comment' ] );
	assert.equal( clean( find( rowNamed( view, 'In response to' ), byTag( 'td' ) ) ), 'Locked' );
	assert.ok( ! find( rowNamed( view, 'In response to' ), byTag( 'a' ) ) );
	assert.ok( ! find( rowNamed( view, 'Submitted on' ), byTag( 'a' ) ) );
	assert.ok( ! find( view.container, ( el ) => hasClass( el, 'notice-info' ) ) );
} );

// Confirm -----------------------------------------------------------------------------------

test( 'Confirm sends the request WordPress gives, then follows the answer; one at a time', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( ANSWER() );
	} ) );
	const confirmed = [];
	const view = mount( () => h( Contracted, { id: 'core/comment-moderate', data: DATA( 'trash' ), page: { path: 'comment.php?action=trash&c=5', title: 'Moderate Comment' }, onConfirmed: ( answer ) => confirmed.push( answer ) } ), { provide: provide() } );
	await flush();
	form( view ).props.onSubmit( prevent );
	form( view ).props.onSubmit( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/comments/5/status', payload: { status: 'trash', screen: 'comment-moderate' } } ] );
	assert.equal( submitButton( view ).props.disabled, true );
	release();
	await flush();
	assert.deepEqual( followed, [ ANSWER() ] );
	assert.deepEqual( confirmed, [ ANSWER() ] );
} );

test( 'Confirm of a deletion sends DELETE with the screen in the query', async () => {
	api.respondWith( async () => ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) );
	const view = await page( DATA( 'delete' ) );
	await form( view ).props.onSubmit( prevent );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'DELETE', route: 'wp-admin/v1/comments/5?screen=comment-moderate', payload: undefined } ] );
	assert.deepEqual( followed, [ ANSWER( { status: 'deleted', redirect: 'edit-comments.php?deleted=1' } ) ] );
} );

test( 'a refused confirmation shows WordPress\'s message, says it, and the button works again', async () => {
	const message = 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.';
	api.respondWith( async () => {
		throw Object.assign( new Error( message ), { status: 400 } );
	} );
	const view = await page( DATA( 'approve' ) );
	await form( view ).props.onSubmit( prevent );
	await flush();
	assert.equal( added.at( -1 ).message, message );
	assert.equal( added.at( -1 ).type, 'error' );
	assert.deepEqual( spoken, [ message ] );
	assert.equal( followed.length, 0 );
	assert.equal( submitButton( view ).props.disabled, false );
} );

test( 'without a router, a confirmed answer is loaded with location.assign()', async () => {
	const assigned = [];
	const previous = globalThis.location;
	globalThis.location = { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '', assign: ( url ) => assigned.push( url ) };
	try {
		api.respondWith( async () => ANSWER() );
		const view = await page( DATA( 'trash' ), { provided: { router: null } } );
		await form( view ).props.onSubmit( prevent );
		await flush();
		assert.deepEqual( assigned, [ '/wp-admin/edit-comments.php?trashed=1&ids=5' ] );
	} finally {
		globalThis.location = previous;
	}
} );

// Errors ------------------------------------------------------------------------------------

test( 'a post in the Trash: only the classic message, no table or form; the body class while shown', async () => {
	// Without InertHtml on screen, a document stub can carry the body's classes.
	globalThis.document = { body: { classList: { add: ( name ) => bodyClasses.add( name ), remove: ( name ) => bodyClasses.delete( name ) } } };
	const keys = Object.keys( DATA() );
	const data = { ...Object.fromEntries( keys.map( ( key ) => [ key, null ] ) ), screen: 'comment', action: 'approve', error: { kind: 'die', message: 'You cannot edit this comment because the associated post is in the Trash. Please restore the post first, then try again.' } };
	const view = await page( data );
	assert.equal( clean( find( view.container, byClass( 'wp-die-message' ) ) ), data.error.message );
	assert.ok( ! find( view.container, byClass( 'comment-ays' ) ) );
	assert.ok( ! form( view ) );
	assert.ok( bodyClasses.has( 'comment-php' ) );
	unmountAll();
	assert.ok( ! bodyClasses.has( 'comment-php' ) );
} );
