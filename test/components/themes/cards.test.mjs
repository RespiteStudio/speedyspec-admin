/** @jest-environment jsdom */
// Themes (core/themes) as WordPress's data describes it (wp-admin/themes.php and its tmpl-theme
// template): the page from its data, each card's actions, Activate's request and its link a plugin
// rewrote, Customize and Live Preview through the router, Update now with updates.js's texts and
// events, the messages of the query, the current theme's buttons, a failed answer, the refusal,
// and theme texts that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import contract from '../../../site/contracts/core/themes.js';
import { stylesheets } from '../../../site/components/core/themes.js';
import { apiError, card, cardIds, cardOf, host, loadContracts, mountThemes, overlayOf, settle, stubJQuery, themesData, update, updateAnswer } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

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

test( 'the contract: a page, two segments, 1.0.0, data and page, emits saved; the page needs the themes stylesheet', () => {
	expect( contract.id ).toBe( 'core/themes' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBe( true );
	expect( Object.keys( contract.props ) ).toEqual( [ 'data', 'page' ] );
	expect( contract.emits ).toEqual( [ 'saved' ] );
	expect( stylesheets ).toEqual( [ 'themes' ] );
} );

test( 'page from data: the count, Add Theme, the search form, the cards with the active theme first, no-themes text, the title and body class', async () => {
	const wrapper = await mountThemes();
	// The page host gives the heading (the page title); the count, Add Theme and the end of the header follow it.
	expect( wrapper.find( 'h1' ).exists() ).toBe( false );
	expect( wrapper.find( 'span.title-count.theme-count' ).text() ).toBe( '3' );
	const add = wrapper.find( 'a.page-title-action' );
	expect( add.text() ).toBe( 'Add Theme' );
	expect( add.attributes( 'href' ) ).toBe( '/wp-admin/theme-install.php' );
	expect( wrapper.find( 'hr.wp-header-end' ).exists() ).toBe( true );
	const wrap = wrapper.find( '.wp-admin-themes' );
	expect( wrap.find( 'form.search-form.search-themes' ).exists() ).toBe( true );
	expect( wrap.find( '.theme-browser.rendered .themes.wp-clearfix' ).exists() ).toBe( true );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha', 'beta' ] );
	const active = cardOf( wrapper, 'twentytwentyfive' );
	expect( active.classes() ).toContain( 'active' );
	expect( active.find( 'h2.theme-name#twentytwentyfive-name' ).text() ).toBe( 'Active: Twenty Twenty-Five' );
	expect( active.find( 'h2.theme-name span' ).text() ).toBe( 'Active:' );
	const alpha = cardOf( wrapper, 'alpha' );
	expect( alpha.find( '.theme-screenshot img' ).attributes( 'src' ) ).toBe( '/wp-content/themes/alpha/screenshot.png?ver=1.0' );
	expect( alpha.find( 'button.more-details#alpha-action' ).text() ).toBe( 'Theme Details' );
	expect( alpha.find( 'button.more-details' ).attributes( 'aria-label' ) ).toBe( 'View Theme Details for Alpha' );
	expect( alpha.find( '.theme-author' ).text() ).toBe( 'By Ann Author' );
	expect( alpha.find( 'h2.theme-name#alpha-name' ).text() ).toBe( 'Alpha' );
	expect( wrapper.find( 'p.no-themes' ).text() ).toBe( 'No themes found. Try a different search.' );
	expect( wrapper.find( 'div.theme-overlay' ).exists() ).toBe( false );
	expect( document.body.classList.contains( 'themes-php' ) ).toBe( true );
	expect( wrapper.record.titles ).toContain( 'Themes' );
	wrapper.unmount();
	expect( document.body.classList.contains( 'themes-php' ) ).toBe( false );
} );

test( 'page from data: no screenshot is a blank one; no Add Theme without the data', async () => {
	const wrapper = await mountThemes( themesData( { heading: { addNew: null, searchLabel: 'Search installed themes' }, themes: [ card( 'alpha', { screenshot: null } ) ] } ) );
	expect( cardOf( wrapper, 'alpha' ).find( '.theme-screenshot.blank' ).exists() ).toBe( true );
	expect( wrapper.find( 'a.page-title-action' ).exists() ).toBe( false );
} );

test( 'actions: the active card shows Customize, an inactive one Activate and Live Preview, an incompatible one Cannot Activate and its message', async () => {
	const incompatible = card( 'old', {
		compatibility: { ok: false, message: 'This theme does not work with your version of PHP. <a href="https://wordpress.org/support/update-php/">Learn more about updating PHP</a>.' },
		actions: { activate: { request: null, href: null, label: 'Cannot Activate', disabled: true }, customize: { path: null, label: 'Live Preview', disabled: true }, delete: null },
		ariaLabels: { details: 'View Theme Details for Theme old', activate: 'Cannot Activate Theme old', customize: 'Live Preview Theme old', delete: 'Delete Theme old' },
	} );
	const wrapper = await mountThemes( themesData( { themes: [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha' } ), incompatible ] } ) );
	const active = cardOf( wrapper, 'twentytwentyfive' ).findAll( '.theme-actions a' );
	expect( active.map( ( a ) => a.text() ) ).toEqual( [ 'Customize' ] );
	expect( active[ 0 ].classes() ).toEqual( expect.arrayContaining( [ 'button', 'button-primary', 'customize', 'load-customize' ] ) );
	expect( active[ 0 ].attributes( 'aria-label' ) ).toBe( 'Customize Twenty Twenty-Five' );
	const alpha = cardOf( wrapper, 'alpha' ).findAll( '.theme-actions a' );
	expect( alpha.map( ( a ) => a.text() ) ).toEqual( [ 'Activate', 'Live Preview' ] );
	expect( alpha[ 0 ].classes() ).toEqual( expect.arrayContaining( [ 'button', 'activate' ] ) );
	expect( alpha[ 0 ].attributes( 'aria-label' ) ).toBe( 'Activate Alpha' );
	expect( alpha[ 1 ].attributes( 'href' ) ).toBe( '/wp-admin/customize.php?theme=alpha&return=%2Fwp-admin%2Fthemes.php' );
	const old = cardOf( wrapper, 'old' );
	expect( old.findAll( '.theme-actions a' ).map( ( a ) => [ a.text(), a.classes( 'disabled' ), a.attributes( 'href' ) ] ) ).toEqual( [ [ 'Cannot Activate', true, undefined ], [ 'Live Preview', true, undefined ] ] );
	expect( old.find( '.notice.notice-error.notice-alt.inline p' ).text() ).toBe( 'This theme does not work with your version of PHP. Learn more about updating PHP.' );
	await old.findAll( '.theme-actions a' )[ 0 ].trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
} );

test( 'request action follows: Activate posts its request and follows the answer', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'themes.php?activated=true', location: null } ) );
	const wrapper = await mountThemes( themesData(), record );
	await cardOf( wrapper, 'alpha' ).find( '.theme-actions a.activate' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/activate', payload: { stylesheet: 'alpha' } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'themes.php?activated=true', location: null } ] );
	// The click did not open the details.
	expect( overlayOf( wrapper ).exists() ).toBe( false );
} );

test( 'hooks: an Activate a plugin rewrote is a link the router opens, never a request', async () => {
	const record = host();
	const rewritten = card( 'alpha', { name: 'Alpha (fixture)' } );
	rewritten.actions.activate = { request: null, href: 'options-general.php?detached_fixture_theme=1', label: 'Activate', disabled: false };
	const wrapper = await mountThemes( themesData( { themes: [ card( 'twentytwentyfive', { active: true } ), rewritten ] } ), record );
	const link = cardOf( wrapper, 'alpha' ).find( '.theme-actions a.activate' );
	expect( link.attributes( 'href' ) ).toBe( '/wp-admin/options-general.php?detached_fixture_theme=1' );
	expect( cardOf( wrapper, 'alpha' ).find( 'h2.theme-name' ).text() ).toBe( 'Alpha (fixture)' );
	await link.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
	expect( record.navigated ).toEqual( [ '/wp-admin/options-general.php?detached_fixture_theme=1' ] );
} );

test( 'customize path: Live Preview and Customize open their address through the router (the hosted Customizer)', async () => {
	const record = host();
	const wrapper = await mountThemes( themesData(), record );
	await cardOf( wrapper, 'alpha' ).find( '.theme-actions a.load-customize' ).trigger( 'click' );
	await cardOf( wrapper, 'twentytwentyfive' ).find( '.theme-actions a.customize' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [
		'/wp-admin/customize.php?theme=alpha&return=%2Fwp-admin%2Fthemes.php',
		'/wp-admin/customize.php?theme=twentytwentyfive&return=%2Fwp-admin%2Fthemes.php',
	] );
	expect( api.calls ).toEqual( [] );
} );

test( 'update: Update now queues themes/update, shows Updating... then Updated!, replaces the card, gives the menu counts and triggers the events', async () => {
	const record = host();
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( updateAnswer( 'alpha' ) );
	} ) );
	const themes = [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', update: update( 'alpha' ) } ) ];
	const wrapper = await mountThemes( themesData( { themes } ), record );
	const message = () => cardOf( wrapper, 'alpha' ).find( '.update-message' );
	expect( message().classes() ).toEqual( expect.arrayContaining( [ 'notice', 'inline', 'notice-warning', 'notice-alt' ] ) );
	expect( message().text() ).toBe( 'New version available. Update now' );
	await message().find( 'a' ).trigger( 'click' );
	await settle();
	expect( message().classes() ).toContain( 'updating-message' );
	expect( message().text() ).toBe( 'Updating...' );
	expect( record.spoken ).toContain( 'Updating... please wait.' );
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/update', payload: { stylesheet: 'alpha', screen: 'themes', query: {} } } ] );
	// Not the details: the update message is an action.
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	release();
	await settle();
	expect( message().classes() ).toEqual( expect.arrayContaining( [ 'updated-message', 'notice-success' ] ) );
	expect( message().text() ).toBe( 'Updated!' );
	expect( record.spoken ).toContain( 'Update completed successfully.' );
	expect( record.menuCounts ).toEqual( [ { 'themes.php': 0 } ] );
	expect( events ).toEqual( [
		[ 'wp-theme-updating', { slug: 'alpha' } ],
		[ 'wp-theme-update-success', { update: 'theme', slug: 'alpha', themeName: 'Alpha', oldVersion: '1.0', newVersion: '2.0' } ],
	] );
	// The fresh card: version 2.0, no update offered.
	await cardOf( wrapper, 'alpha' ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-version' ).text() ).toBe( 'Version: 2.0' );
} );

test( 'update: a failed answer shows Update failed: in the card\'s notice, spoken, and the error event', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture update failure.' );
	} );
	const themes = [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', update: update( 'alpha' ) } ) ];
	const wrapper = await mountThemes( themesData( { themes } ), record );
	await cardOf( wrapper, 'alpha' ).find( '.update-message a' ).trigger( 'click' );
	await settle();
	const notice = cardOf( wrapper, 'alpha' ).find( '.update-message' );
	expect( notice.classes() ).toEqual( expect.arrayContaining( [ 'notice-error', 'notice-alt' ] ) );
	expect( notice.text() ).toBe( 'Update failed: Fixture update failure.' );
	expect( record.spoken ).toContainEqual( [ 'Update failed: Fixture update failure.', 'assertive' ] );
	expect( events.at( -1 ) ).toEqual( [ 'wp-theme-update-error', { update: 'theme', slug: 'alpha', errorCode: 'fixture_failure', errorMessage: 'Fixture update failure.' } ] );
} );

test( 'an incompatible update shows its message as an error and runs nothing', async () => {
	const themes = [ card( 'alpha', { name: 'Alpha', update: update( 'alpha', { compatible: false, request: null, message: 'There is a new version of Alpha available, but it does not work with your version of PHP.' } ) } ) ];
	const wrapper = await mountThemes( themesData( { themes } ) );
	const notice = cardOf( wrapper, 'alpha' ).find( '.update-message' );
	expect( notice.classes() ).toEqual( expect.arrayContaining( [ 'notice-error', 'notice-alt' ] ) );
	await notice.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
} );

test( 'a failed answer: Activate shows WordPress\'s message in a page notice, and stays', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Fixture activate failure.' );
	} );
	const wrapper = await mountThemes( themesData(), record );
	await cardOf( wrapper, 'alpha' ).find( '.theme-actions a.activate' ).trigger( 'click' );
	await settle();
	expect( record.notices ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Fixture activate failure.', scope: 'page' } ) ] );
	expect( record.followed ).toEqual( [] );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha', 'beta' ] );
} );

test( 'messages: each message of the query shows with its type, dismissible ones with a dismiss button', async () => {
	const wrapper = await mountThemes( themesData( { messages: [
		{ markup: 'New theme activated. <a href="http://localhost:8889/">Visit site</a>', type: 'updated', dismissible: true },
		{ markup: '<strong>Error:</strong> The parent theme is missing.', type: 'error', dismissible: false },
	] } ) );
	const shown = wrapper.findAll( '.wp-admin-themes > .notice' );
	expect( shown.map( ( notice ) => notice.find( 'p' ).text() ) ).toEqual( [ 'New theme activated. Visit site', 'Error: The parent theme is missing.' ] );
	expect( shown[ 0 ].find( 'button.notice-dismiss .screen-reader-text' ).text() ).toBe( 'Dismiss this notice.' );
	expect( shown[ 0 ].classes() ).toEqual( expect.arrayContaining( [ 'notice', 'updated', 'is-dismissible' ] ) );
	expect( shown[ 0 ].find( 'a' ).attributes( 'href' ) ).toBe( 'http://localhost:8889/' );
	expect( shown[ 1 ].classes() ).toEqual( expect.arrayContaining( [ 'notice', 'error' ] ) );
	expect( shown[ 1 ].classes() ).not.toContain( 'is-dismissible' );
	await shown[ 0 ].find( 'button.notice-dismiss' ).trigger( 'click' );
	await settle();
	expect( wrapper.findAll( '.wp-admin-themes > .notice' ) ).toHaveLength( 1 );
} );

test( 'current actions: the active theme\'s details show Customize and the current theme\'s buttons, which open their pages', async () => {
	const record = host();
	const wrapper = await mountThemes( themesData(), record );
	await cardOf( wrapper, 'twentytwentyfive' ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	const buttons = overlayOf( wrapper ).findAll( '.theme-actions .active-theme a' );
	expect( buttons.map( ( a ) => a.text() ) ).toEqual( [ 'Customize', 'Widgets', 'Menus' ] );
	expect( buttons[ 1 ].classes() ).toEqual( [ 'button', 'button-compact' ] );
	await buttons[ 1 ].trigger( 'click' );
	await buttons[ 2 ].trigger( 'click' );
	await settle();
	expect( record.navigated.slice( -2 ) ).toEqual( [ '/wp-admin/widgets.php', '/wp-admin/nav-menus.php' ] );
} );

test( 'names as text: a theme named and described with <img onerror> and <script> runs nothing on its card and in its details', async () => {
	const name = 'Bad <img src=x onerror="window.__ran=1"><script>window.__ran=2</script>';
	const themes = [ card( 'twentytwentyfive', { active: true } ), card( 'bad', { name: 'Bad ', description: 'Desc <img src=x onerror="window.__ran=3"> <script>window.__ran=4</script>', author: '<img src=x onerror="window.__ran=5">Eve', tags: '<script>window.__ran=6</script>', ariaLabels: { details: 'View Theme Details for ' + name, activate: 'Activate ' + name, customize: 'Live Preview ' + name, delete: 'Delete ' + name } } ) ];
	const wrapper = await mountThemes( themesData( { themes } ) );
	const bad = cardOf( wrapper, 'bad' );
	expect( bad.find( 'button.more-details' ).attributes( 'aria-label' ) ).toBe( 'View Theme Details for ' + name );
	expect( bad.findAll( 'script' ) ).toHaveLength( 0 );
	await bad.find( 'button.more-details' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).findAll( 'script' ) ).toHaveLength( 0 );
	expect( overlayOf( wrapper ).findAll( 'img[onerror]' ) ).toHaveLength( 0 );
	expect( window.__ran ).toBeUndefined();
} );

test( 'refusal: the classic text in place of the page', async () => {
	const wrapper = await mountThemes( { context: 'site', refusal: { status: 403, heading: 'You need a higher level of permission.', message: 'Sorry, you are not allowed to edit theme options on this site.' }, title: 'Themes' } );
	expect( wrapper.find( '.wp-admin-themes-error h2' ).text() ).toBe( 'You need a higher level of permission.' );
	expect( wrapper.find( '.wp-admin-themes-error p' ).text() ).toBe( 'Sorry, you are not allowed to edit theme options on this site.' );
	expect( wrapper.find( '.theme-browser' ).exists() ).toBe( false );
} );

test( 'a user who may only edit theme options: the active theme alone, no Activate, Delete or Add Theme', async () => {
	const only = card( 'twentytwentyfive', { active: true } );
	const wrapper = await mountThemes( themesData( { themes: [ only ], heading: { addNew: null, searchLabel: 'Search installed themes' } } ) );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive' ] );
	expect( wrapper.findAll( 'a.activate' ) ).toHaveLength( 0 );
	expect( wrapper.find( 'a.page-title-action' ).exists() ).toBe( false );
	await cardOf( wrapper, 'twentytwentyfive' ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).find( 'a.delete-theme' ).exists() ).toBe( false );
} );
