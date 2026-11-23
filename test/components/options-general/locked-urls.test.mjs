/** @jest-environment jsdom */
// General Settings with WP_HOME and WP_SITEURL set (the throwaway e2e project drives the same
// page): WordPress lists the locked fields in `data.locked`. Their rows are disabled with the
// description, and a save leaves them out of the body. Nothing here decides which fields are
// locked: that comes from the page data.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from './data.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const LOCKED = 'This address is set in the site configuration file and cannot be changed here.';

/** Settings data as wp-admin/v1/settings/general returns it on a single site. */
const settingsData = ( overrides = {} ) => ( {
	blogname: 'My Site',
	blogdescription: 'Just another site',
	site_icon: { id: 0, url: '', alt: '' },
	siteurl: 'http://localhost:8891',
	home: 'http://localhost:8891',
	new_admin_email: 'admin@example.org',
	pending_admin_email: '',
	users_can_register: false,
	default_role: 'subscriber',
	WPLANG: '',
	timezone_string: 'Europe/Lisbon',
	gmt_offset: 0,
	date_format: 'F j, Y',
	time_format: 'g:i a',
	start_of_week: 1,
	unshown: [],
	choices: {
		roles: [ { value: 'subscriber', label: 'Subscriber' } ],
		languages: [ { value: '', label: 'English (United States)', lang: 'en', installed: true } ],
		languagesComplete: true,
		languageSelector: false,
		timezones: [ { group: 'Europe', options: [ { value: 'Europe/Lisbon', label: 'Lisbon' } ] } ],
		dateFormats: [ { value: 'F j, Y', example: 'November 17, 2026' } ],
		timeFormats: [ { value: 'g:i a', example: '10:00 am' } ],
		weekdays: [ 'Sunday', 'Monday' ].map( ( label, value ) => ( { value, label } ) ),
	},
	preview: {
		dateFormat: 'November 17, 2026',
		timeFormat: '10:00 am',
		utcTime: { format: 'Universal time is %s.', value: '2026-11-17 10:00:00' },
		localTime: { format: 'Local time is %s.', value: '2026-11-17 10:00:00' },
		timezoneAbbr: 'WET',
		dstNotice: [],
	},
	locked: [],
	multisite: false,
	legacySections: { sections: [], scripts: [], styles: [] },
	...overrides,
} );

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-general', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

async function generalPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-general', data, page: { path: 'options-general.php', title: 'General Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#blogname' ).exists() ).toBe( true );
	return wrapper;
}

test( 'locked rows from the data are disabled, with the description', async () => {
	const wrapper = await generalPage( settingsData( { locked: [ 'siteurl', 'home' ] } ) );
	for ( const field of [ 'siteurl', 'home' ] ) {
		const input = wrapper.find( '#' + field );
		expect( input.element.disabled ).toBe( true );
		expect( input.classes() ).toContain( 'disabled' );
		expect( wrapper.find( '#' + field + '-locked-description' ).text() ).toBe( LOCKED );
		expect( input.attributes( 'aria-describedby' ) ).toBe( field + '-locked-description' );
	}
	// The classic Site Address description gives way to the locked one.
	expect( wrapper.find( '#home-description' ).exists() ).toBe( false );
} );

test( 'without locked fields the rows are enabled, with no locked description', async () => {
	const wrapper = await generalPage( settingsData() );
	for ( const field of [ 'siteurl', 'home' ] ) {
		expect( wrapper.find( '#' + field ).element.disabled ).toBe( false );
		expect( wrapper.find( '#' + field + '-locked-description' ).exists() ).toBe( false );
	}
	expect( wrapper.find( '#home-description' ).exists() ).toBe( true );
} );

test( 'locked rows are left out of the save body', async () => {
	api.respondWith( async () => ( { ...settingsData( { locked: [ 'siteurl', 'home' ], blogdescription: 'New words' } ), notices: [] } ) );
	const wrapper = await generalPage( settingsData( { locked: [ 'siteurl', 'home' ] } ) );
	await wrapper.find( '#blogdescription' ).setValue( 'New words' );
	// Even a value that reached a locked input (a script, a devtools edit) is not sent.
	const siteurl = wrapper.find( '#siteurl' ).element;
	siteurl.value = 'http://elsewhere.example';
	siteurl.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].method ).toBe( 'POST' );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/settings/general' );
	expect( api.calls[ 0 ].payload ).toEqual( { blogdescription: 'New words' } );
} );

test( 'an unlocked Site Address is sent when changed', async () => {
	api.respondWith( async () => ( { ...settingsData( { home: 'http://localhost:8891/detached-home' } ), notices: [] } ) );
	const wrapper = await generalPage( settingsData() );
	await wrapper.find( '#home' ).setValue( 'http://localhost:8891/detached-home' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { home: 'http://localhost:8891/detached-home' } );
} );
