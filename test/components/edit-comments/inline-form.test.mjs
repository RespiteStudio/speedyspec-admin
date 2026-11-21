/** @jest-environment jsdom */
// The inline Quick Edit and Reply form of the Comments list. The part alone (Escape, Cancel, Save,
// Enter, the fields), then in the page: where the focus goes back to when the form closes, the
// Reply that approves, and the Quicktags toolbar, which is core's own quicktags.js (the test reads
// it from WP_SRC, as the strings test does, and is skipped without it).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { reactive } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { mountQuicktagsEditor } from '../../../site/runtime/quicktags.js';
import InlineForm from '../../../site/components/core/edit-comments/inline-form.js';
import { answer, commentsData, loadContracts, mountComments, row, settle, textareaEditor } from './data.mjs';

const state = ( over = {} ) => reactive( { id: 7, postId: 40, mode: 'replyto', request: null, content: '', original: '', author: '', email: '', url: '', approve: false, sending: false, error: '', ...over } );

// A form is a table row: it is mounted in a table body. `calls` records what it emits.
function inTable( form, provide = { quicktagsEditor: textareaEditor }, quicktags = null ) {
	const table = document.createElement( 'table' );
	const body = document.createElement( 'tbody' );
	table.appendChild( body );
	document.body.appendChild( table );
	const calls = { save: 0, cancel: 0 };
	const wrapper = mountPart( InlineForm, {
		props: { form, colspan: 4, quicktags, onSave: () => calls.save++, onCancel: () => calls.cancel++ },
		provide,
		attachTo: body,
	} );
	wrapper.calls = calls;
	return wrapper;
}

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => resetContracts() );

test( 'the legend, the button and the fields follow the mode', () => {
	const reply = inTable( state() );
	expect( reply.find( '#replyhead' ).text() ).toBe( 'Reply to Comment' );
	expect( reply.find( '#replybtn' ).text() ).toBe( 'Reply' );
	expect( reply.find( '#edithead' ).exists() ).toBe( false );
	expect( reply.find( '#action' ).element.value ).toBe( 'replyto-comment' );

	const edit = inTable( state( { mode: 'edit', author: 'Pat', email: 'p@example.org', url: 'https://p.example.org' } ) );
	expect( edit.find( '#editlegend' ).text() ).toBe( 'Edit Comment' );
	expect( edit.find( '#savebtn' ).text() ).toBe( 'Update Comment' );
	expect( [ '#author-name', '#author-email', '#author-url' ].map( ( id ) => edit.find( id ).element.value ) ).toEqual( [ 'Pat', 'p@example.org', 'https://p.example.org' ] );
	expect( edit.find( '#action' ).element.value ).toBe( 'edit-comment' );
} );

test( 'replying to a pending comment says Approve and Reply', () => {
	const wrapper = inTable( state( { approve: true } ) );
	expect( wrapper.find( '#replybtn' ).text() ).toBe( 'Approve and Reply' );
} );

test( 'Cancel emits cancel; Update emits save and is disabled while sending', async () => {
	const form = state( { mode: 'edit' } );
	const wrapper = inTable( form );
	await wrapper.find( 'button.cancel' ).trigger( 'click' );
	expect( wrapper.calls.cancel ).toBe( 1 );
	await wrapper.find( 'button.save' ).trigger( 'click' );
	expect( wrapper.calls.save ).toBe( 1 );
	form.sending = true;
	await settle( 2 );
	expect( wrapper.find( 'button.save' ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( '.spinner' ).classes() ).toContain( 'is-active' );
} );

test( 'Escape in the editor cancels, unless an input method is composing', async () => {
	const wrapper = inTable( state() );
	const container = wrapper.find( '#wp-replycontent-editor-container' );
	await container.trigger( 'keyup', { key: 'a' } );
	expect( wrapper.calls.cancel ).toBe( 0 );
	await container.trigger( 'keyup', { key: 'Escape' } );
	expect( wrapper.calls.cancel ).toBe( 1 );

	await container.trigger( 'compositionstart' );
	await container.trigger( 'keyup', { key: 'Escape' } );
	expect( wrapper.calls.cancel ).toBe( 1 );
	await container.trigger( 'compositionend' );
	await container.trigger( 'keyup', { key: 'Escape', isComposing: true } );
	expect( wrapper.calls.cancel ).toBe( 1 );
	await container.trigger( 'keyup', { key: 'Escape' } );
	expect( wrapper.calls.cancel ).toBe( 2 );
} );

test( 'typing updates the form; Enter in a Quick Edit field saves; the error shows in the form', async () => {
	const form = state( { mode: 'edit' } );
	const wrapper = inTable( form );
	const area = wrapper.find( '#replycontent' );
	area.element.value = 'Typed';
	await area.trigger( 'input' );
	expect( form.content ).toBe( 'Typed' );

	await wrapper.find( '#author-name' ).setValue( 'New name' );
	await wrapper.find( '#author-email' ).setValue( 'new@example.org' );
	await wrapper.find( '#author-url' ).setValue( 'https://new.example.org' );
	expect( [ form.author, form.email, form.url ] ).toEqual( [ 'New name', 'new@example.org', 'https://new.example.org' ] );

	const enter = new KeyboardEvent( 'keypress', { key: 'Enter', bubbles: true, cancelable: true } );
	wrapper.find( '#author-name' ).element.dispatchEvent( enter );
	expect( enter.defaultPrevented ).toBe( true );
	expect( wrapper.calls.save ).toBe( 1 );

	expect( wrapper.find( '.notice-error' ).classes() ).toContain( 'hidden' );
	form.error = 'Please type your comment text.';
	await settle( 2 );
	expect( wrapper.find( '.notice-error' ).classes() ).not.toContain( 'hidden' );
	expect( wrapper.find( '.notice-error .error' ).text() ).toBe( 'Please type your comment text.' );
} );

test( 'the editor starts on the textarea with the settings WordPress sent, and is focused; it goes with the form', async () => {
	const started = [];
	const wrapper = inTable( state( { content: 'Draft' } ), { quicktagsEditor: ( host, options ) => {
		started.push( options );
		return textareaEditor( host, options );
	} }, { id: 'replycontent', buttons: 'strong,em' } );
	await settle( 2 );
	expect( started ).toHaveLength( 1 );
	expect( started[ 0 ] ).toMatchObject( { id: 'replycontent', name: 'replycontent', value: 'Draft', settings: { id: 'replycontent', buttons: 'strong,em' } } );
	expect( document.activeElement ).toBe( wrapper.find( '#replycontent' ).element );
	wrapper.unmount();
	expect( document.getElementById( 'replycontent' ) ).toBeNull();
} );

// In the page ---------------------------------------------------------------------------------

// `edit` is Quick Edit, `replyto` is Reply (the buttons' data-action).
const open = async ( wrapper, id, action ) => {
	const button = wrapper.find( `#comment-${ id } button[data-action="${ action }"]` );
	await button.trigger( 'click' );
	await settle( 3 );
	return button.element;
};

test( 'Cancel gives the focus back to the Quick Edit button that opened the form', async () => {
	const wrapper = await mountComments();
	const button = await open( wrapper, 8, 'edit' );
	expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
	expect( wrapper.find( '#replyrow button.cancel' ).exists() ).toBe( true );
	await wrapper.find( '#replyrow button.cancel' ).trigger( 'click' );
	await settle( 3 );
	expect( wrapper.find( '#replyrow button.cancel' ).exists() ).toBe( false );
	expect( document.activeElement ).toBe( button );
	expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
} );

test( 'Escape in the Quick Edit editor gives the focus back to the button', async () => {
	const wrapper = await mountComments();
	const button = await open( wrapper, 8, 'edit' );
	expect( document.activeElement ).toBe( wrapper.find( '#replycontent' ).element );
	await wrapper.find( '#wp-replycontent-editor-container' ).trigger( 'keyup', { key: 'Escape' } );
	await settle( 3 );
	expect( wrapper.find( '#replyrow button.cancel' ).exists() ).toBe( false );
	expect( document.activeElement ).toBe( button );
	expect( api.calls ).toEqual( [] );
} );

test( 'Cancel and Escape on a Reply give the focus back to the Reply button', async () => {
	const wrapper = await mountComments();
	const button = await open( wrapper, 8, 'replyto' );
	expect( wrapper.find( '#replyhead' ).exists() ).toBe( true );
	await wrapper.find( '#replyrow button.cancel' ).trigger( 'click' );
	await settle( 3 );
	expect( document.activeElement ).toBe( button );

	await open( wrapper, 8, 'replyto' );
	await wrapper.find( '#wp-replycontent-editor-container' ).trigger( 'keyup', { key: 'Escape' } );
	await settle( 3 );
	expect( wrapper.find( '#replyhead' ).exists() ).toBe( false );
	expect( document.activeElement ).toBe( button );
	expect( api.calls ).toEqual( [] );
} );

test( 'Reply on a pending comment says Approve and Reply and posts the typed text', async () => {
	api.respondWith( async () => answer( { id: 7, replyRow: row( 50, { content: 'The reply' } ), parent: { approved: true, row: row( 7 ) } } ) );
	const wrapper = await mountComments();
	await open( wrapper, 7, 'replyto' );
	expect( wrapper.find( '#replybtn' ).text() ).toBe( 'Approve and Reply' );
	const area = wrapper.find( '#replycontent' );
	area.element.value = 'The reply';
	await area.trigger( 'input' );
	await wrapper.find( '#replyrow button.save' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/comments/7/reply' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { content: 'The reply', screen: 'edit-comments' } );
	// The form is gone, the reply's row follows the comment, and the parent is approved.
	expect( wrapper.find( '#replycontent' ).exists() ).toBe( false );
	expect( wrapper.find( '#comment-50' ).exists() ).toBe( true );
	expect( wrapper.find( '#comment-7' ).classes() ).not.toContain( 'unapproved' );
} );

test( 'an empty reply: the error WordPress gives shows in the form and is spoken; the form stays', async () => {
	const spoken = [];
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Error: Please type your comment text.' ), { status: 200 } );
	} );
	const wrapper = await mountComments( commentsData(), { speak: ( message ) => spoken.push( message ) } );
	await open( wrapper, 8, 'replyto' );
	await wrapper.find( '#replyrow button.save' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#replyrow .notice-error .error' ).text() ).toBe( 'Error: Please type your comment text.' );
	expect( wrapper.find( '#replyrow .notice-error' ).classes() ).not.toContain( 'hidden' );
	expect( spoken ).toEqual( [ 'Error: Please type your comment text.' ] );
	expect( wrapper.find( '#replyrow button.save' ).attributes( 'disabled' ) ).toBeUndefined();
} );

// The Quicktags toolbar, core's own script -------------------------------------------------------

const WP_SRC = resolve( process.cwd(), process.env.WP_SRC ?? '../wordpress-develop-original/src' );
const QUICKTAGS = resolve( WP_SRC, 'js/_enqueues/lib/quicktags.js' );

( existsSync( QUICKTAGS ) ? test : test.skip )( 'the Quicktags toolbar inserts its tags around the selection and the form takes the text', async () => {
	// Core's script is self-contained: it needs the document and its own L10n object.
	window.quicktagsL10n = { closeAllOpenTags: 'Close all open tags', closeTags: 'close tags', enterURL: 'Enter the URL', enterImageURL: 'Enter the URL of the image', enterImageDescription: 'Enter a description of the image', fullscreen: 'fullscreen', toggleFullscreen: 'Toggle fullscreen mode', textdirection: 'text direction', toggleTextdirection: 'Toggle Editor Text Direction', dfw: 'Distraction-free writing mode' };
	( 0, eval )( readFileSync( QUICKTAGS, 'utf8' ) );
	expect( typeof window.quicktags ).toBe( 'function' );
	// jsdom has no layout: Quicktags ignores a click on a button whose width is 0 (a hidden one).
	const width = Object.getOwnPropertyDescriptor( Element.prototype, 'clientWidth' );
	Object.defineProperty( Element.prototype, 'clientWidth', { configurable: true, get: () => 40 } );
	try {
		const form = state();
		const wrapper = inTable( form, { quicktagsEditor: mountQuicktagsEditor }, { id: 'replycontent', buttons: 'strong,em' } );
		await settle( 4 );
		await new Promise( ( resolveTimer ) => setTimeout( resolveTimer, 50 ) );
		const toolbar = document.getElementById( 'qt_replycontent_toolbar' );
		expect( toolbar ).not.toBeNull();
		const area = document.getElementById( 'replycontent' );
		expect( area.previousElementSibling ).toBe( toolbar );
		// The two buttons the page asked for.
		expect( [ ...toolbar.querySelectorAll( 'input.ed_button' ) ].map( ( button ) => button.value ) ).toEqual( [ 'b', 'i' ] );

		area.value = 'bold words';
		area.setSelectionRange( 0, area.value.length );
		document.getElementById( 'qt_replycontent_strong' ).click();
		expect( area.value ).toBe( '<strong>bold words</strong>' );
		expect( form.content ).toBe( '<strong>bold words</strong>' );

		wrapper.unmount();
		expect( document.getElementById( 'qt_replycontent_toolbar' ) ).toBeNull();
	} finally {
		Object.defineProperty( Element.prototype, 'clientWidth', width );
		delete window.QTags;
		delete window.quicktags;
		delete window.quicktagsL10n;
	}
} );
