/** @jest-environment jsdom */
// A page whose `menuCurrent` names a taxonomy's submenu item marks that item current (and not
// another taxonomy's): the shell gives the frame its menu path, and the menu matches the query.
import { afterEach, expect, test } from '@jest/globals';
import { defineComponent, h, reactive, shallowRef } from 'vue';
import Shell from '../../../site/runtime/Shell.js';
import AdminMenu from '../../../site/components/core/menu.js';
import { currentMenuPath } from '../../../site/runtime/menu.js';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';

const MENU = [
	{ path: 'edit.php', label: 'Posts', icon: '', count: null, children: [
		{ path: 'edit.php', label: 'All Posts', icon: '', count: null, children: [] },
		{ path: 'edit-tags.php?taxonomy=category', label: 'Categories', icon: '', count: null, children: [] },
	] },
	{ path: 'edit.php?post_type=page', label: 'Pages', icon: '', count: null, children: [
		{ path: 'edit.php?post_type=page', label: 'All Pages', icon: '', count: null, children: [] },
		{ path: 'edit-tags.php?taxonomy=detached_section&post_type=page', label: 'Sections', icon: '', count: null, children: [] },
	] },
];

let realFetch;
afterEach( () => {
	globalThis.fetch = realFetch;
} );

test( 'menuCurrent of a term page marks its own submenu item current, and not Categories', async () => {
	realFetch = globalThis.fetch;
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { name: 'Site' } ) } );
	const Frame = defineComponent( {
		props: [ 'current' ],
		render() { return h( AdminMenu, { items: MENU, current: this.current, base: '/wp-admin/' } ); },
	} );
	const admin = { Contracted: Frame, adminBase: () => '/wp-admin/', currentMenuPath };
	const page = { path: 'edit-tags.php?taxonomy=detached_section', title: 'Sections', menuCurrent: 'edit-tags.php?taxonomy=detached_section&post_type=page' };
	const state = reactive( { status: 'ready', manifest: { menu: MENU }, page, error: null } );
	const wrapper = mountPart( Shell, { props: { router: { state, refresh() {}, login() {}, signOut() {} }, signedIn: shallowRef( admin ) } } );
	await settle();
	const link = ( href ) => wrapper.find( 'a[href="/wp-admin/' + href + '"]' );
	const sections = link( 'edit-tags.php?taxonomy=detached_section&post_type=page' );
	expect( sections.exists() ).toBe( true );
	expect( sections.attributes( 'aria-current' ) ).toBe( 'page' );
	expect( sections.element.closest( 'li' ).classList.contains( 'current' ) ).toBe( true );
	const categories = link( 'edit-tags.php?taxonomy=category' );
	expect( categories.attributes( 'aria-current' ) ).toBeUndefined();
	expect( categories.element.closest( 'li' ).classList.contains( 'current' ) ).toBe( false );
} );
