/** @jest-environment jsdom */
// The flyout of a menu item that is not the current one: it opens on hover and from the
// keyboard (the toggle, as the classic menu opens it when a submenu link takes focus), shows
// the classic `opensub` class and un-hides the submenu, and closes on mouse leave, Escape, a
// choice or when focus leaves the item. The current item's submenu is shown in place instead.
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import MenuItem from '../../../site/components/core/menu-item.js';

const POSTS = {
	path: 'edit.php',
	label: 'Posts',
	icon: 'dashicons-admin-post',
	count: null,
	children: [
		{ path: 'edit.php', label: 'All Posts', icon: '', count: null, children: [] },
		{ path: 'post-new.php', label: 'Add New Post', icon: '', count: null, children: [] },
	],
};

const item = ( props = {} ) => mountPart( MenuItem, { props: { item: POSTS, menuKey: 'edit.php', base: '/wp-admin/', submenuId: 'sub-1', ...props } } );
const top = ( wrapper ) => wrapper.find( 'li.menu-top' );
const submenu = ( wrapper ) => wrapper.find( '#sub-1' );
const toggle = ( wrapper ) => wrapper.find( 'button.wp-admin-menu-toggle' );

test( 'a closed flyout is hidden and not marked opensub', () => {
	const wrapper = item();
	expect( top( wrapper ).classes() ).toContain( 'wp-not-current-submenu' );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
	expect( toggle( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'false' );
} );

test( 'hovering opens the flyout and leaving closes it', async () => {
	const wrapper = item();
	await top( wrapper ).trigger( 'mouseenter' );
	expect( top( wrapper ).classes() ).toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeUndefined();
	expect( toggle( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'true' );

	await top( wrapper ).trigger( 'mouseleave' );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
} );

test( 'the toggle opens a flyout that stays open while it is hovered away, and a second press closes it', async () => {
	const wrapper = item();
	await toggle( wrapper ).trigger( 'click' );
	expect( top( wrapper ).classes() ).toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeUndefined();

	// Opened with the toggle, a mouse that never entered does not close it.
	await top( wrapper ).trigger( 'mouseleave' );
	expect( top( wrapper ).classes() ).toContain( 'opensub' );

	await toggle( wrapper ).trigger( 'click' );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
} );

test( 'focus moving to a link inside the open flyout keeps it open; focus leaving the item closes it', async () => {
	const wrapper = item();
	await toggle( wrapper ).trigger( 'click' );
	const inside = wrapper.findAll( '#sub-1 a' )[ 0 ].element;
	inside.focus();
	await top( wrapper ).trigger( 'focusout', { relatedTarget: inside } );
	expect( top( wrapper ).classes() ).toContain( 'opensub' );

	const outside = document.createElement( 'button' );
	document.body.append( outside );
	try {
		outside.focus();
		await top( wrapper ).trigger( 'focusout', { relatedTarget: outside } );
		expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
		expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
	} finally {
		outside.remove();
	}
} );

test( 'Escape closes the flyout and returns focus to the toggle', async () => {
	const wrapper = item();
	await toggle( wrapper ).trigger( 'click' );
	wrapper.findAll( '#sub-1 a' )[ 1 ].element.focus();
	expect( document.activeElement.textContent ).toBe( 'Add New Post' );

	await top( wrapper ).trigger( 'keydown', { key: 'Escape' } );
	await flushPromises();
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
	expect( document.activeElement ).toBe( toggle( wrapper ).element );
} );

test( 'choosing a submenu link closes the flyout', async () => {
	const wrapper = item();
	await top( wrapper ).trigger( 'mouseenter' );
	expect( top( wrapper ).classes() ).toContain( 'opensub' );
	// The click is cancelled, as the router would take it; the flyout closes either way.
	wrapper.element.addEventListener( 'click', ( event ) => event.preventDefault() );
	await wrapper.findAll( '#sub-1 a' )[ 0 ].trigger( 'click' );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
} );

test( 'the current item shows its submenu in place: hovering adds no flyout class, and the toggle collapses it', async () => {
	const wrapper = item( { isCurrent: true, currentChild: 'post-new.php' } );
	expect( top( wrapper ).classes() ).toEqual( expect.arrayContaining( [ 'wp-has-current-submenu', 'wp-menu-open' ] ) );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeUndefined();

	await top( wrapper ).trigger( 'mouseenter' );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );

	await toggle( wrapper ).trigger( 'click' );
	expect( top( wrapper ).classes() ).toContain( 'is-collapsed' );
	expect( submenu( wrapper ).attributes( 'hidden' ) ).toBeDefined();
	expect( toggle( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'false' );
} );

test( 'an item without children has no toggle and no flyout', async () => {
	const wrapper = item( { item: { path: 'tools.php', label: 'Tools', icon: '', count: null, children: [] } } );
	await top( wrapper ).trigger( 'mouseenter' );
	expect( toggle( wrapper ).exists() ).toBe( false );
	expect( wrapper.find( '.wp-submenu' ).exists() ).toBe( false );
	expect( top( wrapper ).classes() ).not.toContain( 'opensub' );
} );
