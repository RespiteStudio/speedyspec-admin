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

function routerWith( denied ) {
	const api = {
		setBase() {}, setNonce() {}, onUnauthorized() {},
		async get( route, params ) {
			if ( params?.path === 'link-manager.php' ) {
				throw new ApiError( { status: 403, code: 'rest_forbidden', message: 'no', data: denied === null ? {} : { status: 403, markup: denied } } );
			}
			return manifestFor( params?.path );
		},
	};
	return createRouter( { api, history: window.history, location: window.location, reactive } );
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
