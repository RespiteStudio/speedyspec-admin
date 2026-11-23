/** @jest-environment jsdom */
// The router's access-denied message: a 403 whose data carries `markup` shows that text (inline
// markup) in place of the generic sentence, on the error screen the page host shows and on the
// shell's own. The next navigation clears it.
import { afterEach, expect, test } from '@jest/globals';
import { defineComponent, h, reactive, shallowRef } from 'vue';
import { createRouter } from '../../../site/runtime/router.js';
import { ApiError } from '../../../site/runtime/api.js';
import InlineMarkup from '../../../site/kit/InlineMarkup.js';
import ErrorScreen from '../../../site/pages/ErrorScreen.js';
import Shell from '../../../site/runtime/Shell.js';
import PageHost from '../../../site/runtime/PageHost.js';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';

const MARKUP = 'Please activate the <a href="plugins.php?x">Link Manager plugin</a> to use the link manager.';
const GENERIC = 'You do not have permission to access this page.';
const manifestFor = ( path ) => ( { apiVersion: 1, locale: { code: 'en_US', dir: 'ltr' }, importMap: { imports: {} }, menu: [], replacements: {}, slots: {}, page: { path, title: path, component: 'core/x', textDomains: [], data: {} } } );

let realFetch;
afterEach( () => {
	if ( realFetch ) {
		globalThis.fetch = realFetch;
		realFetch = undefined;
	}
	history.replaceState( null, '', '/' );
} );

function routerWith( denied, options = {} ) {
	const api = {
		setBase() {}, setNonce() {}, onUnauthorized() {},
		async get( route, params ) {
			if ( params?.path === 'link-manager.php' ) {
				throw new ApiError( { status: 403, code: 'rest_forbidden', message: 'no', data: denied === null ? {} : { status: 403, markup: denied } } );
			}
			return manifestFor( params?.path );
		},
	};
	return createRouter( { api, history: window.history, location: window.location, reactive, ...options } );
}

test( 'a 403 with markup stores it, and the next navigation clears it', async () => {
	const router = routerWith( MARKUP );
	await router.navigate( '/wp-admin/link-manager.php' );
	expect( router.state.status ).toBe( 'forbidden' );
	expect( router.state.forbiddenMarkup ).toBe( MARKUP );
	await router.navigate( '/wp-admin/edit.php' );
	expect( router.state.status ).toBe( 'ready' );
	expect( router.state.forbiddenMarkup ).toBeNull();
} );

test( 'a 403 without markup stores null', async () => {
	const router = routerWith( null );
	await router.navigate( '/wp-admin/link-manager.php' );
	expect( router.state.status ).toBe( 'forbidden' );
	expect( router.state.forbiddenMarkup ).toBeNull();
} );

test( 'the error screen shows the markup, with its link, and not the generic text', () => {
	const wrapper = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden', markup: MARKUP, markupComponent: InlineMarkup } } );
	expect( wrapper.find( '.wp-admin-error__title' ).text() ).not.toContain( GENERIC );
	expect( wrapper.text() ).not.toContain( GENERIC );
	const link = wrapper.find( 'a[href="plugins.php?x"]' );
	expect( link.exists() ).toBe( true );
	expect( link.text() ).toBe( 'Link Manager plugin' );
	expect( wrapper.text() ).toContain( 'Please activate the Link Manager plugin to use the link manager.' );
} );

test( 'the error screen shows the generic text without markup', () => {
	const wrapper = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden' } } );
	expect( wrapper.text() ).toContain( GENERIC );
	const empty = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden', markup: null, markupComponent: InlineMarkup } } );
	expect( empty.text() ).toContain( GENERIC );
} );

test( 'the shell\'s own forbidden screen (no frame) shows the stored markup', async () => {
	realFetch = globalThis.fetch;
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } );
	const Frame = defineComponent( { props: [ 'page' ], render() { return h( 'div' ); } } );
	const admin = { Contracted: Frame, MessageMarkup: InlineMarkup, adminBase: () => '/wp-admin/', currentMenuPath: ( { path } ) => path };
	const state = reactive( { status: 'forbidden', manifest: null, page: null, error: null, forbiddenMarkup: MARKUP } );
	const router = { state, refresh() {}, login() {}, signOut() {} };
	const wrapper = mountPart( Shell, { props: { router, signedIn: shallowRef( admin ) } } );
	await settle();
	expect( wrapper.find( 'main[data-kind="forbidden"] a[href="plugins.php?x"]' ).exists() ).toBe( true );
	expect( wrapper.text() ).not.toContain( GENERIC );
} );

test( 'markup is never shown raw: without the component that renders it, the generic text shows', () => {
	const wrapper = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden', markup: MARKUP } } );
	expect( wrapper.text() ).toContain( GENERIC );
	expect( wrapper.text() ).not.toContain( 'Link Manager plugin' );
} );

test( 'a 403 with markup asks for what renders it (onForbidden), once, with the markup; one without does not', async () => {
	const asked = [];
	const router = routerWith( MARKUP, { onForbidden: ( markup ) => asked.push( markup ) } );
	await router.navigate( '/wp-admin/link-manager.php' );
	expect( asked ).toEqual( [ MARKUP ] );
	const plain = [];
	const without = routerWith( null, { onForbidden: ( markup ) => plain.push( markup ) } );
	await without.navigate( '/wp-admin/link-manager.php' );
	expect( plain ).toEqual( [] );
} );

test( 'an onForbidden that fails leaves the forbidden screen as it is', async () => {
	const router = routerWith( MARKUP, { onForbidden: async () => {
		throw new Error( 'no entry' );
	} } );
	await router.navigate( '/wp-admin/link-manager.php' );
	await settle();
	expect( router.state.status ).toBe( 'forbidden' );
	expect( router.state.forbiddenMarkup ).toBe( MARKUP );
} );

test( 'the error screen\'s heading is the message: an h1 with the markup, as with the generic text', () => {
	const shown = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden', markup: MARKUP, markupComponent: InlineMarkup } } );
	expect( shown.findAll( 'h1' ) ).toHaveLength( 1 );
	expect( shown.find( 'h1' ).text() ).toBe( 'Please activate the Link Manager plugin to use the link manager.' );
	expect( shown.find( 'h1 a[href="plugins.php?x"]' ).exists() ).toBe( true );
	const generic = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden' } } );
	expect( generic.find( 'h1' ).text() ).toBe( GENERIC );
} );

test( 'hostile markup through the error screen runs and loads nothing: no script, no handler, no javascript: link', () => {
	delete window.__ran;
	const hostile = 'Go <a href="javascript:window.__ran=1">here</a><img src=x onerror="window.__ran=1"><script>window.__ran=1</script> <a href="plugins.php" onclick="window.__ran=1">plugins</a>';
	const wrapper = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, kind: 'forbidden', markup: hostile, markupComponent: InlineMarkup } } );
	const heading = wrapper.find( 'h1' );
	expect( heading.findAll( 'script' ) ).toHaveLength( 0 );
	expect( heading.findAll( 'img' ) ).toHaveLength( 0 );
	expect( heading.findAll( 'a' ).map( ( a ) => a.attributes() ) ).toEqual( [ { href: 'plugins.php' } ] );
	expect( heading.text() ).toBe( 'Go here plugins' );
	heading.find( 'a' ).element.dispatchEvent( new window.MouseEvent( 'click', { bubbles: true, cancelable: true } ) );
	expect( window.__ran ).toBeUndefined();
	delete window.__ran;
} );

test( 'the framed forbidden screen (PageHost) shows the router\'s message with its link, not the generic text', async () => {
	const state = reactive( { status: 'forbidden', forbiddenMarkup: MARKUP, page: null, manifest: null } );
	const router = { state, setDirty() {}, isDirty: () => false, refresh() {} };
	const wrapper = mountPart( PageHost, { props: { page: { path: 'link-manager.php', title: 'Links', component: 'core/link-manager', data: {} } }, provide: { router } } );
	await settle();
	const main = wrapper.find( 'main[data-kind="forbidden"]' );
	expect( main.exists() ).toBe( true );
	expect( main.find( 'h1' ).text() ).toBe( 'Please activate the Link Manager plugin to use the link manager.' );
	expect( main.find( 'h1 a[href="plugins.php?x"]' ).exists() ).toBe( true );
	expect( wrapper.text() ).not.toContain( GENERIC );
} );

test( 'the heading is a heading and the alert wraps it: role="alert" is on a div around the h1, never on the h1', () => {
	for ( const props of [ { kind: 'forbidden', markup: MARKUP, markupComponent: InlineMarkup }, { kind: 'forbidden' }, { kind: 'notfound' } ] ) {
		const wrapper = mountPart( ErrorScreen, { props: { router: { state: {}, refresh() {} }, ...props } } );
		const heading = wrapper.get( 'h1' );
		expect( wrapper.findAll( 'h1' ) ).toHaveLength( 1 );
		expect( heading.attributes( 'role' ) ).toBeUndefined();
		const parent = heading.element.parentElement;
		expect( parent.getAttribute( 'role' ) ).toBe( 'alert' );
		expect( parent.tagName ).toBe( 'DIV' );
		expect( parent.classList.contains( 'wp-admin-error__alert' ) ).toBe( true );
		expect( wrapper.findAll( '[role="alert"]' ) ).toHaveLength( 1 );
	}
} );
