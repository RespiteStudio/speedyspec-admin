/** @jest-environment jsdom */
// The Help panel of the file editors (E16). The tabs come from the router (WordPress registers
// them for each screen): Overview, with the keyboard texts the editing area is described by, and
// the sidebar's documentation. The page adds no help of its own.
import { expect, test } from '@jest/globals';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';
import * as page from '../../../site/components/core/file-editor.js';

const KEYBOARD = '<p id="editor-keyboard-trap-help-1">When using a keyboard to navigate:</p><ul><li id="editor-keyboard-trap-help-2">In the editing area, the Tab key enters a tab character.</li><li id="editor-keyboard-trap-help-3">To move away from this area, press the Esc key followed by the Tab key.</li><li id="editor-keyboard-trap-help-4">Screen reader users: when in forms mode, you may need to press the Esc key twice.</li></ul>';
const THEME_OVERVIEW = { id: 'overview', title: 'Overview', priority: 10, content: '<p>You can use the theme file editor to edit the individual CSS and PHP files which make up your theme.</p>' + KEYBOARD + '<p>After typing in your edits, click Update File.</p>' };
const THEME_SIDEBAR = '<p><strong>For more information:</strong></p><p><a href="https://developer.wordpress.org/themes/">Documentation on Theme Development</a></p><p><a href="https://wordpress.org/documentation/article/appearance-theme-file-editor-screen/">Documentation on Editing Themes</a></p><p><a href="https://developer.wordpress.org/advanced-administration/wordpress/edit-files/">Documentation on Editing Files</a></p><p><a href="https://developer.wordpress.org/themes/basics/template-tags/">Documentation on Template Tags</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';
const PLUGIN_OVERVIEW = { id: 'overview', title: 'Overview', priority: 10, content: '<p>You can use the plugin file editor to make changes to any of your plugins&#8217; individual PHP files. Be aware that if you make changes, plugins updates will overwrite your customizations.</p>' + KEYBOARD };
const PLUGIN_SIDEBAR = '<p><strong>For more information:</strong></p><p><a href="https://developer.wordpress.org/advanced-administration/plugins/editor-screen/">Documentation on Editing Plugins</a></p><p><a href="https://developer.wordpress.org/plugins/">Documentation on Writing Plugins</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>';

test( 'help: the page adds no tabs of its own', () => {
	expect( page.help ).toBeUndefined();
} );

test( 'help: the Theme File Editor\'s Overview, selected, with the four keyboard texts by id', () => {
	const wrapper = openHelp( null, { tabs: [ THEME_OVERVIEW ], sidebar: THEME_SIDEBAR }, { data: {} } );
	expect( [ titles( wrapper ), selected( wrapper ), [ 1, 2, 3, 4 ].map( ( n ) => wrapper.find( '#editor-keyboard-trap-help-' + n ).exists() ), flat( wrapper.find( '#tab-panel-overview' ) ) ] ).toEqual( [
		[ 'Overview' ],
		[ 'Overview' ],
		[ true, true, true, true ],
		expect.stringContaining( 'In the editing area, the Tab key enters a tab character.' ),
	] );
} );

test( 'help: the Theme File Editor\'s sidebar', () => {
	const wrapper = openHelp( null, { tabs: [ THEME_OVERVIEW ], sidebar: THEME_SIDEBAR }, { data: {} } );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.text() ) ).toEqual( [
		'Documentation on Theme Development',
		'Documentation on Editing Themes',
		'Documentation on Editing Files',
		'Documentation on Template Tags',
		'Support forums',
	] );
} );

test( 'help: the Plugin File Editor\'s Overview and sidebar', () => {
	const wrapper = openHelp( null, { tabs: [ PLUGIN_OVERVIEW ], sidebar: PLUGIN_SIDEBAR }, { data: {} } );
	expect( [ flat( wrapper.find( '#tab-panel-overview' ) ), wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.text() ) ] ).toEqual( [
		expect.stringContaining( 'You can use the plugin file editor to make changes to any of your plugins’ individual PHP files.' ),
		[ 'Documentation on Editing Plugins', 'Documentation on Writing Plugins', 'Support forums' ],
	] );
} );
