/** @jest-environment jsdom */
// The admin bar's site link goes to the site's front end, as the classic toolbar's site name
// does on an admin screen (wp-includes/admin-bar.php:451-457: home_url( '/' ) in the admin). When
// the home address is not known the link goes to the admin home, as before.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import * as api from '../../helpers/api-stub.mjs';
import AdminBar from '../../../site/components/core/admin-bar.js';
import Frame from '../../../site/components/core/frame.js';

const USER = { id: 1, name: 'Ada', avatar: null };
const bar = ( props = {} ) => mountPart( AdminBar, { props: { user: USER, base: '/wp-admin/', siteName: 'My Site', ...props } } );
const site = ( wrapper ) => wrapper.find( 'a.wp-admin-bar__site' );

test( 'the site link goes to the address WordPress sent, as it is', () => {
	const wrapper = bar( { homeUrl: 'http://localhost:8889/' } );
	expect( site( wrapper ).attributes( 'href' ) ).toBe( 'http://localhost:8889/' );
	expect( site( wrapper ).text() ).toBe( 'My Site' );
	// Nothing is added or fixed: a path-aware filter's answer is shown untouched.
	expect( site( bar( { homeUrl: 'https://example.test/en' } ) ).attributes( 'href' ) ).toBe( 'https://example.test/en' );
} );

test( 'without a home address the link goes to the admin home; so it does for one that is not http(s)', () => {
	// The same part with a good address proves that the link does follow it.
	expect( site( bar( { homeUrl: 'https://example.test/blog/' } ) ).attributes( 'href' ) ).toBe( 'https://example.test/blog/' );
	expect( site( bar() ).attributes( 'href' ) ).toBe( '/wp-admin/' );
	expect( site( bar( { homeUrl: '' } ) ).attributes( 'href' ) ).toBe( '/wp-admin/' );
	expect( site( bar( { homeUrl: 'javascript:alert(1)' } ) ).attributes( 'href' ) ).toBe( '/wp-admin/' );
} );

let warn;
beforeEach( async () => {
	api.reset();
	await fillContracts( [ 'frame', 'menu', 'admin-bar', 'notices', 'help-tabs', 'screen-options' ] );
	contracts.configure( { replacements: {}, slots: {} } );
	warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );

afterEach( () => {
	warn.mockRestore();
	resetContracts();
} );

test( 'the frame gives its admin bar the homeUrl of the manifest', async () => {
	const page = { path: 'options-general.php', title: 'General Settings', component: 'core/not-converted', textDomains: [], data: {}, help: null };
	const manifest = { menu: [], user: USER, homeUrl: 'http://localhost:8889/' };
	const wrapper = mountPart( Frame, { props: { manifest, page, current: 'options-general.php', base: '/wp-admin/', siteName: 'Site' } } );
	await flushPromises();
	expect( wrapper.find( 'a.wp-admin-bar__site' ).attributes( 'href' ) ).toBe( 'http://localhost:8889/' );
} );
