/** @jest-environment jsdom */
// All Settings: a second Save posts only the rows changed since the first (the first save's values are the new baseline), and
// a Save with nothing changed since posts an empty change set.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const row = ( name, value, extra = {} ) => ( { name, value, editable: true, multiline: false, ...extra } );
const data = ( values ) => ( { rows: Object.entries( values ).map( ( [ name, value ] ) => row( name, value ) ) } );

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-all', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

async function allPage( page ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-all', data: page, page: { path: 'options.php', title: 'All Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#alpha' ).exists() ).toBe( true );
	return wrapper;
}

const saves = () => api.calls.filter( ( call ) => 'wp-admin/v1/settings/all' === call.route ).map( ( call ) => call.payload );

test( 'the second Save posts only the rows changed since the first', async () => {
	// The answer stores what was posted, as the endpoint does.
	let stored = { alpha: 'a', beta: 'b', gamma: 'c' };
	api.respondWith( async ( method, route, payload ) => {
		stored = { ...stored, ...payload.changed };
		return { ...data( stored ), notices: [] };
	} );
	const wrapper = await allPage( data( stored ) );

	await wrapper.find( '#alpha' ).setValue( 'a1' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	await wrapper.find( '#beta' ).setValue( 'b2' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( saves() ).toEqual( [ { changed: { alpha: 'a1' } }, { changed: { beta: 'b2' } } ] );
	expect( wrapper.find( '#alpha' ).element.value ).toBe( 'a1' );
	expect( wrapper.find( '#beta' ).element.value ).toBe( 'b2' );
} );

test( 'a Save with nothing changed since the last posts an empty change set', async () => {
	let stored = { alpha: 'a', beta: 'b', gamma: 'c' };
	api.respondWith( async ( method, route, payload ) => {
		stored = { ...stored, ...payload.changed };
		return { ...data( stored ), notices: [] };
	} );
	const wrapper = await allPage( data( stored ) );

	await wrapper.find( '#gamma' ).setValue( 'c1' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( saves() ).toEqual( [ { changed: { gamma: 'c1' } }, { changed: {} } ] );
} );

test( 'a row typed again to the saved value is not posted', async () => {
	api.respondWith( async () => ( { ...data( { alpha: 'a', beta: 'b', gamma: 'c' } ), notices: [] } ) );
	const wrapper = await allPage( data( { alpha: 'a', beta: 'b', gamma: 'c' } ) );

	await wrapper.find( '#alpha' ).setValue( 'zzz' );
	await wrapper.find( '#alpha' ).setValue( 'a' );
	await wrapper.find( '#beta' ).setValue( 'b1' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( saves() ).toEqual( [ { changed: { beta: 'b1' } } ] );
} );
