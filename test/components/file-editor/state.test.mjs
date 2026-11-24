/** @jest-environment jsdom */
// The state of a file editor's form (file-editor/state.js), as theme-plugin-editor.js keeps it:
// dirty on change, the lint gate with "Update anyway", the save's notices, and in the page the
// leave warning while dirty (E8).
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { canSave, dismissed, edited, editorState, failed, linted, lintShown, saved, saving, updateAnyway, SAVED } from '../../../site/components/core/file-editor/state.js';
import { LABELS, host, lintError, loadContracts, mountEditor, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	resetContracts();
} );

test( 'a file just read is clean and may be saved', () => {
	const state = editorState( { content: 'a' } );
	expect( [ state.content, state.dirty, canSave( state ) ] ).toEqual( [ 'a', false, true ] );
} );

test( 'dirty: an edit makes the file dirty with the new text', () => {
	expect( edited( editorState( { content: 'a' } ), 'b' ) ).toMatchObject( { content: 'b', dirty: true } );
} );

test( 'dirty: an edit removes the saved notice (theme-plugin-editor.js onChange)', () => {
	const state = saved( saving( editorState( { content: 'a' } ) ), { message: 'File edited successfully.' } );
	expect( edited( state, 'b' ).notice ).toBeNull();
} );

test( 'dirty: an edit keeps a failed save\'s notice', () => {
	const state = failed( saving( editorState() ), { code: 'fixture_failure' }, 'Broken.' );
	expect( edited( state, 'b' ).notice?.code ).toBe( 'fixture_failure' );
} );

test( 'lint gate: with lint errors the file cannot be saved', () => {
	expect( canSave( linted( editorState(), [ lintError() ] ) ) ).toBe( false );
} );

test( 'lint gate: the shown error notice tells the count and disables Update File', () => {
	expect( lintShown( linted( editorState(), [ lintError( 1 ), lintError( 4 ) ] ), [ lintError( 1 ), lintError( 4 ) ] ) ).toMatchObject( { lintNotice: 2, buttonDisabled: true } );
} );

test( 'lint gate: Update anyway lets the file be saved', () => {
	const state = lintShown( linted( editorState(), [ lintError() ] ), [ lintError() ] );
	expect( canSave( updateAnyway( state ) ) ).toBe( true );
} );

test( 'lint gate: errors fixed enable Update File again', () => {
	const state = lintShown( linted( editorState(), [ lintError() ] ), [ lintError() ] );
	expect( linted( state, [] ).buttonDisabled ).toBe( false );
} );

test( 'a save running cannot start another', () => {
	expect( canSave( saving( editorState() ) ) ).toBe( false );
} );

test( 'a save starting removes the previous save\'s notice', () => {
	const state = failed( saving( editorState() ), { code: 'fixture_failure' }, 'Broken.' );
	expect( saving( state ).notice ).toBeNull();
} );

test( 'saved: the answer\'s message, dismissible, and the file is clean', () => {
	const state = saved( saving( edited( editorState(), 'b' ) ), { message: 'File edited successfully.' } );
	expect( [ state.dirty, state.saving, state.notice ] ).toEqual( [ false, false, { code: SAVED, type: 'success', dismissible: true, markup: null, message: null, text: 'File edited successfully.' } ] );
} );

test( 'failed: WordPress\'s notice markup and the PHP message, the file still dirty', () => {
	const error = { code: 'php_error', data: { notice: { markup: 'Your PHP code changes were not applied due to an error on line 3 of file x.php.', message: 'Fixture fatal' } } };
	const state = failed( saving( edited( editorState(), 'b' ) ), error, 'unused' );
	expect( [ state.dirty, state.notice ] ).toEqual( [ true, { code: 'php_error', type: 'error', dismissible: true, markup: error.data.notice.markup, message: 'Fixture fatal', text: null } ] );
} );

test( 'failed: without WordPress\'s notice, the page\'s text under the code save_error', () => {
	expect( failed( saving( editorState() ), {}, 'An error occurred.' ).notice ).toEqual( { code: 'save_error', type: 'error', dismissible: true, markup: null, message: null, text: 'An error occurred.' } );
} );

test( 'a dismissed notice goes', () => {
	expect( dismissed( saved( saving( editorState() ), { message: 'Done.' } ) ).notice ).toBeNull();
} );

test( 'dirty: typing in the page sets the leave warning with labels.leave and marks the page dirty', async () => {
	const record = host();
	const wrapper = await mountEditor( undefined, record, { codeEditorApi: null } );
	await wrapper.find( '#newcontent' ).setValue( "<?php\n// Changed.\n" );
	await settle();
	expect( [ record.leave.at( -1 ), record.dirty.at( -1 ) ] ).toEqual( [ LABELS.leave, true ] );
} );

test( 'dirty: a page that was not edited asks nothing when left', async () => {
	const record = host();
	await mountEditor( undefined, record, { codeEditorApi: null } );
	expect( record.leave.filter( ( message ) => message !== null ) ).toEqual( [] );
} );
