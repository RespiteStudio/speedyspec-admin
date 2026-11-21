/** @jest-environment jsdom */
// The Help panel of Reading Settings: Overview, and a second tab titled "Search engine visibility", or "Site visibility"
// when the blog_privacy_selector action has callbacks (the page data's `flags.privacySelector`).
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, tabs, titles } from '../../helpers/help-tabs.mjs';
import { help } from '../../../site/components/core/options-reading/help.js';
import { readingData } from './data.mjs';

function open( flags = {} ) {
	const page = { data: readingData( { flags: { pages: true, privacySelector: false, ...flags } } ) };
	return openHelp( help, null, page );
}


test( 'Overview and Search engine visibility, and the sidebar documentation link', () => {
	const wrapper = open();
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Search engine visibility' ] );
	expect( wrapper.find( '.contextual-help-sidebar a[href="https://wordpress.org/documentation/article/settings-reading-screen/"]' ).text() ).toBe( 'Documentation on Reading Settings' );
	expect( wrapper.find( '.contextual-help-sidebar a[href="https://wordpress.org/support/forums/"]' ).text() ).toBe( 'Support forums' );
} );

test( 'with a visibility selector plugin the second tab is Site visibility, and there is only one', () => {
	const wrapper = open( { privacySelector: true } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Site visibility' ] );
} );

test( 'the Overview explains the homepage and the feeds, with the pages link', () => {
	const wrapper = open();
	const panel = wrapper.find( '[role="tabpanel"]:not([hidden])' );
	expect( panel.text() ).toContain( 'This screen contains the settings that affect the display of your content.' );
	expect( panel.text() ).toContain( 'To set a static homepage, you first need to create two Pages.' );
	expect( panel.find( 'a[href$="post-new.php?post_type=page"]' ).text() ).toBe( 'Pages' );
	expect( panel.find( 'a[href="https://developer.wordpress.org/advanced-administration/wordpress/feeds/"]' ).text() ).toBe( 'Learn more about feeds' );
} );

test( 'the visibility tab shows its three paragraphs when it is selected', async () => {
	const wrapper = open();
	await tabs( wrapper )[ 1 ].trigger( 'click' );
	await flushPromises();
	const panel = wrapper.find( '[role="tabpanel"]:not([hidden])' );
	expect( panel.text() ).toContain( 'You can choose whether or not your site will be crawled by robots, ping services, and spiders.' );
	expect( panel.text() ).toContain( 'Note that even when set to discourage search engines' );
	expect( panel.text() ).toContain( 'Search engines discouraged' );
} );
