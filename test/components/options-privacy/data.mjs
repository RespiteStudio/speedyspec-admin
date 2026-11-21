// Page data of Privacy Settings, as wp-admin/v1/settings/privacy returns it with pages and no page set, shared by the
// component tests of this folder. Not a test file.
import { h } from 'vue';
import { expect } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export const privacyData = ( overrides = {} ) => ( {
	selected: 0,
	hasPages: true,
	pageExists: false,
	pageStatus: '',
	choices: { pages: [ { value: '0', label: '— Select —' }, { value: '21', label: 'Privacy Draft' } ] },
	guidePath: 'options-privacy.php?tab=policyguide',
	notices: [],
	...overrides,
} );

export const settle = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
};

/** A promise whose answer the test gives: `{ promise, resolve, reject }`. */
export function deferred() {
	const out = {};
	out.promise = new Promise( ( resolve, reject ) => {
		out.resolve = resolve;
		out.reject = reject;
	} );
	return out;
}

/** Mounts core/options-privacy with the data. The contracts must have been filled (see fillContracts). */
export async function privacyPage( data, provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-privacy', data, page: { path: 'options-privacy.php', title: 'Privacy' } } ) }, {
		provide: { notices: { add: () => 'n1', dismiss: () => {} }, pageState: { setDirty: () => {}, isDirty: () => false }, ...provide },
	} );
	await settle();
	expect( wrapper.find( '#create-page' ).exists() ).toBe( true );
	return wrapper;
}
