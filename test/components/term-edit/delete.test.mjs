/** @jest-environment jsdom */
// Delete on the term edit page, as tags.js runs it on `#edittag .delete`: showNotice.warn()'s
// question; declined, nothing; accepted, DELETE terms/{id} with `screen: 'term'` and the page's
// path as the referer, then the redirect (the list) is followed. No link without `data.delete`.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { PATH, host, loadContracts, mountTerm, settle, termData } from './data.mjs';

const WARN = 'You are about to permanently delete these items from your site.\nThis action cannot be undone.\n\'Cancel\' to stop, \'OK\' to delete.';
const ANSWER = { redirect: 'term.php?taxonomy=category&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory%26s%3Djazz&message=2', location: null };

beforeEach( async () => {
	api.reset();
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
} );

const deletes = () => api.calls.filter( ( call ) => call.method === 'DELETE' );

test( 'confirm text; dismiss: the classic question, and nothing happens when it is declined', async () => {
	const asked = [];
	const wrapper = await mountTerm( termData(), host(), { confirm: ( message ) => asked.push( message ) && false } );
	const link = wrapper.find( '.edit-tag-actions #delete-link a.delete' );
	expect( link.text() ).toBe( 'Delete' );
	await link.trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [ WARN ] );
	expect( deletes() ).toEqual( [] );
	expect( wrapper.record.followed ).toEqual( [] );
} );

test( 'accept: DELETE terms/{id} with the taxonomy, screen term and the page path as referer; the redirect is followed', async () => {
	api.respondWith( async () => ANSWER );
	const wrapper = await mountTerm( termData(), host(), { confirm: () => true } );
	await wrapper.find( '#delete-link a.delete' ).trigger( 'click' );
	await settle();
	expect( deletes() ).toHaveLength( 1 );
	const route = new URL( deletes()[ 0 ].route, 'http://localhost/' );
	expect( route.pathname ).toBe( '/wp-admin/v1/terms/5' );
	expect( [ ...route.searchParams ] ).toEqual( [ [ 'taxonomy', 'category' ], [ 'screen', 'term' ], [ 'referer', PATH ] ] );
	expect( wrapper.record.followed ).toEqual( [ [ ANSWER, null ] ] );
} );

test( 'no link without delete: the default category has no Delete link', async () => {
	const wrapper = await mountTerm( termData( { delete: null } ) );
	expect( wrapper.find( '#delete-link' ).exists() ).toBe( false );
	expect( wrapper.find( 'a.delete' ).exists() ).toBe( false );
	expect( wrapper.find( '.edit-tag-actions input[type="submit"]' ).exists() ).toBe( true );
} );

test( 'a refused delete shows WordPress\'s message in a page notice and stays', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Sorry, you are not allowed to delete this item.' ), { status: 403, code: 'term_forbidden' } );
	} );
	const wrapper = await mountTerm( termData(), host(), { confirm: () => true } );
	await wrapper.find( '#delete-link a.delete' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.added.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Sorry, you are not allowed to delete this item.' ] ] );
	expect( wrapper.record.followed ).toEqual( [] );
	expect( wrapper.find( 'form#edittag' ).exists() ).toBe( true );
} );

test( 'showNotice: the page gives plugins common.js\'s showNotice while it is shown', async () => {
	const before = Object.hasOwn( window, 'showNotice' );
	const wrapper = await mountTerm( termData(), host(), { confirm: () => false } );
	expect( typeof window.showNotice?.warn ).toBe( 'function' );
	expect( window.showNotice.warn() ).toBe( false );
	wrapper.unmount();
	expect( Object.hasOwn( window, 'showNotice' ) ).toBe( before );
} );
