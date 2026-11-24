/** @jest-environment jsdom */
// The Help panel of Add Themes. The tabs come from the router (WordPress registers them for the
// screen, wp-admin/theme-install.php): Overview (with the live search text), Previewing and
// Installing, and Block themes, with the documentation in the sidebar.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const OVERVIEW = tab( 'overview', 'Overview', '<p>You can find additional themes for your site by using the Theme Browser/Installer on this screen, which will display themes from the <a href="https://wordpress.org/themes/">WordPress Theme Directory</a>. These themes are designed and developed by third parties, are available free of charge, and are compatible with the license WordPress uses.</p><p>You can Search for themes by keyword, author, or tag, or can get more specific and search by criteria listed in the feature filter. <span id="live-search-desc">The search results will be updated as you type.</span></p>' );
const INSTALLING = tab( 'installing', 'Previewing and Installing', '<p>Once you have generated a list of themes, you can preview and install any of them. Click on the thumbnail of the theme you are interested in previewing. It will open up in a full-screen Preview page to give you a better idea of how that theme will look.</p>' );
const BLOCK = tab( 'block_themes', 'Block themes', '<p>A block theme is a theme that uses blocks for all parts of a site including navigation menus, header, content, and site footer. These themes are built for the features that allow you to edit and customize all parts of your site.</p>' );
const SIDEBAR = '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/appearance-themes-screen/#install-themes">Documentation on Adding New Themes</a></p><p><a href="https://wordpress.org/documentation/article/block-themes/">Documentation on Block Themes</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

test( 'help: the three tabs, Overview first with the live search text, Block themes on click, and the sidebar', async () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, INSTALLING, BLOCK ], sidebar: SIDEBAR }, { data: {} } );
	expect( [ titles( wrapper ), selected( wrapper ) ] ).toEqual( [ [ 'Overview', 'Previewing and Installing', 'Block themes' ], [ 'Overview' ] ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toContain( 'The search results will be updated as you type.' );
	await wrapper.findAll( '[role="tab"]' )[ 2 ].trigger( 'click' );
	await flushPromises();
	expect( [ selected( wrapper ), flat( wrapper.find( '#tab-panel-block_themes' ) ) ] ).toEqual( [ [ 'Block themes' ], expect.stringContaining( 'A block theme is a theme that uses blocks' ) ] );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.text() ) ).toEqual( [ 'Documentation on Adding New Themes', 'Documentation on Block Themes', 'Support forums' ] );
} );
