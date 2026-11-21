/** @jest-environment jsdom */
// The Help panel of the Media Library list. The tabs come from the router (WordPress registers
// them for the screen, wp-admin/upload.php:319-357); the part shows them as the classic panel
// does: three tabs and the sidebar. The grid's two other tabs are the hosted classic screen's.
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const MEDIA = {
	tabs: [
		tab( 'overview', 'Overview', '<p>All the files you&#8217;ve uploaded are listed in the Media Library, with the most recent uploads listed first. You can use the Screen Options tab to customize the display of this screen.</p>' ),
		tab( 'actions-links', 'Available Actions', '<p>Hovering over a row reveals action links that allow you to manage media items. You can perform the following actions:</p><ul><li><strong>Edit</strong> takes you to a simple screen to edit that individual file&#8217;s metadata.</li><li><strong>Download file</strong> downloads the original media file to your device.</li></ul>' ),
		tab( 'attaching-files', 'Attaching Files', '<p>If a media file has not been attached to any content, you will see that in the Uploaded To column, and can click on Attach to launch a small popup that will allow you to search for existing content and attach the file.</p>' ),
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/media-library-screen/">Documentation on Media Library</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

function open() {
	const { tabs, sidebar } = mergeHelp( null, MEDIA, { data: {} } );
	return mountPart( HelpTabs, { props: { tabs, sidebar } } );
}
const titles = ( wrapper ) => wrapper.findAll( '[role="tab"]' ).map( ( item ) => item.text() );
const selected = ( wrapper ) => wrapper.findAll( '[role="tab"]' ).filter( ( item ) => item.attributes( 'aria-selected' ) === 'true' ).map( ( item ) => item.text() );

test( 'three tabs, Overview first and shown, the others hidden', () => {
	const wrapper = open();
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Available Actions', 'Attaching Files' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	const hidden = [ 'overview', 'actions-links', 'attaching-files' ].filter( ( id ) => wrapper.find( '#tab-panel-' + id ).attributes( 'hidden' ) !== undefined );
	expect( hidden ).toEqual( [ 'actions-links', 'attaching-files' ] );
} );

test( 'choosing Attaching Files shows its panel and hides the one before', async () => {
	const wrapper = open();
	await wrapper.findAll( '[role="tab"]' )[ 2 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Attaching Files' ] );
	expect( wrapper.find( '#tab-panel-attaching-files' ).attributes( 'hidden' ) ).toBeUndefined();
	expect( wrapper.find( '#tab-panel-overview' ).attributes( 'hidden' ) ).toBeDefined();
	expect( wrapper.find( '#tab-panel-attaching-files' ).text() ).toContain( 'Attach to launch a small popup' );
} );

test( 'the Available Actions panel lists Download file, and the sidebar links to the Media Library documentation', () => {
	const wrapper = open();
	expect( wrapper.find( '#tab-panel-actions-links' ).text() ).toContain( 'Download file downloads the original media file to your device.' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( item ) => [ item.text(), item.attributes( 'href' ) ] ) ).toEqual( [
		[ 'Documentation on Media Library', 'https://wordpress.org/documentation/article/media-library-screen/' ],
		[ 'Support forums', 'https://wordpress.org/support/forums/' ],
	] );
} );

test( 'the Help button opens the panel and reports aria-expanded; the arrow keys move through the three tabs', async () => {
	const wrapper = open();
	const button = wrapper.find( '#contextual-help-link' );
	expect( button.attributes( 'aria-expanded' ) ).toBe( 'false' );
	await button.trigger( 'click' );
	expect( button.attributes( 'aria-expanded' ) ).toBe( 'true' );
	expect( wrapper.find( '#screen-meta' ).attributes( 'hidden' ) ).toBeUndefined();
	await wrapper.findAll( '[role="tab"]' )[ 0 ].trigger( 'keydown', { key: 'End' } );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Attaching Files' ] );
	await wrapper.findAll( '[role="tab"]' )[ 2 ].trigger( 'keydown', { key: 'ArrowDown' } );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
} );
