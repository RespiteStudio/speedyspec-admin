/** @jest-environment jsdom */
// The Help panel of Add Plugins. The tabs come from the router (WordPress registers them for the
// screen, wp-admin/plugin-install.php): Overview and Adding Plugins, with the documentation in the
// sidebar.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const OVERVIEW = tab( 'overview', 'Overview', '<p>Plugins hook into WordPress to extend its functionality with custom features. Plugins are developed independently from the core WordPress application by thousands of developers all over the world. All plugins in the official <a href="https://wordpress.org/plugins/">WordPress Plugin Directory</a> are compatible with the license WordPress uses.</p><p>You can find new plugins to install by searching or browsing the directory right here in your own Plugins section. <span id="live-search-desc" class="hide-if-no-js">The search results will be updated as you type.</span></p>' );
const ADDING = tab( 'adding-plugins', 'Adding Plugins', '<p>If you know what you are looking for, Search is your best bet. The Search screen has options to search the WordPress Plugin Directory for a particular Term, Author, or Tag. You can also search the directory by selecting popular tags. Tags in larger type mean more plugins have been labeled with that tag.</p><p>If you want to install a plugin that you&#8217;ve downloaded elsewhere, click the Upload Plugin button above the plugins list. You will be prompted to upload the .zip package, and once uploaded, you can activate the new plugin.</p>' );
const SIDEBAR = '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/plugins-add-new-screen/">Documentation on Installing Plugins</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

test( 'help: Overview first with the live search text, Adding Plugins on click, and the sidebar', async () => {
	const wrapper = openHelp( null, { tabs: [ OVERVIEW, ADDING ], sidebar: SIDEBAR }, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Adding Plugins' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toContain( 'The search results will be updated as you type.' );
	await wrapper.findAll( '[role="tab"]' )[ 1 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Adding Plugins' ] );
	expect( flat( wrapper.find( '#tab-panel-adding-plugins' ) ) ).toContain( 'you’ve downloaded elsewhere' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [
		'https://wordpress.org/documentation/article/plugins-add-new-screen/',
		'https://wordpress.org/support/forums/',
	] );
} );
