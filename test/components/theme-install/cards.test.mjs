/** @jest-environment jsdom */
// The page and its cards on Add Themes (theme-install.php, its tmpl-theme, theme.js and
// updates.js): the page from its data, the tabs and the next page as the last card comes into
// view, Install then Activate, the button states, Live Preview, the plugin tab and the events, the
// refusal and the other host, and each failed answer.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { mergeCard } from '../../../site/components/core/theme-install.js';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import {
	DIRECTORY, INSTALL, apiError, button, card, cardOf, cardSlugs, credentialsError, directory, host, installAnswer, installData,
	loadContracts, mountInstall, reads, settle, stubJQuery, stubObserver,
} from './data.mjs';

const bodyClass = document.body.className;
let events = [];

beforeEach( async () => {
	api.reset();
	api.respondWith( async ( method, route ) => ( route === DIRECTORY ? directory() : {} ) );
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	events = stubJQuery();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.body.className = bodyClass;
	delete window.jQuery;
	delete window.__ran;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

test( 'page from data: the Upload Theme toggle, the hidden headings, the four tabs with Popular current, the feature filter, the search, the count and the cards', async () => {
	const wrapper = await mountInstall();
	const toggle = wrapper.find( 'button.upload-view-toggle.page-title-action' );
	expect( [ toggle.text(), toggle.attributes( 'aria-expanded' ) ] ).toEqual( [ 'Upload Theme', 'false' ] );
	expect( wrapper.findAll( 'h2.screen-reader-text' ).map( ( found ) => found.text() ) ).toEqual( [ 'Filter themes list', 'Themes list' ] );
	const tabs = wrapper.findAll( '.wp-filter .filter-links li a' );
	expect( tabs.map( ( a ) => [ a.text(), a.attributes( 'data-sort' ), a.classes( 'current' ) ] ) ).toEqual( [
		[ 'Popular', 'popular', true ],
		[ 'Latest', 'new', false ],
		[ 'Block Themes', 'block-themes', false ],
		[ 'Favorites', 'favorites', false ],
	] );
	expect( tabs[ 0 ].attributes( 'aria-current' ) ).toBe( 'page' );
	expect( wrapper.find( 'button.drawer-toggle' ).text() ).toBe( 'Feature Filter' );
	expect( wrapper.find( 'form.search-form label[for="wp-filter-search-input"]' ).text() ).toBe( 'Search Themes' );
	expect( wrapper.find( '#wp-filter-search-input' ).attributes( 'aria-describedby' ) ).toBe( 'live-search-desc' );
	expect( reads( api.calls ) ).toEqual( [ { browse: 'popular' } ] );
	expect( wrapper.find( '.filter-count .count.theme-count' ).text() ).toBe( '3' );
	expect( cardSlugs( wrapper ) ).toEqual( [ 'e2e-test-theme', 'detached-needs-php', 'detached-block' ] );
	expect( wrapper.find( '.theme-browser' ).classes() ).toEqual( expect.arrayContaining( [ 'content-filterable', 'rendered' ] ) );
	expect( wrapper.find( 'div.theme-install-overlay' ).exists() ).toBe( false );
	expect( wrapper.find( 'p.no-themes' ).text() ).toBe( 'No themes found. Try a different search.' );
	expect( wrapper.find( 'span.spinner' ).exists() ).toBe( true );
	expect( wrapper.record.spoken ).toContain( 'Number of Themes found: 3' );
} );

test( 'page from data: a card as tmpl-theme prints it: screenshot, Details & Preview, By the author, the name, Install with its label, Preview', async () => {
	const wrapper = await mountInstall();
	const found = cardOf( wrapper, 'e2e-test-theme' );
	expect( found.attributes( 'tabindex' ) ).toBe( '0' );
	expect( found.find( '.theme-screenshot img' ).attributes( 'src' ) ).toBe( 'https://wp-themes.invalid/e2e-test-theme/screenshot.png?ver=1.0' );
	expect( found.find( 'button.more-details' ).text() ).toBe( 'Details & Preview' );
	expect( found.find( '.theme-author' ).text() ).toBe( 'By Fixture Author' );
	expect( found.find( 'h3.theme-name' ).text() ).toBe( 'E2E Test Theme' );
	const install = found.find( '.theme-actions a.theme-install' );
	expect( [ install.text(), install.attributes( 'aria-label' ), install.attributes( 'data-slug' ), install.classes() ] ).toEqual( [ 'Install', 'Install E2E Test Theme', 'e2e-test-theme', [ 'button', 'button-primary', 'button-compact', 'theme-install' ] ] );
	expect( found.find( '.theme-actions button.preview.install-theme-preview' ).text() ).toBe( 'Preview' );
	expect( found.find( '.theme-screenshot.blank' ).exists() ).toBe( false );
} );

test( 'page from data: the body has show-upload-view while the upload form shows, and the toggle hides it again', async () => {
	const wrapper = await mountInstall();
	await wrapper.find( 'button.upload-view-toggle' ).trigger( 'click' );
	expect( [ document.body.classList.contains( 'show-upload-view' ), wrapper.find( 'button.upload-view-toggle' ).attributes( 'aria-expanded' ) ] ).toEqual( [ true, 'true' ] );
	await wrapper.find( 'button.upload-view-toggle' ).trigger( 'click' );
	expect( document.body.classList.contains( 'show-upload-view' ) ).toBe( false );
} );

test( 'page from data: `?upload` opens the upload form at once; without upload_themes there is no toggle and no form', async () => {
	const open = await mountInstall( installData( { upload: { ...installData().upload, open: true } } ) );
	expect( document.body.classList.contains( 'show-upload-view' ) ).toBe( true );
	open.unmount();
	expect( document.body.classList.contains( 'show-upload-view' ) ).toBe( false );
	const none = await mountInstall( installData( { upload: null } ) );
	expect( [ none.find( '.upload-view-toggle' ).exists(), none.find( '.upload-theme' ).exists() ] ).toEqual( [ false, false ] );
} );

test( 'tabs and paging: each tab reads its cards and sets ?browse= (Block Themes reads the full-site-editing tag; Favorites shows the form)', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	const tab = ( sort ) => wrapper.find( `.filter-links a[data-sort="${ sort }"]` );
	await tab( 'new' ).trigger( 'click' );
	await settle();
	await tab( 'block-themes' ).trigger( 'click' );
	await settle();
	await tab( 'favorites' ).trigger( 'click' );
	await settle();
	expect( reads( api.calls ) ).toEqual( [ { browse: 'popular' }, { browse: 'new' }, { tag: 'full-site-editing' }, { browse: 'favorites' } ] );
	expect( record.addressed.map( ( [ url, options ] ) => [ url, options.replace ] ) ).toEqual( [
		[ '/wp-admin/theme-install.php?browse=new', false ],
		[ '/wp-admin/theme-install.php?browse=block-themes', false ],
		[ '/wp-admin/theme-install.php?browse=favorites', false ],
	] );
	expect( tab( 'favorites' ).classes( 'current' ) ).toBe( true );
	expect( document.body.classList.contains( 'show-favorites-form' ) ).toBe( true );
} );

test( 'tabs and paging: the tab shown is not read again; the address without a browse becomes ?browse=popular, replaced', async () => {
	const record = host();
	const wrapper = await mountInstall( installData( { query: {} } ), record );
	await wrapper.find( '.filter-links a[data-sort="popular"]' ).trigger( 'click' );
	await settle();
	expect( [ reads( api.calls ), record.addressed ] ).toEqual( [ [ { browse: 'popular' } ], [ [ '/wp-admin/theme-install.php?browse=popular', { replace: true } ] ] ] );
} );

test( 'tabs and paging: info.page below info.pages watches the last card; in view, page 2 is added; the last page stops watching', async () => {
	const observed = stubObserver();
	api.respondWith( async ( method, route, payload ) => ( payload.page === 2 ? directory( [ card( 'detached-second-page' ) ], { page: 2, pages: 2, results: 4 } ) : directory( undefined, { page: 1, pages: 2, results: 4 } ) ) );
	const wrapper = await mountInstall();
	const [ watching ] = observed.live();
	expect( watching.targets[ 0 ].dataset.slug ).toBe( 'detached-block' );
	observed.fire( watching );
	await settle();
	expect( reads( api.calls ) ).toEqual( [ { browse: 'popular' }, { browse: 'popular', page: 2 } ] );
	expect( cardSlugs( wrapper ) ).toEqual( [ 'e2e-test-theme', 'detached-needs-php', 'detached-block', 'detached-second-page' ] );
	expect( observed.live() ).toEqual( [] );
} );

test( 'install then activate: Installing..., Installed!, then the answer\'s card merged in: Installed, Activate and Live Preview; Activate posts and follows', async () => {
	jest.useFakeTimers();
	const record = host();
	api.respondWith( async ( method, route ) => {
		if ( route === DIRECTORY ) {
			return directory();
		}
		if ( route === INSTALL ) {
			return installAnswer();
		}
		return { redirect: 'themes.php?activated=true', location: null };
	} );
	const wrapper = await mountInstall( installData( { query: { browse: 'popular' } } ), record );
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'a.theme-install' ).trigger( 'click' );
	const installing = cardOf( wrapper, 'e2e-test-theme' ).find( 'a.theme-install' );
	expect( [ installing.text(), installing.classes( 'updating-message' ), installing.attributes( 'aria-label' ) ] ).toEqual( [ 'Installing...', true, 'Installing E2E Test Theme...' ] );
	await settle();
	expect( api.calls.find( ( call ) => call.route === INSTALL ) ).toEqual( { method: 'POST', route: INSTALL, payload: { slug: 'e2e-test-theme', screen: 'theme-install', query: { browse: 'popular' } } } );
	const done = cardOf( wrapper, 'e2e-test-theme' ).find( '.theme-actions .button-primary' );
	expect( [ done.text(), done.classes( 'updated-message' ), done.attributes( 'aria-label' ) ] ).toEqual( [ 'Installed!', true, 'E2E Test Theme installed!' ] );
	expect( record.spoken ).toEqual( expect.arrayContaining( [ 'Installing... please wait.', 'Installation completed successfully.' ] ) );
	jest.advanceTimersByTime( 1000 );
	await settle();
	const merged = cardOf( wrapper, 'e2e-test-theme' );
	expect( merged.find( '.notice.notice-success.notice-alt p' ).text() ).toBe( 'Installed' );
	expect( merged.findAll( '.theme-actions a' ).map( ( a ) => a.text() ) ).toEqual( [ 'Activate', 'Live Preview' ] );
	expect( merged.find( 'h3.theme-name' ).text() ).toBe( 'E2E Test Theme' );
	expect( events.map( ( [ name, detail ] ) => [ name, detail ] ) ).toEqual( [
		[ 'wp-theme-installing', { slug: 'e2e-test-theme' } ],
		[ 'wp-theme-install-success', { install: 'theme', slug: 'e2e-test-theme', themeName: 'E2E Test Theme' } ],
	] );
	await merged.find( '.theme-actions a.activate' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: 'wp-admin/v1/themes/activate', payload: { stylesheet: 'e2e-test-theme' } } );
	expect( record.followed ).toEqual( [ { redirect: 'themes.php?activated=true', location: null } ] );
} );

test( 'install then activate: Live Preview and Customize open their path through the router', async () => {
	const record = host();
	api.respondWith( async () => directory( [ card( 'e2e-test-theme', { installed: true, button: button( 'activate' ), customize: { path: 'customize.php?theme=e2e-test-theme', label: 'Live Preview', disabled: false } } ) ] ) );
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'a.load-customize' ).trigger( 'click' );
	expect( record.navigated ).toEqual( [ '/wp-admin/customize.php?theme=e2e-test-theme' ] );
} );

test( 'install then activate: mergeCard() takes the answer\'s local decisions and keeps a Cannot Install the card shows', () => {
	const blocked = card( 'detached-needs-php', { button: button( 'incompatible', 'detached-needs-php' ), preview: { label: 'Preview', disabled: true } } );
	const local = { installed: false, active: false, blockTheme: false, button: button( 'install', 'detached-needs-php' ), customize: null, preview: { label: 'Preview', disabled: false } };
	expect( [ mergeCard( blocked, local ).button.action, mergeCard( blocked, local ).preview.disabled, mergeCard( card( 'a' ), installAnswer( 'a' ).card ).button.action, mergeCard( card( 'a' ), installAnswer( 'a' ).card ).name, mergeCard( card( 'a' ), null ).button.action ] ).toEqual( [ 'incompatible', true, 'activate', 'Theme a', 'install' ] );
} );

test( 'button states: Installed with Activate and Live Preview, Activated with Customize, Cannot Install with the PHP notice, Cannot Activate, and a network\'s installed card without a button', async () => {
	const php = 'This theme does not work with your version of PHP. <a href="https://wordpress.org/support/update-php/">Learn more about updating PHP</a>.';
	api.respondWith( async () => directory( [
		card( 'installed', { installed: true, button: button( 'activate', 'installed' ), customize: { path: 'customize.php?theme=installed', label: 'Live Preview', disabled: false } } ),
		card( 'active', { installed: true, active: true, button: button( 'active', 'active' ), customize: { path: 'customize.php', label: 'Customize', disabled: false } } ),
		card( 'needs-php', { compatibility: { wordpress: true, php: false, message: php }, button: button( 'incompatible', 'needs-php' ), preview: { label: 'Preview', disabled: true } } ),
		card( 'old', { installed: true, compatibility: { wordpress: false, php: true, message: 'This theme does not work with your version of WordPress.' }, button: button( 'cannot-activate', 'old' ), customize: { path: null, label: 'Live Preview', disabled: true } } ),
		card( 'network', { installed: true, button: null, customize: null } ),
	] ) );
	const wrapper = await mountInstall();
	const actions = ( slug ) => cardOf( wrapper, slug ).findAll( '.theme-actions > *' ).map( ( found ) => [ found.element.tagName.toLowerCase(), found.text(), found.classes( 'disabled' ) ] );
	expect( cardOf( wrapper, 'installed' ).find( '.notice-success p' ).text() ).toBe( 'Installed' );
	expect( actions( 'installed' ) ).toEqual( [ [ 'a', 'Activate', false ], [ 'a', 'Live Preview', false ] ] );
	expect( actions( 'active' ) ).toEqual( [ [ 'button', 'Activated', true ], [ 'a', 'Customize', false ] ] );
	expect( actions( 'needs-php' ) ).toEqual( [ [ 'button', 'Cannot Install', true ], [ 'button', 'Preview', true ] ] );
	expect( cardOf( wrapper, 'needs-php' ).find( '.notice-error p' ).text() ).toBe( 'This theme does not work with your version of PHP. Learn more about updating PHP.' );
	expect( cardOf( wrapper, 'needs-php' ).find( 'span.more-details' ).exists() ).toBe( true );
	expect( actions( 'old' ) ).toEqual( [ [ 'button', 'Cannot Activate', true ], [ 'button', 'Live Preview', true ] ] );
	expect( actions( 'network' ) ).toEqual( [ [ 'button', 'Preview', false ] ] );
} );

test( 'button states: a card without a screenshot shows the blank one; names and descriptions run nothing', async () => {
	api.respondWith( async () => directory( [ card( 'bad', { name: '<img src=x onerror="window.__ran=1">Bad', author: '<script>window.__ran=2</script>Eve', screenshot: null } ) ] ) );
	const wrapper = await mountInstall();
	expect( cardOf( wrapper, 'bad' ).find( '.theme-screenshot.blank' ).exists() ).toBe( true );
	expect( [ cardOf( wrapper, 'bad' ).find( 'h3.theme-name' ).text(), cardOf( wrapper, 'bad' ).findAll( 'img, script' ).length, window.__ran ] ).toEqual( [ '<img src=x onerror="window.__ran=1">Bad', 0, undefined ] );
} );

test( 'hooks: the plugin tab\'s output is shown as classic prints it', async () => {
	const wrapper = await mountInstall( installData( { tabHtml: '<div class="detached-fixture-theme-tab">Fixture theme tab</div>' } ) );
	expect( wrapper.find( '.wp-admin-legacy-html .detached-fixture-theme-tab' ).text() ).toBe( 'Fixture theme tab' );
} );

test( 'hooks: a failed install says Installation failed on the card, its button Installation failed., and triggers wp-theme-install-error', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === DIRECTORY ) {
			return directory();
		}
		throw apiError( 'Fixture install failure.' );
	} );
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'a.theme-install' ).trigger( 'click' );
	await settle();
	const found = cardOf( wrapper, 'e2e-test-theme' );
	expect( [ found.classes( 'theme-install-failed' ), found.find( '.notice.update-message.notice-error p' ).text(), found.find( 'a.theme-install' ).text() ] ).toEqual( [ true, 'Installation failed: Fixture install failure.', 'Installation failed.' ] );
	expect( events.at( -1 ) ).toEqual( [ 'wp-theme-install-error', { install: 'theme', slug: 'e2e-test-theme', errorCode: 'fixture_failure', errorMessage: 'Fixture install failure.' } ] );
	expect( record.spoken ).toContainEqual( [ 'Installation failed: Fixture install failure.', 'assertive' ] );
} );

test( 'hooks: a job that needs credentials opens the dialog; cancelled, the card is put back and credential-modal-cancel is triggered once', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === DIRECTORY ) {
			return directory();
		}
		throw credentialsError();
	} );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'a.theme-install' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#request-filesystem-credentials-dialog button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( events.filter( ( [ name ] ) => name === 'credential-modal-cancel' ).map( ( [ , job ] ) => job ) ).toEqual( [ { action: 'install-theme', data: { slug: 'e2e-test-theme' } } ] );
	expect( cardOf( wrapper, 'e2e-test-theme' ).find( 'a.theme-install' ).text() ).toBe( 'Install' );
} );

test( 'a failed answer: a directory read shows the classic error with Try Again, which reads again', async () => {
	let fail = true;
	api.respondWith( async () => {
		if ( fail ) {
			throw apiError( 'Fixture: the theme directory cannot be reached.', 500, 'themes_api_failed' );
		}
		return directory();
	} );
	const wrapper = await mountInstall();
	const error = wrapper.find( '.theme-browser > div.notice.notice-error' );
	expect( error.find( 'p' ).text() ).toBe( 'An unexpected error occurred. Something may be wrong with WordPress.org or this server’s configuration. If you continue to have problems, please try the support forums.' );
	fail = false;
	await error.find( 'button.try-again' ).trigger( 'click' );
	await settle();
	expect( [ reads( api.calls ), wrapper.find( '.theme-browser > div.notice.notice-error' ).exists(), cardSlugs( wrapper ).length ] ).toEqual( [ [ { browse: 'popular' }, { browse: 'popular' } ], false, 3 ] );
} );

test( 'a failed answer: an Activate shows the error in a page notice', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === DIRECTORY ) {
			return directory( [ card( 'e2e-test-theme', { installed: true, button: button( 'activate' ) } ) ] );
		}
		throw apiError( 'Fixture activate failure.' );
	} );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'a.activate' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.notices.map( ( notice ) => notice.message ) ).toContain( 'Fixture activate failure.' );
} );

test( 'the refusal: the classic text in place of the page', async () => {
	const wrapper = await mountInstall( { context: 'site', query: {}, refusal: { status: 403, heading: null, message: 'Sorry, you are not allowed to install themes on this site.' }, title: 'Add Themes' } );
	expect( [ wrapper.find( '.wp-admin-theme-install' ).exists(), wrapper.text() ] ).toEqual( [ false, 'Sorry, you are not allowed to install themes on this site.' ] );
} );

test( 'a network whose admin is on another host: the page loads the address WordPress gives, and reads nothing', async () => {
	const record = host();
	await mountInstall( { context: 'site', query: {}, refusal: null, title: 'Add Themes', location: 'https://network.example/wp-admin/network/theme-install.php' }, record );
	expect( [ record.followed, reads( api.calls ) ] ).toEqual( [ [ { redirect: null, location: 'https://network.example/wp-admin/network/theme-install.php' } ], [] ] );
} );
