/** @jest-environment jsdom */
// "Show Avatars" of Discussion Settings: the Maximum Rating and Default Avatar rows follow it (as
// options_discussion_add_js() does), the choices are the endpoint's, and a save sends the choice.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { discussionData, discussionPage, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-discussion', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

const rating = ( wrapper ) => wrapper.find( 'tr[data-field="avatar_rating"]' );
const picker = ( wrapper ) => wrapper.find( 'tr[data-field="avatar_default"]' );
const hidden = ( row ) => row.element.style.display === 'none';

test( 'shown: both rows are visible, with the endpoint\'s ratings and avatars, and the stored ones checked', async () => {
	const wrapper = await discussionPage( discussionData() );
	expect( hidden( rating( wrapper ) ) ).toBe( false );
	expect( hidden( picker( wrapper ) ) ).toBe( false );
	expect( rating( wrapper ).classes() ).toContain( 'avatar-settings' );
	expect( rating( wrapper ).findAll( 'input[type="radio"]' ).map( ( input ) => input.element.value ) ).toEqual( [ 'G', 'PG' ] );
	expect( wrapper.find( '#avatar_rating_G' ).element.checked ).toBe( true );
	expect( picker( wrapper ).findAll( 'img.avatar.avatar-32' ) ).toHaveLength( 2 );
	expect( wrapper.find( '#avatar_mystery' ).element.checked ).toBe( true );
	expect( wrapper.find( '#avatar_identicon' ).element.checked ).toBe( false );
} );

test( 'Show Avatars unchecked hides both rows, checked shows them again, and nothing is sent by toggling', async () => {
	const wrapper = await discussionPage( discussionData() );
	await wrapper.find( '#show_avatars' ).setValue( false );
	expect( hidden( rating( wrapper ) ) ).toBe( true );
	expect( hidden( picker( wrapper ) ) ).toBe( true );
	// The row with the checkbox itself stays.
	expect( wrapper.find( 'tr[data-field="avatar_display"]' ).exists() ).toBe( true );
	expect( hidden( wrapper.find( 'tr[data-field="avatar_display"]' ) ) ).toBe( false );

	await wrapper.find( '#show_avatars' ).setValue( true );
	expect( hidden( rating( wrapper ) ) ).toBe( false );
	expect( hidden( picker( wrapper ) ) ).toBe( false );
	expect( api.calls ).toHaveLength( 0 );
} );

test( 'a site that starts with avatars off starts with the rows hidden', async () => {
	const wrapper = await discussionPage( discussionData( { show_avatars: false } ) );
	expect( hidden( rating( wrapper ) ) ).toBe( true );
	expect( hidden( picker( wrapper ) ) ).toBe( true );
} );

test( 'the chosen rating and avatar are saved with the box', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...discussionData( payload ), notices: [] } ) );
	const wrapper = await discussionPage( discussionData() );
	await wrapper.find( 'input[name="avatar_rating"][value="PG"]' ).setValue( true );
	await wrapper.find( '#avatar_identicon' ).setValue( true );
	await wrapper.find( '#show_avatars' ).setValue( false );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.route ).toBe( 'wp-admin/v1/settings/discussion' );
	expect( save.payload ).toEqual( { show_avatars: false, avatar_rating: 'PG', avatar_default: 'identicon' } );
	expect( hidden( rating( wrapper ) ) ).toBe( true );
} );

test( 'a stored default avatar that is no choice shows none checked, and is sent as the endpoint says', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...discussionData( payload ), notices: [] } ) );
	const data = discussionData( { avatar_default: '', unshown: [ 'avatar_default' ] } );
	const wrapper = await discussionPage( data );
	expect( wrapper.findAll( 'input[name="avatar_default"]:checked' ) ).toHaveLength( 0 );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls.find( ( call ) => call.method === 'POST' ).payload ).toEqual( { avatar_default: '' } );
} );
