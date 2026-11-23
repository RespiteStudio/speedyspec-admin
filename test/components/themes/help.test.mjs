/** @jest-environment jsdom */
// The Help panel of Themes. The tabs come from the router (WordPress registers them for the
// screen, wp-admin/themes.php): Overview, Adding Themes, Previewing and Customizing and
// Auto-updates, with the documentation in the sidebar; without theme auto-updates the
// Auto-updates tab and its sidebar link are not registered.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const OVERVIEW = tab( 'overview', 'Overview', '<p>This screen is used for managing your installed themes. Aside from the default theme(s) included with your WordPress installation, themes are designed and developed by third parties.</p><p>From this screen you can:</p><ul><li>Hover or tap to see Activate and Live Preview buttons.</li><li>Use the buttons at the top of the dialog, or <code>alt</code>/<code>option</code> plus the left or right arrow keys on your keyboard, to navigate between themes quickly.</li></ul><p>The search for installed themes will search for terms in their name, description, author, or tag. <span id="live-search-desc">The search results will be updated as you type.</span></p>' );
const ADDING = tab( 'adding-themes', 'Adding Themes', '<p>If you would like to see more themes to choose from, click on the &#8220;Add Theme&#8221; button and you will be able to browse or search for additional themes from the <a href="https://wordpress.org/themes/">WordPress Theme Directory</a>.</p>' );
const PREVIEW = tab( 'customize-preview-themes', 'Previewing and Customizing', '<p>Tap or hover on any theme then click the Live Preview button to see a live preview of that theme.</p>' );
const AUTO = tab( 'plugins-themes-auto-updates', 'Auto-updates', '<p>Auto-updates can be enabled or disabled for each individual theme. Themes with auto-updates enabled will display the estimated date of the next auto-update. Auto-updates depends on the WP-Cron task scheduling system.</p>' );
const SIDEBAR = ( auto ) => '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/work-with-themes/">Documentation on Using Themes</a></p><p><a href="https://wordpress.org/documentation/article/appearance-themes-screen/">Documentation on Managing Themes</a></p>' +
	( auto ? '<p><a href="https://wordpress.org/documentation/article/plugins-themes-auto-updates/">Documentation on Auto-updates</a></p>' : '' ) +
	'<p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

test( 'help: the four tabs, Overview first with the alt/option keys and the live search text, Auto-updates on click, and the sidebar', async () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, ADDING, PREVIEW, AUTO ], sidebar: SIDEBAR( true ) }, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Adding Themes', 'Previewing and Customizing', 'Auto-updates' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toContain( 'alt/option plus the left or right arrow keys' );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toContain( 'The search results will be updated as you type.' );
	await wrapper.findAll( '[role="tab"]' )[ 3 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Auto-updates' ] );
	expect( flat( wrapper.find( '#tab-panel-plugins-themes-auto-updates' ) ) ).toContain( 'Auto-updates can be enabled or disabled for each individual theme.' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.text() ) ).toEqual( [
		'Documentation on Using Themes',
		'Documentation on Managing Themes',
		'Documentation on Auto-updates',
		'Support forums',
	] );
} );

test( 'help: without theme auto-updates, no Auto-updates tab and no Auto-updates documentation', () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, ADDING, PREVIEW ], sidebar: SIDEBAR( false ) }, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Adding Themes', 'Previewing and Customizing' ] );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.text() ) ).not.toContain( 'Documentation on Auto-updates' );
} );
