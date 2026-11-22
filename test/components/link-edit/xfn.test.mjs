/** @jest-environment jsdom */
// The Link Relationship (XFN) box (link_xfn_meta_box(), xfn.js): `rel` is read-only and composed
// from the choices on a click or a key (composeRel()), "another web address of mine" disables the
// others (meDisables()), and the save sends the composed `rel`.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { composeRel, meDisables } from '../../../site/components/core/link-edit/xfn.js';
import { editData, loadContracts, mountLink, settle, xfnGroups } from './data.mjs';

beforeEach( async () => {
	api.reset();
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
} );

/** Clicks a control as the user does (its check changes, then click and change fire). */
async function press( wrapper, selector ) {
	wrapper.find( selector ).element.click();
	await settle();
}

test( 'composeRel; meDisables: the checked values in order, none for an empty value, "me" alone when it is checked', () => {
	expect( composeRel( { me: false, values: [ 'friend', 'met', 'co-worker' ] } ) ).toBe( 'friend met co-worker' );
	expect( composeRel( { me: false, values: [ '', 'met', '' ] } ) ).toBe( 'met' );
	expect( composeRel( { me: false, values: [] } ) ).toBe( '' );
	expect( composeRel( { me: true, values: [ 'friend', 'met' ] } ) ).toBe( 'me' );
	expect( meDisables( { me: true, values: [] } ) ).toBe( true );
	expect( meDisables( { me: false, values: [ 'friend' ] } ) ).toBe( false );
} );

test( 'the box: rel read-only with the stored value, the groups in classic order with the classic ids and checks', async () => {
	const wrapper = await mountLink();
	const rel = wrapper.find( '#linkxfndiv #link_rel' );
	expect( rel.element.readOnly ).toBe( true );
	expect( rel.element.value ).toBe( 'friend met' );
	expect( wrapper.find( '#me' ).attributes( 'name' ) ).toBe( 'identity' );
	expect( wrapper.findAll( '#linkxfndiv table.links-table th' ).map( ( th ) => th.text().trim() ) ).toEqual( [ 'rel:', 'identity', 'friendship', 'physical', 'professional', 'geographical', 'family', 'romantic' ] );
	expect( wrapper.findAll( 'input.valinp[name="friendship"]' ).map( ( input ) => [ input.attributes( 'id' ), input.element.value, input.element.checked ] ) ).toEqual( [ [ 'contact', 'contact', false ], [ 'acquaintance', 'acquaintance', false ], [ 'friend', 'friend', true ], [ 'friendship', '', false ] ] );
	expect( wrapper.find( '#romantic' ).element.value ).toBe( 'sweetheart' );
	expect( wrapper.find( '#met' ).element.checked ).toBe( true );
	// The none choices WordPress checks.
	expect( wrapper.find( '#geographical' ).element.checked ).toBe( true );
	expect( wrapper.find( '#family' ).element.checked ).toBe( true );
} );

test( 'XFN composes rel; "another web address of mine" disables the others, and the save sends rel', async () => {
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const wrapper = await mountLink();
	await press( wrapper, '#contact' );
	await press( wrapper, '#colleague' );
	expect( wrapper.find( '#link_rel' ).element.value ).toBe( 'contact met colleague' );
	expect( wrapper.find( '#friend' ).element.checked ).toBe( false );

	await press( wrapper, '#me' );
	expect( wrapper.find( '#link_rel' ).element.value ).toBe( 'me' );
	const valinp = wrapper.findAll( 'input.valinp' );
	expect( valinp.every( ( input ) => input.element.disabled ) ).toBe( true );
	expect( wrapper.find( 'label[for="contact"]' ).classes() ).toContain( 'disabled' );

	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( api.calls.at( -1 ).payload.fields.link_rel ).toBe( 'me' );

	await wrapper.find( '#me' ).setValue( false );
	await wrapper.find( '#me' ).trigger( 'keyup' );
	expect( wrapper.find( '#link_rel' ).element.value ).toBe( 'contact met colleague' );
	expect( wrapper.findAll( 'input.valinp' ).some( ( input ) => input.element.disabled ) ).toBe( false );
} );

test( 'meDisables: as xfn.js, the others are disabled only once the box is used, and the stored rel stays until then', async () => {
	const wrapper = await mountLink( editData( { link: { ...editData().link, rel: 'me nofollow' }, xfn: { rel: 'me nofollow', me: true, groups: xfnGroups() } } ) );
	expect( wrapper.find( '#me' ).element.checked ).toBe( true );
	expect( wrapper.find( '#link_rel' ).element.value ).toBe( 'me nofollow' );
	expect( wrapper.findAll( 'input.valinp' ).some( ( input ) => input.element.disabled ) ).toBe( false );
	await press( wrapper, '#link_rel' );
	expect( wrapper.find( '#link_rel' ).element.value ).toBe( 'me' );
	expect( wrapper.findAll( 'input.valinp' ).every( ( input ) => input.element.disabled ) ).toBe( true );
} );
