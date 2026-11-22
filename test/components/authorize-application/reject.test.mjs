/** @jest-environment jsdom */
// Authorize Application's Reject (core/authorize-application): it posts the request with
// `approve: false` and follows WordPress's answer as Approve does: the reject URL (or the success
// URL with `success=false`) loaded, the Dashboard through the router, a refused scheme said and
// not loaded, a failed answer said; it never shows a password. New data resets the page.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { ref } from 'vue';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { APP_ID, ROUTE, answer, apiError, authorizeData, loadContracts, mountAuthorize, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = bodyClass;
	document.body.innerHTML = '';
} );

test( 'Reject posts the request with approve false and loads the reject URL WordPress answered', async () => {
	api.respondWith( async () => answer( { location: 'https://app.example.org/done?success=false' } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#reject' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ {
		method: 'POST',
		route: ROUTE,
		payload: { app_name: 'Acme App', app_id: APP_ID, success_url: 'https://app.example.org/done', reject_url: 'https://app.example.org/done?success=false', approve: false },
	} ] );
	expect( wrapper.record.assigned ).toEqual( [ 'https://app.example.org/done?success=false' ] );
	expect( wrapper.find( '#new-application-password-value' ).exists() ).toBe( false );
} );

test( 'Reject without a reject URL goes to the Dashboard through the router', async () => {
	api.respondWith( async () => answer( { redirect: '' } ) );
	const wrapper = await mountAuthorize( authorizeData( { request: { appName: 'Acme App', appId: '', successUrl: null, rejectUrl: null } } ) );
	await wrapper.find( 'input#reject' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 0 ].payload ).toEqual( { app_name: 'Acme App', app_id: '', success_url: '', reject_url: '', approve: false } );
	expect( wrapper.record.followed ).toEqual( [ { redirect: '' } ] );
	expect( wrapper.record.assigned ).toEqual( [] );
} );

test( 'Reject: a vbscript: reject URL is refused and said, nothing loads', async () => {
	api.respondWith( async () => answer( { location: 'vbscript://app.example.org/x' } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#reject' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.assigned ).toEqual( [] );
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Invalid URL format.' ] ] );
} );

test( 'Reject: a failed answer is said in a page notice and the form stays', async () => {
	api.respondWith( async () => {
		throw apiError( 'Fixture reject failure.' );
	} );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#reject' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture reject failure.' ] ] );
	expect( wrapper.record.assigned ).toEqual( [] );
	expect( wrapper.find( 'form.form-wrap' ).exists() ).toBe( true );
} );

test( 'Reject: an answer that carries a password shows none', async () => {
	api.respondWith( async () => answer( { password: 'abcd', chunked: 'ab cd' } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#reject' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#new-application-password-value' ).exists() ).toBe( false );
	expect( wrapper.find( 'form.form-wrap' ).exists() ).toBe( true );
} );

test( 'new data resets the name field to the request\'s name', async () => {
	const data = ref( authorizeData() );
	const wrapper = await mountAuthorize( data );
	await wrapper.find( 'input#app_name' ).setValue( 'Typed' );
	data.value = authorizeData( { request: { appName: 'Other App', appId: '', successUrl: null, rejectUrl: null } } );
	await settle();
	expect( wrapper.find( 'input#app_name' ).element.value ).toBe( 'Other App' );
} );
