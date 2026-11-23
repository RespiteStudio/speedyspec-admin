/** @jest-environment jsdom */
// The auto-update setting in the theme details (wp_theme_auto_update_setting_template(), and
// updates.js's toggle): the toggle posts its request, says Enabling... or Disabling..., then shows
// the answer's text and the next update's time when WordPress says it shows; a forced setting is a
// text; a failed answer shows its error; a plugin's template is not run, with a note.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, autoUpdate, card, cardOf, host, loadContracts, mountThemes, overlayOf, request, settle, themesData, update } from './data.mjs';

const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

const NEXT = 'Automatic update scheduled in 12 hours.';

async function details( themes, record = host() ) {
	const wrapper = await mountThemes( themesData( { themes } ), record );
	await cardOf( wrapper, 'alpha' ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	return wrapper;
}

const setting = ( wrapper ) => overlayOf( wrapper ).find( '.theme-info .theme-autoupdate' );

test( 'the toggle posts its request, says Enabling..., then the answer\'s text with the next update shown; reopened, the details keep it', async () => {
	const record = host();
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( { enabled: true, text: 'Disable auto-updates', nextUpdate: NEXT, nextUpdateShown: true } );
	} ) );
	const wrapper = await details( [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', update: update( 'alpha' ), autoUpdate: autoUpdate( 'alpha', { nextUpdate: NEXT } ) } ) ], record );
	const toggle = setting( wrapper ).find( 'button.toggle-auto-update.button-link' );
	expect( toggle.attributes( 'data-wp-action' ) ).toBe( 'enable' );
	expect( toggle.find( '.label' ).text() ).toBe( 'Enable auto-updates' );
	expect( setting( wrapper ).find( '.auto-update-time' ).classes() ).toContain( 'hidden' );
	await toggle.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/auto-updates', payload: { stylesheet: 'alpha', state: 'enable' } } ] );
	expect( setting( wrapper ).find( '.label' ).text() ).toBe( 'Enabling...' );
	expect( setting( wrapper ).find( '.dashicons-update' ).classes() ).not.toContain( 'hidden' );
	release();
	await settle();
	expect( setting( wrapper ).find( '.label' ).text() ).toBe( 'Disable auto-updates' );
	expect( setting( wrapper ).find( 'button.toggle-auto-update' ).attributes( 'data-wp-action' ) ).toBe( 'disable' );
	expect( setting( wrapper ).find( '.auto-update-time' ).classes() ).not.toContain( 'hidden' );
	expect( setting( wrapper ).find( '.auto-update-time' ).text() ).toBe( NEXT );
	expect( record.spoken ).toContain( 'Auto-updates enabled' );
	await overlayOf( wrapper ).find( 'button.close' ).trigger( 'click' );
	await cardOf( wrapper, 'alpha' ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	expect( setting( wrapper ).find( '.label' ).text() ).toBe( 'Disable auto-updates' );
	// The next click sends the other state.
	api.respondWith( async () => ( { enabled: false, text: 'Enable auto-updates', nextUpdate: NEXT, nextUpdateShown: false } ) );
	await setting( wrapper ).find( 'button.toggle-auto-update' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ).payload ).toEqual( { stylesheet: 'alpha', state: 'disable' } );
	expect( setting( wrapper ).find( '.auto-update-time' ).classes() ).toContain( 'hidden' );
	expect( record.spoken ).toContain( 'Auto-updates disabled' );
} );

test( 'a forced setting is its text, without a toggle; no setting without the data', async () => {
	const wrapper = await details( [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', autoUpdate: autoUpdate( 'alpha', { forced: true, text: 'Auto-updates enabled', request: null, enabled: true } ) } ) ] );
	expect( setting( wrapper ).text() ).toContain( 'Auto-updates enabled' );
	expect( setting( wrapper ).find( 'button.toggle-auto-update' ).exists() ).toBe( false );
	wrapper.unmount();
	const none = await details( [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha' } ) ] );
	expect( setting( none ).exists() ).toBe( false );
} );

test( 'a failed answer shows the error in the setting\'s notice, spoken, and keeps the toggle', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture auto-updates failure.' );
	} );
	const wrapper = await details( [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', autoUpdate: autoUpdate( 'alpha' ) } ) ], record );
	await setting( wrapper ).find( 'button.toggle-auto-update' ).trigger( 'click' );
	await settle();
	const notice = setting( wrapper ).find( '.notice.notice-error.notice-alt.inline' );
	expect( notice.classes() ).not.toContain( 'hidden' );
	expect( notice.find( 'p' ).text() ).toBe( 'Fixture auto-updates failure.' );
	expect( record.spoken ).toContainEqual( [ 'Fixture auto-updates failure.', 'assertive' ] );
	expect( setting( wrapper ).find( '.label' ).text() ).toBe( 'Enable auto-updates' );
} );

test( 'a plugin\'s template: the toggle shows with a note that the plugin\'s template is not shown here', async () => {
	const wrapper = await details( [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', autoUpdate: autoUpdate( 'alpha', { templateFiltered: true } ) } ) ] );
	expect( setting( wrapper ).find( 'button.toggle-auto-update' ).exists() ).toBe( true );
	expect( overlayOf( wrapper ).find( '.wp-admin-plugin-note' ).text() ).toBe( 'A plugin changes this setting\'s template, which this screen does not show.' );
	expect( request( 'x', {} ).method ).toBe( 'POST' );
} );
