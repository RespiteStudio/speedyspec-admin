// Page data of Reading Settings, as wp-admin/v1/settings/reading returns it on a site with pages, shared by the component
// tests of this folder. Not a test file.
import { h } from 'vue';
import { expect } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export const PAGES = [
	{ value: 11, label: 'Home', depth: 0 },
	{ value: 12, label: 'Blog', depth: 1 },
	{ value: 13, label: 'Privacy Policy', depth: 0 },
];

export const readingData = ( overrides = {} ) => ( {
	show_on_front: 'posts',
	page_on_front: 0,
	page_for_posts: 0,
	posts_per_page: 10,
	posts_per_rss: 10,
	rss_use_excerpt: '0',
	blog_public: false,
	unshown: [],
	choices: { pageOnFront: PAGES, pageForPosts: PAGES },
	flags: { pages: true, privacySelector: false },
	warnings: {},
	locked: [],
	legacySections: { sections: [], scripts: [], styles: [] },
	...overrides,
} );

export const settle = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
};

/** Mounts core/options-reading with the data. The contracts must have been filled (see fillContracts). */
export async function readingPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-reading', data, page: { path: 'options-reading.php', title: 'Reading Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#posts_per_page' ).exists() ).toBe( true );
	return wrapper;
}
