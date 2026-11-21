/** @jest-environment jsdom */
// The Show and Hide password button of the Post via email table of Writing Settings: it sets the field's `type`, its own
// `aria-label` and `data-toggle`, keeps the value, and the field is masked again after a save.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { settle, writingData, writingPage } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-writing', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

const input = ( wrapper ) => wrapper.find( '#mailserver_pass' );
const toggle = ( wrapper ) => wrapper.find( 'button.wp-hide-pw' );

test( 'the password starts masked, with the Show password button', async () => {
	const wrapper = await writingPage( writingData() );
	expect( input( wrapper ).attributes( 'type' ) ).toBe( 'password' );
	expect( input( wrapper ).element.value ).toBe( 'secret' );
	expect( toggle( wrapper ).attributes( 'aria-label' ) ).toBe( 'Show password' );
	expect( toggle( wrapper ).attributes( 'data-toggle' ) ).toBe( '0' );
	expect( toggle( wrapper ).attributes( 'type' ) ).toBe( 'button' );
} );

test( 'show and hide set the type and the label, and keep the value', async () => {
	const wrapper = await writingPage( writingData() );

	await toggle( wrapper ).trigger( 'click' );
	expect( input( wrapper ).attributes( 'type' ) ).toBe( 'text' );
	expect( toggle( wrapper ).attributes( 'aria-label' ) ).toBe( 'Hide password' );
	expect( toggle( wrapper ).attributes( 'data-toggle' ) ).toBe( '1' );
	expect( toggle( wrapper ).find( '.dashicons' ).classes() ).toContain( 'dashicons-hidden' );
	expect( input( wrapper ).element.value ).toBe( 'secret' );

	await toggle( wrapper ).trigger( 'click' );
	expect( input( wrapper ).attributes( 'type' ) ).toBe( 'password' );
	expect( toggle( wrapper ).attributes( 'aria-label' ) ).toBe( 'Show password' );
	expect( toggle( wrapper ).find( '.dashicons' ).classes() ).toContain( 'dashicons-visibility' );
} );

test( 'showing the password does not send anything by itself', async () => {
	const wrapper = await writingPage( writingData() );
	await toggle( wrapper ).trigger( 'click' );
	expect( api.calls ).toHaveLength( 0 );
} );

test( 'a save masks the password again', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...writingData( payload ), notices: [] } ) );
	const wrapper = await writingPage( writingData() );
	await toggle( wrapper ).trigger( 'click' );
	await input( wrapper ).setValue( 'new secret' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.payload ).toEqual( { mailserver_pass: 'new secret' } );
	expect( input( wrapper ).attributes( 'type' ) ).toBe( 'password' );
	expect( toggle( wrapper ).attributes( 'aria-label' ) ).toBe( 'Show password' );
} );
