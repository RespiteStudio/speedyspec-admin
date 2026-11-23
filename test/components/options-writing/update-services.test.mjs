/** @jest-environment jsdom */
// The Update Services section of Writing Settings: the field is there while the site is public, a site that asks not to be
// indexed gets the not-notifying sentence with its links instead (and sends no `ping_sites`), and a site where the
// filter turns the services off has no section at all.
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

const flags = ( overrides ) => ( { ...writingData().flags, ...overrides } );

/** The data as the endpoint answers when it has no `ping_sites`: the key is absent, not undefined. */
function withoutPing( overrides ) {
	const { ping_sites: omitted, ...rest } = writingData( overrides );
	return rest;
}

test( 'a public site: the heading, the field with its text, and no not-notifying sentence', async () => {
	const wrapper = await writingPage( writingData() );
	expect( wrapper.find( '#wp-settings-section-update-services' ).text() ).toBe( 'Update Services' );
	expect( wrapper.find( '#ping_sites' ).element.value ).toBe( 'https://rpc.pingomatic.com/' );
	expect( wrapper.find( 'label[for="ping_sites"] a' ).attributes( 'href' ) ).toBe( 'https://developer.wordpress.org/advanced-administration/wordpress/update-services/' );
	expect( wrapper.text() ).not.toContain( 'is not notifying any' );
} );

test( 'hidden with blogPublic false: no field, and the sentence links to the documentation and the visibility settings', async () => {
	const wrapper = await writingPage( withoutPing( { flags: flags( { blogPublic: false } ) } ) );
	expect( wrapper.find( '#wp-settings-section-update-services' ).exists() ).toBe( true );
	expect( wrapper.find( '#ping_sites' ).exists() ).toBe( false );
	const sentence = wrapper.findAll( 'p' ).find( ( paragraph ) => paragraph.text().startsWith( 'WordPress is not notifying any' ) );
	expect( sentence.text() ).toBe( 'WordPress is not notifying any Update Services because of your site’s visibility settings.' );
	const links = sentence.findAll( 'a' );
	expect( links.map( ( link ) => link.text() ) ).toEqual( [ 'Update Services', 'visibility settings' ] );
	expect( links[ 0 ].attributes( 'href' ) ).toBe( 'https://developer.wordpress.org/advanced-administration/wordpress/update-services/' );
	expect( links[ 1 ].attributes( 'href' ) ).toMatch( /options-reading\.php$/ );
} );

test( 'a save with the field hidden sends no ping_sites', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...withoutPing( { flags: flags( { blogPublic: false } ) } ), ...payload, notices: [] } ) );
	const wrapper = await writingPage( withoutPing( { flags: flags( { blogPublic: false } ) } ) );
	await wrapper.find( '#mailserver_login' ).setValue( 'other@example.com' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.payload ).toEqual( { mailserver_login: 'other@example.com' } );
} );

test( 'a save of the field posts the text typed', async () => {
	api.respondWith( async ( method, route, payload ) => ( { ...writingData( payload ), notices: [] } ) );
	const wrapper = await writingPage( writingData() );
	await wrapper.find( '#ping_sites' ).setValue( 'https://a.example/\nhttps://b.example/' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls.find( ( call ) => call.method === 'POST' ).payload ).toEqual( { ping_sites: 'https://a.example/\nhttps://b.example/' } );
} );

test( 'the filter turned the services off: no section, not even for a site that is not public', async () => {
	for ( const blogPublic of [ true, false ] ) {
		const wrapper = await writingPage( withoutPing( { flags: flags( { updateServices: false, blogPublic } ) } ) );
		expect( wrapper.find( '#wp-settings-section-update-services' ).exists() ).toBe( false );
		expect( wrapper.find( '#ping_sites' ).exists() ).toBe( false );
		expect( wrapper.text() ).not.toContain( 'is not notifying any' );
	}
} );
