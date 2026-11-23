/** @jest-environment jsdom */
// The Time Format choices of General Settings: choosing a preset fills the custom field and its example; clicking or
// typing in the custom field selects the Custom radio; typing asks the preview route 500 ms after the last key, with a
// spinner meanwhile, and a save posts the typed format.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { generalPage, settingsData, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-general', 'form-table', 'settings-field' ] );
} );

afterEach( () => {
	jest.useRealTimers();
	resetContracts();
} );

// The time fieldset: the one with the custom time field.
const fieldset = ( wrapper ) => wrapper.findAll( 'fieldset' ).find( ( candidate ) => candidate.find( '#time_format_custom' ).exists() );
const customRadio = ( wrapper ) => wrapper.find( '#time_format_custom_radio' );

test( 'a stored preset is checked, and the custom field holds it', async () => {
	const wrapper = await generalPage( settingsData( { time_format: 'g:i a' } ) );
	const radios = fieldset( wrapper ).findAll( 'input[type="radio"]' );
	expect( radios.map( ( radio ) => radio.element.checked ) ).toEqual( [ true, false, false ] );
	expect( wrapper.find( '#time_format_custom' ).element.value ).toBe( 'g:i a' );
	expect( fieldset( wrapper ).find( '.example' ).text() ).toBe( '10:00 am' );
} );

test( 'a stored format that is not a preset checks Custom', async () => {
	const wrapper = await generalPage( settingsData( { time_format: 'G \\h' } ) );
	expect( customRadio( wrapper ).element.checked ).toBe( true );
	expect( wrapper.find( '#time_format_custom' ).element.value ).toBe( 'G \\h' );
} );

test( 'choosing a preset fills the custom field and shows its example', async () => {
	const wrapper = await generalPage( settingsData() );
	await fieldset( wrapper ).findAll( 'input[type="radio"]' )[ 1 ].setValue( true );
	expect( wrapper.find( '#time_format_custom' ).element.value ).toBe( 'H:i' );
	expect( fieldset( wrapper ).find( '.example' ).text() ).toBe( '10:00' );
	expect( customRadio( wrapper ).element.checked ).toBe( false );
} );

test( 'clicking the custom field selects the Custom radio', async () => {
	const wrapper = await generalPage( settingsData() );
	expect( customRadio( wrapper ).element.checked ).toBe( false );
	await wrapper.find( '#time_format_custom' ).trigger( 'click' );
	expect( customRadio( wrapper ).element.checked ).toBe( true );
} );

test( 'typing selects Custom and asks for the preview 500 ms after the last key, with a spinner meanwhile', async () => {
	jest.useFakeTimers( { doNotFake: [ 'nextTick', 'setImmediate', 'queueMicrotask' ] } );
	let answer;
	api.respondWith( () => new Promise( ( resolve ) => {
		answer = resolve;
	} ) );
	const wrapper = await generalPage( settingsData() );

	await wrapper.find( '#time_format_custom' ).setValue( 'H' );
	await wrapper.find( '#time_format_custom' ).setValue( 'H:i:s' );
	expect( customRadio( wrapper ).element.checked ).toBe( true );
	jest.advanceTimersByTime( 499 );
	expect( api.calls ).toHaveLength( 0 );

	jest.advanceTimersByTime( 1 );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'GET' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/settings/general/preview' );
	expect( api.calls[ 0 ].payload ).toEqual( { time_format: 'H:i:s' } );
	expect( fieldset( wrapper ).find( '.example' ).text() ).toBe( '10:00 am' );
	expect( fieldset( wrapper ).find( '.spinner, [class*="spinner"]' ).exists() ).toBe( true );

	answer( { timeFormat: '10:00:42' } );
	await settle();
	expect( fieldset( wrapper ).find( '.example' ).text() ).toBe( '10:00:42' );
} );

test( 'an empty custom format asks for no preview, and a failed preview keeps the example', async () => {
	jest.useFakeTimers( { doNotFake: [ 'nextTick', 'setImmediate', 'queueMicrotask' ] } );
	api.respondWith( async () => {
		throw new Error( 'offline' );
	} );
	const wrapper = await generalPage( settingsData() );

	await wrapper.find( '#time_format_custom' ).setValue( '' );
	jest.advanceTimersByTime( 600 );
	await settle();
	expect( api.calls ).toHaveLength( 0 );

	await wrapper.find( '#time_format_custom' ).setValue( 'H' );
	jest.advanceTimersByTime( 600 );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( fieldset( wrapper ).find( '.example' ).text() ).toBe( '10:00 am' );
} );

test( 'a save posts the typed custom time format', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...settingsData( { time_format: payload?.time_format } ), notices: [] } ) );
	const wrapper = await generalPage( settingsData() );
	await wrapper.find( '#time_format_custom' ).setValue( 'H\\h' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.route ).toBe( 'wp-admin/v1/settings/general' );
	expect( save.payload ).toEqual( { time_format: 'H\\h' } );
} );
