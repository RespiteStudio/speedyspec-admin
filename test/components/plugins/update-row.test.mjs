/** @jest-environment jsdom */
// The update row of the Plugins list (wp_plugin_update_row(), updates.js updatePlugin()): the
// message WordPress wrote, "update now" through the package queue with updates.js's texts and
// events, the row and menu counts from the answer, the plugin's update message, "View version
// details" in the plugin information dialog, and a failed update.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { updateNotice } from '../../../site/components/core/plugins/update-row.js';
import { answerPart, apiError, host, loadContracts, mountPlugins, pluginRow, pluginsData, row, settle, update } from './data.mjs';

const UPDATE = 'wp-admin/v1/plugins/update';
const FILE = 'e2e-test-plugin/e2e-test-plugin.php';
const realJQuery = window.jQuery;
let events;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	events = [];
	window.jQuery = () => ( { trigger: ( name, detail ) => events.push( [ name, detail ] ) } );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	if ( realJQuery === undefined ) {
		delete window.jQuery;
	} else {
		window.jQuery = realJQuery;
	}
	delete window.__ran;
	document.body.innerHTML = '';
} );

const withUpdate = ( over = {} ) => row( 'e2e-test-plugin', { file: FILE, name: 'E2E Test Plugin', classes: [ 'inactive', 'update' ], update: update( FILE, 'e2e-test-plugin', 'E2E Test Plugin', '2.0', over ) } );
const updateRow = ( wrapper ) => wrapper.find( '#the-list tr.plugin-update-tr[data-plugin="' + FILE + '"]' );

test( 'updateNotice: the notice classes and text for each step of an update', () => {
	expect( updateNotice( { compatible: true }, null ) ).toEqual( { classes: [ 'notice-warning' ], text: null } );
	expect( updateNotice( { compatible: false }, null ) ).toEqual( { classes: [ 'notice-error' ], text: null } );
	expect( updateNotice( { compatible: true }, { phase: 'updating' } ) ).toEqual( { classes: [ 'updating-message', 'notice-warning' ], text: 'Updating...' } );
	expect( updateNotice( null, { phase: 'updated' } ) ).toEqual( { classes: [ 'updated-message', 'notice-success' ], text: 'Updated!' } );
	expect( updateNotice( { compatible: true }, { phase: 'failed', message: 'Download failed.' } ) ).toEqual( { classes: [ 'notice-error' ], text: 'Update failed: Download failed.' } );
} );

test( 'the update row: WordPress\'s message after the plugin\'s row, its id, colspan and the plugin\'s update message', async () => {
	const wrapper = await mountPlugins( pluginsData( { items: [ withUpdate( { extraHtml: '<span class="detached-fixture-update-message">Fixture update message</span><script>window.__ran = 1;</script>' } ) ] } ) );
	const tr = updateRow( wrapper );
	expect( tr.attributes( 'id' ) ).toBe( 'e2e-test-plugin-update' );
	expect( tr.attributes( 'data-slug' ) ).toBe( 'e2e-test-plugin' );
	expect( tr.classes() ).toEqual( [ 'plugin-update-tr' ] );
	expect( tr.element.previousElementSibling.getAttribute( 'data-plugin' ) ).toBe( FILE );
	expect( tr.find( 'td.plugin-update.colspanchange' ).attributes( 'colspan' ) ).toBe( '4' );
	const message = tr.find( '.update-message.notice.inline.notice-warning.notice-alt p' );
	expect( message.text() ).toContain( 'There is a new version of E2E Test Plugin available. View version 2.0 details or update now.' );
	expect( message.find( '.detached-fixture-update-message' ).text() ).toBe( 'Fixture update message' );
	expect( pluginRow( wrapper, FILE ).classes() ).toEqual( [ 'inactive', 'update' ] );
	await settle();
	expect( window.__ran ).toBe( 1 );
} );

test( 'Update now: updating, then Updated!, the row from the answer, the menu counts, the events and the spoken text', async () => {
	const record = host();
	let release;
	const pending = new Promise( ( resolve ) => {
		release = resolve;
	} );
	api.respondWith( async () => {
		await pending;
		return { plugin: FILE, slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', oldVersion: '1.0', newVersion: '2.0', ...answerPart( { row: row( 'e2e-test-plugin', { file: FILE, name: 'E2E Test Plugin', version: '2.0', meta: [ { kind: 'version', text: 'Version 2.0', url: null, slug: null, ariaLabel: null } ] } ), menuCounts: { 'plugins.php': 0 } } ) };
	} );
	const wrapper = await mountPlugins( pluginsData( { items: [ withUpdate() ], query: { plugin_status: 'upgrade' } } ), record );
	await updateRow( wrapper ).find( '.update-message a[href="#"]' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: UPDATE, payload: { plugin: FILE, screen: 'plugins', query: { plugin_status: 'upgrade' } } } ] );
	const message = updateRow( wrapper ).find( '.update-message' );
	expect( message.classes() ).toEqual( expect.arrayContaining( [ 'updating-message', 'notice-warning' ] ) );
	expect( message.find( 'p' ).text() ).toBe( 'Updating...' );
	expect( message.find( 'p' ).attributes( 'aria-label' ) ).toBe( 'Updating E2E Test Plugin...' );
	expect( pluginRow( wrapper, FILE ).classes() ).toContain( 'is-enqueued' );
	release();
	await settle();
	expect( updateRow( wrapper ).find( '.update-message' ).classes() ).toEqual( expect.arrayContaining( [ 'updated-message', 'notice-success' ] ) );
	expect( updateRow( wrapper ).find( '.update-message p' ).text() ).toBe( 'Updated!' );
	expect( updateRow( wrapper ).find( '.update-message p' ).attributes( 'aria-label' ) ).toBe( 'E2E Test Plugin updated!' );
	expect( pluginRow( wrapper, FILE ).find( '.plugin-version-author-uri' ).text() ).toBe( 'Version 2.0' );
	expect( pluginRow( wrapper, FILE ).classes() ).toEqual( [ 'inactive', 'updated' ] );
	expect( record.menuCounts ).toEqual( [ { 'plugins.php': 0 } ] );
	expect( record.spoken ).toContain( 'Update completed successfully.' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-updating', 'wp-plugin-update-success' ] );
	expect( events[ 1 ][ 1 ] ).toEqual( { update: 'plugin', plugin: FILE, slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', oldVersion: '1.0', newVersion: '2.0' } );
} );

test( 'Update now: a failed answer says Update failed: with WordPress\'s message, and the update error event', async () => {
	api.respondWith( async () => {
		throw apiError( 'Download failed.', 500, 'download_failed' );
	} );
	const wrapper = await mountPlugins( pluginsData( { items: [ withUpdate() ] } ) );
	await updateRow( wrapper ).find( '.update-message a[href="#"]' ).trigger( 'click' );
	await settle();
	expect( updateRow( wrapper ).find( '.update-message' ).classes() ).toContain( 'notice-error' );
	expect( updateRow( wrapper ).find( '.update-message p' ).text() ).toBe( 'Update failed: Download failed.' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-updating', 'wp-plugin-update-error' ] );
	expect( events[ 1 ][ 1 ] ).toEqual( { update: 'plugin', plugin: FILE, slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', errorCode: 'download_failed', errorMessage: 'Download failed.' } );
} );

test( 'View version details opens the plugin information dialog on the Changelog section', async () => {
	api.respondWith( async () => ( { name: 'E2E Test Plugin', banners: {}, sections: [ { name: 'description', title: 'Description', html: '<p>D</p>' }, { name: 'changelog', title: 'Changelog', html: '<p>C</p>' } ], facts: {}, rating: null, notices: [], button: null } ) );
	const wrapper = await mountPlugins( pluginsData( { items: [ withUpdate() ] } ) );
	await updateRow( wrapper ).find( '.update-message a[href^="plugin-install.php"]' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'GET', route: 'wp-admin/v1/plugins/information', payload: { slug: 'e2e-test-plugin', section: 'changelog' } } ] );
	expect( wrapper.find( '#section-changelog' ).text() ).toBe( 'C' );
} );

test( 'an update WordPress cannot run here has no update now link to follow', async () => {
	const message = 'There is a new version of E2E Test Plugin available. <a href="plugin-install.php?tab=plugin-information&amp;plugin=e2e-test-plugin&amp;section=changelog">View version 2.0 details</a>. <em>Automatic update is unavailable for this plugin.</em>';
	const wrapper = await mountPlugins( pluginsData( { items: [ withUpdate( { message, request: null } ) ] } ) );
	expect( updateRow( wrapper ).find( '.update-message em' ).text() ).toBe( 'Automatic update is unavailable for this plugin.' );
	expect( updateRow( wrapper ).find( 'a[href="#"]' ).exists() ).toBe( false );
	expect( api.calls ).toEqual( [] );
} );
