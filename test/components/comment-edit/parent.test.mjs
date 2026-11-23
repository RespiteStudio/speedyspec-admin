/** @jest-environment jsdom */
// The "In reply to" part of the Edit Comment Save box, driven with real change and click events:
// Edit, OK and Cancel (comment.js:110-165). WordPress chooses the parents offered.
import { expect, test } from '@jest/globals';
import { h, ref } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import CommentParent from '../../../site/components/core/comment-edit/parent.js';
import { CHOICES } from './data.mjs';

/** The part with a v-model held by a host; `emitted` lists every value it emits. */
function open( { parent = null, parentId = 0, choices = CHOICES() } = {} ) {
	const emitted = [];
	const Host = { setup() {
		const value = ref( String( parentId ) );
		return () => h( CommentParent, { parent, parentId, choices, modelValue: value.value, 'onUpdate:modelValue': ( next ) => {
			emitted.push( next );
			value.value = next;
		} } );
	} };
	return { wrapper: mountPart( Host ), emitted };
}

const display = ( wrapper ) => wrapper.find( '#comment-parent-display' ).text().replace( /\s+/g, ' ' ).trim();
const BEA = { id: 12, title: 'Bea', url: 'https://example.org/p/#comment-12' };

test( 'no parent: "In reply to: None"; the dropdown lists None, then the server\'s choices', () => {
	const { wrapper } = open();
	expect( display( wrapper ) ).toBe( 'In reply to: None' );
	expect( wrapper.findAll( '#comment_parent option' ).map( ( option ) => [ option.element.value, option.text() ] ) ).toEqual( [ [ '0', 'None (top-level comment)' ], [ '12', 'Bea: First words' ], [ '13', 'Cy: Other words' ] ] );
	expect( wrapper.find( '#comment-parent-div' ).element.style.display ).toBe( 'none' );
} );

test( 'a parent: its link is shown, and the hidden field holds its id', () => {
	const { wrapper } = open( { parent: BEA, parentId: 12 } );
	expect( display( wrapper ) ).toBe( 'In reply to: Bea' );
	expect( wrapper.find( '#comment-parent-display a' ).attributes( 'href' ) ).toBe( BEA.url );
	expect( wrapper.find( '#hidden_comment_parent' ).element.value ).toBe( '12' );
	expect( wrapper.find( '#comment_parent' ).element.value ).toBe( '12' );
} );

test( 'Edit opens the dropdown, hides its own link and focuses the dropdown', async () => {
	const { wrapper } = open();
	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#comment-parent-div' ).element.style.display ).toBe( 'block' );
	expect( wrapper.find( '.edit-comment-parent' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '#comment_parent' ).element );
} );

test( 'OK shows the chosen author (its label when there is none), emits the choice, closes and focuses Edit', async () => {
	const { wrapper, emitted } = open();
	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await wrapper.find( '#comment_parent' ).setValue( '12' );
	await wrapper.find( '.save-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( display( wrapper ) ).toBe( 'In reply to: Bea' );
	expect( emitted ).toEqual( [ '12' ] );
	expect( wrapper.find( '#comment-parent-div' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '.edit-comment-parent' ).element );

	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await wrapper.find( '#comment_parent' ).setValue( '13' );
	await wrapper.find( '.save-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( display( wrapper ) ).toBe( 'In reply to: Cy: Other words' );

	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await wrapper.find( '#comment_parent' ).setValue( '0' );
	await wrapper.find( '.save-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( display( wrapper ) ).toBe( 'In reply to: None' );
	expect( emitted ).toEqual( [ '12', '13', '0' ] );
} );

test( 'Cancel puts back the loaded parent, its link and the dropdown, closes and focuses Edit', async () => {
	const { wrapper, emitted } = open( { parent: BEA, parentId: 12 } );
	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await wrapper.find( '#comment_parent' ).setValue( '13' );
	await wrapper.find( '.save-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( display( wrapper ) ).toBe( 'In reply to: Cy: Other words' );
	await wrapper.find( '.edit-comment-parent' ).trigger( 'click' );
	await wrapper.find( '#comment_parent' ).setValue( '0' );
	await wrapper.find( '.cancel-comment-parent' ).trigger( 'click' );
	await flushPromises();
	expect( emitted.at( -1 ) ).toBe( '12' );
	expect( wrapper.find( '#comment_parent' ).element.value ).toBe( '12' );
	expect( display( wrapper ) ).toBe( 'In reply to: Bea' );
	expect( wrapper.find( '#comment-parent-display a' ).attributes( 'href' ) ).toBe( BEA.url );
	expect( wrapper.find( '#comment-parent-div' ).element.style.display ).toBe( 'none' );
	expect( document.activeElement ).toBe( wrapper.find( '.edit-comment-parent' ).element );
} );

test( 'the loaded parent that is not among the choices is offered last, and chosen', () => {
	const { wrapper } = open( { parent: BEA, parentId: 99, choices: { ...CHOICES(), current: { id: 99, label: 'Old: Gone', author: 'Old' } } } );
	expect( wrapper.findAll( '#comment_parent option' ).map( ( option ) => option.element.value ) ).toEqual( [ '0', '12', '13', '99' ] );
	expect( wrapper.find( '#comment_parent' ).element.value ).toBe( '99' );
} );

test( 'without choices (threading off) there is no editor and no Edit link', () => {
	const { wrapper } = open( { choices: null } );
	expect( display( wrapper ) ).toBe( 'In reply to: None' );
	expect( wrapper.find( '.edit-comment-parent' ).exists() ).toBe( false );
	expect( wrapper.find( '#comment_parent' ).exists() ).toBe( false );
} );
