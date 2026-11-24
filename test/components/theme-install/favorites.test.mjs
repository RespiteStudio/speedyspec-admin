/** @jest-environment jsdom */
// Favorites on Add Themes (theme-install.php's .favorites-form, theme.js saveUsername()): the form
// with the stored username, Get Favorites and Enter store it (`POST themes/favorites-user`) and
// then read the directory with `browse: 'favorites'` and the username, another key does nothing,
// and a failed answer.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { DIRECTORY, apiError, directory, host, installData, loadContracts, mountInstall, reads, settle } from './data.mjs';

const bodyClass = document.body.className;
const FAVORITES = 'wp-admin/v1/themes/favorites-user';

beforeEach( async () => {
	api.reset();
	api.respondWith( async ( method, route ) => ( route === DIRECTORY ? directory() : { saved: true, redirect: 'theme-install.php?browse=favorites', location: null } ) );
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

test( 'the form: the help, the label, the stored username and Get Favorites', async () => {
	const wrapper = await mountInstall( installData( { favorites: { ...installData().favorites, user: 'stored-fan' } } ) );
	const form = wrapper.find( '.wp-filter .favorites-form' );
	expect( [ form.find( 'p.install-help' ).text(), form.find( 'label[for="wporg-username-input"]' ).text(), form.find( '#wporg-username-input' ).element.value, form.find( 'input.favorites-form-submit' ).element.value ] ).toEqual( [ 'If you have marked themes as favorites on WordPress.org, you can browse them here.', 'Your WordPress.org username:', 'stored-fan', 'Get Favorites' ] );
} );

test( 'Get Favorites stores the username, then reads the favorites of it; the address does not change', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await wrapper.find( '#wporg-username-input' ).setValue( 'detached-fan' );
	await wrapper.find( 'input.favorites-form-submit' ).trigger( 'click' );
	await settle();
	expect( [ api.calls.find( ( call ) => call.route === FAVORITES ), reads( api.calls ).at( -1 ), record.addressed ] ).toEqual( [ { method: 'POST', route: FAVORITES, payload: { user: 'detached-fan' } }, { browse: 'favorites', user: 'detached-fan' }, [] ] );
} );

test( 'Enter in the field gets the favorites; another key does nothing', async () => {
	const wrapper = await mountInstall();
	const input = wrapper.find( '#wporg-username-input' );
	await input.setValue( 'detached-fan' );
	await input.trigger( 'keyup', { key: 'a' } );
	await settle();
	expect( api.calls.some( ( call ) => call.route === FAVORITES ) ).toBe( false );
	await input.trigger( 'keyup', { key: 'Enter' } );
	await settle();
	expect( api.calls.filter( ( call ) => call.route === FAVORITES ) ).toHaveLength( 1 );
} );

test( 'a failed answer: the error in a page notice, and no favorites read', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === DIRECTORY ) {
			return directory();
		}
		throw apiError( 'Fixture favorites failure.' );
	} );
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await wrapper.find( '#wporg-username-input' ).setValue( 'detached-fan' );
	await wrapper.find( 'input.favorites-form-submit' ).trigger( 'click' );
	await settle();
	expect( [ record.notices.map( ( notice ) => notice.message ), reads( api.calls ) ] ).toEqual( [ [ 'Fixture favorites failure.' ], [ { browse: 'popular' } ] ] );
} );
