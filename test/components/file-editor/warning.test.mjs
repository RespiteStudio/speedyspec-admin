/** @jest-environment jsdom */
// The warning dialog of the file editors (E2), as theme-plugin-editor.js showWarning() shows it
// until the user dismisses it: on load, the focus on Go back and kept in the dialog; Go back
// returns to the page the editor was opened from (WordPress decides it from the referer field the
// page sends), else to `goBack.path`; I understand posts the dismissal and closes it.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, host, loadContracts, mountEditor, pluginEditorData, settle, themeEditorData, warning } from './data.mjs';

const bodyClass = document.body.className;
const PLAIN = { codeEditorApi: null };
const dialogOf = ( wrapper ) => wrapper.find( '#file-editor-warning' );

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	resetContracts();
} );

test( 'shown on load: the heading and paragraphs (inline markup), Go back and I understand', async () => {
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), host(), PLAIN );
	const dialog = dialogOf( wrapper );
	expect( [
		dialog.find( '.notification-dialog' ).attributes( 'role' ),
		dialog.find( '.file-editor-warning-message h1' ).text(),
		dialog.findAll( '.file-editor-warning-message p' ).length,
		dialog.find( '.file-editor-warning-message p a' ).attributes( 'href' ),
		dialog.find( 'a.file-editor-warning-go-back' ).text(),
		dialog.find( 'button.file-editor-warning-dismiss' ).text(),
	] ).toEqual( [ 'dialog', 'Heads up!', 2, 'https://developer.wordpress.org/themes/advanced-topics/child-themes/', 'Go back', 'I understand' ] );
} );

test( 'shown on load: the focus is on Go back and the body is modal-open', async () => {
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), host(), PLAIN );
	expect( [ document.activeElement === dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' ).element, document.body.classList.contains( 'modal-open' ) ] ).toEqual( [ true, true ] );
} );

test( 'without a warning (dismissed before), no dialog', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	expect( dialogOf( wrapper ).exists() ).toBe( false );
} );

test( 'Tab stays in the dialog: from I understand to Go back, and Shift+Tab back', async () => {
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), host(), PLAIN );
	const back = dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' ).element;
	const dismiss = dialogOf( wrapper ).find( 'button.file-editor-warning-dismiss' ).element;
	dismiss.focus();
	dismiss.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Tab', bubbles: true, cancelable: true } ) );
	const forward = document.activeElement === back;
	back.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true } ) );
	expect( [ forward, document.activeElement === dismiss ] ).toEqual( [ true, true ] );
} );

test( 'Go back without a page before it goes to goBack.path (the Dashboard)', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), record, PLAIN );
	await dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' ).trigger( 'click' );
	await settle();
	expect( [ record.looked, record.followed ] ).toEqual( [ [], [ { redirect: '' } ] ] );
} );

test( 'Go back asks WordPress with the page before it as the referer field, and goes where it says', async () => {
	const record = host();
	record.previous = '/wp-admin/plugins.php?plugin_status=all';
	record.lookupAnswer = { page: { data: themeEditorData( { warning: warning( { goBack: { label: 'Go back', path: 'plugins.php?plugin_status=all' } } ) } ) } };
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), record, PLAIN );
	const back = dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' );
	await back.trigger( 'click' );
	await settle();
	expect( [ record.looked, back.attributes( 'href' ), record.followed ] ).toEqual( [
		[ '/wp-admin/theme-editor.php?file=functions.php&_wp_http_referer=plugins.php%3Fplugin_status%3Dall' ],
		'/wp-admin/plugins.php?plugin_status=all',
		[ { redirect: 'plugins.php?plugin_status=all' } ],
	] );
} );

test( 'Go back to an address outside the admin loads it', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData( { warning: warning( { goBack: { label: 'Go back', path: 'https://example.org/page/' } } ) } ), record, PLAIN );
	await dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' ).trigger( 'click' );
	await settle();
	expect( record.followed ).toEqual( [ { location: 'https://example.org/page/' } ] );
} );

test( 'Go back when WordPress cannot answer the referer read goes to goBack.path', async () => {
	const record = host();
	record.previous = '/wp-admin/plugins.php';
	record.provide.router.lookup = async () => {
		throw apiError( 'Fixture failure.' );
	};
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), record, PLAIN );
	await dialogOf( wrapper ).find( 'a.file-editor-warning-go-back' ).trigger( 'click' );
	await settle();
	expect( record.followed ).toEqual( [ { redirect: '' } ] );
} );

test( 'I understand posts the dismissal and closes the dialog', async () => {
	api.respondWith( async () => ( { dismissed: true } ) );
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), host(), PLAIN );
	await dialogOf( wrapper ).find( 'button.file-editor-warning-dismiss' ).trigger( 'click' );
	await settle();
	expect( [ api.calls, dialogOf( wrapper ).exists(), document.body.classList.contains( 'modal-open' ) ] ).toEqual( [
		[ { method: 'POST', route: 'wp-admin/v1/file-editor/warning', payload: { pointer: 'theme_editor_notice' } } ],
		false,
		false,
	] );
} );

test( 'I understand on the Plugin File Editor posts its own pointer', async () => {
	api.respondWith( async () => ( { dismissed: true } ) );
	const wrapper = await mountEditor( pluginEditorData( { warning: warning( { dismiss: { label: 'I understand', request: { pointer: 'plugin_editor_notice' } } } ) } ), host(), PLAIN );
	await dialogOf( wrapper ).find( 'button.file-editor-warning-dismiss' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload ) ).toEqual( [ { pointer: 'plugin_editor_notice' } ] );
} );

test( 'a failed answer: the dismissal\'s error in a page notice, the dialog closed as classic does', async () => {
	api.respondWith( async () => {
		throw apiError( 'Fixture warning failure.', 500 );
	} );
	const record = host();
	const wrapper = await mountEditor( themeEditorData( { warning: warning() } ), record, PLAIN );
	await dialogOf( wrapper ).find( 'button.file-editor-warning-dismiss' ).trigger( 'click' );
	await settle();
	expect( [ record.notices.map( ( notice ) => [ notice.type, notice.message ] ), dialogOf( wrapper ).exists() ] ).toEqual( [ [ [ 'error', 'Fixture warning failure.' ] ], false ] );
} );
