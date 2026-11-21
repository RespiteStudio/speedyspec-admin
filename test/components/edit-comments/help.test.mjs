/** @jest-environment jsdom */
// The Help panel of the Comments screen: Overview and Moderating Comments, and the sidebar, with
// core's strings (wp-admin/edit-comments.php:205-233).
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { help } from '../../../site/components/core/edit-comments/help.js';

function open() {
	const { tabs, sidebar } = mergeHelp( help, null, { data: {} } );
	return mountPart( HelpTabs, { props: { tabs, sidebar } } );
}

const tabs = ( wrapper ) => wrapper.findAll( '[role="tab"]' );
const selected = ( wrapper ) => tabs( wrapper ).filter( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' ).map( ( tab ) => tab.text() );
const flat = ( found ) => found.text().replace( /\s+/g, ' ' );

test( 'two tabs, Overview and Moderating Comments, the first shown', () => {
	const wrapper = open();
	expect( tabs( wrapper ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview', 'Moderating Comments' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( flat( wrapper.find( '#tab-panel-overview' ) ) ).toBe( 'You can manage comments made on your site similar to the way you manage posts and other content. This screen is customizable in the same ways as other management screens, and you can act on comments using the on-hover action links or the bulk actions.' );
	expect( wrapper.find( '#tab-panel-moderating-comments' ).attributes( 'hidden' ) ).toBeDefined();
} );

test( 'Moderating Comments: the six paragraphs of classic, with the column names in bold', async () => {
	const wrapper = open();
	await tabs( wrapper )[ 1 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Moderating Comments' ] );
	const panel = wrapper.find( '#tab-panel-moderating-comments' );
	expect( panel.attributes( 'hidden' ) ).toBeUndefined();
	const paragraphs = panel.findAll( 'p' );
	expect( paragraphs.map( ( p ) => flat( p ).slice( 0, 40 ) ) ).toEqual( [
		'A red bar on the left means the comment ',
		'In the Author column, in addition to the',
		'In the Comment column, hovering over any',
		'In the In response to column, there are ',
		'In the Submitted on column, the date and',
		'Many people take advantage of keyboard s',
	] );
	expect( paragraphs.slice( 1, 5 ).map( ( p ) => p.find( 'strong' ).text() ) ).toEqual( [ 'Author', 'Comment', 'In response to', 'Submitted on' ] );
	expect( flat( paragraphs[ 1 ] ) ).toBe( 'In the Author column, in addition to the author’s name, email address, and site URL, the commenter’s IP address is shown. Clicking on this link will show you all the comments made from this IP address.' );
} );

test( 'the sidebar: four documentation links', () => {
	const wrapper = open();
	const links = wrapper.findAll( '.contextual-help-sidebar a' );
	expect( links.map( ( link ) => [ link.text(), link.attributes( 'href' ) ] ) ).toEqual( [
		[ 'Documentation on Comments', 'https://wordpress.org/documentation/article/comments-screen/' ],
		[ 'Documentation on Comment Spam', 'https://wordpress.org/documentation/article/understand-comment-spam/' ],
		[ 'Documentation on Keyboard Shortcuts', 'https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments' ],
		[ 'Support forums', 'https://wordpress.org/support/forums/' ],
	] );
	expect( wrapper.find( '.contextual-help-sidebar' ).text() ).toContain( 'For more information:' );
} );
