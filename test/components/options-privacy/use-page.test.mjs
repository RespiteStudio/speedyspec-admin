/** @jest-environment jsdom */
// "Use This Page" of Privacy Settings: while the request runs both buttons are disabled and Use This Page is busy, the answer
// frees them and shows the page it sends; a failed request keeps the choice, shows the message and frees them.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { deferred, privacyData, privacyPage, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-privacy' ] );
} );

afterEach( () => resetContracts() );

test( 'busy until the answer, then the page the answer names is shown', async () => {
	const answer = deferred();
	api.respondWith( () => answer.promise );
	const wrapper = await privacyPage( privacyData() );
	await wrapper.find( '#page_for_privacy_policy' ).setValue( '21' );

	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( '#set-page' ).attributes( 'aria-busy' ) ).toBe( 'true' );
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( '#create-page' ).attributes( 'aria-busy' ) ).toBeUndefined();

	// A second submit while busy posts nothing.
	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );
	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ] ).toMatchObject( { method: 'POST', route: 'wp-admin/v1/settings/privacy', payload: { page: 21 } } );

	answer.resolve( privacyData( { selected: 21, pageExists: true, pageStatus: 'draft', editPath: 'post.php?post=21&action=edit', viewUrl: 'https://example.test/?p=21', notices: [ { type: 'success', message: 'Privacy Policy page updated successfully.' } ] } ) );
	await settle();
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( wrapper.find( 'label[for="page_for_privacy_policy"]' ).text() ).toBe( 'Change your Privacy Policy page' );
	expect( wrapper.find( '.wp-admin-privacy-page-links a' ).attributes( 'href' ) ).toBe( '/wp-admin/post.php?post=21&action=edit' );
} );

test( 'a refused request shows the message, keeps the choice and frees both buttons', async () => {
	const raised = [];
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture refusal.' ), { code: 'x', status: 500 } );
	} );
	const wrapper = await privacyPage( privacyData(), { notices: { add: ( notice ) => raised.push( notice ) || 'n1', dismiss: () => {} } } );
	await wrapper.find( '#page_for_privacy_policy' ).setValue( '21' );
	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );
	await settle();

	expect( raised.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture refusal.' ] ] );
	expect( wrapper.find( '#page_for_privacy_policy' ).element.value ).toBe( '21' );
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeUndefined();
} );

test( 'an unreachable WordPress shows the classic retry message and keeps the choice', async () => {
	const raised = [];
	api.respondWith( async () => {
		throw Object.assign( new Error( 'x' ), { code: 'admin_upstream_unreachable', status: 0 } );
	} );
	const wrapper = await privacyPage( privacyData(), { notices: { add: ( notice ) => raised.push( notice ) || 'n1', dismiss: () => {} } } );
	await wrapper.find( '#page_for_privacy_policy' ).setValue( '21' );
	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );
	await settle();

	expect( raised.map( ( notice ) => notice.message ) ).toEqual( [ 'WordPress cannot be reached right now. Please try again in a moment.' ] );
	expect( wrapper.find( '#page_for_privacy_policy' ).element.value ).toBe( '21' );
} );
