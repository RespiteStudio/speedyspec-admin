/** @jest-environment jsdom */
// The count bubble of a menu item, drawn from the data of the item: the classic
// `awaiting-mod count-N` markup, the visible number hidden from assistive technology and a
// translated, pluralised name for it.
import { expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import MenuCount from '../../../site/components/core/menu-count.js';
import MenuItem from '../../../site/components/core/menu-item.js';
import { withMenuCounts } from '../../../site/components/core/frame.js';

const count = ( value ) => mountPart( MenuCount, { props: { count: value } } );

test( 'a count of 5 shows the bubble with the number and a plural name', () => {
	const wrapper = count( 5 );
	expect( wrapper.find( 'span.awaiting-mod' ).classes() ).toEqual( [ 'awaiting-mod', 'count-5' ] );
	expect( wrapper.find( '.pending-count' ).text() ).toBe( '5' );
	expect( wrapper.find( '.pending-count' ).attributes( 'aria-hidden' ) ).toBe( 'true' );
	expect( wrapper.find( '.screen-reader-text' ).text() ).toBe( '5 items' );
} );

test( 'a count of 1 has the singular name', () => {
	expect( count( 1 ).find( '.screen-reader-text' ).text() ).toBe( '1 item' );
} );

test( 'no bubble for zero, no count, or anything that is not a whole number', () => {
	// The same component with a count that shows proves that the bubble can appear at all.
	expect( count( 3 ).find( '.awaiting-mod' ).exists() ).toBe( true );
	for ( const value of [ 0, null, undefined, -2 ] ) {
		expect( count( value ).find( '.awaiting-mod' ).exists() ).toBe( false );
	}
	for ( const value of [ 2.5, NaN ] ) {
		expect( count( value ).find( '.awaiting-mod' ).exists() ).toBe( false );
	}
} );

test( 'an item draws its own bubble and its child items draw theirs, from their data', () => {
	const wrapper = mountPart( MenuItem, {
		props: {
			item: {
				path: 'edit-comments.php',
				label: 'Comments',
				icon: 'dashicons-admin-comments',
				count: 4,
				children: [
					{ path: 'edit-comments.php', label: 'All Comments', icon: '', count: null, children: [] },
					{ path: 'update-core.php', label: 'Updates', icon: '', count: 2, children: [] },
				],
			},
			base: '/wp-admin/',
			submenuId: 's',
		},
	} );
	expect( wrapper.find( 'a.menu-top .awaiting-mod' ).classes() ).toContain( 'count-4' );
	const [ all, updates ] = wrapper.findAll( '#s a' );
	expect( all.find( '.awaiting-mod' ).exists() ).toBe( false );
	expect( updates.find( '.awaiting-mod' ).classes() ).toContain( 'count-2' );
} );

test( 'a count the page gave replaces the manifest count of an item that has a bubble, and no other', () => {
	const menu = [
		{ path: 'edit-comments.php', label: 'Comments', count: 1, children: [ { path: 'edit-comments.php', label: 'All Comments', count: null } ] },
		{ path: 'tools.php', label: 'Tools', count: null, children: [] },
	];
	const updated = withMenuCounts( menu, { 'edit-comments.php': 7 } );
	expect( updated[ 0 ].count ).toBe( 7 );
	// "All Comments" links to the same path but never had a bubble: it is not given one.
	expect( updated[ 0 ].children[ 0 ].count ).toBeNull();
	expect( updated[ 1 ] ).toEqual( menu[ 1 ] );
	expect( count( updated[ 0 ].count ).find( '.pending-count' ).text() ).toBe( '7' );
	// The manifest's menu is left as it was.
	expect( menu[ 0 ].count ).toBe( 1 );
} );
