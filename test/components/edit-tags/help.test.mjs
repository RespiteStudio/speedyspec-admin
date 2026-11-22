/** @jest-environment jsdom */
// The Help panel of the terms lists. The tabs come from the router (WordPress registers them for
// the screen, wp-admin/edit-tags.php:232-306); the part shows them as the classic panel does:
// Overview and Adding Categories for Categories, Overview and Adding Tags for Tags, Overview only
// for Link Categories, and none for another taxonomy.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const DIFFERENCE = '<p>What&#8217;s the difference between categories and tags? Normally, tags are ad-hoc keywords that identify important information in your post (names, subjects, etc) that may or may not recur in other posts, while categories are pre-determined sections. If you think of your site like a book, the categories are like the Table of Contents and the tags are like the terms in the index.</p>';
const sidebar = ( link ) => '<p><strong>For more information:</strong></p><p>' + link + '</p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

const CATEGORIES = {
	tabs: [
		tab( 'overview', 'Overview', '<p>You can use categories to define sections of your site and group related posts. The default category is &#8220;Uncategorized&#8221; until you change it in your <a href="options-writing.php">writing settings</a>.</p>' + DIFFERENCE ),
		tab( 'adding-terms', 'Adding Categories', '<p>When adding a new category on this screen, you&#8217;ll fill in the following fields:</p><ul><li><strong>Name</strong> &mdash; The name is how it appears on your site.</li></ul>' ),
	],
	sidebar: sidebar( '<a href="https://wordpress.org/documentation/article/posts-categories-screen/">Documentation on Categories</a>' ),
};
const TAGS = {
	tabs: [
		tab( 'overview', 'Overview', '<p>You can assign keywords to your posts using <strong>tags</strong>. Unlike categories, tags have no hierarchy, meaning there is no relationship from one tag to another.</p>' + DIFFERENCE ),
		tab( 'adding-terms', 'Adding Tags', '<p>When adding a new tag on this screen, you&#8217;ll fill in the following fields:</p>' ),
	],
	sidebar: sidebar( '<a href="https://wordpress.org/documentation/article/posts-tags-screen/">Documentation on Tags</a>' ),
};
const LINK_CATEGORIES = {
	tabs: [
		tab( 'overview', 'Overview', '<p>You can create groups of links by using Link Categories. Link Category names must be unique and Link Categories are separate from the categories you use for posts.</p><p>You can delete Link Categories in the Bulk Action pull-down, but that action does not delete the links within the category. Instead, it moves them to the default Link Category.</p>' ),
	],
	sidebar: sidebar( '<a href="https://codex.wordpress.org/Links_Link_Categories_Screen">Documentation on Link Categories</a>' ),
};

const open = ( routerHelp ) => openHelp( null, routerHelp, { data: {} } );

test( 'Categories: Overview and Adding Categories, Overview shown, and the Categories documentation', async () => {
	const wrapper = open( CATEGORIES );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Adding Categories' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.find( '#tab-panel-overview a' ).attributes( 'href' ) ).toBe( 'options-writing.php' );
	await wrapper.findAll( '[role="tab"]' )[ 1 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Adding Categories' ] );
	expect( flat( wrapper.find( '#tab-panel-adding-terms p' ) ) ).toBe( 'When adding a new category on this screen, you’ll fill in the following fields:' );
	expect( wrapper.find( '.contextual-help-sidebar a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/documentation/article/posts-categories-screen/' );
} );

test( 'Tags: Overview and Adding Tags, and the Tags documentation', () => {
	const wrapper = open( TAGS );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Adding Tags' ] );
	expect( wrapper.find( '#tab-panel-overview strong' ).text() ).toBe( 'tags' );
	expect( wrapper.find( '.contextual-help-sidebar a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/documentation/article/posts-tags-screen/' );
} );

test( 'Link Categories: Overview only, and the Link Categories documentation', () => {
	const wrapper = open( LINK_CATEGORIES );
	expect( titles( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.findAll( '#tab-panel-overview p' ) ).toHaveLength( 2 );
	expect( wrapper.find( '.contextual-help-sidebar a' ).attributes( 'href' ) ).toBe( 'https://codex.wordpress.org/Links_Link_Categories_Screen' );
} );

test( 'a fixture taxonomy: the router sends no tab and an empty sidebar, so there is nothing to show', () => {
	expect( mergeHelp( null, { tabs: [], sidebar: '' }, { data: {} } ) ).toEqual( { tabs: [], sidebar: null } );
} );
