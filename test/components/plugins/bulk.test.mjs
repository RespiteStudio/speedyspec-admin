/** @jest-environment jsdom */
// Bulk actions and Delete on the Plugins list: common.js's two checks; the bulk actions WordPress
// runs as one write (`plugins/bulk`); Delete and Update as updates.js runs them, one package job per
// plugin through the package queue (package-parts/queue.js), with the classic confirm texts, the
// deleted row, the views and menu counts from the answer, and the Connection Information dialog when
// WordPress needs filesystem credentials.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { planBulk } from '../../../site/components/core/plugins/bulk.js';
import { answerPart, apiError, credentialsError, host, loadContracts, mountPlugins, pluginRow, pluginsData, row, settle, update } from './data.mjs';

const BULK = 'wp-admin/v1/plugins/bulk';
const DELETE = 'wp-admin/v1/plugins/delete';
const UPDATE = 'wp-admin/v1/plugins/update';

let events;
const realJQuery = window.jQuery;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	jest.spyOn( window, 'scrollTo' ).mockImplementation( () => {} );
	events = [];
	// A jQuery that records what updates.js listeners would hear.
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
	document.body.innerHTML = '';
} );

async function check( wrapper, ...files ) {
	for ( const file of files ) {
		await pluginRow( wrapper, file ).find( 'input[name="checked[]"]' ).trigger( 'click' );
	}
}

async function apply( wrapper, action, which = 'top' ) {
	await wrapper.find( '#bulk-action-selector-' + which ).setValue( action );
	await wrapper.find( which === 'top' ? '#doaction' : '#doaction2' ).trigger( 'click' );
	await settle();
}

test( 'common.js\'s checks: no action, then no row checked, say their texts and nothing is posted', async () => {
	const record = host();
	const wrapper = await mountPlugins( pluginsData(), record );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	await apply( wrapper, 'activate-selected' );
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Please select a bulk action to perform.', 'Please select at least one item to perform this action on.' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'posts plugins/bulk: Activate with the checked plugins and the list\'s query, and follows the answer', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'plugins.php?activate-multi=true', location: null } ) );
	const wrapper = await mountPlugins( pluginsData( { query: { plugin_status: 'all' } } ), record );
	await check( wrapper, 'beta/beta.php', 'gamma/gamma.php' );
	await apply( wrapper, 'activate-selected', 'bottom' );
	expect( api.calls ).toEqual( [ { method: 'POST', route: BULK, payload: { action: 'activate-selected', plugins: [ 'beta/beta.php', 'gamma/gamma.php' ], list: { plugin_status: 'all' } } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?activate-multi=true', location: null } ] );
} );

test( 'posts plugins/bulk: a failed answer is said, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountPlugins( pluginsData(), record );
	await check( wrapper, 'beta/beta.php' );
	await apply( wrapper, 'deactivate-selected' );
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Fixture failure.' ] );
	expect( record.followed ).toEqual( [] );
} );

test( 'planBulk: the jobs of update and delete, one per checked row WordPress allows; the others are one write', () => {
	const items = [ row( 'alpha', { active: true, update: update( 'alpha/alpha.php', 'alpha', 'Plugin alpha' ) } ), row( 'beta' ), row( 'gamma', { update: update( 'gamma/gamma.php', 'gamma', 'Plugin gamma' ) } ) ];
	const files = [ 'alpha/alpha.php', 'beta/beta.php', 'gamma/gamma.php' ];
	expect( planBulk( 'update-selected', items, files ) ).toEqual( { kind: 'update', files: [ 'alpha/alpha.php', 'gamma/gamma.php' ] } );
	// Active plugins have no Delete: they are left out, as WordPress would refuse them.
	expect( planBulk( 'delete-selected', items, files ) ).toEqual( { kind: 'delete', files: [ 'beta/beta.php', 'gamma/gamma.php' ] } );
	expect( planBulk( 'activate-selected', items, files ) ).toEqual( { kind: 'bulk', files } );
} );

test( 'delete confirm from data: row Delete asks the action\'s question; Cancel sends nothing; OK deletes and shows the deleted row', async () => {
	const record = host();
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValueOnce( false ).mockReturnValueOnce( true );
	api.respondWith( async () => ( { plugin: 'beta/beta.php', slug: 'beta', pluginName: 'Plugin beta', ...answerPart() } ) );
	const wrapper = await mountPlugins( pluginsData( { query: { plugin_status: 'all' } } ), record );
	const link = pluginRow( wrapper, 'beta/beta.php' ).find( '#delete-beta' );
	expect( link.classes() ).toEqual( [ 'delete' ] );
	await link.trigger( 'click' );
	await settle();
	expect( confirm ).toHaveBeenLastCalledWith( 'Are you sure you want to delete Plugin beta?' );
	expect( api.calls ).toEqual( [] );
	await link.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: DELETE, payload: { plugin: 'beta/beta.php', screen: 'plugins', query: { plugin_status: 'all' } } } ] );
	expect( pluginRow( wrapper, 'beta/beta.php' ).exists() ).toBe( false );
	const deleted = wrapper.find( '#the-list tr.plugin-deleted-tr.inactive.deleted' );
	expect( deleted.attributes( 'id' ) ).toBe( 'beta-deleted' );
	expect( deleted.attributes( 'data-plugin' ) ).toBe( 'beta/beta.php' );
	expect( deleted.find( 'td.plugin-update.colspanchange' ).attributes( 'colspan' ) ).toBe( '4' );
	expect( deleted.text() ).toBe( 'Plugin beta was successfully deleted.' );
	expect( deleted.find( 'strong' ).text() ).toBe( 'Plugin beta' );
	expect( wrapper.find( 'ul.subsubsub li.inactive a' ).text() ).toBe( 'Inactive (1)' );
	expect( record.menuCounts ).toEqual( [ { 'plugins.php': 0 } ] );
	expect( record.spoken ).toContain( 'Deleting...' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-deleting', 'wp-plugin-delete-success' ] );
	expect( events[ 0 ][ 1 ] ).toEqual( { plugin: 'beta/beta.php', slug: 'beta' } );
} );

test( 'delete confirm from data: a plugin with an uninstall routine asks about its data', async () => {
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValue( false );
	const data = pluginsData( { items: [ row( 'beta', { classes: [ 'inactive', 'is-uninstallable' ], actions: [ { action: 'delete', text: 'Delete', ariaLabel: 'Delete Plugin beta', htmlId: 'delete-beta', request: { method: 'POST', path: 'plugins/delete', body: { plugin: 'beta/beta.php' } }, disabled: false, reason: null, confirm: 'Are you sure you want to delete Plugin beta and its data?' } ] } ) ] } );
	const wrapper = await mountPlugins( data );
	await pluginRow( wrapper, 'beta/beta.php' ).find( '#delete-beta' ).trigger( 'click' );
	expect( confirm ).toHaveBeenCalledWith( 'Are you sure you want to delete Plugin beta and its data?' );
} );

test( 'delete confirm from data: a failed answer shows WordPress\'s message in the row\'s update row', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async () => {
		throw apiError( 'Could not delete the plugin.', 500, 'could_not_remove_plugin' );
	} );
	const wrapper = await mountPlugins();
	await pluginRow( wrapper, 'beta/beta.php' ).find( '#delete-beta' ).trigger( 'click' );
	await settle();
	expect( pluginRow( wrapper, 'beta/beta.php' ).exists() ).toBe( true );
	const notice = wrapper.find( '#the-list tr.plugin-update-tr[data-plugin="beta/beta.php"] .update-message.notice-error.notice-alt p' );
	expect( notice.text() ).toBe( 'Could not delete the plugin.' );
	expect( pluginRow( wrapper, 'beta/beta.php' ).find( '#delete-beta' ).text() ).toBe( 'Delete' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-deleting', 'wp-plugin-delete-error' ] );
} );

test( 'one job per row: bulk Delete asks updates.js\'s question, then deletes each checked inactive plugin in turn', async () => {
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	let release;
	const first = new Promise( ( resolve ) => {
		release = resolve;
	} );
	api.respondWith( async ( method, route, payload ) => {
		if ( payload.plugin === 'beta/beta.php' ) {
			await first;
		}
		return { plugin: payload.plugin, slug: payload.plugin.split( '/' )[ 0 ], pluginName: 'x', ...answerPart() };
	} );
	const wrapper = await mountPlugins();
	await check( wrapper, 'alpha/alpha.php', 'beta/beta.php', 'gamma/gamma.php' );
	await apply( wrapper, 'delete-selected' );
	expect( confirm ).toHaveBeenCalledWith( 'Are you sure you want to delete the selected plugins and their data?' );
	// One at a time: the second waits for the first.
	expect( api.calls.map( ( call ) => call.payload.plugin ) ).toEqual( [ 'beta/beta.php' ] );
	release();
	await settle();
	expect( api.calls.map( ( call ) => [ call.route, call.payload.plugin ] ) ).toEqual( [ [ DELETE, 'beta/beta.php' ], [ DELETE, 'gamma/gamma.php' ] ] );
	expect( wrapper.findAll( '#the-list tr.plugin-deleted-tr' ) ).toHaveLength( 2 );
	expect( pluginRow( wrapper, 'alpha/alpha.php' ).exists() ).toBe( true );
} );

test( 'one job per row: Cancel on the bulk question sends nothing', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( false );
	const wrapper = await mountPlugins();
	await check( wrapper, 'beta/beta.php' );
	await apply( wrapper, 'delete-selected' );
	expect( api.calls ).toEqual( [] );
} );

test( 'credentials pause: the dialog opens with WordPress\'s form, and the job and the next resume with the credentials', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async ( method, route, payload ) => {
		if ( ! payload.credentials ) {
			throw credentialsError();
		}
		return { plugin: payload.plugin, slug: payload.plugin.split( '/' )[ 0 ], pluginName: 'x', ...answerPart() };
	} );
	const wrapper = await mountPlugins();
	await check( wrapper, 'beta/beta.php', 'gamma/gamma.php' );
	await apply( wrapper, 'delete-selected' );
	const dialog = wrapper.find( '#request-filesystem-credentials-dialog' );
	expect( dialog.exists() ).toBe( true );
	expect( dialog.find( 'h1' ).text() ).toBe( 'Connection Information' );
	expect( api.calls ).toHaveLength( 1 );
	await dialog.find( '#hostname' ).setValue( 'ftp.example.org' );
	await dialog.find( '#username' ).setValue( 'deploy' );
	await dialog.find( '#password' ).setValue( 's3cret' );
	await dialog.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls.map( ( call ) => [ call.payload.plugin, call.payload.credentials?.password ?? null ] ) ).toEqual( [ [ 'beta/beta.php', null ], [ 'beta/beta.php', 's3cret' ], [ 'gamma/gamma.php', 's3cret' ] ] );
	expect( api.calls[ 1 ].payload.credentials ).toEqual( { hostname: 'ftp.example.org', username: 'deploy', password: 's3cret', connection_type: 'ftp' } );
	expect( wrapper.find( '#request-filesystem-credentials-dialog' ).exists() ).toBe( false );
	expect( wrapper.findAll( '#the-list tr.plugin-deleted-tr' ) ).toHaveLength( 2 );
	// No listener ever hears the credentials.
	expect( JSON.stringify( events ) ).not.toContain( 's3cret' );
} );

test( 'credentials pause: a failed connection opens the dialog again with WordPress\'s error', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async ( method, route, payload ) => {
		throw credentialsError( payload.credentials ? 'Failed to connect to FTP Server ftp.example.org:21' : null );
	} );
	const wrapper = await mountPlugins();
	await pluginRow( wrapper, 'beta/beta.php' ).find( '#delete-beta' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#password' ).setValue( 'wrong' );
	await wrapper.find( '#request-filesystem-credentials-dialog form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#request-filesystem-credentials-dialog .notice-error' ).text() ).toBe( 'Failed to connect to FTP Server ftp.example.org:21' );
} );

test( 'credentials pause: Cancel drops the queue, announces each job once, puts the rows back, speaks Update canceled. for the update that ran, and later jobs still start', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	const record = host();
	let needs = true;
	api.respondWith( async ( method, route, payload ) => {
		if ( needs ) {
			throw credentialsError();
		}
		return { plugin: payload.plugin, slug: payload.plugin.split( '/' )[ 0 ], pluginName: 'Plugin gamma', oldVersion: '1.0', newVersion: '2.0', ...answerPart( { row: row( 'gamma', { version: '2.0' } ) } ) };
	} );
	const items = [ row( 'beta', { update: update( 'beta/beta.php', 'beta', 'Plugin beta' ) } ), row( 'gamma', { update: update( 'gamma/gamma.php', 'gamma', 'Plugin gamma' ) } ) ];
	const wrapper = await mountPlugins( pluginsData( { items } ), record );
	await check( wrapper, 'beta/beta.php', 'gamma/gamma.php' );
	await apply( wrapper, 'update-selected' );
	expect( wrapper.find( 'tr.plugin-update-tr[data-plugin="beta/beta.php"] .update-message p' ).text() ).toBe( 'Updating...' );
	await wrapper.find( '#request-filesystem-credentials-dialog button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#request-filesystem-credentials-dialog' ).exists() ).toBe( false );
	const cancelled = events.filter( ( [ name ] ) => name === 'credential-modal-cancel' ).map( ( [ , job ] ) => job );
	expect( cancelled ).toEqual( [ { action: 'update-plugin', data: { plugin: 'beta/beta.php', slug: 'beta' } }, { action: 'update-plugin', data: { plugin: 'gamma/gamma.php', slug: 'gamma' } } ] );
	// As updates.js: only the update that showed Updating... is put back and spoken.
	expect( record.spoken.filter( ( message ) => message === 'Update canceled.' ) ).toHaveLength( 1 );
	expect( wrapper.find( 'tr.plugin-update-tr[data-plugin="beta/beta.php"] .update-message p' ).text() ).toContain( 'There is a new version of Plugin beta available.' );
	expect( pluginRow( wrapper, 'beta/beta.php' ).classes() ).not.toContain( 'is-enqueued' );
	// The queue is free again: a later update starts.
	needs = false;
	await wrapper.find( 'tr.plugin-update-tr[data-plugin="gamma/gamma.php"] .update-message a[href="#"]' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: UPDATE, payload: { plugin: 'gamma/gamma.php', screen: 'plugins', query: {} } } );
	expect( wrapper.find( 'tr.plugin-update-tr[data-plugin="gamma/gamma.php"] .update-message p' ).text() ).toBe( 'Updated!' );
} );
