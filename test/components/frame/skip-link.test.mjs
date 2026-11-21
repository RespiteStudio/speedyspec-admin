/** @jest-environment jsdom */
// The "Skip to main content" link of the frame: the first thing in the frame, a link to
// `#wpbody-content` as the classic admin has it (wp-admin/menu-header.php:323), the element that
// holds the page's Help and Screen Options panel, its notices and the page.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import * as api from '../../helpers/api-stub.mjs';
import Frame from '../../../site/components/core/frame.js';

const PAGE = { path: 'options-general.php', title: 'General Settings', component: 'core/not-converted', textDomains: [], data: {}, help: null };
const MANIFEST = { menu: [ { path: 'index.php', label: 'Dashboard', icon: '', count: null, children: [] } ], user: { id: 1, name: 'Admin', avatar: null } };

beforeEach( async () => {
	api.reset();
	await fillContracts( [ 'frame', 'menu', 'admin-bar', 'notices', 'help-tabs', 'screen-options' ] );
	contracts.configure( { replacements: {}, slots: {} } );
} );

let warn;
beforeEach( () => {
	// The page's component has no contract: the frame says so once, and the page host shows its own text.
	warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );

afterEach( () => {
	warn.mockRestore();
	resetContracts();
} );

async function open() {
	const wrapper = mountPart( Frame, { props: { manifest: MANIFEST, page: PAGE, current: 'options-general.php', base: '/wp-admin/', siteName: 'Site' } } );
	await flushPromises();
	return wrapper;
}

test( 'the frame starts with a skip link to #wpbody-content, which holds the page', async () => {
	const wrapper = await open();
	const link = wrapper.find( 'a.screen-reader-shortcut' );
	expect( link.text() ).toBe( 'Skip to main content' );

	expect( link.attributes( 'href' ) ).toBe( '#wpbody-content' );
	const destination = document.getElementById( 'wpbody-content' );
	expect( destination ).not.toBeNull();
	expect( wrapper.element.contains( destination ) ).toBe( true );
	expect( destination.querySelector( 'main#wp-admin-page' )?.getAttribute( 'data-path' ) ).toBe( 'options-general.php' );
	// It comes before the toolbar and the menu in the document, so that it is the first tab stop.
	const focusable = [ ...wrapper.element.querySelectorAll( 'a[href], button' ) ];
	expect( focusable[ 0 ] ).toBe( link.element );
	expect( wrapper.find( '#wp-admin-bar' ).exists() ).toBe( true );
	expect( wrapper.find( '#adminmenu' ).exists() ).toBe( true );
} );
