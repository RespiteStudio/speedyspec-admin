import test from 'node:test';
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
		'/wp-admin/css/admin-menu.css',
	] );
	assert.deepEqual( coreStylesheets( 'rtl' ), [
		'/wp-includes/css/dashicons.css',
		'/wp-includes/css/buttons-rtl.css',
		'/wp-admin/css/common-rtl.css',
		'/wp-admin/css/forms-rtl.css',
		'/wp-admin/css/admin-menu-rtl.css',
	] );
} );

test( 'syncStylesheets adds core links before the site styles so those win', () => {
	const doc = fakeDocument();
	syncStylesheets( doc, 'ltr' );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
} );

test( 'syncStylesheets swaps to the RTL variants and back, without duplicates', () => {
	const doc = fakeDocument();
	syncStylesheets( doc, 'ltr' );
	syncStylesheets( doc, 'rtl' );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'rtl' ), '/styles/base.css' ] );
	syncStylesheets( doc, 'rtl' );
	syncStylesheets( doc, 'ltr' );
	assert.deepEqual( hrefs( doc ), [ ...coreStylesheets( 'ltr' ), '/styles/base.css' ] );
} );

test( 'syncStylesheets with no direction removes the core links', () => {
	const doc = fakeDocument();
	syncStylesheets( doc, 'rtl' );
	syncStylesheets( doc, null );
	assert.deepEqual( hrefs( doc ), [ '/styles/base.css' ] );
} );
