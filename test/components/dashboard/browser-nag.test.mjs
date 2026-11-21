/** @jest-environment jsdom */
// The browser nag (core/dashboard-browser-nag) and the box's Dismiss link, which the holder turns into "hide the
// box": it posts the complete list of hidden boxes, as postbox.js stores it.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { linkClasses } from '../../../site/components/core/dashboard-browser-nag.js';
import { BOX, dashboardData, mountDashboard, mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const DATA = {
	message: 'outdated',
	name: 'Firefox',
	image: 'https://example.org/firefox.png',
	updateUrl: 'https://www.mozilla.org/firefox/',
	browseHappyUrl: 'https://browsehappy.com/',
	html: null,
};

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const nag = async ( data = DATA ) => ( await mountWidget( 'browser-nag', data ) ).wrapper;

test( 'an outdated browser: its name links to the update, and the Browse Happy line follows', async () => {
	const wrapper = await nag();
	expect( wrapper.find( 'p.browser-update-nag' ).text() ).toContain( 'It looks like you\'re using an old version of Firefox.' );
	expect( wrapper.find( 'p.browser-update-nag a' ).attributes( 'href' ) ).toBe( DATA.updateUrl );
	expect( wrapper.find( '.browser-icon img' ).attributes( 'src' ) ).toBe( DATA.image );
	const links = wrapper.findAll( 'p a.update-browser-link, p a.browse-happy-link' );
	expect( links.map( ( link ) => [ link.classes().join( ' ' ), link.attributes( 'href' ), link.text() ] ) ).toEqual( [
		[ 'update-browser-link', DATA.updateUrl, 'Update Firefox' ],
		[ 'browse-happy-link', DATA.browseHappyUrl, 'browse happy' ],
	] );
	expect( wrapper.find( 'a.dismiss' ).attributes( 'aria-label' ) ).toBe( 'Dismiss the browser warning panel' );
} );

test( 'an insecure browser and Internet Explorer each show their own message', async () => {
	const insecure = await nag( { ...DATA, message: 'insecure' } );
	expect( insecure.find( 'p.browser-update-nag' ).text() ).toContain( 'an insecure version of Firefox' );

	const explorer = await nag( { ...DATA, message: 'ie', name: 'Internet Explorer', image: null } );
	expect( explorer.find( 'p.browser-update-nag' ).text() ).toContain( 'Internet Explorer does not give you the best WordPress experience.' );
	expect( explorer.find( '.browser-icon' ).exists() ).toBe( false );
	expect( explorer.find( 'p.browser-update-nag' ).classes() ).not.toContain( 'has-browser-icon' );
	expect( explorer.find( 'a.update-browser-link' ).attributes( 'href' ) ).toBe( DATA.browseHappyUrl );
} );

test( 'a plugin that filters browse-happy-notice shows its HTML instead', async () => {
	const wrapper = await nag( { ...DATA, html: '<p class="filtered">Filtered notice</p>' } );
	expect( wrapper.find( '.filtered' ).text() ).toBe( 'Filtered notice' );
	expect( wrapper.find( 'p.browser-update-nag' ).exists() ).toBe( false );
} );

test( 'linkClasses reads the class of each link by the number of its address placeholder', () => {
	expect( linkClasses( '<a href="%1$s" class="update-browser-link">Update %2$s</a> or <a href="%3$s" class="browse-happy-link">x</a>' ) ).toEqual( { 1: 'update-browser-link', 3: 'browse-happy-link' } );
	expect( linkClasses( '<a href="%s" class="a b">x</a>' ) ).toEqual( { 1: 'a b' } );
	// Only plain class names are kept.
	expect( linkClasses( '<a href="%s" class="x&quot;y">x</a>' ) ).toEqual( {} );
} );

test( 'Dismiss hides the box and posts the complete list of hidden boxes', async () => {
	const data = dashboardData( {
		boxes: [ BOX( 'dashboard_browser_nag', 'Your browser is out of date!', { warning: true } ), BOX( 'dashboard_activity', 'Activity' ) ],
		widgets: { dashboard_browser_nag: DATA, dashboard_activity: { future: [], published: [], onThisDay: [], empty: true } },
	} );
	const { wrapper, spoken } = await mountDashboard( data, { names: [ 'browser-nag', 'activity' ] } );
	expect( wrapper.find( '#dashboard_browser_nag' ).classes() ).not.toContain( 'hide-if-js' );

	await wrapper.find( '#dashboard_browser_nag a.dismiss' ).trigger( 'click' );
	await settle();

	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/dashboard', payload: { closed: [], hidden: [ 'dashboard_browser_nag' ] } } ] );
	expect( wrapper.find( '#dashboard_browser_nag' ).classes() ).toContain( 'hide-if-js' );
	expect( spoken ).toEqual( [ 'Screen Options updated.' ] );
} );
