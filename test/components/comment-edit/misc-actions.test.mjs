/** @jest-environment jsdom */
// The Save box of the Edit Comment page: the plugins' misc actions are their HTML
// (edit_comment_misc_actions), and the rest of the box shows what the data says.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { ANSWER, DATA, api, flushPromises, openPage, recorder, useContracts } from './data.mjs';

const setup = useContracts();
beforeEach( async () => {
	api.reset();
	api.respondWith( async () => ANSWER() );
	await setup();
} );
afterEach( () => resetContracts() );

test( 'the misc actions HTML of the data is shown in #misc-publishing-actions, with its markup', async () => {
	const wrapper = await openPage( DATA( { miscActionsHtml: '<div class="misc-pub-section detached-fixture-misc">Fixture misc</div><a class="acme-link" href="#acme">Acme</a>' } ), recorder() );
	const misc = wrapper.find( '#misc-publishing-actions .detached-fixture-misc' );
	expect( misc.exists() ).toBe( true );
	expect( misc.text() ).toBe( 'Fixture misc' );
	expect( misc.classes() ).toContain( 'misc-pub-section' );
	expect( wrapper.find( '#misc-publishing-actions .acme-link' ).attributes( 'href' ) ).toBe( '#acme' );
} );

test( 'template braces in the misc HTML stay text', async () => {
	const wrapper = await openPage( DATA( { miscActionsHtml: '<p class="braces">{{ 1 + 1 }}</p>' } ), recorder() );
	expect( wrapper.find( '.braces' ).text() ).toBe( '{{ 1 + 1 }}' );
} );

test( 'no misc HTML, no section of it', async () => {
	const wrapper = await openPage( DATA( { miscActionsHtml: '' } ), recorder() );
	expect( wrapper.find( '.acme-misc' ).exists() ).toBe( false );
	expect( wrapper.find( '#misc-publishing-actions .wp-admin-legacy-html' ).exists() ).toBe( false );
} );

test( 'the Save box: the status radios, the response link, and Update and the delete link as the data gives them', async () => {
	const wrapper = await openPage( DATA( { status: '0' } ), recorder() );
	expect( wrapper.find( '#comment-status-display' ).text() ).toBe( 'Pending' );
	expect( wrapper.findAll( '#comment-status-radio input' ).map( ( input ) => [ input.element.value, input.element.checked ] ) ).toEqual( [ [ '1', false ], [ '0', true ], [ 'spam', false ] ] );
	expect( wrapper.find( '.misc-pub-response-to' ).text().replace( /\s+/g, ' ' ) ).toBe( 'In response to: The post' );
	expect( wrapper.find( '.misc-pub-response-to a' ).attributes( 'href' ) ).toBe( '/wp-admin/post.php?post=40&action=edit' );
	expect( wrapper.find( '#delete-action a' ).text() ).toBe( 'Move to Trash' );
	expect( wrapper.find( '#save' ).element.value ).toBe( 'Update' );
} );

test( 'the status radios change what Update sends', async () => {
	const wrapper = await openPage( DATA( { status: '1' } ), recorder() );
	await wrapper.find( '#comment-status-radio input[value="spam"]' ).setValue( true );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	expect( api.calls[ 0 ].payload.status ).toBe( 'spam' );
} );
