/** @jest-environment jsdom */
// The date of the Edit Comment Save box, driven with real input, change and click events: Edit,
// OK, Cancel and an invalid date (comment.js:30-96).
import { expect, test } from '@jest/globals';
import { h, ref } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import Timestamp from '../../../site/components/core/comment-edit/timestamp.js';
import { DATE } from './data.mjs';

/** The part with the date's v-model held by a host, as the page holds it; `emitted` lists every value it emits. */
function open() {
	const emitted = [];
	const date = DATE();
	const Host = { setup() {
		const value = ref( { ...date.parts } );
		return () => h( Timestamp, { date, modelValue: value.value, 'onUpdate:modelValue': ( next ) => {
			emitted.push( next );
			value.value = next;
		} } );
	} };
	return { wrapper: mountPart( Host ), emitted };
}

const text = ( wrapper, selector ) => wrapper.find( selector ).text().replace( /\s+/g, ' ' ).trim();
const parts = ( wrapper ) => [ 'aa', 'mm', 'jj', 'hh', 'mn' ].map( ( key ) => wrapper.find( '#' + key ).element.value );

test( 'closed at first: the date as loaded, the editor hidden, the loaded parts in the hidden_ fields', () => {
	const { wrapper } = open();
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Mar 7, 2024 at 09:05' );
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'none' );
	expect( wrapper.find( '.edit-timestamp' ).element.style.display ).toBe( '' );
	expect( [ 'mm', 'jj', 'aa', 'hh', 'mn' ].map( ( key ) => wrapper.find( '#hidden_' + key ).element.value ) ).toEqual( [ '03', '07', '2024', '09', '05' ] );
	expect( wrapper.find( '#ss' ).element.value ).toBe( '30' );
} );

test( 'Edit opens the editor, hides its own link and focuses the month', async () => {
	const { wrapper } = open();
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'block' );
	expect( wrapper.find( '.edit-timestamp' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '#mm' ).element );
} );

test( 'OK with a valid date shows it as comment.js does, emits the parts, closes and focuses Edit', async () => {
	const { wrapper, emitted } = open();
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await wrapper.find( '#mm' ).setValue( '02' );
	await wrapper.find( '#jj' ).setValue( '9' );
	await wrapper.find( '#hh' ).setValue( '7' );
	await wrapper.find( '.save-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Feb 9, 2024 at 07:05' );
	expect( wrapper.find( '#timestamp b' ).text() ).toBe( 'Feb 9, 2024 at 07:05' );
	expect( wrapper.find( '#timestampdiv .timestamp-wrap' ).classes() ).not.toContain( 'form-invalid' );
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '.edit-timestamp' ).element );
	expect( emitted.at( -1 ) ).toEqual( { aa: '2024', mm: '02', jj: '9', hh: '7', mn: '05', ss: '30' } );
} );

test( 'OK with February 30 marks form-invalid, stays open and leaves the shown date alone; a valid date clears the mark', async () => {
	const { wrapper } = open();
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await wrapper.find( '#mm' ).setValue( '02' );
	await wrapper.find( '#jj' ).setValue( '30' );
	await wrapper.find( '.save-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#timestampdiv .timestamp-wrap' ).classes() ).toContain( 'form-invalid' );
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'block' );
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Mar 7, 2024 at 09:05' );

	await wrapper.find( '#jj' ).setValue( '29' );
	await wrapper.find( '.save-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#timestampdiv .timestamp-wrap' ).classes() ).not.toContain( 'form-invalid' );
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Feb 29, 2024 at 09:05' );
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'none' );
} );

test( 'Cancel puts back the loaded parts and the loaded display, closes, and focuses Edit', async () => {
	const { wrapper, emitted } = open();
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await wrapper.find( '#aa' ).setValue( '1999' );
	await wrapper.find( '#mm' ).setValue( '12' );
	await wrapper.find( '#jj' ).setValue( '31' );
	await wrapper.find( '#hh' ).setValue( '23' );
	await wrapper.find( '#mn' ).setValue( '59' );
	expect( parts( wrapper ) ).toEqual( [ '1999', '12', '31', '23', '59' ] );
	await wrapper.find( '.cancel-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( parts( wrapper ) ).toEqual( [ '2024', '03', '07', '09', '05' ] );
	expect( emitted.at( -1 ) ).toEqual( { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05', ss: '30' } );
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Mar 7, 2024 at 09:05' );
	expect( wrapper.find( '#timestampdiv' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '.edit-timestamp' ).element );
} );

test( 'Cancel after an accepted date puts back the loaded display too', async () => {
	const { wrapper } = open();
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await wrapper.find( '#aa' ).setValue( '1999' );
	await wrapper.find( '.save-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Mar 7, 1999 at 09:05' );
	await wrapper.find( '.edit-timestamp' ).trigger( 'click' );
	await wrapper.find( '.cancel-timestamp' ).trigger( 'click' );
	await flushPromises();
	expect( text( wrapper, '#timestamp' ) ).toBe( 'Submitted on: Mar 7, 2024 at 09:05' );
	expect( parts( wrapper ) ).toEqual( [ '2024', '03', '07', '09', '05' ] );
} );
