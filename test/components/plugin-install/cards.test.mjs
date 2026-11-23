/** @jest-environment jsdom */
// Add Plugins (core/plugin-install) as WordPress's data describes it (WP_Plugin_Install_List_Table,
// wp-admin/plugin-install.php): the page from its data, the tabs, the cards and their buttons
// (Install Now, Update Now, Activate with updates.js's texts and events, the fresh card), the
// dependencies, More Details and the information address, the popular tags, plugin output, a
// failed answer of each card write, the credentials pause, the refusal, and card texts that run
// nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { shallowRef } from 'vue';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { legacyLinkPath } from '../../../site/components/core/plugin-install.js';
import { cardButton, groupCards } from '../../../site/components/core/plugin-install/cards.js';
import contract from '../../../site/contracts/core/plugin-install.js';
import { apiError, button, card, cardOf, cardSlugs, credentialsError, host, installAnswer, installData, loadContracts, mountInstall, settle, stubJQuery, tabs } from './data.mjs';
import { information } from '../plugin-information/data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;
const INSTALL = 'wp-admin/v1/plugins/install';
const UPDATE = 'wp-admin/v1/plugins/update';
const ACTIVATE = 'wp-admin/v1/plugins/activate';
const FILE = 'e2e-test-plugin/e2e-test-plugin.php';

let events;
beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	events = stubJQuery();
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	delete window.__ran;
	delete window.jQuery;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

test( 'the contract: a page, two segments, 1.1.0, data and page, emits saved', () => {
	expect( contract.id ).toBe( 'core/plugin-install' );
	expect( contract.version ).toBe( '1.1.0' );
	expect( contract.page ).toBe( true );
	expect( Object.keys( contract.props ) ).toEqual( [ 'data', 'page' ] );
	expect( contract.emits ).toEqual( [ 'saved' ] );
} );

test( 'page from data: the toggle, the text, the tabs, the search form, the cards, the popular tags and the body classes', async () => {
	const wrapper = await mountInstall();
	const root = wrapper.find( '.wp-admin-plugin-install' );
	expect( root.classes() ).toContain( 'plugin-install-tab-featured' );
	const toggle = wrapper.find( 'a.upload-view-toggle.page-title-action' );
	expect( toggle.attributes( 'href' ) ).toBe( '/wp-admin/plugin-install.php?tab=upload' );
	expect( toggle.attributes( 'role' ) ).toBe( 'button' );
	expect( toggle.attributes( 'aria-expanded' ) ).toBe( 'false' );
	expect( toggle.find( '.upload' ).text() ).toBe( 'Upload Plugin' );
	expect( toggle.find( '.browse' ).text() ).toBe( 'Browse Plugins' );
	expect( wrapper.find( 'hr.wp-header-end' ).exists() ).toBe( true );
	expect( wrapper.find( '.upload-plugin-wrap form.wp-upload-form #pluginzip' ).attributes( 'accept' ) ).toBe( '.zip' );
	expect( wrapper.find( 'h2.screen-reader-text' ).text() ).toBe( 'Filter plugins list' );
	expect( wrapper.find( '.wp-admin-plugin-install > p a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/plugins/' );
	const links = wrapper.findAll( '.wp-filter ul.filter-links li' );
	expect( links.map( ( li ) => li.classes() ) ).toEqual( [ [ 'plugin-install-featured' ], [ 'plugin-install-popular' ], [ 'plugin-install-recommended' ], [ 'plugin-install-favorites' ] ] );
	expect( links.map( ( li ) => li.find( 'a' ).attributes( 'href' ) ) ).toEqual( [ '/wp-admin/plugin-install.php?tab=featured', '/wp-admin/plugin-install.php?tab=popular', '/wp-admin/plugin-install.php?tab=recommended', '/wp-admin/plugin-install.php?tab=favorites' ] );
	expect( links[ 0 ].find( 'a' ).classes() ).toEqual( [ 'current' ] );
	expect( links[ 0 ].find( 'a' ).attributes( 'aria-current' ) ).toBe( 'page' );
	const form = wrapper.find( '.wp-filter form.search-form.search-plugins' );
	expect( form.find( 'input[type="hidden"][name="tab"]' ).element.value ).toBe( 'search' );
	expect( form.find( 'label[for="search-plugins"]' ).text() ).toBe( 'Search Plugins' );
	expect( form.find( '#search-plugins' ).attributes( 'aria-describedby' ) ).toBe( 'live-search-desc' );
	expect( form.findAll( '#typeselector option' ).map( ( option ) => [ option.element.value, option.text() ] ) ).toEqual( [ [ 'term', 'Keyword' ], [ 'author', 'Author' ], [ 'tag', 'Tag' ] ] );
	expect( wrapper.find( 'form#plugin-filter .wp-list-table.widefat.plugin-install #the-list' ).attributes( 'data-wp-lists' ) ).toBe( 'list:plugin-install' );
	// Featured has no navigation.
	expect( wrapper.find( '.tablenav' ).exists() ).toBe( false );
	expect( cardSlugs( wrapper ) ).toEqual( [ 'e2e-test-plugin', 'alpha' ] );
	expect( wrapper.find( '.plugins-popular-tags-wrapper h2' ).text() ).toBe( 'Popular tags' );
	expect( document.body.classList.contains( 'plugin-install-php' ) ).toBe( true );
	expect( document.body.classList.contains( 'plugin-install-tab-featured' ) ).toBe( true );
	expect( wrapper.record.titles ).toContain( 'Add Plugins' );
	wrapper.unmount();
	expect( document.body.classList.contains( 'plugin-install-php' ) ).toBe( false );
} );

test( 'page from data: a card in classic markup', async () => {
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { icon: 'https://ps.w.org/e2e/icon.svg' } ) ] } ) );
	const found = cardOf( wrapper, 'e2e-test-plugin' );
	expect( found.find( '.plugin-card-top .name.column-name h3 a.thickbox.open-plugin-details-modal' ).attributes( 'href' ) ).toBe( '/wp-admin/plugin-install.php?tab=plugin-information&plugin=e2e-test-plugin' );
	expect( found.find( 'h3 a' ).text() ).toBe( 'E2E Test Plugin' );
	expect( found.find( 'h3 a img.plugin-icon' ).attributes( 'src' ) ).toBe( 'https://ps.w.org/e2e/icon.svg' );
	const buttons = found.findAll( '.action-links ul.plugin-action-buttons li' );
	expect( buttons ).toHaveLength( 2 );
	const install = buttons[ 0 ].find( 'a' );
	expect( install.classes() ).toEqual( [ 'install-now', 'button', 'button-compact' ] );
	expect( install.attributes( 'role' ) ).toBe( 'button' );
	expect( install.attributes( 'aria-label' ) ).toBe( 'Install E2E Test Plugin 1.0 now' );
	expect( install.attributes( 'data-slug' ) ).toBe( 'e2e-test-plugin' );
	expect( install.text() ).toBe( 'Install Now' );
	const more = buttons[ 1 ].find( 'a' );
	expect( more.text() ).toBe( 'More Details' );
	expect( more.attributes( 'aria-label' ) ).toBe( 'More information about E2E Test Plugin' );
	expect( found.find( '.desc.column-description p' ).text() ).toBe( 'Fixture  description' );
	expect( found.find( '.desc p.authors cite' ).text() ).toBe( 'By Fixture Author' );
	expect( found.find( '.desc p.authors cite a' ).attributes( 'href' ) ).toBe( 'https://example.org/' );
	expect( found.find( '.plugin-card-bottom .star-rating .screen-reader-text' ).text() ).toBe( '4.0 rating based on 5 ratings' );
	expect( found.findAll( '.star-rating .star-full' ) ).toHaveLength( 4 );
	expect( found.findAll( '.star-rating .star-empty' ) ).toHaveLength( 1 );
	expect( found.find( '.num-ratings' ).text() ).toBe( '(5)' );
	expect( found.find( '.column-updated' ).text() ).toBe( 'Last Updated: 11 months ago' );
	expect( found.find( '.column-downloaded' ).text() ).toBe( '1,000+ Active Installations' );
	expect( found.find( '.column-compatibility span.compatibility-compatible' ).text() ).toBe( 'Compatible with your version of WordPress' );
	expect( found.find( '.column-compatibility strong' ).text() ).toBe( 'Compatible' );
} );

test( 'tabs: each tab\'s text, the navigation on the other tabs, Favorites without the search, and no cards', async () => {
	const beta = installData( 'beta', { tabs: tabs( 'beta' ), notice: 'You are using a development version of WordPress. These feature plugins are also under development. <a href="https://make.wordpress.org/core/handbook/about/release-cycle/features-as-plugins/">Learn more</a>.' } );
	let wrapper = await mountInstall( beta );
	expect( wrapper.find( '.wp-admin-plugin-install > p:not(:first-of-type) a' ).exists() ).toBe( true );
	expect( wrapper.findAll( '.tablenav' ).map( ( nav ) => nav.classes() ) ).toEqual( [ [ 'tablenav', 'top' ], [ 'tablenav', 'bottom' ] ] );
	expect( wrapper.find( '.tablenav.top .displaying-num' ).text() ).toBe( '3 items' );
	expect( wrapper.find( '.plugins-popular-tags-wrapper' ).exists() ).toBe( false );
	wrapper.unmount();

	wrapper = await mountInstall( installData( 'favorites' ) );
	expect( wrapper.find( 'form.search-plugins' ).exists() ).toBe( false );
	expect( wrapper.find( 'p.favorites-username #user' ).exists() ).toBe( true );
	wrapper.unmount();

	wrapper = await mountInstall( installData( 'popular', { cards: [] } ) );
	expect( wrapper.find( '#the-list .no-plugin-results' ).text() ).toBe( 'No plugins found. Try a different search.' );
	wrapper.unmount();

	// A tab without the table (a plugin's tab, Favorites without a username) shows no list.
	wrapper = await mountInstall( installData( 'popular', { showTable: false } ) );
	expect( wrapper.find( '#the-list' ).exists() ).toBe( false );
} );

test( 'tabs: the API\'s error is the classic error notice, and Try Again reads the page again', async () => {
	const record = host();
	const wrapper = await mountInstall( installData( 'popular', { cards: [], apiError: true, noItems: 'An unexpected error occurred. Something may be wrong with WordPress.org or this server&#8217;s configuration.' } ), record );
	const notice = wrapper.find( '#the-list .notice.notice-error.inline' );
	expect( notice.find( 'p' ).text() ).toBe( 'An unexpected error occurred. Something may be wrong with WordPress.org or this server’s configuration.' );
	await notice.find( 'button.try-again' ).trigger( 'click' );
	expect( record.refreshed ).toBe( 1 );
} );

test( 'tabs: cards in groups under their heading, as display_rows() prints them', async () => {
	expect( groupCards( [ { slug: 'a', group: 'Tools' }, { slug: 'b', group: 'Tools' }, { slug: 'c', group: null }, { slug: 'd', group: 'Social' } ] ).map( ( run ) => [ run.group, run.cards.map( ( item ) => item.slug ) ] ) ).toEqual( [ [ 'Tools', [ 'a', 'b' ] ], [ null, [ 'c' ] ], [ 'Social', [ 'd' ] ] ] );
	const wrapper = await mountInstall( installData( 'recommended', { cards: [ card( 'alpha', { group: 'Tools' } ), card( 'beta', { group: 'Tools' } ) ] } ) );
	expect( wrapper.find( '#the-list .plugin-group h3' ).text() ).toBe( 'Tools' );
	expect( wrapper.findAll( '#the-list .plugin-group .plugin-items .plugin-card' ) ).toHaveLength( 2 );
} );

test( 'install then activate: Installing..., Installed!, the fresh card\'s Activate; Activating..., Activated!, then Active, with updates.js\'s events', async () => {
	jest.useFakeTimers();
	const record = host();
	api.respondWith( async ( method, route ) => {
		if ( route === INSTALL ) {
			return installAnswer();
		}
		return { activate: 'plugin', slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', plugin: FILE, card: card( 'e2e-test-plugin', { button: button( 'active' ) } ) };
	} );
	const wrapper = await mountInstall( installData( 'featured', { query: { tab: 'featured' } } ), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.install-now' ).text() ).toBe( 'Installing...' );
	await settle();
	expect( api.calls[ 0 ] ).toEqual( { method: 'POST', route: INSTALL, payload: { slug: 'e2e-test-plugin', screen: 'plugin-install', query: { tab: 'featured' } } } );
	const installed = cardOf( wrapper, 'e2e-test-plugin' ).find( '.install-now' );
	expect( installed.text() ).toBe( 'Installed!' );
	expect( installed.classes() ).toEqual( expect.arrayContaining( [ 'updated-message', 'installed', 'button-disabled' ] ) );
	expect( record.spoken ).toEqual( [ 'Installing... please wait.', 'Installation completed successfully.' ] );
	jest.advanceTimersByTime( 1000 );
	await settle();
	const activate = cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.activate-now' );
	expect( activate.text() ).toBe( 'Activate' );
	expect( activate.classes() ).toEqual( [ 'button', 'button-compact', 'button-primary', 'activate-now' ] );
	await activate.trigger( 'click' );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.activate-now' ).text() ).toBe( 'Activating...' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: ACTIVATE, payload: { plugin: FILE, screen: 'plugin-install', query: { tab: 'featured' } } } );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.activate-now' ).text() ).toBe( 'Activated!' );
	jest.advanceTimersByTime( 1000 );
	await settle();
	const active = cardOf( wrapper, 'e2e-test-plugin' ).find( 'button.button-disabled' );
	expect( active.text() ).toBe( 'Active' );
	expect( active.attributes( 'disabled' ) ).toBeDefined();
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-installing', 'wp-plugin-install-success', 'wp-plugin-activate-success' ] );
	expect( events[ 0 ][ 1 ] ).toEqual( { slug: 'e2e-test-plugin' } );
	expect( events[ 1 ][ 1 ] ).toEqual( { install: 'plugin', slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', plugin: FILE, activate: 'plugin' } );
	expect( events[ 2 ][ 1 ] ).toEqual( { activate: 'plugin', slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', plugin: FILE } );
	expect( record.spoken ).toContain( 'Activation completed successfully.' );
} );

test( 'button states: Installed, Active, Update Now and the incompatible plugin\'s disabled Install Now with its PHP notice', async () => {
	const notice = 'This plugin does not work with your version of PHP. <a href="https://wordpress.org/support/update-php/">Learn more about updating PHP</a>.';
	const wrapper = await mountInstall( installData( 'featured', { cards: [
		card( 'alpha', { button: button( 'installed' ) } ),
		card( 'beta', { button: button( 'active' ) } ),
		card( 'e2e-test-plugin', { button: button( 'update' ) } ),
		card( 'gamma', { button: button( 'incompatible' ), compatibility: { wordpress: true, php: false, tested: true, status: 'compatible', text: '<strong>Compatible</strong> with your version of WordPress', notice } } ),
	] } ) );
	expect( cardOf( wrapper, 'alpha' ).find( '.plugin-action-buttons button' ).text() ).toBe( 'Installed' );
	expect( cardOf( wrapper, 'alpha' ).find( '.plugin-action-buttons button' ).classes() ).toEqual( [ 'button', 'button-compact', 'button-disabled' ] );
	expect( cardOf( wrapper, 'beta' ).find( '.plugin-action-buttons button' ).text() ).toBe( 'Active' );
	const update = cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.update-now' );
	expect( update.classes() ).toEqual( [ 'update-now', 'button', 'button-compact', 'aria-button-if-js' ] );
	expect( update.attributes( 'data-plugin' ) ).toBe( FILE );
	expect( update.text() ).toBe( 'Update Now' );
	const gamma = cardOf( wrapper, 'gamma' );
	expect( gamma.find( '.plugin-action-buttons button.button-disabled' ).text() ).toBe( 'Install Now' );
	expect( gamma.find( '.plugin-action-buttons button' ).attributes( 'disabled' ) ).toBeDefined();
	const shown = gamma.find( ':scope > .notice.inline.notice-error.notice-alt p' );
	expect( shown.text() ).toBe( 'This plugin does not work with your version of PHP. Learn more about updating PHP.' );
	expect( shown.find( 'a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/support/update-php/' );
	// A disabled button never posts.
	await gamma.find( '.plugin-action-buttons button' ).trigger( 'click' );
	expect( api.calls ).toEqual( [] );
	// What the step names, in updates.js's texts.
	expect( cardButton( button( 'install' ), { phase: 'install-failed' }, 'X' ) ).toMatchObject( { text: 'Installation failed.', ariaLabel: 'X installation failed' } );
	expect( cardButton( button( 'update' ), { phase: 'updated' }, 'X' ) ).toMatchObject( { text: 'Updated!', ariaLabel: 'X updated!' } );
	expect( cardButton( button( 'activate' ), { phase: 'activate-failed' }, 'X' ) ).toMatchObject( { text: 'Activation failed.', ariaLabel: 'X activation failed' } );
} );

test( 'update: Update Now posts the update for this screen, Updating..., Updated!, then the fresh card', async () => {
	jest.useFakeTimers();
	api.respondWith( async () => ( { update: 'plugin', plugin: FILE, slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', oldVersion: '1.0', newVersion: '2.0', card: card( 'e2e-test-plugin', { button: button( 'installed' ) } ) } ) );
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { button: button( 'update' ) } ) ] } ) );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.update-now' ).trigger( 'click' );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.update-now' ).text() ).toBe( 'Updating...' );
	await settle();
	expect( api.calls[ 0 ] ).toEqual( { method: 'POST', route: UPDATE, payload: { plugin: FILE, screen: 'plugin-install', query: { tab: 'featured' } } } );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.update-now' ).text() ).toBe( 'Updated!' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-plugin-updating', 'wp-plugin-update-success' ] );
	expect( events[ 0 ][ 1 ] ).toEqual( { plugin: FILE, slug: 'e2e-test-plugin' } );
	expect( events[ 1 ][ 1 ] ).toEqual( { update: 'plugin', plugin: FILE, slug: 'e2e-test-plugin', pluginName: 'E2E Test Plugin', oldVersion: '1.0', newVersion: '2.0' } );
	jest.advanceTimersByTime( 1000 );
	await settle();
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.plugin-action-buttons button' ).text() ).toBe( 'Installed' );
} );

test( 'install: jobs run one at a time; a second click on a queued plugin queues nothing', async () => {
	let release;
	api.respondWith( ( method, route, payload ) => new Promise( ( resolve ) => {
		release = () => resolve( installAnswer( { slug: payload.slug, card: null } ) );
	} ) );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	await cardOf( wrapper, 'alpha' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload.slug ) ).toEqual( [ 'e2e-test-plugin' ] );
	expect( cardOf( wrapper, 'alpha' ).find( '.install-now' ).text() ).toBe( 'Installing...' );
	release();
	await settle();
	expect( api.calls.map( ( call ) => call.payload.slug ) ).toEqual( [ 'e2e-test-plugin', 'alpha' ] );
	release();
	await settle();
} );

test( 'new data for the page shown (a live search in place, a reload) keeps the queue and the cards\' states; leaving meanwhile asks updates.js\'s question', async () => {
	let release;
	api.respondWith( ( method, route, payload ) => new Promise( ( resolve ) => {
		release = () => resolve( installAnswer( { slug: payload.slug, card: null } ) );
	} ) );
	const warnings = [];
	const pageState = { setDirty() {}, isDirty: () => false, setLeaveWarning: ( message ) => warnings.push( message ) };
	const data = shallowRef( installData() );
	const wrapper = await mountInstall( data, host(), { pageState } );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	await cardOf( wrapper, 'alpha' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	expect( warnings.at( -1 ) ).toBe( 'Updates may not complete if you navigate away from this page.' );

	data.value = installData( 'search' );
	await settle();
	expect( cardOf( wrapper, 'alpha' ).find( '.install-now' ).text() ).toBe( 'Installing...' );
	release();
	await settle();
	// The waiting install still runs.
	expect( api.calls.map( ( call ) => call.payload.slug ) ).toEqual( [ 'e2e-test-plugin', 'alpha' ] );
	release();
	await settle();
	expect( warnings.at( -1 ) ).toBe( null );
} );

test( 'dependencies: the disabled Install Now and the dependency notice with its More Details', async () => {
	api.respondWith( async () => information() );
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'detached-dependent', {
		button: button( 'install', { ariaLabel: null, disabled: true, request: null } ),
		dependencies: { text: 'Additional plugins are required', names: [ { name: 'E2E Test Plugin', detailsSlug: 'e2e-test-plugin' }, { name: 'missing-one', detailsSlug: null } ] },
	} ) ] } ) );
	const found = cardOf( wrapper, 'detached-dependent' );
	expect( found.find( '.plugin-action-buttons button.install-now' ).attributes( 'disabled' ) ).toBeDefined();
	const notice = found.find( '.plugin-dependencies.notice.notice-alt.notice-info.inline' );
	expect( notice.find( 'p.plugin-dependencies-explainer-text strong' ).text() ).toBe( 'Additional plugins are required' );
	const names = notice.findAll( '.plugin-dependency' );
	expect( names.map( ( entry ) => entry.find( '.plugin-dependency-name' ).text() ) ).toEqual( [ 'E2E Test Plugin', 'missing-one' ] );
	expect( names[ 1 ].find( 'a' ).exists() ).toBe( false );
	const more = names[ 0 ].find( 'a.more-details-link' );
	expect( more.attributes( 'aria-label' ) ).toBe( 'More information about E2E Test Plugin' );
	await more.trigger( 'click' );
	await settle();
	expect( wrapper.find( 'dialog#plugin-information' ).exists() ).toBe( true );
	expect( api.calls[ 0 ] ).toEqual( { method: 'GET', route: 'wp-admin/v1/plugins/information', payload: { slug: 'e2e-test-plugin', section: 'description' } } );
} );

test( 'details: More Details and the name open the dialog; its footer Install Now installs and the dialog reads again', async () => {
	let installedYet = false;
	api.respondWith( async ( method, route ) => {
		if ( route === INSTALL ) {
			installedYet = true;
			return installAnswer();
		}
		return information( { button: installedYet ? { action: 'activate', label: 'Activate', disabled: false, request: { method: 'POST', path: 'plugins/activate', body: { plugin: FILE } } } : { action: 'install', label: 'Install Now', disabled: false, request: { method: 'POST', path: 'plugins/install', body: { slug: 'e2e-test-plugin' } } } } );
	} );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'h3 a' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'dialog#plugin-information #plugin-information-name' ).text() ).toBe( 'E2E Test Plugin' );
	await wrapper.find( '#plugin-information .plugin-information-close' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'dialog#plugin-information' ).exists() ).toBe( false );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( '.plugin-action-buttons li:nth-child(2) a' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#plugin-information-footer #plugin_install_from_iframe' ).trigger( 'click' );
	await settle();
	expect( api.calls.filter( ( call ) => call.route === INSTALL ) ).toEqual( [ { method: 'POST', route: INSTALL, payload: { slug: 'e2e-test-plugin', screen: 'plugin-install', query: { tab: 'featured' } } } ] );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.install-now' ).text() ).toBe( 'Installed!' );
	expect( wrapper.find( '#plugin-information-footer .activate-now' ).text() ).toBe( 'Activate' );
	expect( api.calls.filter( ( call ) => call.method === 'GET' ) ).toHaveLength( 3 );
} );

test( 'details: the footer\'s Activate posts its request and goes where the activation leads', async () => {
	const record = host();
	api.respondWith( async ( method, route ) => ( route === ACTIVATE ? { redirect: 'plugins.php?activate=true', location: null } : information( { button: { action: 'activate', label: 'Activate', disabled: false, request: { method: 'POST', path: 'plugins/activate', body: { plugin: FILE } } } } ) ) );
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'h3 a' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#plugin-information-footer .activate-now' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: ACTIVATE, payload: { plugin: FILE } } );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?activate=true', location: null } ] );
	expect( wrapper.find( 'dialog#plugin-information' ).exists() ).toBe( false );
} );

test( 'details: the information address opens the dialog on its plugin and section at once', async () => {
	api.respondWith( async () => information() );
	const wrapper = await mountInstall( installData( 'featured', { information: { slug: 'e2e-test-plugin', section: 'changelog' } } ) );
	expect( api.calls[ 0 ] ).toEqual( { method: 'GET', route: 'wp-admin/v1/plugins/information', payload: { slug: 'e2e-test-plugin', section: 'changelog' } } );
	expect( wrapper.find( '#plugin-information-tabs a.current' ).text() ).toBe( 'Changelog' );
	expect( wrapper.find( '#section-changelog' ).text() ).toBe( '2.0Second.' );
} );

test( 'popular tags: the cloud with its sizes and labels, each a search by tag; the API\'s error in their place', async () => {
	let wrapper = await mountInstall();
	const tags = wrapper.findAll( '.plugins-popular-tags-wrapper p.popular-tags a.tag-cloud-link' );
	expect( tags.map( ( tag ) => [ tag.text(), tag.attributes( 'href' ), tag.attributes( 'style' ), tag.attributes( 'aria-label' ) ] ) ).toEqual( [
		[ 'fixture-big', '/wp-admin/plugin-install.php?tab=search&type=tag&s=fixture-big', 'font-size: 22pt;', 'fixture-big (10 plugins)' ],
		[ 'fixture-small', '/wp-admin/plugin-install.php?tab=search&type=tag&s=fixture-small', 'font-size: 8pt;', 'fixture-small (1 plugin)' ],
	] );
	expect( wrapper.find( '.plugins-popular-tags-wrapper > p:not(.popular-tags)' ).text() ).toBe( 'You may also browse based on the most popular tags in the Plugin Directory:' );
	wrapper.unmount();
	wrapper = await mountInstall( installData( 'featured', { popularTags: [], popularTagsError: 'An unexpected error occurred.' } ) );
	expect( wrapper.find( 'p.popular-tags' ).text() ).toBe( 'An unexpected error occurred.' );
} );

test( 'hook html: a card\'s added links, a plugin\'s tab and the tabs plugins filtered are plugin output, with their scripts', async () => {
	const wrapper = await mountInstall( installData( 'detached_fixture', {
		tabs: tabs( 'detached_fixture', [ [ 'detached_fixture', 'Fixture tab' ] ] ),
		showTable: false,
		cards: [],
		tabHtml: '<div class="detached-fixture-install-tab">Fixture install tab</div><script>window.__ran = "tab";</script>',
	} ) );
	await settle();
	expect( wrapper.find( '.detached-fixture-install-tab' ).text() ).toBe( 'Fixture install tab' );
	expect( window.__ran ).toBe( 'tab' );
	expect( wrapper.find( '.filter-links li.plugin-install-detached_fixture a' ).classes() ).toEqual( [ 'current' ] );
	wrapper.unmount();

	const links = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { actionsHtml: '<li><a class="detached-fixture-install-action" href="#">Fixture install link</a></li>' } ) ] } ) );
	await settle();
	const added = cardOf( links, 'e2e-test-plugin' ).find( '.action-links .wp-admin-legacy-html.plugin-action-buttons a.detached-fixture-install-action' );
	expect( added.text() ).toBe( 'Fixture install link' );
	// The core button and More Details stay the page's own.
	expect( cardOf( links, 'e2e-test-plugin' ).findAll( '.action-links ul.plugin-action-buttons > li' ) ).toHaveLength( 2 );
	links.unmount();

	const filtered = await mountInstall( installData( 'featured', { viewsHtml: { 'plugin-install-featured': '<a href="plugin-install.php?tab=featured" class="current">Featured</a>', fixture: '<a href="plugin-install.php?tab=fixture">Fixture view</a>' } } ) );
	await settle();
	expect( filtered.findAll( '.filter-links li' ).map( ( li ) => [ li.classes(), li.text() ] ) ).toEqual( [ [ [ 'plugin-install-featured' ], 'Featured' ], [ [ 'fixture' ], 'Fixture view' ] ] );
} );

test( 'hook html: a relative admin link in plugin output opens through the router, resolved against the admin', async () => {
	const record = host();
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { actionsHtml: '<li><a class="rel" href="update.php?action=install-plugin&amp;plugin=x&amp;_wpnonce=abc" target="_parent">Run</a></li><li><a class="off" href="https://example.org/" target="_blank">Off</a></li>' } ) ] } ), record );
	await settle();
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.rel' ).trigger( 'click' );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.off' ).trigger( 'click' );
	expect( record.navigated ).toEqual( [ '/wp-admin/update.php?action=install-plugin&plugin=x&_wpnonce=abc' ] );
	const anchor = ( href, target = null ) => {
		const a = document.createElement( 'a' );
		a.setAttribute( 'href', href );
		if ( target ) {
			a.setAttribute( 'target', target );
		}
		return { target: a, defaultPrevented: false };
	};
	expect( legacyLinkPath( anchor( 'plugins.php?action=activate&plugin=x' ) ) ).toBe( 'plugins.php?action=activate&plugin=x' );
	expect( legacyLinkPath( anchor( 'network/plugins.php' ) ) ).toBe( 'network/plugins.php' );
	expect( legacyLinkPath( anchor( 'plugins.php', '_blank' ) ) ).toBeNull();
	expect( legacyLinkPath( anchor( '#' ) ) ).toBeNull();
	expect( legacyLinkPath( anchor( 'javascript:alert(1)' ) ) ).toBeNull();
	expect( legacyLinkPath( anchor( '/wp-admin/plugins.php' ) ) ).toBeNull();
	expect( legacyLinkPath( anchor( '../evil.php' ) ) ).toBeNull();
} );

test( 'a failed answer: an install says Installation failed. on the card with the classic notice; dismissing it hides the notice', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Download failed. A valid URL was not provided.' );
	} );
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	const found = cardOf( wrapper, 'e2e-test-plugin' );
	expect( found.classes() ).toContain( 'plugin-card-update-failed' );
	expect( found.find( '.install-now' ).text() ).toBe( 'Installation failed.' );
	expect( found.find( '.notice.notice-error.notice-alt.is-dismissible[role="alert"] p' ).text() ).toBe( 'Installation failed: Download failed. A valid URL was not provided.' );
	expect( record.spoken ).toContainEqual( [ 'Installation failed: Download failed. A valid URL was not provided.', 'assertive' ] );
	expect( events.at( -1 ) ).toEqual( [ 'wp-plugin-install-error', { install: 'plugin', slug: 'e2e-test-plugin', errorCode: 'fixture_failure', errorMessage: 'Download failed. A valid URL was not provided.' } ] );
	await found.find( '.notice-dismiss' ).trigger( 'click' );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.notice-error' ).exists() ).toBe( false );
} );

test( 'a failed answer: an update says Update failed. with the notice; an activation says Activation failed. and fires wp-plugin-activate-error', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { button: button( 'update' ) } ), card( 'alpha', { button: button( 'activate', { file: 'alpha/alpha.php', request: { method: 'POST', path: 'plugins/activate', body: { plugin: 'alpha/alpha.php' } } } ) } ) ] } ), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.update-now' ).trigger( 'click' );
	await settle();
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.update-now' ).text() ).toBe( 'Update failed.' );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.update-message.notice-error p' ).text() ).toBe( 'Update failed: Fixture failure.' );
	await cardOf( wrapper, 'alpha' ).find( 'a.activate-now' ).trigger( 'click' );
	await settle();
	expect( cardOf( wrapper, 'alpha' ).find( '.plugin-action-buttons a' ).text() ).toBe( 'Activation failed.' );
	expect( record.spoken ).toContainEqual( [ 'Activation failed: Fixture failure.', 'assertive' ] );
	expect( events.at( -1 ) ).toEqual( [ 'wp-plugin-activate-error', { activate: 'plugin', slug: 'alpha', pluginName: 'Plugin alpha', errorCode: 'fixture_failure', errorMessage: 'Fixture failure.' } ] );
} );

test( 'a failed answer: a card activation that fatals leads to the classic error page its error gives', async () => {
	const record = host();
	const redirect = 'plugins.php?error=true&plugin=e2e-test-plugin%2Fe2e-test-plugin.php&_error_nonce=abc';
	api.respondWith( async () => {
		throw apiError( 'Plugin could not be activated because it triggered a fatal error.', 500, 'plugin_activation_fatal', { status: 500, redirect, location: null } );
	} );
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', { button: button( 'activate' ) } ) ] } ), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.activate-now' ).trigger( 'click' );
	await settle();
	expect( record.followed ).toEqual( [ { redirect, location: null } ] );
	expect( events.at( -1 )[ 0 ] ).toBe( 'wp-plugin-activate-error' );
} );

test( 'credentials pause: the dialog opens; submitted, the install resumes with them; cancelled, the job is dropped once and a later job still starts', async () => {
	let needs = true;
	api.respondWith( async ( method, route, payload ) => {
		if ( needs && ! payload.credentials ) {
			throw credentialsError();
		}
		return installAnswer( { slug: payload.slug, card: null } );
	} );
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	const dialog = wrapper.find( '#request-filesystem-credentials-dialog' );
	expect( dialog.find( 'h1' ).text() ).toBe( 'Connection Information' );
	await dialog.find( '#hostname' ).setValue( 'ftp.example.org' );
	await dialog.find( '#username' ).setValue( 'deploy' );
	await dialog.find( '#password' ).setValue( 's3cret' );
	await dialog.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload.credentials?.password ?? null ) ).toEqual( [ null, 's3cret' ] );
	expect( cardOf( wrapper, 'e2e-test-plugin' ).find( '.install-now' ).text() ).toBe( 'Installed!' );
	expect( JSON.stringify( events ) ).not.toContain( 's3cret' );
	wrapper.unmount();

	api.reset();
	events.length = 0;
	api.respondWith( async ( method, route, payload ) => {
		if ( needs ) {
			throw credentialsError();
		}
		return installAnswer( { slug: payload.slug, card: null } );
	} );
	const again = await mountInstall( installData(), record );
	await cardOf( again, 'e2e-test-plugin' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	await again.find( '#request-filesystem-credentials-dialog button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( events.filter( ( [ name ] ) => name === 'credential-modal-cancel' ).map( ( [ , job ] ) => job ) ).toEqual( [ { action: 'install-plugin', data: { slug: 'e2e-test-plugin' } } ] );
	expect( cardOf( again, 'e2e-test-plugin' ).find( 'a.install-now' ).text() ).toBe( 'Install Now' );
	needs = false;
	await cardOf( again, 'alpha' ).find( 'a.install-now' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ).payload.slug ).toBe( 'alpha' );
	expect( cardOf( again, 'alpha' ).find( '.install-now' ).text() ).toBe( 'Installed!' );
} );

test( 'the refusal: the classic text in place of the page', async () => {
	const wrapper = await mountInstall( { context: 'site', query: {}, refusal: { status: 403, heading: null, message: 'Sorry, you are not allowed to install plugins on this site.' }, title: 'Add Plugins' } );
	expect( wrapper.find( '.wp-admin-plugin-install' ).exists() ).toBe( false );
	expect( wrapper.text() ).toContain( 'Sorry, you are not allowed to install plugins on this site.' );
} );

test( 'a network whose admin is on another host: the page loads the address WordPress gives', async () => {
	const record = host();
	await mountInstall( { context: 'site', query: {}, refusal: null, title: 'Add Plugins', location: 'https://network.example.org/wp-admin/network/plugin-install.php' }, record );
	expect( record.followed ).toEqual( [ { redirect: null, location: 'https://network.example.org/wp-admin/network/plugin-install.php' } ] );
} );

test( 'as text: a card\'s name, description and author, and the plugin tab text, run nothing', async () => {
	const wrapper = await mountInstall( installData( 'featured', { cards: [ card( 'e2e-test-plugin', {
		name: '<img src=x onerror="window.__ran=1">Name',
		description: '<script>window.__ran=1</script>Desc',
		author: 'By <a href="javascript:window.__ran=1" onclick="window.__ran=1">A</a><img src=x onerror="window.__ran=1">',
		compatibility: { wordpress: true, php: true, tested: true, status: 'compatible', text: '<img src=x onerror="window.__ran=1">Compatible', notice: '<script>window.__ran=1</script>x' },
	} ) ] } ) );
	await settle();
	const found = cardOf( wrapper, 'e2e-test-plugin' );
	expect( found.find( 'h3 a' ).text() ).toBe( '<img src=x onerror="window.__ran=1">Name' );
	expect( found.find( '.desc p' ).text() ).toBe( '<script>window.__ran=1</script>Desc' );
	expect( found.find( 'img:not(.plugin-icon)' ).exists() ).toBe( false );
	expect( found.find( 'script' ).exists() ).toBe( false );
	expect( found.find( '.authors [onclick]' ).exists() ).toBe( false );
	expect( found.find( '.authors a[href^="javascript"]' ).exists() ).toBe( false );
	expect( found.find( '.authors' ).text() ).toBe( 'By A' );
	expect( window.__ran ).toBeUndefined();
} );
