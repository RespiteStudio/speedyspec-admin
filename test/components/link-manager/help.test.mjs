/** @jest-environment jsdom */
// The Help panel of the Links list. The tabs come from the router (WordPress registers them for
// the screen, wp-admin/link-manager.php:37-67): Overview and Deleting Links, with the
// Documentation on Managing Links in the sidebar.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const HELP = {
	tabs: [
		tab( 'overview', 'Overview', '<p>You can add links here to be displayed on your site, usually using <a href="widgets.php">Widgets</a>. By default, links to several sites in the WordPress community are included as examples.</p><p>Links may be separated into Link Categories; these are different than the categories used on your posts.</p><p>You can customize the display of this screen using the Screen Options tab and/or the dropdown filters above the links table.</p>' ),
		tab( 'deleting-links', 'Deleting Links', '<p>If you delete a link, it will be removed permanently, as Links do not have a Trash function yet.</p>' ),
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://codex.wordpress.org/Links_Screen">Documentation on Managing Links</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

test( 'two tabs and the sidebar: Overview shown first, Deleting Links on click, and the Links documentation', async () => {
	const wrapper = openHelp( null, HELP, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Deleting Links' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.findAll( '#tab-panel-overview p' ) ).toHaveLength( 3 );
	expect( wrapper.find( '#tab-panel-overview a' ).attributes( 'href' ) ).toBe( 'widgets.php' );
	await wrapper.findAll( '[role="tab"]' )[ 1 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Deleting Links' ] );
	expect( flat( wrapper.find( '#tab-panel-deleting-links p' ) ) ).toBe( 'If you delete a link, it will be removed permanently, as Links do not have a Trash function yet.' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [ 'https://codex.wordpress.org/Links_Screen', 'https://wordpress.org/support/forums/' ] );
} );
