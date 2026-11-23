// Page data of Writing Settings, as wp-admin/v1/settings/writing returns it on a single site with post by email and
// update services on, shared by the component tests of this folder. Not a test file.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { expect } from '@jest/globals';

export { settle };

export const writingData = ( overrides = {} ) => ( {
	default_category: 1,
	default_post_format: '0',
	mailserver_url: 'mail.example.com',
	mailserver_port: '110',
	mailserver_login: 'login@example.com',
	mailserver_pass: 'secret',
	default_email_category: 1,
	ping_sites: 'https://rpc.pingomatic.com/',
	unshown: [],
	choices: { categories: [ { value: 1, label: 'Uncategorized', depth: 0 } ], postFormats: [ { value: '0', label: 'Standard' } ] },
	flags: { formatting: false, linkManager: false, postByEmail: true, updateServices: true, blogPublic: true },
	randomStrings: [ 'aB3dE6gH', 'Ij9kL2mN', 'oP5qR8sT' ],
	locked: [],
	multisite: false,
	legacySections: { sections: [], scripts: [], styles: [] },
	...overrides,
} );

/** Mounts core/options-writing with the data. The contracts must have been filled (see fillContracts). */
export async function writingPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-writing', data, page: { path: 'options-writing.php', title: 'Writing Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#default_category' ).exists() ).toBe( true );
	return wrapper;
}
