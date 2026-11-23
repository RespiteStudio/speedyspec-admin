/** @jest-environment jsdom */
// The forms' check before sending (form.validate, ajax-response.js's validateForm()): an empty
// field of a `.form-required` row marks its row `form-invalid` and nothing is sent; a change of
// the field clears its row.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { requiredEmpty } from '../../../site/components/core/user-new.js';
import { loadContracts, mountUserNew, multisiteData, setMeter, settle, singleData, unsetMeter } from './data.mjs';

beforeEach( async () => {
	api.reset();
	setMeter( 4 );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	unsetMeter();
	document.body.className = '';
	document.body.innerHTML = '';
} );

const invalid = ( wrapper ) => wrapper.findAll( 'tr.form-invalid' ).map( ( row ) => row.find( 'input' ).attributes( 'id' ) );

test( 'requiredEmpty: the empty required fields, the password only when its row shows', () => {
	expect( requiredEmpty( { user_login: '', email: 'a@example.org' }, { password: true }, 'pw' ) ).toEqual( [ 'user_login' ] );
	expect( requiredEmpty( { user_login: 'u', email: '' }, { password: true }, '' ) ).toEqual( [ 'email', 'pass1' ] );
	expect( requiredEmpty( { user_login: '', email: '' }, { password: false }, '' ) ).toEqual( [ 'user_login', 'email' ] );
} );

test( 'empty username or email marks the row form-invalid and sends nothing; a change clears the row', async () => {
	const wrapper = await mountUserNew();
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( invalid( wrapper ) ).toEqual( [ 'user_login', 'email' ] );
	expect( api.calls ).toEqual( [] );
	await wrapper.find( '#user_login' ).setValue( 'someone' );
	await wrapper.find( '#user_login' ).trigger( 'change' );
	expect( invalid( wrapper ) ).toEqual( [ 'email' ] );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( invalid( wrapper ) ).toEqual( [ 'email' ] );
	expect( api.calls ).toEqual( [] );
	await wrapper.find( '#email' ).setValue( 'someone@example.org' );
	await wrapper.find( '#email' ).trigger( 'change' );
	api.respondWith( async () => ( { redirect: 'users.php?update=add&id=7', location: null } ) );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( invalid( wrapper ) ).toEqual( [] );
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ 'wp-admin/v1/users' ] );
} );

test( 'an emptied password marks the password row too', async () => {
	const wrapper = await mountUserNew( singleData() );
	await wrapper.find( '#user_login' ).setValue( 'someone' );
	await wrapper.find( '#email' ).setValue( 'someone@example.org' );
	await wrapper.find( '#pass1' ).setValue( '' );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( invalid( wrapper ) ).toEqual( [ 'pass1' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'Add Existing User: an empty email marks its row and sends nothing', async () => {
	const wrapper = await mountUserNew( multisiteData() );
	await wrapper.find( 'form#adduser' ).trigger( 'submit' );
	await settle();
	expect( wrapper.findAll( 'form#adduser tr.form-invalid #adduser-email' ) ).toHaveLength( 1 );
	expect( api.calls ).toEqual( [] );
	await wrapper.find( '#adduser-email' ).setValue( 'someone' );
	await wrapper.find( '#adduser-email' ).trigger( 'change' );
	expect( wrapper.findAll( 'form#adduser tr.form-invalid' ) ).toHaveLength( 0 );
} );
