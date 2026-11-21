/** @jest-environment jsdom */
// The Help panel of the Posts and Pages lists. The tabs come from the router (WordPress registers
// them for the screen, wp-admin/edit.php:141-212); the part shows them as the classic panel does:
// four tabs for Posts, two for Pages, and none for another post type.
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const POSTS = {
	tabs: [
		tab( 'overview', 'Overview', '<p>This screen provides access to all of your posts. You can customize the display of this screen to suit your workflow.</p>' ),
		tab( 'screen-content', 'Screen Content', '<p>You can customize the display of this screen&#8217;s contents in a number of ways:</p><ul><li>You can hide/display columns based on your needs and decide how many posts to list per screen using the Screen Options tab.</li></ul>' ),
		tab( 'action-links', 'Available Actions', '<p>Hovering over a row in the posts list will display action links that allow you to manage your post. You can perform the following actions:</p><ul><li><strong>Edit</strong> takes you to the editing screen for that post.</li></ul>' ),
		tab( 'bulk-actions', 'Bulk actions', '<p>You can also edit or move multiple posts to the Trash at once.</p><p>When using Bulk Edit, you can change the metadata (categories, author, etc.) for all selected posts at once.</p>' ),
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/posts-screen/">Documentation on Managing Posts</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};
const PAGES = {
	tabs: [
		tab( 'overview', 'Overview', '<p>Pages are similar to posts in that they have a title, body text, and associated metadata.</p>' ),
		tab( 'managing-pages', 'Managing Pages', '<p>Managing pages is very similar to managing posts, and the screens can be customized in the same way.</p>' ),
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/pages-screen/">Documentation on Managing Pages</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

function open( routerHelp ) {
	const { tabs, sidebar } = mergeHelp( null, routerHelp, { data: {} } );
	return mountPart( HelpTabs, { props: { tabs, sidebar } } );
}
const titles = ( wrapper ) => wrapper.findAll( '[role="tab"]' ).map( ( item ) => item.text() );
const selected = ( wrapper ) => wrapper.findAll( '[role="tab"]' ).filter( ( item ) => item.attributes( 'aria-selected' ) === 'true' ).map( ( item ) => item.text() );
const flat = ( found ) => found.text().replace( /\s+/g, ' ' );

test( 'Posts: four tabs, Overview first and shown, the others hidden', () => {
	const wrapper = open( POSTS );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Screen Content', 'Available Actions', 'Bulk actions' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toBe( 'This screen provides access to all of your posts. You can customize the display of this screen to suit your workflow.' );
	const hidden = [ 'overview', 'screen-content', 'action-links', 'bulk-actions' ].filter( ( id ) => wrapper.find( '#tab-panel-' + id ).attributes( 'hidden' ) !== undefined );
	expect( hidden ).toEqual( [ 'screen-content', 'action-links', 'bulk-actions' ] );
} );

test( 'choosing a tab shows its panel and hides the one before', async () => {
	const wrapper = open( POSTS );
	await wrapper.findAll( '[role="tab"]' )[ 3 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Bulk actions' ] );
	expect( wrapper.find( '#tab-panel-bulk-actions' ).attributes( 'hidden' ) ).toBeUndefined();
	expect( wrapper.find( '#tab-panel-overview' ).attributes( 'hidden' ) ).toBeDefined();
	expect( wrapper.find( '#tab-panel-bulk-actions' ).findAll( 'p' ).map( ( p ) => flat( p ) ) ).toEqual( [
		'You can also edit or move multiple posts to the Trash at once.',
		'When using Bulk Edit, you can change the metadata (categories, author, etc.) for all selected posts at once.',
	] );
} );

test( 'Posts: the sidebar links to the Posts documentation and the forums', () => {
	const links = open( POSTS ).findAll( '.contextual-help-sidebar a' );
	expect( links.map( ( link ) => [ link.text(), link.attributes( 'href' ) ] ) ).toEqual( [
		[ 'Documentation on Managing Posts', 'https://wordpress.org/documentation/article/posts-screen/' ],
		[ 'Support forums', 'https://wordpress.org/support/forums/' ],
	] );
} );

test( 'Pages: two tabs, Overview and Managing Pages, and the Pages documentation', async () => {
	const wrapper = open( PAGES );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Managing Pages' ] );
	await wrapper.findAll( '[role="tab"]' )[ 1 ].trigger( 'click' );
	await flushPromises();
	expect( flat( wrapper.find( '#tab-panel-managing-pages' ) ) ).toBe( 'Managing pages is very similar to managing posts, and the screens can be customized in the same way.' );
	expect( wrapper.find( '.contextual-help-sidebar a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/documentation/article/pages-screen/' );
} );

test( 'another post type: the router sends no tab and no sidebar, so there is nothing to show', () => {
	expect( mergeHelp( null, { tabs: [], sidebar: '' }, { data: {} } ) ).toEqual( { tabs: [], sidebar: null } );
	expect( mergeHelp( null, null, { data: {} } ) ).toEqual( { tabs: [], sidebar: null } );
} );

test( 'a tab the router sent without a title or content is left out', () => {
	const { tabs } = mergeHelp( null, { tabs: [ ...POSTS.tabs.slice( 0, 1 ), { id: 'broken', title: '', content: '<p>x</p>' }, { id: 'empty', title: 'Empty' } ] }, { data: {} } );
	expect( tabs.map( ( entry ) => entry.id ) ).toEqual( [ 'overview' ] );
} );
