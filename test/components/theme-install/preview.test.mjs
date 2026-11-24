/** @jest-environment jsdom */
// The preview of Add Themes (tmpl-theme-preview, theme.js's Preview view): previewFrame() as the
// page decides what the frame may load, opening from a card at `?theme=`, the sidebar, Collapse,
// previous and next (and Alt with the arrow keys), Escape and Close back to the browse, Install in
// the preview, the address's `?theme=`, and a same-origin address that is never framed.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { previewFrame } from '../../../site/components/core/theme-install/preview.js';
import { DIRECTORY, INSTALL, button, card, cardOf, directory, host, installAnswer, installData, loadContracts, mountInstall, previewOf, reads, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	api.respondWith( async () => directory() );
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	delete window.__ran;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

const key = ( name, options = {} ) => document.dispatchEvent( new KeyboardEvent( 'keydown', { key: name, bubbles: true, ...options } ) );

test( 'same-origin refused: previewFrame() loads only http(s) on another origin', () => {
	expect( [
		previewFrame( 'https://wp-themes.invalid/a/', 'http://localhost:3000' ),
		previewFrame( 'http://localhost:3000/?p=1', 'http://localhost:3000' ),
		previewFrame( 'javascript:alert(1)', 'http://localhost:3000' ),
		previewFrame( '//localhost:3000/x', 'http://localhost:3000' ),
		previewFrame( null, 'http://localhost:3000' ),
		previewFrame( 'not a url', 'http://localhost:3000' ),
	] ).toEqual( [ 'https://wp-themes.invalid/a/', null, null, null, null, null ] );
} );

test( 'same-origin refused: the frame is sandboxed without allow-same-origin, with no referrer; a same-origin address shows the screenshot', async () => {
	api.respondWith( async () => directory( [ card( 'a' ), card( 'same', { previewUrl: 'http://localhost/?detached_fixture_preview=1' } ) ] ) );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'a' ).trigger( 'click' );
	const frame = previewOf( wrapper ).find( '.wp-full-overlay-main iframe' );
	expect( [ frame.attributes( 'src' ), frame.attributes( 'sandbox' ), frame.attributes( 'referrerpolicy' ), frame.attributes( 'title' ) ] ).toEqual( [ 'https://wp-themes.invalid/a/', 'allow-scripts allow-forms allow-popups', 'no-referrer', 'Preview' ] );
	await previewOf( wrapper ).find( 'button.next-theme' ).trigger( 'click' );
	expect( [ previewOf( wrapper ).find( 'iframe' ).exists(), previewOf( wrapper ).find( '.wp-full-overlay-main img' ).attributes( 'src' ) ] ).toEqual( [ false, 'https://wp-themes.invalid/same/screenshot.png?ver=1.0' ] );
} );

test( 'a card click opens the preview at ?theme= with the body classes; the sidebar shows the theme', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	const overlay = previewOf( wrapper );
	expect( [ overlay.classes(), overlay.attributes( 'aria-label' ), record.addressed.at( -1 ) ] ).toEqual( [ expect.arrayContaining( [ 'theme-install-overlay', 'wp-full-overlay', 'expanded' ] ), 'Browse Themes', [ '/wp-admin/theme-install.php?theme=e2e-test-theme', { replace: false } ] ] );
	expect( [ 'theme-installer-active', 'full-overlay-active' ].every( ( name ) => document.body.classList.contains( name ) ) ).toBe( true );
	const info = overlay.find( '.install-theme-info' );
	expect( [ info.find( 'h3.theme-name' ).text(), info.find( '.theme-by' ).text(), info.find( 'img.theme-screenshot' ).attributes( 'src' ), info.find( '.theme-version' ).text() ] ).toEqual( [ 'E2E Test Theme', 'By Fixture Author', 'https://wp-themes.invalid/e2e-test-theme/screenshot.png?ver=1.0', 'Version: 1.0' ] );
	const rating = info.find( '.theme-rating' );
	expect( [ rating.find( '.star-rating .screen-reader-text' ).text(), rating.findAll( '.star-full' ).length, rating.find( 'a.num-ratings' ).attributes( 'href' ), rating.find( 'a.num-ratings' ).text() ] ).toEqual( [ '4.0 rating based on 5 ratings', 4, 'https://wordpress.org/support/theme/e2e-test-theme/reviews/', '(5 ratings)' ] );
	expect( info.find( '.theme-description' ).text() ).toBe( 'Fixture  description' );
	expect( overlay.find( '.wp-full-overlay-header a.theme-install' ).text() ).toBe( 'Install' );
} );

test( 'Details & Preview and Preview open it too; the buttons of the actions do not', async () => {
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-theme' ).find( 'button.more-details' ).trigger( 'click' );
	expect( previewOf( wrapper ).find( 'h3.theme-name' ).text() ).toBe( 'E2E Test Theme' );
	await previewOf( wrapper ).find( 'button.close-full-overlay' ).trigger( 'click' );
	await cardOf( wrapper, 'detached-block' ).find( 'button.install-theme-preview' ).trigger( 'click' );
	expect( previewOf( wrapper ).find( 'h3.theme-name' ).text() ).toBe( 'Detached Block' );
} );

test( 'an unrated theme says so; an incompatible one shows its notice and Cannot Install', async () => {
	api.respondWith( async () => directory( [ card( 'old', { rating: { value: 0, label: '0.0 rating based on 0 ratings', count: 0, text: 'This theme has not been rated yet.', rated: false, reviewsUrl: null }, compatibility: { wordpress: false, php: true, message: 'This theme does not work with your version of WordPress.' }, button: button( 'incompatible', 'old' ) } ) ] ) );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'old' ).trigger( 'click' );
	const overlay = previewOf( wrapper );
	expect( [ overlay.find( 'span.no-rating' ).text(), overlay.find( '.notice-error.notice-large p' ).text(), overlay.find( '.wp-full-overlay-header button.button-primary.disabled' ).text() ] ).toEqual( [ 'This theme has not been rated yet.', 'This theme does not work with your version of WordPress.', 'Cannot Install' ] );
} );

test( 'Collapse hides the sidebar and says Expand Sidebar; again expands it', async () => {
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	const collapse = () => previewOf( wrapper ).find( 'button.collapse-sidebar' );
	expect( [ collapse().attributes( 'aria-expanded' ), collapse().attributes( 'aria-label' ), collapse().find( '.collapse-sidebar-label' ).text() ] ).toEqual( [ 'true', 'Collapse Sidebar', 'Collapse' ] );
	await collapse().trigger( 'click' );
	expect( [ previewOf( wrapper ).classes( 'collapsed' ), previewOf( wrapper ).classes( 'expanded' ), collapse().attributes( 'aria-expanded' ), collapse().attributes( 'aria-label' ) ] ).toEqual( [ true, false, 'false', 'Expand Sidebar' ] );
	await collapse().trigger( 'click' );
	expect( previewOf( wrapper ).classes( 'expanded' ) ).toBe( true );
} );

test( 'previous and next move through the cards (disabled at the ends), as Alt with the arrow keys do; each step is spoken and addressed', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	const name = () => previewOf( wrapper ).find( 'h3.theme-name' ).text();
	expect( previewOf( wrapper ).find( 'button.previous-theme' ).classes( 'disabled' ) ).toBe( true );
	await previewOf( wrapper ).find( 'button.next-theme' ).trigger( 'click' );
	expect( name() ).toBe( 'Detached Needs PHP' );
	key( 'ArrowRight', { altKey: true } );
	await settle();
	expect( [ name(), previewOf( wrapper ).find( 'button.next-theme' ).classes( 'disabled' ) ] ).toEqual( [ 'Detached Block', true ] );
	key( 'ArrowLeft', { altKey: true } );
	await settle();
	key( 'ArrowLeft' );
	await settle();
	expect( [ name(), record.spoken.includes( 'Theme details: Detached Needs PHP' ), record.addressed.at( -1 )[ 0 ] ] ).toEqual( [ 'Detached Needs PHP', true, '/wp-admin/theme-install.php?theme=detached-needs-php' ] );
} );

test( 'Escape and Close close it, back to the browse shown, the focus on the card\'s Details & Preview', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await wrapper.find( '.filter-links a[data-sort="new"]' ).trigger( 'click' );
	await settle();
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	key( 'Escape' );
	await settle();
	expect( [ previewOf( wrapper ).exists(), document.body.classList.contains( 'full-overlay-active' ), record.addressed.at( -1 )[ 0 ], document.activeElement === cardOf( wrapper, 'e2e-test-theme' ).find( '.more-details' ).element ] ).toEqual( [ false, false, '/wp-admin/theme-install.php?browse=new', true ] );
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	await previewOf( wrapper ).find( 'button.close-full-overlay' ).trigger( 'click' );
	expect( previewOf( wrapper ).exists() ).toBe( false );
} );

test( 'Install in the preview installs the theme; the preview then offers Activate', async () => {
	jest.useFakeTimers();
	api.respondWith( async ( method, route ) => ( route === INSTALL ? installAnswer() : directory() ) );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	await previewOf( wrapper ).find( '.wp-full-overlay-header a.theme-install' ).trigger( 'click' );
	expect( previewOf( wrapper ).find( '.wp-full-overlay-header .button-primary' ).text() ).toBe( 'Installing...' );
	await settle();
	jest.advanceTimersByTime( 1000 );
	await settle();
	expect( [ api.calls.filter( ( call ) => call.route === INSTALL ).length, previewOf( wrapper ).find( '.wp-full-overlay-header a.activate' ).text() ] ).toEqual( [ 1, 'Activate' ] );
} );

test( 'the address\'s ?theme= reads that theme and opens its preview at once', async () => {
	api.respondWith( async ( method, route, payload ) => ( route === DIRECTORY && payload.theme === 'detached-block' ? directory( [ card( 'detached-block', { name: 'Detached Block' } ) ] ) : directory() ) );
	const wrapper = await mountInstall( installData( { query: { theme: 'detached-block' }, open: 'detached-block' } ) );
	expect( [ reads( api.calls ), previewOf( wrapper ).find( 'h3.theme-name' ).text(), previewOf( wrapper ).classes( 'no-navigation' ) ] ).toEqual( [ [ { theme: 'detached-block' } ], 'Detached Block', true ] );
} );

test( 'a description with <script> and <img onerror> runs nothing', async () => {
	api.respondWith( async () => directory( [ card( 'bad', { description: 'Bad <script>window.__ran=1</script><img src=x onerror="window.__ran=2"> theme' } ) ] ) );
	const wrapper = await mountInstall();
	await cardOf( wrapper, 'bad' ).trigger( 'click' );
	await settle();
	const description = previewOf( wrapper ).find( '.theme-description' );
	expect( [ description.findAll( 'script' ).length, description.find( 'img' ).attributes( 'onerror' ), window.__ran ] ).toEqual( [ 0, undefined, undefined ] );
} );

test( 'Back and Forward between the page\'s addresses (pageState onAddress): the preview closes and opens, the tab switches, a running install goes on', async () => {
	const record = host();
	let told = null;
	let removed = 0;
	const pageState = { setDirty() {}, isDirty: () => false, setLeaveWarning() {}, onAddress: ( handler ) => {
		told = handler;
		return () => removed++;
	} };
	let finish;
	api.respondWith( ( method, route ) => ( route === INSTALL ? new Promise( ( resolve ) => {
		finish = () => resolve( installAnswer() );
	} ) : Promise.resolve( directory() ) ) );
	const wrapper = await mountInstall( installData(), record, { pageState } );
	expect( typeof told ).toBe( 'function' );
	await wrapper.find( '.filter-links a[data-sort="new"]' ).trigger( 'click' );
	await settle();
	await cardOf( wrapper, 'e2e-test-theme' ).trigger( 'click' );
	await previewOf( wrapper ).find( '.wp-full-overlay-header a.theme-install' ).trigger( 'click' );
	await settle();
	const addressed = record.addressed.length;
	const before = reads( api.calls ).length;

	// Back from the preview: it closes on the tab shown, nothing is read or written to the address.
	told( '/wp-admin/theme-install.php?browse=new' );
	await settle();
	expect( previewOf( wrapper ).exists() ).toBe( false );
	expect( [ reads( api.calls ).length, record.addressed.length ] ).toEqual( [ before, addressed ] );

	// Back across the tab change: Popular is read and current again.
	told( '/wp-admin/theme-install.php?browse=popular' );
	await settle();
	expect( wrapper.find( '.filter-links a[data-sort="popular"]' ).classes( 'current' ) ).toBe( true );
	expect( reads( api.calls ).slice( before ) ).toEqual( [ expect.objectContaining( { browse: 'popular' } ) ] );

	// The install still ends on its card; Forward to the preview opens it again.
	finish();
	await settle();
	expect( api.calls.filter( ( call ) => call.route === INSTALL ) ).toHaveLength( 1 );
	told( '/wp-admin/theme-install.php?theme=e2e-test-theme' );
	await settle();
	expect( previewOf( wrapper ).exists() ).toBe( true );
	expect( [ record.navigated, record.addressed.length ] ).toEqual( [ [], addressed ] );
	wrapper.unmount();
	expect( removed ).toBe( 1 );
} );
