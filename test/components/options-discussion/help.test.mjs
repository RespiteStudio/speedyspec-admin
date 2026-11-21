/** @jest-environment jsdom */
// The Help panel of Discussion Settings: the one Overview tab and the sidebar, with core's strings.
import { expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { help } from '../../../site/components/core/options-discussion/help.js';
import { discussionData } from './data.mjs';

function open() {
	const { tabs, sidebar } = mergeHelp( help, null, { data: discussionData() } );
	return mountPart( HelpTabs, { props: { tabs, sidebar } } );
}

test( 'one Overview tab with the classic text', () => {
	const wrapper = open();
	expect( wrapper.findAll( '[role="tab"]' ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview' ] );
	const text = wrapper.find( '[role="tabpanel"]' ).text();
	expect( text ).toContain( 'This screen provides many options for controlling the management and display of comments and links to your posts/pages.' );
	expect( text ).toContain( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.' );
} );

test( 'the sidebar links to the documentation and the support forums', () => {
	const sidebar = open().find( '.contextual-help-sidebar' );
	expect( sidebar.text() ).toContain( 'For more information:' );
	expect( sidebar.find( 'a[href="https://wordpress.org/documentation/article/settings-discussion-screen/"]' ).text() ).toBe( 'Documentation on Discussion Settings' );
	expect( sidebar.find( 'a[href="https://wordpress.org/support/forums/"]' ).text() ).toBe( 'Support forums' );
} );
