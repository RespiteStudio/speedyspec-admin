/** @jest-environment jsdom */
// The theme details (theme.js's Details view, tmpl-theme-single): opened at `?theme=` in place,
// its content, previous and next with their buttons and Alt plus the arrow keys, Escape, Close and
// the backdrop returning the focus to the card, Activate and Live Preview, Delete with the classic
// question (updates.js deleteTheme()), its failed answer, and the credentials pause.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { CONFIRM_DELETE, apiError, card, cardIds, cardOf, credentialsError, deleteAnswer, host, loadContracts, mountThemes, overlayOf, settle, stubJQuery, themesData, update } from './data.mjs';

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
	delete window.jQuery;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

async function open( wrapper, id ) {
	await cardOf( wrapper, id ).find( 'button.more-details' ).trigger( 'click' );
	await settle();
	return overlayOf( wrapper );
}

const key = ( name, extra = {} ) => document.body.dispatchEvent( new KeyboardEvent( 'keydown', { key: name, bubbles: true, ...extra } ) );

test( 'Theme Details opens the overlay at ?theme= in place (a new history entry), with the theme\'s details', async () => {
	const record = host();
	const themes = [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', parent: 'Twenty Twenty-Five', tags: 'Blog, Portfolio' } ) ];
	const wrapper = await mountThemes( themesData( { themes } ), record );
	const overlay = await open( wrapper, 'alpha' );
	expect( record.addressed ).toEqual( [ [ '/wp-admin/themes.php?theme=alpha', { replace: false } ] ] );
	// No router read: the page keeps the data it has.
	expect( record.navigated ).toEqual( [] );
	expect( overlay.attributes( 'aria-label' ) ).toBe( 'Theme Details' );
	expect( overlay.attributes( 'tabindex' ) ).toBe( '0' );
	expect( document.body.classList.contains( 'modal-open' ) ).toBe( true );
	const inner = overlay.find( '.theme-overlay' );
	expect( inner.classes() ).not.toContain( 'active' );
	expect( inner.find( '.theme-backdrop' ).exists() ).toBe( true );
	expect( inner.find( '.theme-wrap .theme-header button.close .screen-reader-text' ).text() ).toBe( 'Close' );
	expect( inner.find( '.theme-screenshots .screenshot img' ).attributes( 'src' ) ).toBe( '/wp-content/themes/alpha/screenshot.png?ver=1.0' );
	expect( inner.find( '.theme-info h2.theme-name' ).text() ).toBe( 'AlphaVersion: 1.0' );
	expect( inner.find( '.theme-info .theme-version' ).text() ).toBe( 'Version: 1.0' );
	expect( inner.find( '.theme-info p.theme-author' ).text() ).toBe( 'By the WordPress team' );
	expect( inner.find( '.theme-info p.theme-author a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/' );
	expect( inner.find( 'p.theme-description' ).text() ).toBe( 'The Alpha description.' );
	expect( inner.find( 'p.parent-theme' ).text() ).toBe( 'This is a child theme of Twenty Twenty-Five.' );
	expect( inner.find( 'p.parent-theme strong' ).text() ).toBe( 'Twenty Twenty-Five' );
	expect( inner.find( 'p.theme-tags' ).text() ).toBe( 'Tags: Blog, Portfolio' );
	const actions = inner.findAll( '.theme-actions .inactive-theme a' );
	expect( actions.map( ( a ) => a.text() ) ).toEqual( [ 'Live Preview', 'Activate' ] );
	expect( inner.find( '.theme-actions a.delete-theme' ).attributes( 'aria-label' ) ).toBe( 'Delete Alpha' );
	expect( api.calls ).toEqual( [] );
} );

test( 'the active theme\'s details: Active Theme label, the active class, no Delete', async () => {
	const wrapper = await mountThemes();
	const overlay = await open( wrapper, 'twentytwentyfive' );
	expect( overlay.find( '.theme-overlay' ).classes() ).toContain( 'active' );
	expect( overlay.find( '.current-label' ).text() ).toBe( 'Active Theme' );
	expect( overlay.find( 'a.delete-theme' ).exists() ).toBe( false );
} );

test( 'the address\'s theme opens at once; previous and next move, disabled at the ends, and speak the theme', async () => {
	const record = host();
	const wrapper = await mountThemes( themesData( { open: 'alpha' } ), record );
	let overlay = overlayOf( wrapper );
	expect( overlay.find( '.theme-info h2.theme-name' ).text() ).toContain( 'Alpha' );
	await overlay.find( '.theme-header button.right' ).trigger( 'click' );
	await settle();
	overlay = overlayOf( wrapper );
	expect( overlay.find( '.theme-info h2.theme-name' ).text() ).toContain( 'Beta' );
	expect( overlay.find( 'button.right' ).classes() ).toContain( 'disabled' );
	expect( overlay.find( 'button.right' ).attributes( 'aria-disabled' ) ).toBe( 'true' );
	expect( record.spoken ).toContain( 'Theme details: Beta' );
	expect( record.addressed.at( -1 ) ).toEqual( [ '/wp-admin/themes.php?theme=beta', { replace: false } ] );
	expect( record.navigated ).toEqual( [] );
	await overlay.find( 'button.right' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-info h2.theme-name' ).text() ).toContain( 'Beta' );
	await overlayOf( wrapper ).find( 'button.left' ).trigger( 'click' );
	await overlayOf( wrapper ).find( 'button.left' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-info h2.theme-name' ).text() ).toContain( 'Twenty Twenty-Five' );
	expect( overlayOf( wrapper ).find( 'button.left' ).classes() ).toContain( 'disabled' );
} );

test( 'Alt plus the right and left arrow keys move; the arrows alone do not', async () => {
	const wrapper = await mountThemes();
	await open( wrapper, 'alpha' );
	key( 'ArrowRight' );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-info h2.theme-name' ).text() ).toContain( 'Alpha' );
	key( 'ArrowRight', { altKey: true } );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-info h2.theme-name' ).text() ).toContain( 'Beta' );
	key( 'ArrowLeft', { altKey: true } );
	await settle();
	expect( overlayOf( wrapper ).find( '.theme-info h2.theme-name' ).text() ).toContain( 'Alpha' );
} );

test( 'Escape, Close and the backdrop close the overlay at themes.php, and the focus returns to the card\'s details button', async () => {
	const record = host();
	const wrapper = await mountThemes( themesData(), record );
	await open( wrapper, 'alpha' );
	key( 'Escape' );
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	expect( document.body.classList.contains( 'modal-open' ) ).toBe( false );
	expect( document.activeElement?.id ).toBe( 'alpha-action' );
	expect( record.addressed.at( -1 ) ).toEqual( [ '/wp-admin/themes.php', { replace: false } ] );
	expect( record.navigated ).toEqual( [] );
	await open( wrapper, 'beta' );
	await overlayOf( wrapper ).find( 'button.close' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	expect( document.activeElement?.id ).toBe( 'beta-action' );
	await open( wrapper, 'alpha' );
	await overlayOf( wrapper ).find( '.theme-backdrop' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( false );
} );

test( 'Activate and Live Preview in the overlay act as on the card', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'themes.php?activated=true', location: null } ) );
	const wrapper = await mountThemes( themesData(), record );
	const overlay = await open( wrapper, 'alpha' );
	await overlay.find( '.inactive-theme a.load-customize' ).trigger( 'click' );
	await overlay.find( '.inactive-theme a.activate' ).trigger( 'click' );
	await settle();
	expect( record.navigated.at( -1 ) ).toBe( '/wp-admin/customize.php?theme=alpha&return=%2Fwp-admin%2Fthemes.php' );
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/activate', payload: { stylesheet: 'alpha' } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'themes.php?activated=true', location: null } ] );
} );

test( 'update in the overlay: Update Available with its message; Update now runs the job and shows Updated!', async () => {
	api.respondWith( async () => ( { slug: 'alpha', themeName: 'Alpha', oldVersion: '1.0', newVersion: '2.0', card: card( 'alpha', { name: 'Alpha', version: '2.0' } ), count: 3, menuCounts: { 'themes.php': 0 }, broken: null } ) );
	const themes = [ card( 'twentytwentyfive', { active: true } ), card( 'alpha', { name: 'Alpha', update: update( 'alpha' ) } ) ];
	const wrapper = await mountThemes( themesData( { themes } ) );
	const overlay = await open( wrapper, 'alpha' );
	const notice = overlay.find( '.theme-info .notice.notice-warning.notice-alt' );
	expect( notice.find( 'h3.notice-title' ).text() ).toBe( 'Update Available' );
	await notice.find( 'a' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ 'wp-admin/v1/themes/update' ] );
	expect( overlayOf( wrapper ).find( '.theme-info .notice.notice-success' ).text() ).toBe( 'Updated!' );
	expect( overlayOf( wrapper ).find( '.theme-version' ).text() ).toBe( 'Version: 2.0' );
} );

test( 'delete confirm: Cancel sends nothing; OK queues themes/delete, says Deleting..., removes the card and closes', async () => {
	const record = host();
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValueOnce( false ).mockReturnValueOnce( true );
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( deleteAnswer( 'beta' ) );
	} ) );
	const wrapper = await mountThemes( themesData(), record );
	let overlay = await open( wrapper, 'beta' );
	await overlay.find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( confirm ).toHaveBeenLastCalledWith( CONFIRM_DELETE );
	expect( api.calls ).toEqual( [] );
	overlay = overlayOf( wrapper );
	await overlay.find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( overlayOf( wrapper ).find( 'a.delete-theme' ).text() ).toBe( 'Deleting...' );
	expect( record.spoken ).toContain( 'Deleting...' );
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/delete', payload: { stylesheet: 'beta', screen: 'themes', query: {} } } ] );
	release();
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha' ] );
	expect( wrapper.find( '.title-count.theme-count' ).text() ).toBe( '2' );
	expect( record.spoken ).toContain( 'Deleted!' );
	expect( record.menuCounts ).toEqual( [ { 'themes.php': 0 } ] );
	expect( events ).toEqual( [
		[ 'wp-theme-deleting', { slug: 'beta' } ],
		[ 'wp-theme-delete-success', { delete: 'theme', slug: 'beta' } ],
	] );
} );

test( 'a failed answer: Delete shows Deletion failed: before the description, the button comes back, and the error event', async () => {
	const record = host();
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async () => {
		throw apiError( 'Fixture delete failure.' );
	} );
	const wrapper = await mountThemes( themesData(), record );
	await open( wrapper, 'beta' );
	await overlayOf( wrapper ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	const overlay = overlayOf( wrapper );
	expect( overlay.find( '.theme-info .update-message.notice-error p' ).text() ).toBe( 'Deletion failed: Fixture delete failure.' );
	expect( overlay.find( 'a.delete-theme' ).text() ).toBe( 'Delete' );
	expect( record.spoken ).toContainEqual( [ 'Deletion failed: Fixture delete failure.', 'assertive' ] );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha', 'beta' ] );
	expect( events.at( -1 ) ).toEqual( [ 'wp-theme-delete-error', { delete: 'theme', slug: 'beta', errorCode: 'fixture_failure', errorMessage: 'Fixture delete failure.' } ] );
} );

test( 'credentials pause: a delete that needs credentials opens the dialog; Cancel puts the card back and announces credential-modal-cancel once', async () => {
	const record = host();
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async () => {
		throw credentialsError();
	} );
	const wrapper = await mountThemes( themesData(), record );
	await open( wrapper, 'beta' );
	await overlayOf( wrapper ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	const dialog = wrapper.find( 'dialog#request-filesystem-credentials-dialog' );
	expect( dialog.exists() ).toBe( true );
	// Escape belongs to the dialog while it is open: the details stay.
	key( 'Escape' );
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( true );
	await dialog.find( 'button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'dialog#request-filesystem-credentials-dialog' ).exists() ).toBe( false );
	expect( overlayOf( wrapper ).find( 'a.delete-theme' ).text() ).toBe( 'Delete' );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha', 'beta' ] );
	expect( events.filter( ( [ name ] ) => name === 'credential-modal-cancel' ) ).toEqual( [ [ 'credential-modal-cancel', { action: 'delete-theme', data: { slug: 'beta' } } ] ] );
	expect( api.calls ).toHaveLength( 1 );
} );

test( 'credentials pause: submitted, the delete is sent again with the credentials and the card goes', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	let calls = 0;
	api.respondWith( async () => {
		calls++;
		if ( calls === 1 ) {
			throw credentialsError();
		}
		return deleteAnswer( 'beta' );
	} );
	const wrapper = await mountThemes();
	await open( wrapper, 'beta' );
	await overlayOf( wrapper ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	const dialog = wrapper.find( 'dialog#request-filesystem-credentials-dialog' );
	await dialog.find( '#hostname' ).setValue( 'localhost' );
	await dialog.find( '#username' ).setValue( 'ftp' );
	await dialog.find( '#password' ).setValue( 'secret' );
	await dialog.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 1 ].payload.credentials ).toEqual( expect.objectContaining( { hostname: 'localhost', username: 'ftp', password: 'secret' } ) );
	expect( cardIds( wrapper ) ).toEqual( [ 'twentytwentyfive', 'alpha' ] );
	expect( events.some( ( [ , detail ] ) => JSON.stringify( detail ?? {} ).includes( 'secret' ) ) ).toBe( false );
} );

test( 'one theme: its details show inline in .themes.single-theme (theme.js render()), with no search, no dialog and nothing to close', async () => {
	const record = host();
	const wrapper = await mountThemes( themesData( { themes: [ card( 'twentytwentyfive', { active: true } ) ] } ), record );
	const single = wrapper.find( '.theme-browser .themes.single-theme' );
	expect( single.exists() ).toBe( true );
	const details = single.find( ':scope > div.theme-overlay.active' );
	expect( details.exists() ).toBe( true );
	expect( details.attributes( 'role' ) ).toBeUndefined();
	expect( details.find( '.theme-info h2.theme-name' ).text() ).toContain( 'Twenty Twenty-Five' );
	expect( details.findAll( '.theme-actions .active-theme a' ).map( ( a ) => a.text() ) ).toEqual( [ 'Customize', 'Widgets', 'Menus' ] );
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	expect( wrapper.find( 'form.search-themes' ).exists() ).toBe( false );
	expect( document.body.classList.contains( 'modal-open' ) ).toBe( false );
	// The card is there for theme.js's CSS to hide (`.single-theme .theme`); its details open nothing more.
	await cardOf( wrapper, 'twentytwentyfive' ).find( 'button.more-details' ).trigger( 'click' );
	key( 'Escape' );
	await settle();
	expect( overlayOf( wrapper ).exists() ).toBe( false );
	expect( record.addressed ).toEqual( [] );
} );

test( 'focus trap: Tab on the last action goes to the first header button, Shift+Tab on it to the last action (theme.js containFocus())', async () => {
	const wrapper = await mountThemes();
	const overlay = await open( wrapper, 'alpha' );
	const first = overlay.find( '.theme-header button.left' ).element;
	const actions = overlay.findAll( '.theme-actions a' );
	const last = actions[ actions.length - 1 ].element;
	expect( last.classList.contains( 'delete-theme' ) ).toBe( true );
	last.focus();
	const tab = ( element, shiftKey = false ) => {
		const event = new KeyboardEvent( 'keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true } );
		element.dispatchEvent( event );
		return event.defaultPrevented;
	};
	expect( tab( last ) ).toBe( true );
	expect( document.activeElement ).toBe( first );
	expect( tab( first, true ) ).toBe( true );
	expect( document.activeElement ).toBe( last );
	// In between, Tab is the browser's own.
	expect( tab( overlay.find( '.theme-header button.close' ).element ) ).toBe( false );
} );

test( 'focus trap: at the first theme the first focusable button is Next (Previous is disabled)', async () => {
	const wrapper = await mountThemes();
	const overlay = await open( wrapper, 'twentytwentyfive' );
	const actions = overlay.findAll( '.theme-actions a' );
	actions[ actions.length - 1 ].element.focus();
	actions[ actions.length - 1 ].element.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Tab', bubbles: true, cancelable: true } ) );
	expect( document.activeElement ).toBe( overlay.find( '.theme-header button.right' ).element );
} );
