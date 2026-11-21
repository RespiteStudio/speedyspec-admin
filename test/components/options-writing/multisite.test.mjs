/** @jest-environment jsdom */
// Writing Settings on a multisite network (the throwaway e2e project's `detached-multisite`
// drives the same page): WordPress turns post by email and the update services off there
// (`enable_post_by_email_configuration`, `enable_update_services_configuration`), so the data has
// neither their flags nor their fields. A section absent in the data is not rendered, and a save
// sends none of its fields. Nothing here knows the page is on a network: the data says so.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const MAIL_FIELDS = [ 'mailserver_url', 'mailserver_port', 'mailserver_login', 'mailserver_pass', 'default_email_category' ];

/** Writing data as wp-admin/v1/settings/writing returns it on the main site of a network. */
function networkData( overrides = {} ) {
	return {
		default_category: 1,
		default_post_format: '0',
		unshown: [],
		choices: { categories: [ { value: 1, label: 'Uncategorized', depth: 0 } ], postFormats: [ { value: '0', label: 'Standard' } ] },
		flags: { formatting: false, linkManager: false, postByEmail: false, updateServices: false, blogPublic: true },
		randomStrings: [ 'aB3dE6gH', 'Ij9kL2mN', 'oP5qR8sT' ],
		locked: [],
		multisite: true,
		legacySections: { sections: [], scripts: [], styles: [] },
		...overrides,
	};
}

const settle = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
};

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-writing', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

async function writingPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-writing', data, page: { path: 'options-writing.php', title: 'Writing Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#default_category' ).exists() ).toBe( true );
	return wrapper;
}

const headings = ( wrapper ) => wrapper.findAll( 'h2' ).map( ( heading ) => heading.text() );

test( 'no Post via email section: no heading, no sentence, no mail table', async () => {
	const wrapper = await writingPage( networkData() );
	expect( headings( wrapper ) ).not.toContain( 'Post via email' );
	expect( wrapper.find( '#wp-settings-section-post-via-email' ).exists() ).toBe( false );
	expect( wrapper.text() ).not.toContain( 'To post to WordPress by email' );
	expect( wrapper.text() ).not.toContain( 'aB3dE6gH' );
	for ( const field of MAIL_FIELDS ) {
		expect( wrapper.find( '#' + field ).exists() ).toBe( false );
	}
} );

test( 'no Update Services section: no heading, no field and no not-notifying sentence', async () => {
	const wrapper = await writingPage( networkData() );
	expect( headings( wrapper ) ).not.toContain( 'Update Services' );
	expect( wrapper.find( '#wp-settings-section-update-services' ).exists() ).toBe( false );
	expect( wrapper.find( '#ping_sites' ).exists() ).toBe( false );
	expect( wrapper.text() ).not.toContain( 'is not notifying any' );
	// Not even for a site that asks search engines not to index it.
	const hidden = await writingPage( networkData( { flags: { ...networkData().flags, blogPublic: false } } ) );
	expect( hidden.text() ).not.toContain( 'is not notifying any' );
} );

test( 'the same data with the flags on shows both sections: the flags decide', async () => {
	const wrapper = await writingPage( networkData( {
		mailserver_url: 'mail.example.com', mailserver_port: '110', mailserver_login: 'login@example.com', mailserver_pass: 'password', default_email_category: 1, ping_sites: 'https://rpc.pingomatic.com/',
		flags: { formatting: false, linkManager: false, postByEmail: true, updateServices: true, blogPublic: true },
	} ) );
	expect( headings( wrapper ) ).toEqual( expect.arrayContaining( [ 'Post via email', 'Update Services' ] ) );
	expect( wrapper.find( '#mailserver_url' ).exists() ).toBe( true );
	expect( wrapper.find( '#ping_sites' ).exists() ).toBe( true );
} );

test( 'a save sends none of the absent sections\' fields', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...networkData(), ...payload } ) );
	const wrapper = await writingPage( networkData() );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	const save = api.calls.find( ( call ) => call.method === 'POST' && call.route === 'wp-admin/v1/settings/writing' );
	expect( save ).toBeDefined();
	for ( const field of [ ...MAIL_FIELDS, 'ping_sites' ] ) {
		expect( Object.keys( save.payload ) ).not.toContain( field );
	}
} );
