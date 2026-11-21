/** @jest-environment jsdom */
// The Help panel of Edit Comment: the Overview tab and the sidebar, with core's strings
// (wp-admin/comment.php:61-75).
import { expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { help } from '../../../site/components/core/comment-edit.js';

function open() {
	const { tabs, sidebar } = mergeHelp( help, null, { data: {} } );
	return mountPart( HelpTabs, { props: { tabs, sidebar } } );
}

const flat = ( found ) => found.text().replace( /\s+/g, ' ' );

test( 'one tab, Overview, with the two paragraphs of classic', () => {
	const wrapper = open();
	expect( wrapper.findAll( '[role="tab"]' ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.find( '[role="tab"]' ).attributes( 'aria-selected' ) ).toBe( 'true' );
	expect( wrapper.findAll( '#tab-panel-overview p' ).map( flat ) ).toEqual( [
		'You can edit the information left in a comment if needed. This is often useful when you notice that a commenter has made a typographical error.',
		'You can also moderate the comment from this screen using the Status box, where you can also change the timestamp of the comment.',
	] );
} );

test( 'the sidebar: the heading and two links, to the Comments documentation and the support forums', () => {
	const wrapper = open();
	expect( flat( wrapper.find( '.contextual-help-sidebar' ) ) ).toContain( 'For more information:' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( link ) => [ link.text(), link.attributes( 'href' ) ] ) ).toEqual( [
		[ 'Documentation on Comments', 'https://wordpress.org/documentation/article/comments-screen/' ],
		[ 'Support forums', 'https://wordpress.org/support/forums/' ],
	] );
} );
