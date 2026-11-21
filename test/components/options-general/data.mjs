// Page data of General Settings, as wp-admin/v1/settings/general returns it on a single site, shared by the
// component tests of this folder. Not a test file.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { expect } from '@jest/globals';

export { settle };

export const settingsData = ( overrides = {} ) => ( {
	blogname: 'My Site',
	blogdescription: 'Just another site',
	site_icon: { id: 0, url: '', alt: '' },
	siteurl: 'http://localhost:8889',
	home: 'http://localhost:8889',
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
		timeFormats: [ { value: 'g:i a', example: '10:00 am' }, { value: 'H:i', example: '10:00' } ],
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

/** Mounts core/options-general with the data. The contracts must have been filled (see fillContracts). */
export async function generalPage( data, { notices = [] } = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-general', data, page: { path: 'options-general.php', title: 'General Settings' } } ) }, {
		provide: { notices: { add: ( notice ) => { notices.push( notice ); return 'n' + notices.length; } }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#blogname' ).exists() ).toBe( true );
	return wrapper;
}
