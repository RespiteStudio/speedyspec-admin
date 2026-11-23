/** @jest-environment jsdom */
// The Plugins list page (core/plugins) as WordPress's data describes it (WP_Plugins_List_Table,
// wp-admin/plugins.php): the heading, the views, the live search, the rows and their actions, the
// dependencies, Clear List, Screen Options, plugin output, the refusal, and names that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, column, host, loadContracts, mountPlugins, pluginRow, pluginsData, row, rowFiles, settle, views } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
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
	delete window.__ran;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

test( 'heading from data: Add Plugin, the bulk form, the rows with their slug, file and classes, and the body class', async () => {
	const wrapper = await mountPlugins();
	const add = wrapper.find( 'a.page-title-action' );
	expect( add.text() ).toBe( 'Add Plugin' );
	expect( add.attributes( 'href' ) ).toBe( '/wp-admin/plugin-install.php' );
	expect( wrapper.find( 'hr.wp-header-end' ).exists() ).toBe( true );
	expect( wrapper.find( 'form.search-form.search-plugins' ).attributes( 'method' ) ).toBe( 'get' );
	expect( wrapper.find( 'form.search-plugins #plugin-search-input' ).exists() ).toBe( true );
	const form = wrapper.find( 'form#bulk-action-form' );
	expect( form.attributes( 'method' ) ).toBe( 'post' );
	expect( form.find( 'input[type="hidden"][name="plugin_status"]' ).element.value ).toBe( 'all' );
	expect( form.find( 'table.wp-list-table.widefat.plugins' ).exists() ).toBe( true );
	expect( rowFiles( wrapper ) ).toEqual( [ 'alpha/alpha.php', 'beta/beta.php', 'gamma/gamma.php' ] );
	const alpha = pluginRow( wrapper, 'alpha/alpha.php' );
	expect( alpha.attributes( 'data-slug' ) ).toBe( 'alpha' );
	expect( alpha.classes() ).toEqual( [ 'active' ] );
	expect( alpha.find( 'th.plugin-title.column-primary strong' ).text() ).toBe( 'Plugin alpha' );
	expect( alpha.find( 'th.plugin-title' ).attributes( 'aria-label' ) ).toBe( 'Plugin alpha' );
	const box = alpha.find( 'td.check-column input[type="checkbox"]' );
	expect( box.attributes( 'name' ) ).toBe( 'checked[]' );
	expect( box.element.value ).toBe( 'alpha/alpha.php' );
	expect( alpha.find( 'td.check-column label.label-covers-full-cell .screen-reader-text' ).text() ).toBe( 'Select Plugin alpha' );
	expect( alpha.find( 'td.column-description .plugin-description p' ).text() ).toBe( 'The plugin alpha.' );
	expect( alpha.find( '.plugin-version-author-uri' ).classes() ).toEqual( [ 'active', 'second', 'plugin-version-author-uri' ] );
	expect( alpha.find( '.plugin-version-author-uri' ).text() ).toBe( 'Version 1.0 | By Author' );
	expect( document.body.classList.contains( 'plugins-php' ) ).toBe( true );
	expect( wrapper.record.titles ).toContain( 'Plugins' );
	wrapper.unmount();
	expect( document.body.classList.contains( 'plugins-php' ) ).toBe( false );
} );

test( 'heading from data: no Add Plugin without one; the refusal in place of the list', async () => {
	let wrapper = await mountPlugins( pluginsData( { heading: { addNew: null, search: null } } ) );
	expect( wrapper.find( 'a.page-title-action' ).exists() ).toBe( false );
	wrapper.unmount();
	wrapper = await mountPlugins( { context: 'site', query: {}, refusal: { status: 403, heading: null, message: 'Sorry, you are not allowed to manage plugins for this site.' }, title: 'Plugins' } );
	expect( wrapper.text() ).toBe( 'Sorry, you are not allowed to manage plugins for this site.' );
	expect( wrapper.find( '#bulk-action-form' ).exists() ).toBe( false );
} );

test( 'views: each view links to its list with its count, the current one marked', async () => {
	const wrapper = await mountPlugins( pluginsData( { views: views( 'inactive' ), query: { plugin_status: 'inactive' } } ) );
	expect( wrapper.findAll( 'ul.subsubsub li a' ).map( ( a ) => [ a.text(), a.attributes( 'href' ) ] ) ).toEqual( [
		[ 'All (3)', '/wp-admin/plugins.php?plugin_status=all' ],
		[ 'Active (1)', '/wp-admin/plugins.php?plugin_status=active' ],
		[ 'Inactive (2)', '/wp-admin/plugins.php?plugin_status=inactive' ],
	] );
	expect( wrapper.find( 'ul.subsubsub li.inactive a' ).attributes( 'aria-current' ) ).toBe( 'page' );
	expect( wrapper.find( 'input[name="plugin_status"]' ).element.value ).toBe( 'inactive' );
	expect( wrapper.findAll( 'h2.screen-reader-text' ).map( ( h2 ) => h2.text() ) ).toEqual( [ 'Filter plugins list', 'Plugins list' ] );
} );

test( 'search subtitle and noItems: the term as text, the table\'s text, and typing navigates after the pause with the view kept', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountPlugins( pluginsData( { heading: { addNew: null, search: '<b>x</b>' }, items: [], noItems: 'No plugins found for: <strong>&lt;b&gt;x&lt;/b&gt;</strong>.', query: { plugin_status: 'inactive', s: '<b>x</b>' }, search: { shown: true, value: '<b>x</b>', label: 'Search installed plugins', inputId: 'plugin-search-input', keep: [] } } ), record );
	expect( wrapper.find( '.subtitle' ).text() ).toBe( 'Search results for: <b>x</b>' );
	expect( wrapper.find( '.subtitle strong' ).text() ).toBe( '<b>x</b>' );
	expect( wrapper.find( '#the-list tr.no-items td' ).text() ).toBe( 'No plugins found for: <b>x</b>.' );
	expect( wrapper.find( '#the-list tr.no-items strong' ).exists() ).toBe( true );
	expect( wrapper.find( '#plugin-search-input' ).element.value ).toBe( '<b>x</b>' );
	expect( api.calls ).toEqual( [] );
	expect( record.navigated ).toEqual( [] );
} );

test( 'search subtitle and noItems: typing navigates after the pause with the view kept, not below two characters', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountPlugins( pluginsData( { query: { plugin_status: 'inactive' }, views: views( 'inactive' ) } ), record );
	const input = wrapper.find( '#plugin-search-input' );
	expect( input.classes() ).toContain( 'wp-filter-search' );
	expect( wrapper.find( 'label[for="plugin-search-input"]' ).text() ).toBe( 'Search installed plugins' );
	// One character is too short to search (updates.js searchMinCharacters).
	await input.setValue( 'j' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( record.navigated ).toEqual( [] );
	await input.setValue( 'jazz' );
	jest.advanceTimersByTime( 499 );
	expect( record.navigated ).toEqual( [] );
	jest.advanceTimersByTime( 1 );
	await settle();
	expect( record.navigated ).toEqual( [ [ '/wp-admin/plugins.php?s=jazz&plugin_status=inactive', { replace: true } ] ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'search subtitle and noItems: the submit button searches at once', async () => {
	const record = host();
	const wrapper = await mountPlugins( pluginsData(), record );
	await wrapper.find( '#plugin-search-input' ).setValue( 'beta' );
	await wrapper.find( 'form.search-plugins #search-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/plugins.php?s=beta&plugin_status=all' ] );
} );

test( 'request action follows: Activate posts its route with the list\'s query and goes where WordPress answers', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'plugins.php?activate=true&plugin_status=all&paged=1&s=', location: null } ) );
	const wrapper = await mountPlugins( pluginsData( { query: { plugin_status: 'all' } } ), record );
	const link = pluginRow( wrapper, 'beta/beta.php' ).find( '.row-actions span.activate a' );
	expect( link.attributes( 'id' ) ).toBe( 'activate-beta' );
	expect( link.attributes( 'aria-label' ) ).toBe( 'Activate Plugin beta' );
	expect( link.classes() ).toEqual( [ 'edit' ] );
	await link.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/plugins/activate', payload: { plugin: 'beta/beta.php', list: { plugin_status: 'all' } } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?activate=true&plugin_status=all&paged=1&s=', location: null } ] );
} );

test( 'request action follows: Deactivate, and a fatal activation goes to the classic error page of the answer', async () => {
	const record = host();
	api.respondWith( async ( method, route ) => {
		if ( route.endsWith( 'deactivate' ) ) {
			return { redirect: 'plugins.php?deactivate=true', location: null };
		}
		throw apiError( 'The plugin could not be activated because it triggered a fatal error.', 500, 'plugin_activation_fatal', { status: 500, redirect: 'plugins.php?error=true&plugin=beta%2Fbeta.php&_error_nonce=abc', location: null } );
	} );
	const wrapper = await mountPlugins( pluginsData(), record );
	await pluginRow( wrapper, 'alpha/alpha.php' ).find( '#deactivate-alpha' ).trigger( 'click' );
	await settle();
	await pluginRow( wrapper, 'beta/beta.php' ).find( '#activate-beta' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ 'wp-admin/v1/plugins/deactivate', 'wp-admin/v1/plugins/activate' ] );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?deactivate=true', location: null }, { redirect: 'plugins.php?error=true&plugin=beta%2Fbeta.php&_error_nonce=abc', location: null } ] );
	expect( record.notices ).toEqual( [] );
} );

test( 'request action follows: a failed answer is WordPress\'s message in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Sorry, you are not allowed to activate this plugin.', 403, 'rest_forbidden' );
	} );
	const wrapper = await mountPlugins( pluginsData(), record );
	await pluginRow( wrapper, 'beta/beta.php' ).find( '#activate-beta' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Sorry, you are not allowed to activate this plugin.' ] );
	expect( record.followed ).toEqual( [] );
} );

test( 'Clear List: the Recently Active view\'s button deletes the list and follows the answer; a failed answer is said', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'plugins.php?plugin_status=recently_activated', location: null } ) );
	const data = pluginsData( { recent: { label: 'Clear List' }, query: { plugin_status: 'recently_activated' }, items: [ row( 'beta' ) ] } );
	const wrapper = await mountPlugins( data, record );
	const buttons = wrapper.findAll( '.tablenav .alignleft.actions input#clear-recent-list' );
	expect( buttons ).toHaveLength( 2 );
	expect( buttons[ 0 ].element.value ).toBe( 'Clear List' );
	await buttons[ 0 ].trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/plugins/recent?list%5Bplugin_status%5D=recently_activated', payload: undefined } ] );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?plugin_status=recently_activated', location: null } ] );
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	await buttons[ 1 ].trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => notice.message ) ).toEqual( [ 'Fixture failure.' ] );
} );

test( 'Clear List: none outside the Recently Active view, and the Must-Use note in its place', async () => {
	const wrapper = await mountPlugins( pluginsData( { tablenavNote: 'Files in the <code>/wp-content/mu-plugins</code> directory are executed automatically.', bulkActions: [] } ) );
	expect( wrapper.find( '#clear-recent-list' ).exists() ).toBe( false );
	expect( wrapper.find( '.tablenav.top .alignleft.actions p code' ).text() ).toBe( '/wp-content/mu-plugins' );
	expect( wrapper.find( '.tablenav.bottom .alignleft.actions p' ).exists() ).toBe( false );
} );

test( 'dependencies: Requires with its details link, the unmet notice, a disabled Activate with its reason, Required by with its note, and a disabled checkbox', async () => {
	const dependent = row( 'needs', {
		checkboxDisabled: true,
		actions: [
			{ action: 'activate', text: 'Activate', ariaLabel: null, htmlId: null, request: null, disabled: true, reason: 'You cannot activate this plugin as it has unmet requirements.', confirm: null },
		],
		dependencies: {
			requires: { names: [ 'Missing One', 'E2E Test Plugin' ], details: [ null, 'e2e-test-plugin' ], text: 'Requires: Missing One, E2E Test Plugin' },
			requiredBy: null,
			error: 'This plugin cannot be activated because required plugins are missing or inactive.',
		},
	} );
	const required = row( 'base', { active: true, dependencies: { requires: null, requiredBy: { names: [ 'Plugin x' ], text: 'Required by: Plugin x', note: 'Note: This plugin cannot be deactivated until the plugins that require it are deactivated.' }, error: null } } );
	const wrapper = await mountPlugins( pluginsData( { items: [ dependent, required ] } ) );
	const cell = pluginRow( wrapper, 'needs/needs.php' ).find( 'td.column-description' );
	expect( cell.find( '.requires p' ).text() ).toBe( 'Requires: Missing One, E2E Test Plugin' );
	expect( cell.find( '.requires p strong' ).text() ).toBe( 'Requires:' );
	const link = cell.find( '.requires p a.open-plugin-details-modal' );
	expect( link.text() ).toBe( 'E2E Test Plugin' );
	expect( link.attributes( 'aria-label' ) ).toBe( 'More information about E2E Test Plugin' );
	expect( cell.find( '.requires .notice.notice-error.inline.notice-alt p' ).text() ).toBe( 'This plugin cannot be activated because required plugins are missing or inactive.' );
	const activate = pluginRow( wrapper, 'needs/needs.php' ).find( '.row-actions span.activate' );
	expect( activate.find( 'a' ).exists() ).toBe( false );
	expect( activate.text() ).toBe( 'ActivateYou cannot activate this plugin as it has unmet requirements.' );
	expect( activate.find( '.screen-reader-text' ).text() ).toBe( 'You cannot activate this plugin as it has unmet requirements.' );
	expect( pluginRow( wrapper, 'needs/needs.php' ).find( 'input[name="checked[]"]' ).attributes( 'disabled' ) ).toBeDefined();
	const by = pluginRow( wrapper, 'base/base.php' ).find( '.required-by' );
	expect( by.find( 'p' ).text() ).toBe( 'Required by: Plugin x' );
	expect( by.find( '.notice.notice-warning.inline p' ).text() ).toBe( 'Note: This plugin cannot be deactivated until the plugins that require it are deactivated.' );
} );

test( 'hook html and core ids: plugin action links, meta, after meta, after rows, custom cells and what prints before the views', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'plugins.php?activate=true', location: null } ) );
	const hooked = row( 'hooked', {
		actionsHtml: '<span class=\'activate\'><a href="plugins.php?action=activate&amp;plugin=hooked%2Fhooked.php&amp;_wpnonce=x" id="activate-hooked" class="edit" aria-label="Activate Plugin hooked">Activate</a> | </span><span class=\'detached_fixture\'><a class="detached-fixture-plugin-action" href="options-general.php?detached_fixture_plugin=1">Fixture settings</a></span>',
		metaHtml: 'Version 1.0 | By Author | <span class="detached-fixture-meta">Fixture meta</span>',
		afterMetaHtml: '<div class="detached-fixture-after-meta">After meta</div>',
		dependencies: { requires: { names: [ 'Other' ], details: [ null ], text: 'Requires: Other' }, requiredBy: null, error: null },
		afterHtml: '<tr class="detached-fixture-after-row"><td colspan="4">Fixture after row</td></tr>',
		cells: { detached_fixture: { html: 'plugin-hooked/hooked.php<script>window.__ran = ( window.__ran || 0 ) + 1;</script>', error: null } },
	} );
	const data = pluginsData( {
		items: [ hooked ],
		columns: [ ...pluginsData().columns, column( 'detached_fixture', 'Fixture plugin', { core: false } ) ],
		preHtml: '<div class="detached-fixture-pre">Before the views</div>',
	} );
	const wrapper = await mountPlugins( data, record );
	await settle();
	const tr = pluginRow( wrapper, 'hooked/hooked.php' );
	expect( tr.find( '.row-actions.visible a.detached-fixture-plugin-action' ).text() ).toBe( 'Fixture settings' );
	const meta = tr.find( '.plugin-version-author-uri' );
	expect( meta.find( '.detached-fixture-meta' ).text() ).toBe( 'Fixture meta' );
	// As single_row(): the meta line, then the dependencies, then after_plugin_row_meta.
	const order = [ ...tr.find( 'td.column-description' ).element.querySelectorAll( '.plugin-version-author-uri, .requires, .detached-fixture-after-meta' ) ].map( ( el ) => el.className.split( ' ' ).pop() );
	expect( order ).toEqual( [ 'plugin-version-author-uri', 'requires', 'detached-fixture-after-meta' ] );
	expect( wrapper.find( '#the-list tr.detached-fixture-after-row' ).text() ).toBe( 'Fixture after row' );
	expect( tr.find( 'td.detached_fixture.column-detached_fixture' ).text() ).toContain( 'plugin-hooked/hooked.php' );
	expect( window.__ran ).toBe( 1 );
	expect( wrapper.find( '.detached-fixture-pre' ).text() ).toBe( 'Before the views' );
	// The core Activate link inside the filtered links runs natively; the plugin's link navigates.
	await tr.find( '#activate-hooked' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ 'wp-admin/v1/plugins/activate' ] );
	expect( record.followed ).toHaveLength( 1 );
	const own = new MouseEvent( 'click', { bubbles: true, cancelable: true } );
	tr.find( 'a.detached-fixture-plugin-action' ).element.dispatchEvent( own );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
} );

test( 'Screen Options: the columns and the per page offered for screen plugins; a hidden column is saved and its cells hide', async () => {
	let offered = null;
	const data = pluginsData( {
		screenOptions: { tableColumns: [ { key: 'description', label: 'Description', hidden: false }, { key: 'auto-updates', label: 'Automatic Updates', hidden: false } ], legend: 'Columns', perPage: { option: 'plugins_per_page', value: 999, label: 'Number of items per page:', min: 1, max: 999 }, viewMode: null, settingsHtml: null },
	} );
	const record = host();
	api.respondWith( async ( method, route, payload ) => ( payload?.perPage ? { redirect: 'plugins.php', location: null } : {} ) );
	const wrapper = await mountPlugins( data, record, { screenOptions: { set: ( options ) => {
		offered = options;
		return () => {};
	} } } );
	expect( offered.pagination.option ).toBe( 'plugins_per_page' );
	await offered.onChange( 'hide-column', { key: 'description', hidden: true } );
	await settle();
	expect( api.calls[ 0 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/screen-preferences/plugins', payload: { columnsHidden: [ 'description' ] } } );
	expect( wrapper.find( 'thead #description' ).classes() ).toContain( 'hidden' );
	expect( pluginRow( wrapper, 'beta/beta.php' ).find( 'td.column-description' ).classes() ).toContain( 'hidden' );
	await offered.onApply( { perPage: 2 } );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/screen-preferences/plugins', payload: { perPage: 2, referer: 'plugins.php' } } );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php', location: null } ] );
} );

test( 'names as text: a plugin named with markup runs nothing in its row, its checkbox label or its delete question', async () => {
	const name = '<img src=x onerror="window.__ran=1">';
	const evil = row( 'evil', { name, rowHeaderLabel: name, checkboxLabel: 'Select ' + name, actions: [ { action: 'delete', text: 'Delete', ariaLabel: 'Delete ' + name, htmlId: 'delete-evil', request: { method: 'POST', path: 'plugins/delete', body: { plugin: 'evil/evil.php' } }, disabled: false, reason: null, confirm: 'Are you sure you want to delete ' + name + '?' } ] } );
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValue( false );
	const wrapper = await mountPlugins( pluginsData( { items: [ evil ] } ) );
	const tr = pluginRow( wrapper, 'evil/evil.php' );
	expect( tr.find( 'th.plugin-title strong' ).text() ).toBe( name );
	expect( tr.find( 'img' ).exists() ).toBe( false );
	expect( tr.find( 'label .screen-reader-text' ).text() ).toBe( 'Select ' + name );
	await tr.find( '#delete-evil' ).trigger( 'click' );
	await settle();
	expect( confirm ).toHaveBeenCalledWith( 'Are you sure you want to delete ' + name + '?' );
	expect( wrapper.find( 'img' ).exists() ).toBe( false );
	expect( window.__ran ).toBeUndefined();
	expect( api.calls ).toEqual( [] );
} );
