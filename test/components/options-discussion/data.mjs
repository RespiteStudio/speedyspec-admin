// Page data of Discussion Settings, as wp-admin/v1/settings/discussion returns it on a single site with every option at a
// common value, shared by the component tests of this folder. Not a test file.
import { h } from 'vue';
import { expect } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export const discussionData = ( overrides = {} ) => ( {
	default_pingback_flag: true,
	default_ping_status: true,
	default_comment_status: true,
	require_name_email: true,
	comment_registration: false,
	close_comments_for_old_posts: false,
	close_comments_days_old: 14,
	show_comments_cookies_opt_in: true,
	thread_comments: true,
	thread_comments_depth: 5,
	page_comments: false,
	comments_per_page: 50,
	default_comments_page: 'newest',
	comment_order: 'asc',
	comments_notify: true,
	moderation_notify: true,
	wp_notes_notify: true,
	comment_moderation: false,
	comment_previously_approved: true,
	comment_max_links: 2,
	moderation_keys: '',
	disallowed_keys: '',
	show_avatars: true,
	avatar_rating: 'G',
	avatar_default: 'mystery',
	unshown: [],
	choices: {
		threadCommentsDepth: [ 2, 3, 4, 5 ].map( ( value ) => ( { value, label: String( value ) } ) ),
		avatarRating: [
			{ value: 'G', label: 'G — Suitable for all audiences' },
			{ value: 'PG', label: 'PG — Possibly offensive, usually for audiences 13 and above' },
		],
		avatarDefault: [
			{ value: 'mystery', label: 'Mystery Person', url: 'https://secure.gravatar.test/avatar/?d=mm&s=32' },
			{ value: 'identicon', label: 'Identicon (Generated)', url: 'https://secure.gravatar.test/avatar/?d=identicon&s=32' },
		],
	},
	locked: [],
	legacySections: { sections: [], scripts: [], styles: [] },
	...overrides,
} );

export const settle = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
};

/** Mounts core/options-discussion with the data. The contracts must have been filled (see fillContracts). */
export async function discussionPage( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/options-discussion', data, page: { path: 'options-discussion.php', title: 'Discussion Settings' } } ) }, {
		provide: { notices: { add: () => 'n1' }, pageState: { setDirty: () => {}, isDirty: () => false } },
	} );
	await settle();
	expect( wrapper.find( '#comments_per_page' ).exists() ).toBe( true );
	return wrapper;
}
