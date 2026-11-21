// Page data of Media Settings, as wp-admin/v1/settings/media returns it on a single site, shared by the component tests of
// this folder. Not a test file.
import { h } from 'vue';
import { expect } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

/** With custom paths: `upload_path` and `upload_url_path` are in the data, and the flags say they can be edited. */
export const mediaData = ( overrides = {} ) => ( {
	thumbnail_size_w: 150,
	thumbnail_size_h: 150,
	thumbnail_crop: true,
	medium_size_w: 300,
	medium_size_h: 300,
	large_size_w: 1024,
	large_size_h: 1024,
	uploads_use_yearmonth_folders: true,
	unshown: [],
	flags: { uploadsTable: true, uploadPaths: false },
	locked: [],
	legacySections: { sections: [], scripts: [], styles: [] },
	...overrides,
} );

export const customPaths = ( overrides = {} ) => mediaData( {
	upload_path: 'wp-content/uploads-custom',
	upload_url_path: 'https://example.test/uploads-custom',
	flags: { uploadsTable: true, uploadPaths: true },
	...overrides,
} );

export const settle = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
};

/** Mounts core/options-media with the data. The contracts must have been filled (see fillContracts). */
export async function mediaPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-media', data, page: { path: 'options-media.php', title: 'Media Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#thumbnail_size_w' ).exists() ).toBe( true );
	return wrapper;
}
