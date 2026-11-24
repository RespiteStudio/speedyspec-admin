/** @jest-environment jsdom */
// Update File (E4, E6, E7, E10, E14), as theme-plugin-editor.js submit() saves: the page's save
// request with the current text, read-only with the spinner while it runs, then the answer's
// message, or WordPress's error notice with the PHP error's message as text; the lint gate in the
// page (E5); raw file content shown and sent back as it is.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { LABELS, apiError, fakeCodeEditor, host, lintError, loadContracts, mountEditor, pluginEditorData, settle, themeEditorData } from './data.mjs';

const bodyClass = document.body.className;
const PLAIN = { codeEditorApi: null };
const SAVE = 'wp-admin/v1/file-editor/save';

beforeEach( async () => {
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	delete window.__ran;
	jest.restoreAllMocks();
	resetContracts();
} );

const update = ( wrapper ) => wrapper.find( 'form#template' ).trigger( 'submit' );
const notices = ( wrapper ) => wrapper.find( 'form#template .editor-notices' );

/** An answer that waits until `release()`. */
function held( value ) {
	let release;
	const promise = new Promise( ( resolve ) => {
		release = () => resolve( value );
	} );
	return { promise, release: () => release() };
}

test( 'saved: Update File posts the save request with the current text', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await wrapper.find( '#newcontent' ).setValue( "<?php\n// New.\n" );
	await update( wrapper );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: SAVE, payload: { kind: 'theme', theme: 'twentytwentyone', file: 'functions.php', nonce: 'abc123', newcontent: "<?php\n// New.\n" } } ] );
} );

test( 'saved: while the save runs the textarea is read-only and the spinner shows', async () => {
	const answer = held( { message: 'File edited successfully.' } );
	api.respondWith( () => answer.promise );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await update( wrapper );
	await settle();
	const during = [ wrapper.find( '#newcontent' ).element.readOnly, wrapper.find( 'p.submit .spinner' ).classes( 'is-active' ) ];
	answer.release();
	await settle();
	expect( [ during, [ wrapper.find( '#newcontent' ).element.readOnly, wrapper.find( 'p.submit .spinner' ).classes( 'is-active' ) ] ] ).toEqual( [ [ true, true ], [ false, false ] ] );
} );

test( 'saved: the answer\'s message in a dismissible success notice, spoken', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	await update( wrapper );
	await settle();
	const notice = notices( wrapper ).find( '.notice.notice-success.inline.is-dismissible' );
	expect( [ notice.find( 'p' ).text(), notice.find( 'button.notice-dismiss .screen-reader-text' ).text(), record.spoken.includes( 'File edited successfully.' ) ] ).toEqual( [ 'File edited successfully.', LABELS.dismiss, true ] );
} );

test( 'saved: the file is clean again, so leaving asks nothing', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	await wrapper.find( '#newcontent' ).setValue( 'changed' );
	await update( wrapper );
	await settle();
	expect( [ record.leave.at( -1 ), record.dirty.at( -1 ) ] ).toEqual( [ null, false ] );
} );

test( 'saved: the notice\'s dismiss button removes it', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await update( wrapper );
	await settle();
	await notices( wrapper ).find( 'button.notice-dismiss' ).trigger( 'click' );
	expect( notices( wrapper ).find( '.notice-success' ).exists() ).toBe( false );
} );

test( 'php_error: the classic PHP error notice, its message as text in a pre', async () => {
	api.respondWith( async () => {
		throw apiError( 'Fixture fatal', 400, 'php_error', { status: 400, line: 3, file: 'functions.php', notice: { markup: 'Your PHP code changes were not applied due to an error on line 3 of file functions.php. Please fix and try saving again.', message: 'Fixture <b>fatal</b>' } } );
	} );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await update( wrapper );
	await settle();
	const notice = notices( wrapper ).find( '.notice.notice-error.inline.is-dismissible' );
	expect( [ notice.find( 'p' ).text(), notice.find( 'pre' ).text(), notice.find( 'pre b' ).exists() ] ).toEqual( [
		'Your PHP code changes were not applied due to an error on line 3 of file functions.php. Please fix and try saving again.',
		'Fixture <b>fatal</b>',
		false,
	] );
} );

test( 'failed: the loopback\'s text WordPress composed, the file still dirty', async () => {
	const text = 'Unable to communicate back with site to check for fatal errors, so the PHP change was reverted. You will need to upload your PHP file change by some other means, such as by using SFTP.';
	api.respondWith( async () => {
		throw apiError( text, 400, 'loopback_request_failed', { status: 400, notice: { markup: text, message: null } } );
	} );
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	await wrapper.find( '#newcontent' ).setValue( 'changed' );
	await update( wrapper );
	await settle();
	expect( [ notices( wrapper ).find( '.notice-error p' ).text(), notices( wrapper ).find( '.notice-error pre' ).exists(), record.leave.at( -1 ) ] ).toEqual( [ text, false, LABELS.leave ] );
} );

test( 'a failed answer: without WordPress\'s notice, its message', async () => {
	api.respondWith( async () => {
		throw apiError( 'Fixture save failure.', 500 );
	} );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await update( wrapper );
	await settle();
	expect( notices( wrapper ).find( '.notice-error p' ).text() ).toBe( 'Fixture save failure.' );
} );

test( 'a failed answer: without a message, theme-plugin-editor.js\'s text', async () => {
	api.respondWith( async () => {
		throw apiError( '', 500, 'fixture_failure' );
	} );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await update( wrapper );
	await settle();
	expect( notices( wrapper ).find( '.notice-error p' ).text() ).toBe( 'An error occurred while saving your changes. Please try again. If the problem persists, you may need to manually update the file via FTP.' );
} );

test( 'plugin: Update File posts the plugin\'s save request', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const wrapper = await mountEditor( pluginEditorData(), host( { origin: 'http://localhost', pathname: '/wp-admin/plugin-editor.php', search: '' } ), PLAIN );
	await update( wrapper );
	await settle();
	expect( api.calls.map( ( call ) => call.payload ) ).toEqual( [ { kind: 'plugin', plugin: 'akismet/akismet.php', file: 'akismet/akismet.php', nonce: 'def456', newcontent: "<?php\n/* Plugin Name: Akismet */\n" } ] );
} );

test( 'raw content: </textarea>, a script and {{ }} are the textarea\'s text, run nothing and are saved back as they are', async () => {
	const content = "a</textarea><script>window.__ran = 1;</script>{{ 1 + 1 }}\n<?php echo 'x'; ?>\n";
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const wrapper = await mountEditor( themeEditorData( { file: { ...themeEditorData().file, content } } ), host(), PLAIN );
	const shown = wrapper.find( '#newcontent' ).element.value;
	await update( wrapper );
	await settle();
	expect( [ shown, window.__ran, wrapper.find( 'form#template script' ).exists(), api.calls[ 0 ]?.payload.newcontent ] ).toEqual( [ content, undefined, false, content ] );
} );

test( 'lint gate: the code editor\'s errors show the count and disable Update File', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const wrapper = await mountEditor( themeEditorData(), host(), { codeEditorApi: codeEditor } );
	made[ 0 ].lint( [ lintError( 2 ) ] );
	await settle();
	expect( [ notices( wrapper ).find( '.notice-error p' ).text(), wrapper.find( 'p.submit input#submit' ).classes( 'disabled' ) ] ).toEqual( [ 'There is 1 error which must be fixed before you can update this file.', true ] );
} );

test( 'lint gate: Update File with errors saves nothing and puts the cursor on the first error', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const wrapper = await mountEditor( themeEditorData(), host(), { codeEditorApi: codeEditor } );
	made[ 0 ].lint( [ lintError( 4 ) ] );
	await update( wrapper );
	await settle();
	expect( [ api.calls, made[ 0 ].codemirror.cursor ] ).toEqual( [ [], 4 ] );
} );

test( 'lint gate: Update anyway, then Update File saves CodeMirror\'s text', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	const wrapper = await mountEditor( themeEditorData(), host(), { codeEditorApi: codeEditor } );
	made[ 0 ].codemirror.setValue( 'broken {' );
	made[ 0 ].lint( [ lintError( 0 ) ] );
	await settle();
	await notices( wrapper ).find( 'input[type="checkbox"]' ).setValue( true );
	await update( wrapper );
	await settle();
	expect( [ wrapper.find( 'p.submit input#submit' ).classes( 'disabled' ), api.calls.map( ( call ) => call.payload.newcontent ) ] ).toEqual( [ false, [ 'broken {' ] ] );
} );

test( 'Ctrl+S outside the code editor saves', async () => {
	api.respondWith( async () => ( { message: 'File edited successfully.' } ) );
	await mountEditor( themeEditorData(), host(), PLAIN );
	window.dispatchEvent( new KeyboardEvent( 'keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true } ) );
	await settle();
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ SAVE ] );
} );
