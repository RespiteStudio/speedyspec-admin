/** @jest-environment jsdom */
// At a Glance (core/dashboard-at-a-glance): the counts, their links and the comment counts come from the data.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { mountWidget, resetDoubles } from '../../helpers/dashboard.mjs';

const DATA = {
	counts: [
		{ type: 'post', url: 'edit.php?post_status=publish&post_type=post', text: '12 Posts' },
		{ type: 'page', url: null, text: '3 Pages' },
	],
	comments: {
		approved: { text: '40 Comments', url: 'edit-comments.php' },
		moderated: { text: '2 in moderation', url: 'edit-comments.php?comment_status=moderated', hidden: false },
	},
	glanceItems: [ '<a class="plugin-glance" href="admin.php?page=acme">7 Acme items</a>' ],
	version: { version: '7.3', theme: 'Twenty Twenty-One', themesUrl: 'themes.php', text: null, update: null },
	searchEngines: null,
	quota: null,
	actions: null,
};

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const glance = async ( data = DATA, options = {} ) => ( await mountWidget( 'at-a-glance', data, options ) ).wrapper;

test( 'a count with an address is a link to its list, one without is plain text', async () => {
	const wrapper = await glance();
	const post = wrapper.find( '.main li.post-count' );
	const page = wrapper.find( '.main li.page-count' );

	expect( post.find( 'a' ).text() ).toBe( '12 Posts' );
	expect( post.find( 'a' ).attributes( 'href' ) ).toMatch( /edit\.php\?post_status=publish&post_type=post$/ );
	expect( page.find( 'a' ).exists() ).toBe( false );
	expect( page.text() ).toBe( '3 Pages' );
} );

test( 'the comment counts link to the Comments list and the moderated one hides when the data says so', async () => {
	const wrapper = await glance();
	expect( wrapper.find( '.comments-count-text' ).text() ).toBe( '40 Comments' );
	expect( wrapper.find( 'li.comment-count a' ).attributes( 'href' ) ).toMatch( /edit-comments\.php$/ );
	expect( wrapper.find( '.comments-in-moderation-text' ).text() ).toBe( '2 in moderation' );
	expect( wrapper.find( 'li.comment-mod-count a' ).attributes( 'href' ) ).toMatch( /edit-comments\.php\?comment_status=moderated$/ );
	expect( wrapper.find( 'li.comment-mod-count' ).classes() ).not.toContain( 'hidden' );

	const none = await glance( { ...DATA, comments: { ...DATA.comments, moderated: { ...DATA.comments.moderated, text: '0 in moderation', hidden: true } } } );
	expect( none.find( 'li.comment-mod-count' ).classes() ).toContain( 'hidden' );
} );

test( 'a count the data does not have is not shown, and no comment counts means none', async () => {
	const wrapper = await glance( { ...DATA, counts: [], comments: null } );
	expect( wrapper.findAll( '.main li' ).map( ( item ) => item.classes() ) ).toEqual( [ [] ] );
	expect( wrapper.find( 'li.comment-count' ).exists() ).toBe( false );
} );

test( 'what a plugin adds to the list shows as the plugin printed it', async () => {
	const wrapper = await glance();
	const item = wrapper.find( '.main li a.plugin-glance' );
	expect( item.text() ).toBe( '7 Acme items' );
	expect( item.attributes( 'href' ) ).toBe( 'admin.php?page=acme' );
} );

test( 'the version line names the theme as a link when the data has its address, and offers the update', async () => {
	const wrapper = await glance( { ...DATA, version: { ...DATA.version, update: { url: 'update-core.php', text: 'Update to 7.4' } } } );
	expect( wrapper.find( '#wp-version-message' ).text() ).toContain( 'WordPress 7.3 running Twenty Twenty-One theme.' );
	expect( wrapper.find( '#wp-version a' ).attributes( 'href' ) ).toMatch( /themes\.php$/ );
	expect( wrapper.find( '#wp-version-message a.button' ).text() ).toBe( 'Update to 7.4' );

	const plain = await glance( { ...DATA, version: { ...DATA.version, themesUrl: null } } );
	expect( plain.find( '#wp-version a' ).exists() ).toBe( false );
	expect( plain.find( '#wp-version-message a.button' ).exists() ).toBe( false );
} );

test( 'a version line a plugin filtered shows as HTML', async () => {
	const wrapper = await glance( { ...DATA, version: { ...DATA.version, text: '<b class="filtered">Filtered text</b>' } } );
	expect( wrapper.find( '#wp-version .filtered' ).text() ).toBe( 'Filtered text' );
} );

test( 'the search engines line and the storage quota show only with their data', async () => {
	const none = await glance();
	expect( none.find( '.search-engines-info' ).exists() ).toBe( false );
	expect( none.find( '.sub' ).exists() ).toBe( false );

	const wrapper = await glance( {
		...DATA,
		searchEngines: { url: 'options-reading.php', title: 'Reading', text: 'Search engines discouraged' },
		quota: { url: 'upload.php', allowed: { text: '100 MB Space Allowed' }, used: { text: '98 MB (98%) Space Used', warning: true } },
		actions: '<p class="rightnow-end">End</p>',
	} );
	expect( wrapper.find( '.search-engines-info a' ).attributes( 'href' ) ).toMatch( /options-reading\.php$/ );
	expect( wrapper.find( '.search-engines-info a' ).attributes( 'title' ) ).toBe( 'Reading' );
	const quota = wrapper.findAll( '.sub li.storage-count' );
	expect( quota.map( ( item ) => item.classes() ) ).toEqual( [ [ 'storage-count' ], [ 'storage-count', 'warning' ] ] );
	expect( quota[ 0 ].text() ).toContain( '100 MB Space Allowed' );
	expect( wrapper.find( '.sub .rightnow-end' ).text() ).toBe( 'End' );
} );
