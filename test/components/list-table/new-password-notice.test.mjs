/** @jest-environment jsdom */
// The one-time notice of a new application password and the plugin-fields note that the Users
// and Profile pages share (list-table-parts/new-password-notice.js, plugin-note.js): the
// password as text with Copy, "Copied!" for three seconds, the copy spoken, Dismiss when
// dismissible, the focus the page gives it; one note text and class.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h, nextTick, ref } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import NewPasswordNotice, { COPIED_MS } from '../../../site/components/core/list-table-parts/new-password-notice.js';
import PluginNote from '../../../site/components/core/list-table-parts/plugin-note.js';

let clipboard;

beforeEach( () => {
	clipboard = [];
	Object.defineProperty( navigator, 'clipboard', { configurable: true, value: { writeText: async ( text ) => clipboard.push( text ) } } );
} );
afterEach( () => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	delete navigator.clipboard;
} );

test( 'the notice: the label with the name as text, the password read-only, Copy, the warning; no Dismiss unless dismissible', () => {
	const wrapper = mountPart( NewPasswordNotice, { props: { name: 'O\'Brien & <b>Phone</b>', password: 'abcd ABCD', classes: 'notice-alt below-h2' } } );
	const notice = wrapper.find( 'div' );
	expect( notice.classes() ).toEqual( [ 'notice', 'notice-success', 'notice-alt', 'below-h2' ] );
	expect( [ notice.attributes( 'role' ), notice.attributes( 'tabindex' ) ] ).toEqual( [ 'alert', '-1' ] );
	expect( notice.find( 'label[for="new-application-password-value"]' ).text() ).toBe( 'Your new password for O\'Brien & <b>Phone</b> is:' );
	expect( notice.find( 'label strong b' ).exists() ).toBe( false );
	const field = notice.find( 'input#new-application-password-value' );
	expect( [ field.element.value, field.attributes( 'readonly' ) !== undefined ] ).toEqual( [ 'abcd ABCD', true ] );
	expect( notice.find( 'button.copy-button' ).text() ).toBe( 'Copy' );
	expect( notice.findAll( 'p' )[ 1 ].text() ).toBe( 'Be sure to save this in a safe location. You will not be able to retrieve it.' );
	expect( notice.find( 'button.notice-dismiss' ).exists() ).toBe( false );
} );

test( 'Copy writes the password, shows Copied! for COPIED_MS and speaks it; a failed copy shows nothing', async () => {
	jest.useFakeTimers( { doNotFake: [ 'nextTick', 'setImmediate', 'queueMicrotask' ] } );
	const spoken = [];
	const wrapper = mountPart( NewPasswordNotice, { props: { name: 'Phone', password: 'abcd ABCD' }, provide: { speak: ( message ) => spoken.push( message ) } } );
	await wrapper.find( 'button.copy-button' ).trigger( 'click' );
	await flushPromises();
	expect( clipboard ).toEqual( [ 'abcd ABCD' ] );
	expect( wrapper.find( '.success' ).classes() ).not.toContain( 'hidden' );
	expect( spoken ).toEqual( [ 'Application password has been copied to your clipboard.' ] );
	expect( COPIED_MS ).toBe( 3000 );
	jest.advanceTimersByTime( COPIED_MS - 1 );
	await nextTick();
	expect( wrapper.find( '.success' ).classes() ).not.toContain( 'hidden' );
	jest.advanceTimersByTime( 1 );
	await nextTick();
	expect( wrapper.find( '.success' ).classes() ).toContain( 'hidden' );

	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	navigator.clipboard.writeText = async () => {
		throw new Error( 'Denied.' );
	};
	await wrapper.find( 'button.copy-button' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '.success' ).classes() ).toContain( 'hidden' );
	expect( spoken ).toHaveLength( 1 );
} );

test( 'dismissible: Dismiss emits dismiss; focus() puts the focus on the notice', async () => {
	const dismissed = [];
	const notice = ref( null );
	const wrapper = mountPart( {
		render: () => h( NewPasswordNotice, { ref: notice, name: 'Phone', password: 'abcd', classes: 'new-application-password-notice', dismissible: true, onDismiss: () => dismissed.push( true ) } ),
	} );
	expect( wrapper.find( 'div' ).classes() ).toEqual( [ 'notice', 'notice-success', 'new-application-password-notice', 'is-dismissible' ] );
	notice.value.focus();
	expect( document.activeElement ).toBe( wrapper.find( 'div.notice' ).element );
	await wrapper.find( 'button.notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( 'button.notice-dismiss .screen-reader-text' ).text() ).toBe( 'Dismiss this notice.' );
	expect( dismissed ).toEqual( [ true ] );
} );

test( 'PluginNote: the one note text, with one class wherever it shows', () => {
	const wrapper = mountPart( PluginNote );
	expect( wrapper.find( 'p' ).classes() ).toEqual( [ 'description', 'wp-admin-plugin-note' ] );
	expect( wrapper.text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
} );

test( 'PluginNote: a text given says what else the screen does not run, with the same class', () => {
	const wrapper = mountPart( PluginNote, { props: { text: 'A plugin changes this setting\'s template, which this screen does not show.' } } );
	expect( wrapper.find( 'p' ).classes() ).toEqual( [ 'description', 'wp-admin-plugin-note' ] );
	expect( wrapper.text() ).toBe( 'A plugin changes this setting\'s template, which this screen does not show.' );
} );
