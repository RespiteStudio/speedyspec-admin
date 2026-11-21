/** @jest-environment jsdom */
// The Privacy Policy warning of Reading Settings: it is the endpoint's decision (`warnings.privacyPolicy`), shown inside the
// homepage fieldset after the same-page warning, with core's wording. The page compares nothing itself.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { readingData, readingPage, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-reading', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

test( 'the warning is shown when the data has it, with core\'s text and classes', async () => {
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 13, page_for_posts: 12, warnings: { privacyPolicy: true } } ) );
	const warning = wrapper.find( '#privacy-policy-page-warning' );
	expect( warning.exists() ).toBe( true );
	expect( warning.classes() ).toEqual( expect.arrayContaining( [ 'notice', 'notice-warning', 'inline' ] ) );
	expect( warning.text() ).toBe( 'Warning: these pages should not be the same as your Privacy Policy page!' );
	expect( warning.find( 'strong' ).text() ).toBe( 'Warning:' );
	expect( wrapper.find( '#front-static-pages' ).find( '#privacy-policy-page-warning' ).exists() ).toBe( true );
	// The other warning is a different one.
	expect( wrapper.find( '#front-page-warning' ).exists() ).toBe( false );
} );

test( 'no warning in the data, no warning shown, even when the page chosen has the Privacy Policy\'s title', async () => {
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 13, page_for_posts: 12 } ) );
	expect( wrapper.find( '#privacy-policy-page-warning' ).exists() ).toBe( false );
} );

test( 'both warnings can be shown together, the same-page one first', async () => {
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 13, page_for_posts: 13, warnings: { frontPage: true, privacyPolicy: true } } ) );
	const ids = wrapper.findAll( '#front-static-pages .notice' ).map( ( notice ) => notice.attributes( 'id' ) );
	expect( ids ).toEqual( [ 'front-page-warning', 'privacy-policy-page-warning' ] );
} );

test( 'a save that clears the warning removes it, and one that sets it shows it', async () => {
	let answer = readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 13, warnings: { privacyPolicy: true }, notices: [] } );
	api.respondWith( async () => answer );
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12 } ) );
	expect( wrapper.find( '#privacy-policy-page-warning' ).exists() ).toBe( false );

	await wrapper.find( '#page_for_posts' ).setValue( '13' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#privacy-policy-page-warning' ).exists() ).toBe( true );

	answer = readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12, warnings: {}, notices: [] } );
	await wrapper.find( '#page_for_posts' ).setValue( '12' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#privacy-policy-page-warning' ).exists() ).toBe( false );
} );
