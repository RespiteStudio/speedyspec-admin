/** @jest-environment jsdom */
// "Create" of Privacy Settings: while the request runs the buttons are disabled and busy, a second submit sends nothing, and
// the answer takes the page to the new page's editor; a failed request shows the answer's message and frees the buttons.
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

const created = () => api.calls.filter( ( call ) => call.route === 'wp-admin/v1/settings/privacy/page' );

test( 'busy until the answer: both buttons disabled, Create busy, and a second submit posts nothing', async () => {
	const answer = deferred();
	api.respondWith( () => answer.promise );
	const visits = [];
	const wrapper = await privacyPage( privacyData(), { router: { navigate: async ( target ) => visits.push( target ) } } );
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeUndefined();

	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await settle();

	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( '#create-page' ).attributes( 'aria-busy' ) ).toBe( 'true' );
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( '#set-page' ).attributes( 'aria-busy' ) ).toBeUndefined();

	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( visits ).toEqual( [] );

	answer.resolve( { page: 30, editPath: 'post.php?post=30&action=edit' } );
	await settle();
	expect( created() ).toHaveLength( 1 );
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( visits ).toEqual( [ '/wp-admin/post.php?post=30&action=edit' ] );
} );

test( 'a refused request shows the answer’s message, keeps the choice and frees the buttons', async () => {
	const raised = [];
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Fixture create failure.' ), { code: 'x', status: 500 } );
	} );
	const wrapper = await privacyPage( privacyData(), { notices: { add: ( notice ) => raised.push( notice ) || 'n1', dismiss: () => {} }, router: { navigate: async () => {} } } );
	await wrapper.find( '#page_for_privacy_policy' ).setValue( '21' );

	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await settle();

	expect( raised.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture create failure.' ] ] );
	expect( wrapper.find( '#page_for_privacy_policy' ).element.value ).toBe( '21' );
	expect( wrapper.find( '#create-page' ).attributes( 'disabled' ) ).toBeUndefined();
	expect( wrapper.find( '#set-page' ).attributes( 'disabled' ) ).toBeUndefined();
} );

test( 'an answer without an editor path is an error, and nothing is opened', async () => {
	const raised = [];
	const visits = [];
	api.respondWith( async () => ( { page: 30 } ) );
	const wrapper = await privacyPage( privacyData(), { notices: { add: ( notice ) => raised.push( notice ) || 'n1', dismiss: () => {} }, router: { navigate: async ( target ) => visits.push( target ) } } );
	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await settle();

	expect( raised ).toHaveLength( 1 );
	expect( raised[ 0 ].type ).toBe( 'error' );
	expect( visits ).toEqual( [] );
} );
