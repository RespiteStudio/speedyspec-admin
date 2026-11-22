/** @jest-environment jsdom */
// Personal Options of Profile and Edit User (core/user-edit/personal.js) in user-edit.php's
// markup: the rows the data shows, the color scheme picker of admin_color_scheme_picker() (a
// click on one's own profile stores the scheme at once, as user-profile.js does through
// save-user-color-scheme), and the Language select.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { LANGUAGE, apiError, editData, loadContracts, mountUserEdit, personal, profileData, setMeter, settle, unsetMeter } from './data.mjs';

beforeEach( async () => {
	api.reset();
	setMeter( 4 );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	unsetMeter();
	document.body.className = '';
	document.body.innerHTML = '';
} );

const schemePosts = () => api.calls.filter( ( call ) => call.route === 'wp-admin/v1/users/me/color-scheme' );

test( 'rows from data: a writer\'s own profile shows Syntax Highlighting, the scheme, Keyboard Shortcuts, Toolbar and Infinite Scrolling', async () => {
	const wrapper = await mountUserEdit();
	const section = wrapper.find( 'form#your-profile' );
	expect( section.findAll( 'h2' )[ 0 ].text() ).toBe( 'Personal Options' );
	const rows = section.findAll( 'table.form-table' )[ 0 ].findAll( 'tr' ).map( ( row ) => row.classes()[ 0 ] );
	expect( rows ).toEqual( [ 'user-syntax-highlighting-wrap', 'user-admin-color-wrap', 'user-comment-shortcuts-wrap', 'show-admin-bar', 'user-infinite-scrolling-wrap' ] );
	expect( wrapper.find( '#rich_editing' ).exists() ).toBe( false );
	expect( wrapper.find( 'label[for="syntax_highlighting"]' ).text() ).toBe( 'Disable syntax highlighting when editing code' );
	expect( wrapper.find( '#syntax_highlighting' ).attributes( 'value' ) ).toBe( 'false' );
	expect( wrapper.find( '#comment_shortcuts' ).attributes( 'value' ) ).toBe( 'true' );
	expect( wrapper.find( '.user-comment-shortcuts-wrap a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments' );
	expect( wrapper.find( '#admin_bar_front' ).element.checked ).toBe( true );
	expect( wrapper.find( 'label[for="admin_bar_front"]' ).text() ).toBe( 'Show Toolbar when viewing site' );
	expect( wrapper.find( '#infinite_scrolling' ).element.checked ).toBe( false );
	expect( wrapper.find( '#locale' ).exists() ).toBe( false );
} );

test( 'rows from data: a Subscriber sees no Visual Editor, Keyboard Shortcuts or Syntax Highlighting; a stored "false" shows the Visual Editor row checked', async () => {
	let wrapper = await mountUserEdit( profileData( { personal: personal( { richEditing: null, syntaxHighlighting: null, commentShortcuts: null, infiniteScrolling: null } ) } ) );
	expect( wrapper.findAll( 'table.form-table' )[ 0 ].findAll( 'tr' ).map( ( row ) => row.classes()[ 0 ] ) ).toEqual( [ 'user-admin-color-wrap', 'show-admin-bar' ] );
	wrapper.unmount();
	wrapper = await mountUserEdit( profileData( { personal: personal( { richEditing: true } ) } ) );
	expect( wrapper.find( '#rich_editing' ).element.checked ).toBe( true );
	expect( wrapper.find( '#rich_editing' ).attributes( 'value' ) ).toBe( 'false' );
	expect( wrapper.find( 'label[for="rich_editing"]' ).text() ).toBe( 'Disable the visual editor when writing' );
} );

test( 'the scheme picker: admin_color_scheme_picker()\'s markup, the current scheme selected', async () => {
	const wrapper = await mountUserEdit();
	const picker = wrapper.find( 'tr.user-admin-color-wrap fieldset#color-picker.scheme-list' );
	expect( picker.find( 'legend.screen-reader-text' ).text() ).toBe( 'Administration Color Scheme' );
	const options = picker.findAll( '.color-option' );
	expect( options.map( ( option ) => option.find( 'label' ).text() ) ).toEqual( [ 'Modern', 'Default', 'Light' ] );
	expect( options[ 0 ].classes() ).toContain( 'selected' );
	expect( picker.find( '#admin_color_modern' ).element.checked ).toBe( true );
	expect( options[ 1 ].findAll( '.color-palette-shade' ).map( ( shade ) => shade.element.style.backgroundColor ) ).toEqual( [ 'rgb(29, 35, 39)', 'rgb(44, 51, 56)', 'rgb(34, 113, 177)', 'rgb(114, 174, 230)' ] );
} );

test( 'scheme posts at once: a click on one\'s own profile stores it through users/me/color-scheme; no stylesheet is added (the frame gap)', async () => {
	api.respondWith( async () => ( { previousScheme: 'admin-color-modern', currentScheme: 'admin-color-light' } ) );
	const wrapper = await mountUserEdit();
	await wrapper.findAll( '.color-option' )[ 2 ].trigger( 'click' );
	await settle();
	expect( schemePosts() ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/me/color-scheme', payload: { scheme: 'light' } } ] );
	expect( wrapper.findAll( '.color-option' )[ 2 ].classes() ).toContain( 'selected' );
	expect( wrapper.find( '#admin_color_light' ).element.checked ).toBe( true );
	expect( document.querySelector( 'link#colors-css' ) ).toBeNull();
	// The selected one again sends nothing, as user-profile.js.
	await wrapper.findAll( '.color-option' )[ 2 ].trigger( 'click' );
	await settle();
	expect( schemePosts() ).toHaveLength( 1 );
} );

test( 'scheme posts at once: on another user\'s Edit User a click only selects it, for Update', async () => {
	const wrapper = await mountUserEdit( editData() );
	await wrapper.findAll( '.color-option' )[ 1 ].trigger( 'click' );
	await settle();
	expect( schemePosts() ).toEqual( [] );
	expect( wrapper.find( '#admin_color_fresh' ).element.checked ).toBe( true );
} );

test( 'a failed answer: the scheme save says WordPress\'s message in a page notice', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture scheme failure.' } );
	} );
	const wrapper = await mountUserEdit();
	await wrapper.findAll( '.color-option' )[ 1 ].trigger( 'click' );
	await settle();
	expect( wrapper.record.added ).toEqual( [ expect.objectContaining( { type: 'error', message: 'Fixture scheme failure.' } ) ] );
} );

test( 'language: the installed languages and Site Default, the stored one selected', async () => {
	const wrapper = await mountUserEdit( profileData( { personal: personal( { language: { ...LANGUAGE, selected: 'ar' } } ) } ) );
	const row = wrapper.find( 'tr.user-language-wrap' );
	expect( row.find( 'label[for="locale"]' ).text() ).toBe( 'Language' );
	expect( row.find( '.dashicons-translation' ).exists() ).toBe( true );
	expect( row.findAll( '#locale option' ).map( ( option ) => [ option.element.value, option.text() ] ) ).toEqual( [ [ 'site-default', 'Site Default' ], [ '', 'English (United States)' ], [ 'ar', 'العربية' ] ] );
	expect( row.find( '#locale' ).element.value ).toBe( 'ar' );
} );
