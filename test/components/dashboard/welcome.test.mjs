/** @jest-environment jsdom */
// The Welcome panel (core/dashboard-welcome inside the page's `#welcome-panel`): its content follows the
// data, and Dismiss saves `welcome` with the screen preferences and puts the panel back when that fails.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { dashboardData, mountDashboard, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const WELCOME = { visible: true, displayVersion: '7.3', isBlockTheme: false, canCustomize: true, customizeUrl: 'customize.php', html: null };

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const dashboard = ( welcome = WELCOME, extra = {} ) => mountDashboard( dashboardData( { welcome, ...extra } ), { names: [ 'welcome' ] } );
const panel = ( wrapper ) => wrapper.find( '#welcome-panel' );
const dismiss = ( wrapper ) => wrapper.find( '#welcome-panel .welcome-panel-close' );

test( 'Dismiss posts `welcome: false` to the screen preferences, hides the panel and says so', async () => {
	const { wrapper, spoken } = await dashboard();
	expect( panel( wrapper ).classes() ).not.toContain( 'hidden' );
	expect( dismiss( wrapper ).attributes( 'aria-label' ) ).toBe( 'Dismiss the welcome panel' );

	await dismiss( wrapper ).trigger( 'click' );
	await settle();

	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/dashboard', payload: { welcome: false } } ] );
	expect( panel( wrapper ).classes() ).toContain( 'hidden' );
	expect( spoken ).toEqual( [ 'Screen Options updated.' ] );
} );

test( 'a Dismiss that fails restores the panel, tells the user and announces nothing', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'down' ), { status: 500 } );
	} );
	const warn = silenceWarnings();
	try {
		const { wrapper, spoken, added } = await dashboard();
		await dismiss( wrapper ).trigger( 'click' );
		await settle();

		expect( api.calls ).toHaveLength( 1 );
		expect( panel( wrapper ).classes() ).not.toContain( 'hidden' );
		expect( added ).toEqual( [ { type: 'error', message: 'Your changes could not be saved. Please try again.', dismissible: true, scope: 'page' } ] );
		expect( spoken ).toEqual( [] );
	} finally {
		warn();
	}
} );

test( 'a panel the data says is not visible starts hidden, and Screen Options shows it again', async () => {
	const { wrapper, screenOptions } = await dashboard( { ...WELCOME, visible: false }, {
		screenOptions: { sections: [ { id: 'metabox-prefs', legend: 'Screen elements', description: '', items: [ { id: 'wp_welcome_panel', label: 'Welcome', checked: false } ] } ], reordering: true, columns: null },
	} );
	expect( panel( wrapper ).classes() ).toContain( 'hidden' );
	expect( screenOptions.sections[ 0 ].items[ 0 ].checked ).toBe( false );

	screenOptions.onChange( 'wp_welcome_panel', true );
	await settle();
	expect( api.calls.at( -1 ).payload ).toEqual( { welcome: true } );
	expect( panel( wrapper ).classes() ).not.toContain( 'hidden' );
} );

test( 'the version and the links of the content follow the data', async () => {
	const { wrapper } = await dashboard( { ...WELCOME, displayVersion: '9.9' } );
	const links = wrapper.findAll( '#welcome-panel .welcome-panel-content a' ).map( ( link ) => [ link.text(), link.attributes( 'href' ) ] );

	expect( wrapper.find( '#welcome-panel .welcome-panel-header p a' ).text() ).toBe( 'Learn more about the 9.9 version.' );
	expect( links ).toEqual( expect.arrayContaining( [
		[ 'Add a new page', expect.stringMatching( /post-new\.php\?post_type=page$/ ) ],
		[ 'Open the Customizer', expect.stringMatching( /customize\.php$/ ) ],
		[ 'Learn about block themes', 'https://wordpress.org/documentation/article/block-themes/' ],
	] ) );
	expect( wrapper.find( '#welcome-panel a.load-customize' ).classes() ).toContain( 'hide-if-no-customize' );
} );

test( 'a user who cannot customize gets no Customizer link, and a block theme the site editor links', async () => {
	const none = await dashboard( { ...WELCOME, canCustomize: false } );
	expect( none.wrapper.find( '#welcome-panel a.load-customize' ).exists() ).toBe( false );
	expect( none.wrapper.find( '#welcome-panel' ).text() ).toContain( 'Start Customizing' );

	const block = await dashboard( { ...WELCOME, isBlockTheme: true } );
	const links = block.wrapper.findAll( '#welcome-panel .welcome-panel-content a' ).map( ( link ) => [ link.text(), link.attributes( 'href' ) ] );
	expect( links ).toEqual( expect.arrayContaining( [
		[ 'Open site editor', expect.stringMatching( /site-editor\.php$/ ) ],
		[ 'Edit styles', expect.stringMatching( /site-editor\.php\?p=%2Fstyles$/ ) ],
	] ) );
	expect( block.wrapper.find( '#welcome-panel a.load-customize' ).exists() ).toBe( false );
} );

test( 'a plugin that hooks welcome_panel replaces the content with its HTML', async () => {
	const { wrapper } = await dashboard( { ...WELCOME, html: '<p class="plugin-welcome">Our welcome</p>' } );
	expect( wrapper.find( '#welcome-panel .plugin-welcome' ).text() ).toBe( 'Our welcome' );
	expect( wrapper.find( '#welcome-panel .welcome-panel-content' ).exists() ).toBe( false );
} );

/** Silences console.warn (the page logs a failed save) and returns the restore function. */
function silenceWarnings() {
	const original = console.warn;
	console.warn = () => {};
	return () => {
		console.warn = original;
	};
}
