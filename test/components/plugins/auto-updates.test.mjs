/** @jest-environment jsdom */
// The Automatic Updates column of the Plugins list (single_row()'s `auto-updates` cell, updates.js's
// toggle): the toggle WordPress describes, Enabling... and Disabling..., the label and the next
// update from the answer, the views' counts as updates.js changes them, the error notice, a forced
// or unavailable state, a plugin's filtered cell, and no column when auto-updates are off.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { countedLabel } from '../../../site/components/core/plugins/auto-updates.js';
import { apiError, autoUpdate, host, loadContracts, mountPlugins, pluginRow, pluginsData, row, settle } from './data.mjs';

const ROUTE = 'wp-admin/v1/plugins/auto-updates';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.innerHTML = '';
} );

const autoViews = ( enabled, disabled ) => [
	...pluginsData().views,
	{ key: 'auto-update-enabled', label: 'Auto-updates Enabled (' + enabled + ')', labelHtml: 'Auto-updates Enabled <span class="count">(' + enabled + ')</span>', count: enabled, url: 'plugins.php?plugin_status=auto-update-enabled', current: false },
	{ key: 'auto-update-disabled', label: 'Auto-updates Disabled (' + disabled + ')', labelHtml: 'Auto-updates Disabled <span class="count">(' + disabled + ')</span>', count: disabled, url: 'plugins.php?plugin_status=auto-update-disabled', current: false },
];
const cell = ( wrapper, file ) => pluginRow( wrapper, file ).find( 'td.column-auto-updates' );

test( 'countedLabel: a view\'s count changed by one, never below zero', () => {
	expect( countedLabel( 'Auto-updates Enabled <span class="count">(1)</span>', 1 ) ).toBe( 'Auto-updates Enabled <span class="count">(2)</span>' );
	expect( countedLabel( 'Auto-updates Disabled <span class="count">(0)</span>', -1 ) ).toBe( 'Auto-updates Disabled <span class="count">(0)</span>' );
} );

test( 'Enable auto-updates: Enabling..., the route, the label and next update from the answer, the counts, and Auto-updates enabled spoken', async () => {
	const record = host();
	let release;
	const pending = new Promise( ( resolve ) => {
		release = resolve;
	} );
	api.respondWith( async () => {
		await pending;
		return { enabled: true, text: 'Disable auto-updates', nextUpdate: 'Automatic update scheduled in 12 hours.', nextUpdateShown: true };
	} );
	const wrapper = await mountPlugins( pluginsData( { views: autoViews( 1, 2 ) } ), record );
	const toggle = cell( wrapper, 'beta/beta.php' ).find( 'a.toggle-auto-update.aria-button-if-js' );
	expect( toggle.attributes( 'data-wp-action' ) ).toBe( 'enable' );
	expect( toggle.attributes( 'role' ) ).toBe( 'button' );
	expect( toggle.find( '.label' ).text() ).toBe( 'Enable auto-updates' );
	expect( toggle.find( '.dashicons-update' ).classes() ).toContain( 'hidden' );
	await toggle.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: ROUTE, payload: { plugin: 'beta/beta.php', state: 'enable' } } ] );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.label' ).text() ).toBe( 'Enabling...' );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.dashicons-update' ).classes() ).not.toContain( 'hidden' );
	// A second click while it runs sends nothing.
	await cell( wrapper, 'beta/beta.php' ).find( 'a.toggle-auto-update' ).trigger( 'click' );
	expect( api.calls ).toHaveLength( 1 );
	release();
	await settle();
	const after = cell( wrapper, 'beta/beta.php' );
	expect( after.find( '.label' ).text() ).toBe( 'Disable auto-updates' );
	expect( after.find( 'a.toggle-auto-update' ).attributes( 'data-wp-action' ) ).toBe( 'disable' );
	expect( after.find( '.auto-update-time' ).text() ).toBe( 'Automatic update scheduled in 12 hours.' );
	expect( after.find( '.auto-update-time' ).classes() ).not.toContain( 'hidden' );
	expect( wrapper.find( 'li.auto-update-enabled a' ).text() ).toBe( 'Auto-updates Enabled (2)' );
	expect( wrapper.find( 'li.auto-update-disabled a' ).text() ).toBe( 'Auto-updates Disabled (1)' );
	expect( record.spoken ).toContain( 'Auto-updates enabled' );
} );

test( 'Disable auto-updates: Disabling..., then Enable auto-updates and the next update hidden', async () => {
	const record = host();
	api.respondWith( async () => ( { enabled: false, text: 'Enable auto-updates', nextUpdate: null, nextUpdateShown: false } ) );
	const items = [ row( 'beta', { autoUpdate: autoUpdate( 'beta/beta.php', true, { nextUpdate: 'Automatic update scheduled in 12 hours.', nextUpdateShown: true } ) } ) ];
	const wrapper = await mountPlugins( pluginsData( { items } ), record );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.auto-update-time' ).classes() ).not.toContain( 'hidden' );
	await cell( wrapper, 'beta/beta.php' ).find( 'a.toggle-auto-update' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { plugin: 'beta/beta.php', state: 'disable' } );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.label' ).text() ).toBe( 'Enable auto-updates' );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.auto-update-time' ).classes() ).toContain( 'hidden' );
	expect( record.spoken ).toContain( 'Auto-updates disabled' );
} );

test( 'whether the next update shows comes from the data, not from the toggle\'s state', async () => {
	const items = [
		row( 'beta', { autoUpdate: autoUpdate( 'beta/beta.php', true, { nextUpdate: 'Scheduled.', nextUpdateShown: false } ) } ),
		row( 'gamma', { autoUpdate: autoUpdate( 'gamma/gamma.php', false, { nextUpdate: 'Scheduled.', nextUpdateShown: true } ) } ),
	];
	const wrapper = await mountPlugins( pluginsData( { items } ) );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.auto-update-time' ).classes() ).toContain( 'hidden' );
	expect( cell( wrapper, 'gamma/gamma.php' ).find( '.auto-update-time' ).classes() ).not.toContain( 'hidden' );
} );

test( 'a failed answer shows WordPress\'s message in the cell\'s notice and says it', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Sorry, you are not allowed to manage plugins automatic updates.', 403, 'rest_forbidden' );
	} );
	const wrapper = await mountPlugins( pluginsData(), record );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.notice.notice-error.notice-alt.inline' ).classes() ).toContain( 'hidden' );
	await cell( wrapper, 'beta/beta.php' ).find( 'a.toggle-auto-update' ).trigger( 'click' );
	await settle();
	const notice = cell( wrapper, 'beta/beta.php' ).find( '.notice.notice-error' );
	expect( notice.classes() ).not.toContain( 'hidden' );
	expect( notice.find( 'p' ).text() ).toBe( 'Sorry, you are not allowed to manage plugins automatic updates.' );
	expect( cell( wrapper, 'beta/beta.php' ).find( '.label' ).text() ).toBe( 'Enable auto-updates' );
	expect( record.spoken ).toContainEqual( [ 'Sorry, you are not allowed to manage plugins automatic updates.', 'assertive' ] );
} );

test( 'forced and unavailable: the state as a label, with no toggle', async () => {
	const items = [
		row( 'beta', { autoUpdate: autoUpdate( 'beta/beta.php', true, { forced: true, text: 'Auto-updates enabled', request: null } ) } ),
		row( 'gamma', { autoUpdate: autoUpdate( 'gamma/gamma.php', false, { text: '', request: null } ) } ),
	];
	const wrapper = await mountPlugins( pluginsData( { items } ) );
	expect( cell( wrapper, 'beta/beta.php' ).find( 'a' ).exists() ).toBe( false );
	expect( cell( wrapper, 'beta/beta.php' ).find( 'span.label' ).text() ).toBe( 'Auto-updates enabled' );
	expect( cell( wrapper, 'gamma/gamma.php' ).find( 'span.label' ).text() ).toBe( '' );
} );

test( 'a plugin\'s filtered cell is its HTML; its toggle runs the route and the list is read again', async () => {
	const record = host();
	api.respondWith( async () => ( { enabled: true, text: 'Disable auto-updates', nextUpdate: null } ) );
	const html = '<a href="plugins.php?action=enable-auto-update&amp;plugin=beta%2Fbeta.php&amp;_wpnonce=x" class="toggle-auto-update aria-button-if-js" data-wp-action="enable"><span class="label">Plugin toggle</span></a>';
	const items = [ row( 'beta', { autoUpdate: autoUpdate( 'beta/beta.php', false, { html } ) } ) ];
	const wrapper = await mountPlugins( pluginsData( { items } ), record );
	await settle();
	expect( cell( wrapper, 'beta/beta.php' ).find( '.label' ).text() ).toBe( 'Plugin toggle' );
	await cell( wrapper, 'beta/beta.php' ).find( 'a.toggle-auto-update' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: ROUTE, payload: { plugin: 'beta/beta.php', state: 'enable' } } ] );
	expect( record.refreshed ).toBe( 1 );
} );

test( 'no column when auto-updates are off: no cell in any row', async () => {
	const columns = pluginsData().columns.filter( ( c ) => c.key !== 'auto-updates' );
	const items = pluginsData().items.map( ( item ) => ( { ...item, autoUpdate: null } ) );
	const wrapper = await mountPlugins( pluginsData( { columns, items } ) );
	expect( wrapper.find( 'thead #auto-updates' ).exists() ).toBe( false );
	expect( wrapper.find( 'td.column-auto-updates' ).exists() ).toBe( false );
} );
