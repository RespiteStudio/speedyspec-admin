/** @jest-environment jsdom */
// The Site Language selector of General Settings: a pack that is not installed is chosen from the "Available"
// group, the save posts its `language` code as WPLANG, and the page shows the installing state until the answer.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { generalPage, settingsData, settle } from './data.mjs';

const LANGUAGES = [
	{ value: '', label: 'English (United States)', lang: 'en', installed: true },
	{ value: 'ar', label: 'العربية', lang: 'ar', installed: true },
	{ value: 'de_DE', label: 'Deutsch', lang: 'de', installed: false },
];

const withLanguages = ( overrides = {} ) => {
	const base = settingsData();
	return settingsData( { choices: { ...base.choices, languages: LANGUAGES, languageSelector: true }, ...overrides } );
};

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-general', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

test( 'the installed languages and the available ones are in their own groups', async () => {
	const wrapper = await generalPage( withLanguages() );
	const groups = wrapper.findAll( '#WPLANG optgroup' );
	expect( groups.map( ( group ) => group.attributes( 'label' ) ) ).toEqual( [ 'Installed', 'Available' ] );
	expect( groups[ 0 ].findAll( 'option' ).map( ( option ) => option.element.value ) ).toEqual( [ '', 'ar' ] );
	expect( groups[ 1 ].findAll( 'option' ).map( ( option ) => option.element.value ) ).toEqual( [ 'de_DE' ] );
	expect( groups[ 1 ].find( 'option' ).attributes( 'data-installed' ) ).toBeUndefined();
	expect( groups[ 1 ].find( 'option' ).attributes( 'lang' ) ).toBe( 'de' );
} );

test( 'without the selector flag the row is not rendered', async () => {
	const wrapper = await generalPage( settingsData() );
	expect( wrapper.find( '#WPLANG' ).exists() ).toBe( false );
} );

test( 'choosing a pack that is not installed posts its language and shows the installing state until the answer', async () => {
	let answer;
	api.respondWith( () => new Promise( ( resolve ) => {
		answer = resolve;
	} ) );
	const wrapper = await generalPage( withLanguages() );
	expect( wrapper.find( '.language-install-spinner' ).exists() ).toBe( false );

	await wrapper.find( '#WPLANG' ).setValue( 'de_DE' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'POST' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/settings/general' );
	expect( api.calls[ 0 ].payload ).toEqual( { WPLANG: 'de_DE' } );
	expect( wrapper.find( '.language-install-spinner' ).exists() ).toBe( true );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( true );

	answer( { ...withLanguages( { WPLANG: 'de_DE', choices: { ...settingsData().choices, languageSelector: true, languages: LANGUAGES.map( ( language ) => ( { ...language, installed: true } ) ) } } ), notices: [] } );
	await settle();
	expect( wrapper.find( '.language-install-spinner' ).exists() ).toBe( false );
	expect( wrapper.find( '#submit' ).element.disabled ).toBe( false );
} );

test( 'choosing an installed pack posts it without the installing state', async () => {
	let answer;
	api.respondWith( () => new Promise( ( resolve ) => {
		answer = resolve;
	} ) );
	const wrapper = await generalPage( withLanguages() );

	await wrapper.find( '#WPLANG' ).setValue( 'ar' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	expect( api.calls[ 0 ].payload ).toEqual( { WPLANG: 'ar' } );
	expect( wrapper.find( '.language-install-spinner' ).exists() ).toBe( false );
	answer( { ...withLanguages( { WPLANG: 'ar' } ), notices: [] } );
	await settle();
} );
