/** @jest-environment jsdom */
// The Favorites tab of Add Plugins: install_plugins_favorites_form() with the stored username, Get
// Favorites storing it (`POST plugins/favorites-user`, as wp_ajax_save_wporg_username()) and then
// opening the tab for it, without a nonce in the address, and its failed answer.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { favoritesPath } from '../../../site/components/core/plugin-install/favorites.js';
import { apiError, host, installData, loadContracts, mountInstall, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

const favorites = ( user = '' ) => installData( 'favorites', { favorites: { user, label: 'Your WordPress.org username:', help: 'If you have marked plugins as favorites on WordPress.org, you can browse them here.', submitLabel: 'Get Favorites' } } );

test( 'the form: the text, the label, the stored username and Get Favorites', async () => {
	const wrapper = await mountInstall( favorites( 'wporg-fan' ) );
	const form = wrapper.find( 'form:has( p.favorites-username )' );
	expect( form.attributes( 'method' ) ).toBe( 'get' );
	expect( form.find( 'input[type="hidden"][name="tab"]' ).element.value ).toBe( 'favorites' );
	expect( form.find( 'label[for="user"]' ).text() ).toBe( 'Your WordPress.org username:' );
	expect( form.find( 'input#user[type="search"][name="user"]' ).element.value ).toBe( 'wporg-fan' );
	expect( form.find( 'input[type="submit"].button' ).element.value ).toBe( 'Get Favorites' );
	expect( form.find( 'input[name="_wpnonce"]' ).exists() ).toBe( false );
	expect( wrapper.text() ).toContain( 'If you have marked plugins as favorites on WordPress.org, you can browse them here.' );
} );

test( 'Get Favorites stores the username, then opens the Favorites tab for it', async () => {
	const record = host();
	api.respondWith( async () => ( { saved: true, redirect: 'plugin-install.php?tab=favorites', location: null } ) );
	const wrapper = await mountInstall( favorites(), record );
	await wrapper.find( '#user' ).setValue( ' wporg fan ' );
	await wrapper.find( 'p.favorites-username' ).element.closest( 'form' ).dispatchEvent( new Event( 'submit' ) );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/plugins/favorites-user', payload: { user: 'wporg fan' } } ] );
	expect( record.navigated ).toEqual( [ '/wp-admin/plugin-install.php?tab=favorites&user=wporg+fan' ] );
	expect( favoritesPath( 'a&b' ) ).toBe( 'plugin-install.php?tab=favorites&user=a%26b' );
} );

test( 'a failed answer: WordPress\'s message in a page notice, and no navigation', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountInstall( favorites(), record );
	await wrapper.find( '#user' ).setValue( 'x' );
	await wrapper.find( 'p.favorites-username' ).element.closest( 'form' ).dispatchEvent( new Event( 'submit' ) );
	await settle();
	expect( record.notices.at( -1 ) ).toMatchObject( { type: 'error', message: 'Fixture failure.' } );
	expect( record.navigated ).toEqual( [] );
} );
