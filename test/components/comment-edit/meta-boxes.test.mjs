/** @jest-environment jsdom */
// The meta boxes of the Edit Comment page, through core/meta-box-holder: a box's handle saves the
// closed boxes for screen `comment`, and so does the Screen Options checkbox.
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

const SECTIONS = [ { id: 'metabox-prefs', legend: 'Screen elements', description: 'Some screen elements can be shown or hidden by using the checkboxes.', items: [ { id: 'acme-one', label: 'Acme one', checked: true }, { id: 'acme-two', label: 'Acme two', checked: true } ] } ];
const boxIds = ( wrapper ) => wrapper.findAll( '#postbox-container-2 #normal-sortables .postbox' ).map( ( box ) => box.attributes( 'id' ) );

test( 'the normal boxes sit in #postbox-container-2, in the data\'s order, with their HTML', async () => {
	const wrapper = await openPage( DATA(), recorder() );
	expect( boxIds( wrapper ) ).toEqual( [ 'acme-one', 'acme-two' ] );
	expect( wrapper.find( '#acme-one .acme-one-body' ).text() ).toBe( 'Acme one body' );
	expect( wrapper.findAll( '#postbox-container-1' ) ).toHaveLength( 1 );
} );

test( 'collapsing a box posts the closed boxes to the comment screen\'s preferences, and opening it posts them again', async () => {
	const wrapper = await openPage( DATA(), recorder() );
	await wrapper.find( '#acme-one .handlediv' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#acme-one' ).classes() ).toContain( 'closed' );
	expect( api.calls.map( ( call ) => [ call.method, call.route, call.payload ] ) ).toEqual( [ [ 'POST', 'wp-admin/v1/screen-preferences/comment', { closed: [ 'acme-one' ], hidden: [] } ] ] );

	await wrapper.find( '#acme-one .handlediv' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#acme-one' ).classes() ).not.toContain( 'closed' );
	expect( api.calls.at( -1 ).payload ).toEqual( { closed: [], hidden: [] } );
	expect( api.calls ).toHaveLength( 2 );
} );

test( 'Screen Options hide a box: the checkbox posts it as hidden, and the box goes', async () => {
	let options = null;
	const wrapper = await openPage( DATA( { screenOptions: { sections: SECTIONS, reordering: true, columns: null } } ), recorder(), { screenOptions: { set: ( given ) => {
		options = given;
		return () => {};
	} } } );
	expect( options.sections ).toEqual( SECTIONS );
	expect( options.reordering ).toBe( true );
	options.onChange( 'acme-two', false );
	await flushPromises();
	expect( api.calls.map( ( call ) => [ call.route, call.payload ] ) ).toEqual( [ [ 'wp-admin/v1/screen-preferences/comment', { closed: [], hidden: [ 'acme-two' ] } ] ] );
	expect( wrapper.find( '#acme-two' ).classes() ).toContain( 'hide-if-js' );
	expect( wrapper.find( '#acme-one' ).classes() ).not.toContain( 'hide-if-js' );
} );

test( 'a box whose callback failed says so, and a plugin box\'s fields are not sent with Update (owner decision Q1)', async () => {
	const failed = { ...DATA().boxes[ 0 ], html: '', error: true };
	const wrapper = await openPage( DATA( { boxes: [ failed, DATA().boxes[ 1 ] ] } ), recorder() );
	expect( wrapper.find( '#acme-one .wp-admin-legacy-failure' ).text() ).toBe( 'This box could not be displayed.' );
	await wrapper.find( 'form#post' ).trigger( 'submit' );
	await flushPromises();
	const saved = api.calls.find( ( call ) => call.route === 'wp-admin/v1/comments/5' );
	expect( Object.keys( saved.payload ).sort() ).toEqual( [ 'author', 'content', 'date', 'email', 'parent', 'referredby', 'screen', 'status', 'url' ] );
} );
