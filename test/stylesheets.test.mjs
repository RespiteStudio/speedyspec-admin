import test from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { coreStylesheets, syncStylesheets } from '../site/runtime/stylesheets.js';

/** Just enough of a document for <link> handling in <head>. */
function fakeDocument() {
	const make = ( tag ) => {
		const el = {
			tagName: tag.toUpperCase(),
			attributes: {},
			parent: null,
			setAttribute( k, v ) { this.attributes[ k ] = String( v ); },
			getAttribute( k ) { return this.attributes[ k ] ?? null; },
			hasAttribute( k ) { return k in this.attributes; },
			remove() { this.parent?.children.splice( this.parent.children.indexOf( this ), 1 ); this.parent = null; },
			listeners: {},
			addEventListener( type, fn ) { ( this.listeners[ type ] ??= [] ).push( fn ); },
			fire( type ) { ( this.listeners[ type ] ?? [] ).splice( 0 ).forEach( ( fn ) => fn() ); },
		};
		return el;
	};
	const head = {
		children: [],
		insertBefore( el, ref ) {
			el.parent = head;
			const i = ref ? head.children.indexOf( ref ) : -1;
			head.children.splice( i < 0 ? head.children.length : i, 0, el );
		},
		appendChild( el ) { head.insertBefore( el, null ); },
		querySelectorAll( selector ) {
			if ( selector === 'link[data-wp-admin-core]' ) {
				return head.children.filter( ( c ) => c.hasAttribute( 'data-wp-admin-core' ) );
			}
			if ( selector === 'link[rel="stylesheet"]' ) {
				return head.children.filter( ( c ) => c.getAttribute( 'rel' ) === 'stylesheet' );
			}
			return [];
		},
	};
	const own = make( 'link' );
	own.setAttribute( 'rel', 'stylesheet' );
	own.setAttribute( 'href', '/styles/base.css' );
	head.appendChild( own );
	return { head, createElement: make };
}

const hrefs = ( doc ) => doc.head.children.map( ( c ) => c.getAttribute( 'href' ) );

test( 'coreStylesheets lists the core styles, with the RTL variants for rtl', () => {
	assert.deepEqual( coreStylesheets( 'ltr' ), [
		'/wp-includes/css/dashicons.css',
		'/wp-includes/css/buttons.css',
		'/wp-admin/css/common.css',
		'/wp-admin/css/forms.css',
		'/wp-admin/css/edit.css',
		'/wp-admin/css/admin-menu.css',
		'/wp-admin/css/wp-tooltip.css',
	] );
	assert.deepEqual( coreStylesheets( 'rtl' ), [
		'/wp-includes/css/dashicons.css',
		'/wp-includes/css/buttons-rtl.css',
		'/wp-admin/css/common-rtl.css',
		'/wp-admin/css/forms-rtl.css',
		'/wp-admin/css/edit-rtl.css',
		'/wp-admin/css/admin-menu-rtl.css',
		'/wp-admin/css/wp-tooltip-rtl.css',
	] );
} );

const core = ( doc ) => doc.head.children.filter( ( c ) => c.hasAttribute( 'data-wp-admin-core' ) );
const loadAll = ( doc ) => core( doc ).forEach( ( link ) => link.fire( 'load' ) );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );
// Timers are only run when a test asks for it.
function timers() {
	const pending = [];
	return { setTimer: ( fn ) => pending.push( fn ), run: () => pending.splice( 0 ).forEach( ( fn ) => fn() ) };
}

test( 'syncStylesheets adds core links before the site styles so those win', async () => {
	const doc = fakeDocument();
	const t = timers();
	const done = syncStylesheets( doc, 'ltr', t );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
	loadAll( doc );
	await done;
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
} );

test( 'on a change of direction the old links stay until the new ones have loaded', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'ltr', t );
	loadAll( doc );
	await tick();
	const done = syncStylesheets( doc, 'rtl', t );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'rtl' ), ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
	await tick();
	const count = coreStylesheets( 'ltr' ).length;
	assert.equal( core( doc ).length, 2 * count, 'nothing removed before the new links load' );
	core( doc ).slice( 0, count ).forEach( ( link ) => link.fire( 'load' ) );
	await done;
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'rtl' ), '/styles/base.css' ] );
} );

test( 'a link that never loads is waited for only until the timeout', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'ltr', t );
	loadAll( doc );
	await tick();
	const done = syncStylesheets( doc, 'rtl', t );
	t.run();
	await done;
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'rtl' ), '/styles/base.css' ] );
} );

test( 'syncStylesheets does nothing for the direction already shown', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'ltr', t );
	loadAll( doc );
	await tick();
	await syncStylesheets( doc, 'ltr', t );
	assert.equal( core( doc ).length, coreStylesheets( 'ltr' ).length );
} );

test( 'a newer direction supersedes one still loading', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'ltr', t );
	loadAll( doc );
	await tick();
	const toRtl = syncStylesheets( doc, 'rtl', t );
	const backToLtr = syncStylesheets( doc, 'ltr', t );
	loadAll( doc );
	await Promise.all( [ toRtl, backToLtr ] );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
} );

test( 'syncStylesheets with no direction removes the core links', async () => {
	const doc = fakeDocument();
	const t = timers();
	syncStylesheets( doc, 'rtl', t );
	loadAll( doc );
	await syncStylesheets( doc, null, t );
	assert.deepEqual( hrefs( doc ), [ '/styles/base.css' ] );
} );
