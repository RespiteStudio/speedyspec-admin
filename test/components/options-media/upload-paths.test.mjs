/** @jest-environment jsdom */
// The upload path rows of Media Settings: they exist only when the page data has them (the endpoint leaves them out while
// they are the defaults, which the classic screen locks), they save, and when a save leaves them out they go.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { customPaths, mediaData, mediaPage, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-media', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

test( 'without the paths in the data there are no path rows, but the folders checkbox is there', async () => {
	const wrapper = await mediaPage( mediaData() );
	expect( wrapper.find( '#upload_path' ).exists() ).toBe( false );
	expect( wrapper.find( '#upload_url_path' ).exists() ).toBe( false );
	expect( wrapper.find( '#uploads_use_yearmonth_folders' ).exists() ).toBe( true );
	expect( wrapper.find( '#wp-settings-section-uploading-files' ).exists() ).toBe( true );
} );

test( 'with the paths in the data both rows show their values, labels and descriptions', async () => {
	const wrapper = await mediaPage( customPaths() );
	expect( wrapper.find( '#upload_path' ).element.value ).toBe( 'wp-content/uploads-custom' );
	expect( wrapper.find( '#upload_url_path' ).element.value ).toBe( 'https://example.test/uploads-custom' );
	expect( wrapper.find( 'label[for="upload_path"]' ).text() ).toBe( 'Store uploads in this folder' );
	expect( wrapper.find( 'label[for="upload_url_path"]' ).text() ).toBe( 'Full URL path to files' );
	expect( wrapper.find( 'tr[data-field="upload_path"] .description code' ).text() ).toBe( 'wp-content/uploads' );
	expect( wrapper.find( 'tr[data-field="upload_url_path"] .description' ).text() ).toBe( 'Configuring this is optional. By default, it should be blank.' );
} );

test( 'on a network there is no Uploading Files table at all', async () => {
	const wrapper = await mediaPage( mediaData( { flags: { uploadsTable: false, uploadPaths: false }, uploads_use_yearmonth_folders: undefined } ) );
	expect( wrapper.find( '#wp-settings-section-uploading-files' ).exists() ).toBe( false );
	expect( wrapper.find( '#upload_path' ).exists() ).toBe( false );
} );

test( 'editing the paths saves only what changed', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...customPaths( payload ), notices: [] } ) );
	const wrapper = await mediaPage( customPaths() );
	await wrapper.find( '#upload_url_path' ).setValue( 'https://example.test/other' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.route ).toBe( 'wp-admin/v1/settings/media' );
	expect( save.payload ).toEqual( { upload_url_path: 'https://example.test/other' } );
} );

test( 'clearing the paths sends them empty, and the answer without them removes the rows', async () => {
	api.respondWith( async () => ( { ...mediaData(), notices: [] } ) );
	const wrapper = await mediaPage( customPaths() );
	await wrapper.find( '#upload_path' ).setValue( '' );
	await wrapper.find( '#upload_url_path' ).setValue( '' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.payload ).toEqual( { upload_path: '', upload_url_path: '' } );
	expect( wrapper.find( '#upload_path' ).exists() ).toBe( false );
	expect( wrapper.find( '#upload_url_path' ).exists() ).toBe( false );
	expect( wrapper.find( '#uploads_use_yearmonth_folders' ).exists() ).toBe( true );
} );

test( 'a refused path shows the message beside its input and keeps what was typed', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Invalid.' ), { code: 'rest_invalid_param', data: { params: { upload_path: 'The path is not valid.' } } } );
	} );
	const wrapper = await mediaPage( customPaths() );
	await wrapper.find( '#upload_path' ).setValue( '../outside' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( wrapper.find( '#upload_path-error' ).text() ).toBe( 'The path is not valid.' );
	expect( wrapper.find( '#upload_path' ).attributes( 'aria-describedby' ) ).toBe( 'upload_path-error' );
	expect( wrapper.find( '#upload_path' ).attributes( 'aria-invalid' ) ).toBe( 'true' );
} );
