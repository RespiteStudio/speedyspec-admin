/** @jest-environment jsdom */
// The Help panel of the Plugins list. The tabs come from the router (WordPress registers them for
// the screen, wp-admin/plugins.php:574-640): Overview, Troubleshooting, Auto-updates (with
// `update_plugins` and plugin auto-updates on) and Dependencies, with the documentation in the
// sidebar.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const OVERVIEW = tab( 'overview', 'Overview', '<p>Plugins extend and expand the functionality of WordPress. Once a plugin is installed, you may activate it or deactivate it here.</p><p>The search for installed plugins will search for terms in their name, description, or author. <span id="live-search-desc" class="hide-if-no-js">The search results will be updated as you type.</span></p>' );
const TROUBLESHOOTING = tab( 'compatibility-problems', 'Troubleshooting', '<p>Most of the time, plugins play nicely with the core of WordPress and with other plugins.</p><p>If something goes wrong with a plugin and you cannot use WordPress, delete or rename that file in the <code>/var/www/src/wp-content/plugins</code> directory and it will be automatically deactivated.</p>' );
const AUTO_UPDATES = tab( 'plugins-themes-auto-updates', 'Auto-updates', '<p>Auto-updates can be enabled or disabled for each individual plugin. Plugins with auto-updates enabled will display the estimated date of the next auto-update. Auto-updates depends on the WP-Cron task scheduling system.</p>' );
const DEPENDENCIES = tab( 'plugins-dependencies', 'Dependencies', '<p>Plugin Dependencies aims to make the process of installing and activating addons (dependents) and the plugins they rely on (dependencies) consistent and easy.</p>' );
const SIDEBAR = ( auto = true ) => '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/manage-plugins/">Documentation on Managing Plugins</a></p>' + ( auto ? '<p><a href="https://wordpress.org/documentation/article/plugins-themes-auto-updates/">Learn more: Auto-updates documentation</a></p>' : '' ) + '<p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

test( 'the four tabs and the sidebar: Overview first, Auto-updates on click, and the documentation', async () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, TROUBLESHOOTING, AUTO_UPDATES, DEPENDENCIES ], sidebar: SIDEBAR() }, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Troubleshooting', 'Auto-updates', 'Dependencies' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toContain( 'The search results will be updated as you type.' );
	await wrapper.findAll( '[role="tab"]' )[ 2 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Auto-updates' ] );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [
		'https://wordpress.org/documentation/article/manage-plugins/',
		'https://wordpress.org/documentation/article/plugins-themes-auto-updates/',
		'https://wordpress.org/support/forums/',
	] );
} );

test( 'auto_updates off: no Auto-updates tab, and no Auto-updates link in the sidebar', () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, TROUBLESHOOTING, DEPENDENCIES ], sidebar: SIDEBAR( false ) }, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Troubleshooting', 'Dependencies' ] );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ) ).toHaveLength( 2 );
} );
