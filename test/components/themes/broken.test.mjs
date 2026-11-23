/** @jest-environment jsdom */
// The broken themes below the themes (themes.php's `.broken-themes` table): the rows and their
// columns, Delete with the classic question as a package job, Resume posting and following,
// Install Parent Theme queued as `themes/install` with its result in the row, the action kept
// when a write's answer did not decide it (`installParentChecked` false), and a failed answer of
// each.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { CONFIRM_DELETE, apiError, broken, brokenRow, card, deleteAnswer, host, loadContracts, mountThemes, request, settle, stubJQuery, themesData } from './data.mjs';

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
	jest.restoreAllMocks();
	resetContracts();
} );

const NO_STYLE = brokenRow( 'detached-t-nostyle' );
const ORPHAN = brokenRow( 'detached-t-orphan', {
	name: 'Orphan',
	description: 'The parent theme is missing. Please install the "detached-parent" parent theme.',
	installParent: { request: request( 'themes/install', { slug: 'detached-parent', screen: 'themes' } ), label: 'Install Parent Theme' },
} );
const PAUSED = brokenRow( 'detached-t-paused', { description: 'This theme failed to load properly and was paused within the admin backend.', resume: { request: request( 'themes/resume', { stylesheet: 'detached-t-paused' } ), label: 'Resume' } } );

const rowOf = ( wrapper, stylesheet ) => wrapper.findAll( '.broken-themes table tr' ).find( ( tr ) => tr.attributes( 'data-slug' ) === stylesheet );

test( 'the table: heading, text, columns, each row\'s name, error and actions', async () => {
	const wrapper = await mountThemes( themesData( { broken: broken( [ NO_STYLE, ORPHAN, PAUSED ] ) } ) );
	const block = wrapper.find( '.wp-admin-themes .broken-themes' );
	expect( block.find( 'h3' ).text() ).toBe( 'Broken Themes' );
	expect( block.find( 'p' ).text() ).toBe( 'The following themes are installed but incomplete.' );
	expect( block.findAll( 'table tr' )[ 0 ].findAll( 'th' ).map( ( th ) => th.text() ) ).toEqual( [ 'Name', 'Description' ] );
	const orphan = rowOf( wrapper, 'detached-t-orphan' );
	expect( orphan.findAll( 'td' ).map( ( td ) => td.text() ) ).toEqual( [ 'Orphan', 'The parent theme is missing. Please install the "detached-parent" parent theme.', '', 'Delete', 'Install Parent Theme' ] );
	expect( orphan.find( 'a.button.delete-theme' ).exists() ).toBe( true );
	expect( orphan.find( 'a.button.install-theme' ).exists() ).toBe( true );
	expect( rowOf( wrapper, 'detached-t-paused' ).find( 'a.button.resume-theme' ).text() ).toBe( 'Resume' );
} );

test( 'Delete asks the classic question; Cancel sends nothing; OK queues themes/delete and the answer\'s broken themes replace the table', async () => {
	const record = host();
	const confirm = jest.spyOn( window, 'confirm' ).mockReturnValueOnce( false ).mockReturnValueOnce( true );
	api.respondWith( async () => deleteAnswer( 'detached-t-nostyle', { themeName: 'detached-t-nostyle', count: 3, broken: broken( [ { ...ORPHAN, installParent: null, installParentChecked: false } ] ) } ) );
	const wrapper = await mountThemes( themesData( { broken: broken( [ NO_STYLE, ORPHAN ] ) } ), record );
	await rowOf( wrapper, 'detached-t-nostyle' ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( confirm ).toHaveBeenLastCalledWith( CONFIRM_DELETE );
	expect( api.calls ).toEqual( [] );
	await rowOf( wrapper, 'detached-t-nostyle' ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/delete', payload: { stylesheet: 'detached-t-nostyle', screen: 'themes', query: {} } } ] );
	expect( rowOf( wrapper, 'detached-t-nostyle' ) ).toBeUndefined();
	// installParentChecked false: the row keeps the Install Parent Theme it showed.
	expect( rowOf( wrapper, 'detached-t-orphan' ).find( 'a.install-theme' ).text() ).toBe( 'Install Parent Theme' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-theme-deleting', 'wp-theme-delete-success' ] );
} );

test( 'the last broken theme deleted: the table goes', async () => {
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async () => deleteAnswer( 'detached-t-nostyle', { broken: null } ) );
	const wrapper = await mountThemes( themesData( { broken: broken( [ NO_STYLE ] ) } ) );
	await rowOf( wrapper, 'detached-t-nostyle' ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '.broken-themes' ).exists() ).toBe( false );
} );

test( 'Resume posts its request and follows the answer; a fatal error leads to the classic error page', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'themes.php?resumed=true', location: null } ) );
	const wrapper = await mountThemes( themesData( { broken: broken( [ PAUSED ] ) } ), record );
	await rowOf( wrapper, 'detached-t-paused' ).find( 'a.resume-theme' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/resume', payload: { stylesheet: 'detached-t-paused' } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'themes.php?resumed=true', location: null } ] );
	api.respondWith( async () => {
		throw apiError( 'The theme could not be resumed.', 500, 'theme_resume_fatal', { status: 500, redirect: 'themes.php?error=resuming&_error_nonce=abc', location: null } );
	} );
	await rowOf( wrapper, 'detached-t-paused' ).find( 'a.resume-theme' ).trigger( 'click' );
	await settle();
	expect( record.followed.at( -1 ) ).toEqual( { redirect: 'themes.php?error=resuming&_error_nonce=abc', location: null } );
} );

test( 'Install Parent Theme queues themes/install with its slug and screen, says Installing..., and shows the result in the row', async () => {
	const record = host();
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( { install: 'theme', slug: 'detached-parent', themeName: 'Detached Parent', card: card( 'detached-parent', { name: 'Detached Parent' } ), count: 4, menuCounts: { 'themes.php': 0 }, broken: null } );
	} ) );
	const wrapper = await mountThemes( themesData( { broken: broken( [ ORPHAN ] ) } ), record );
	await rowOf( wrapper, 'detached-t-orphan' ).find( 'a.install-theme' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/install', payload: { slug: 'detached-parent', screen: 'themes', query: {} } } ] );
	const button = rowOf( wrapper, 'detached-t-orphan' ).find( 'a.install-theme' );
	expect( button.classes() ).toContain( 'updating-message' );
	expect( button.text() ).toBe( 'Installing...' );
	expect( record.spoken ).toContain( 'Installing... please wait.' );
	release();
	await settle();
	// The row stays with the result; the parent theme's card joins the list.
	expect( rowOf( wrapper, 'detached-t-orphan' ).find( '.install-theme' ).text() ).toBe( 'Installed!' );
	expect( wrapper.find( '.theme[data-slug="detached-parent"]' ).exists() ).toBe( true );
	expect( wrapper.find( '.title-count.theme-count' ).text() ).toBe( '4' );
	expect( record.spoken ).toContain( 'Installation completed successfully.' );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-theme-installing', 'wp-theme-install-success' ] );
} );

test( 'a failed answer: Install Parent Theme shows Installation failed: in the row; Delete shows Deletion failed:; Resume a page notice', async () => {
	const record = host();
	jest.spyOn( window, 'confirm' ).mockReturnValue( true );
	api.respondWith( async ( method, route ) => {
		throw apiError( route.endsWith( 'install' ) ? 'Fixture install failure.' : route.endsWith( 'delete' ) ? 'Fixture delete failure.' : 'Fixture resume failure.' );
	} );
	const wrapper = await mountThemes( themesData( { broken: broken( [ ORPHAN, PAUSED ] ) } ), record );
	await rowOf( wrapper, 'detached-t-orphan' ).find( 'a.install-theme' ).trigger( 'click' );
	await settle();
	expect( rowOf( wrapper, 'detached-t-orphan' ).find( '.notice-error p' ).text() ).toBe( 'Installation failed: Fixture install failure.' );
	expect( rowOf( wrapper, 'detached-t-orphan' ).find( 'a.install-theme' ).text() ).toBe( 'Install Parent Theme' );
	await rowOf( wrapper, 'detached-t-paused' ).find( 'a.delete-theme' ).trigger( 'click' );
	await settle();
	expect( rowOf( wrapper, 'detached-t-paused' ).find( '.notice-error p' ).text() ).toBe( 'Deletion failed: Fixture delete failure.' );
	await rowOf( wrapper, 'detached-t-paused' ).find( 'a.resume-theme' ).trigger( 'click' );
	await settle();
	expect( record.notices ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Fixture resume failure.' } ) ] );
	expect( events.map( ( [ name ] ) => name ) ).toEqual( [ 'wp-theme-installing', 'wp-theme-install-error', 'wp-theme-deleting', 'wp-theme-delete-error' ] );
} );
