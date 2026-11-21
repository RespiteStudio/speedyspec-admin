/** @jest-environment jsdom */
// The Administration Email Address of General Settings: a pending change shows its notice, with the address, and
// Cancel request posts the dismissal (DELETE of the pending-admin-email route) and the notice goes with the answer.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { generalPage, settingsData, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-general', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

const cancelButtons = ( wrapper ) => wrapper.findAll( 'button.button-link' ).filter( ( button ) => button.text() === 'Cancel request' );

test( 'no pending change: no notice and no Cancel request', async () => {
	const wrapper = await generalPage( settingsData() );
	expect( wrapper.text() ).not.toContain( 'pending change' );
	expect( cancelButtons( wrapper ) ).toHaveLength( 0 );
} );

test( 'a pending change shows the notices with the address and the Cancel request buttons', async () => {
	const wrapper = await generalPage( settingsData( { pending_admin_email: 'new-admin@example.org' } ) );
	expect( wrapper.text() ).toContain( 'There is a pending change of the administration email to new-admin@example.org.' );
	expect( wrapper.text() ).toContain( 'Please check the inbox at new-admin@example.org for a confirmation email.' );
	expect( wrapper.find( '.wp-admin-pending-email code' ).text() ).toBe( 'new-admin@example.org' );
	expect( cancelButtons( wrapper ).length ).toBeGreaterThan( 0 );
} );

test( 'Cancel request posts the dismissal, and the notice goes with the answer, keeping the typed values', async () => {
	api.respondWith( async () => settingsData( { pending_admin_email: '' } ) );
	const wrapper = await generalPage( settingsData( { pending_admin_email: 'new-admin@example.org' } ) );
	await wrapper.find( '#blogname' ).setValue( 'Typed meanwhile' );

	await cancelButtons( wrapper )[ 0 ].trigger( 'click' );
	await settle();

	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'DELETE' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/settings/general/pending-admin-email' );
	expect( wrapper.text() ).not.toContain( 'pending change' );
	expect( cancelButtons( wrapper ) ).toHaveLength( 0 );
	expect( wrapper.find( '#blogname' ).element.value ).toBe( 'Typed meanwhile' );
} );

test( 'a Cancel request that cannot reach WordPress raises an error notice and keeps the pending change', async () => {
	api.respondWith( async () => {
		throw new Error( 'offline' );
	} );
	const notices = [];
	const wrapper = await generalPage( settingsData( { pending_admin_email: 'new-admin@example.org' } ), { notices } );

	await cancelButtons( wrapper )[ 0 ].trigger( 'click' );
	await settle();

	expect( notices.map( ( notice ) => notice.type ) ).toContain( 'error' );
	expect( notices.find( ( notice ) => notice.type === 'error' ).message ).toBe( 'WordPress cannot be reached right now. Please try again in a moment.' );
	expect( wrapper.text() ).toContain( 'There is a pending change of the administration email to new-admin@example.org.' );
} );
