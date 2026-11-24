/** @jest-environment jsdom */
// The code editor adapter (file-editor/code-editor.js): core's wp.codeEditor on the native
// textarea, as theme-plugin-editor.js initCodeEditor() starts it once the screen's assets are
// loaded, its lint callbacks chained to the page's; without settings or without wp.codeEditor,
// the plain textarea (E11).
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { mountCodeEditor } from '../../../site/components/core/file-editor/code-editor.js';
import { CODE_EDITOR, fakeCodeEditor, lintError } from './data.mjs';

let textarea;

beforeEach( () => {
	textarea = document.createElement( 'textarea' );
	textarea.id = 'newcontent';
	textarea.value = 'body { color: red; }';
	document.body.appendChild( textarea );
} );
afterEach( () => {
	textarea.remove();
	jest.restoreAllMocks();
} );

test( 'no settings: the plain textarea, whose typed text is reported', async () => {
	const changes = [];
	const editor = mountCodeEditor( textarea, false, { onChange: ( value ) => changes.push( value ) } );
	await editor.started;
	textarea.value = 'changed';
	textarea.dispatchEvent( new Event( 'input' ) );
	expect( [ changes, editor.value() ] ).toEqual( [ [ 'changed' ], 'changed' ] );
} );

test( 'no settings: wp.codeEditor is never started', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, false, { api: codeEditor } );
	await editor.started;
	expect( made ).toHaveLength( 0 );
} );

test( 'without wp.codeEditor: the plain textarea, read-only while saving', async () => {
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: null } );
	await editor.started;
	editor.setReadOnly( true );
	expect( textarea.readOnly ).toBe( true );
} );

test( 'with settings: wp.codeEditor.initialize() runs on the textarea once the screen assets are ready', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	let release;
	const ready = new Promise( ( resolve ) => {
		release = resolve;
	} );
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor, ready: () => ready } );
	await flushPromises();
	const before = made.length;
	release();
	await editor.started;
	expect( [ before, made.length, made[ 0 ]?.textarea, made[ 0 ]?.settings.codemirror ] ).toEqual( [ 0, 1, textarea, CODE_EDITOR.codemirror ] );
} );

test( 'with settings: the window\'s wp.codeEditor is read once the screen assets are ready, which load it', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const had = Object.hasOwn( window, 'wp' );
	const before = window.wp;
	try {
		delete window.wp;
		const editor = mountCodeEditor( textarea, CODE_EDITOR, {
			ready: async () => {
				window.wp = { codeEditor };
			},
		} );
		await editor.started;
		expect( made ).toHaveLength( 1 );
	} finally {
		if ( had ) {
			window.wp = before;
		} else {
			delete window.wp;
		}
	}
} );

test( 'with settings: CodeMirror\'s text is the value, and its changes are reported', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const changes = [];
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor, onChange: ( value ) => changes.push( value ) } );
	await editor.started;
	made[ 0 ].codemirror.setValue( 'p { margin: 0; }' );
	expect( [ changes, editor.value() ] ).toEqual( [ [ 'p { margin: 0; }' ], 'p { margin: 0; }' ] );
} );

test( 'with settings: onChangeLintingErrors reaches the page, after the settings\' own callback', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const calls = [];
	const settings = { ...CODE_EDITOR, onChangeLintingErrors: ( errors ) => calls.push( [ 'settings', errors.length ] ) };
	const editor = mountCodeEditor( textarea, settings, { api: codeEditor, onLintErrors: ( errors ) => calls.push( [ 'page', errors.length ] ) } );
	await editor.started;
	made[ 0 ].lint( [ lintError() ] );
	expect( calls ).toEqual( [ [ 'settings', 1 ], [ 'page', 1 ] ] );
} );

test( 'with settings: onUpdateErrorNotice reaches the page with the annotations', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const shown = [];
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor, onLintNotice: ( annotations ) => shown.push( annotations.length ) } );
	await editor.started;
	made[ 0 ].lint( [ lintError(), lintError( 5 ) ] );
	expect( shown ).toEqual( [ 2 ] );
} );

test( 'with settings: read-only while saving, both the textarea and CodeMirror', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor } );
	await editor.started;
	editor.setReadOnly( true );
	expect( [ textarea.readOnly, made[ 0 ].codemirror.options.readOnly ] ).toEqual( [ true, true ] );
} );

test( 'with settings: focusError() puts the cursor on the first error\'s line', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor } );
	await editor.started;
	made[ 0 ].lint( [ lintError( 7 ), lintError( 9 ) ] );
	editor.focusError();
	expect( [ made[ 0 ].codemirror.cursor, made[ 0 ].codemirror.focused ] ).toEqual( [ 7, true ] );
} );

test( 'with settings: Ctrl-S and Cmd-S save, beside the editor\'s own keys', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const saves = [];
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor, onSave: () => saves.push( 'save' ) } );
	await editor.started;
	const keys = made[ 0 ].codemirror.options.extraKeys;
	keys[ 'Ctrl-S' ]();
	keys[ 'Cmd-S' ]();
	expect( saves ).toEqual( [ 'save', 'save' ] );
} );

test( 'with settings: the editing area is a labelled multiline textbox described by the help\'s keyboard texts', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor } );
	await editor.started;
	const area = made[ 0 ].codemirror.display.lineDiv;
	expect( [ 'role', 'aria-multiline', 'aria-labelledby', 'aria-describedby' ].map( ( name ) => area.getAttribute( name ) ) ).toEqual( [
		'textbox',
		'true',
		'theme-plugin-editor-label',
		'editor-keyboard-trap-help-1 editor-keyboard-trap-help-2 editor-keyboard-trap-help-3 editor-keyboard-trap-help-4',
	] );
} );

test( 'destroy() gives the textarea back, and a destroy before the assets are ready starts nothing', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor } );
	editor.destroy();
	await editor.started;
	expect( made ).toHaveLength( 0 );
} );

test( 'destroy() after the start removes CodeMirror', async () => {
	const { codeEditor, made } = fakeCodeEditor();
	const editor = mountCodeEditor( textarea, CODE_EDITOR, { api: codeEditor } );
	await editor.started;
	editor.destroy();
	expect( made[ 0 ].codemirror.removed ).toBe( true );
} );
