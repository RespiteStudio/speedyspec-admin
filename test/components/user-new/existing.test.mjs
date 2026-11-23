/** @jest-environment jsdom */
// Add User on multisite (core/user-new): the Add Existing User form (form#adduser) with its
// headings, field, roles, Skip Confirmation Email and the suggestions of user-suggest.js from
// users/suggest; its payload (POST users/existing) and redirect; the Add User form of a network
// (Username, Email, Role, Skip Confirmation Email) and its payload; the errors of `update=`.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import { apiError, existingForm, host, loadContracts, mountUserNew, multisiteCreate, multisiteData, setMeter, settle, singleData, unsetMeter } from './data.mjs';

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

const SUGGESTIONS = [ { label: 'detachedu1 (detachedu1@example.org)', value: 'detachedu1' }, { label: 'detachedu2 (detachedu2@example.org)', value: 'detachedu2' } ];

test( 'both forms for a network administrator: the headings, the help, the field, the roles and Skip Confirmation Email', async () => {
	const wrapper = await mountUserNew( multisiteData() );
	expect( wrapper.findAll( 'h2' ).map( ( h2 ) => [ h2.attributes( 'id' ), h2.text() ] ) ).toEqual( [ [ 'add-existing-user', 'Add Existing User' ], [ 'create-new-user', 'Add User' ] ] );
	const form = wrapper.find( 'form#adduser' );
	expect( form.attributes( 'name' ) ).toBe( 'adduser' );
	expect( form.classes() ).toContain( 'validate' );
	expect( form.find( 'input[name="action"]' ).element.value ).toBe( 'adduser' );
	expect( wrapper.find( '.wp-admin-user-new-existing > p' ).text() ).toBe( existingForm().help );
	expect( form.find( 'label[for="adduser-email"]' ).text() ).toBe( 'Email or Username' );
	const email = form.find( 'tr.form-required input#adduser-email' );
	expect( email.attributes( 'name' ) ).toBe( 'email' );
	expect( email.attributes( 'type' ) ).toBe( 'text' );
	expect( email.classes() ).toContain( 'wp-suggest-user' );
	expect( form.find( 'label[for="adduser-role"]' ).text() ).toBe( 'Role' );
	expect( form.find( '#adduser-role' ).element.value ).toBe( 'subscriber' );
	expect( form.findAll( '#adduser-role option' ) ).toHaveLength( 5 );
	expect( form.find( '#adduser-noconfirmation' ).element.checked ).toBe( false );
	expect( form.find( 'label[for="adduser-noconfirmation"]' ).text() ).toBe( 'Add the user without sending an email that requires their confirmation' );
	expect( form.find( 'p.submit input#addusersub' ).element.value ).toBe( 'Add Existing User' );
	expect( form.find( 'input#addusersub' ).attributes( 'name' ) ).toBe( 'adduser' );
	// The network's Add User form: Username, Email, Role and Skip Confirmation Email only.
	const create = wrapper.find( 'form#createuser' );
	expect( create.findAll( 'input:not([type="hidden"]), select' ).map( ( field ) => field.attributes( 'id' ) ) ).toEqual( [ 'user_login', 'email', 'role', 'noconfirmation', 'createusersub' ] );
	expect( create.find( '#noconfirmation' ).element.checked ).toBe( false );
} );

test( 'a site administrator: Email of type email, no Skip Confirmation Email, no suggestions, and only one form without its heading', async () => {
	const data = multisiteData( {
		existing: existingForm( { label: 'Email', type: 'email', noconfirmation: false, suggest: false, help: 'Enter the email address of an existing user on this network to invite them to this site. That person will be sent an email asking them to confirm the invite.' } ),
		create: null,
		title: 'Add Existing User',
	} );
	const wrapper = await mountUserNew( data );
	expect( wrapper.find( 'h2' ).exists() ).toBe( false );
	expect( wrapper.find( 'label[for="adduser-email"]' ).text() ).toBe( 'Email' );
	expect( wrapper.find( '#adduser-email' ).attributes( 'type' ) ).toBe( 'email' );
	expect( wrapper.find( '#adduser-noconfirmation' ).exists() ).toBe( false );
	expect( wrapper.find( 'form#createuser' ).exists() ).toBe( false );
	await wrapper.find( '#adduser-email' ).setValue( 'someone' );
	await settle();
	expect( api.calls ).toEqual( [] );
} );

test( 'Add Existing User: POST users/existing with the email, role and Skip Confirmation Email, then the answer is followed', async () => {
	api.respondWith( async () => ( { redirect: 'user-new.php?update=addnoconfirmation&user_id=9', location: null } ) );
	const record = host();
	const wrapper = await mountUserNew( multisiteData( { existing: existingForm( { suggest: false } ) } ), record );
	await wrapper.find( '#adduser-email' ).setValue( 'member@example.org' );
	await wrapper.find( '#adduser-role' ).setValue( 'editor' );
	await wrapper.find( '#adduser-noconfirmation' ).setValue( true );
	await wrapper.find( 'form#adduser' ).trigger( 'submit' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/existing', payload: { email: 'member@example.org', role: 'editor', noconfirmation: true } } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'user-new.php?update=addnoconfirmation&user_id=9', location: null }, null ] ] );
} );

test( 'Add Existing User: a refused add says WordPress\'s message in a focused notice and keeps the email', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 403, code: 'role_forbidden', message: 'Sorry, you are not allowed to give users that role.' } );
	} );
	const record = host();
	const wrapper = await mountUserNew( multisiteData( { existing: existingForm( { suggest: false } ) } ), record );
	await wrapper.find( '#adduser-email' ).setValue( 'member@example.org' );
	await wrapper.find( 'form#adduser' ).trigger( 'submit' );
	await settle();
	expect( record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'Sorry, you are not allowed to give users that role.' ] );
	expect( document.activeElement?.id ).toBe( noticeElementId( 'notice-1' ) );
	expect( wrapper.find( '#adduser-email' ).element.value ).toBe( 'member@example.org' );
	expect( record.followed ).toEqual( [] );
} );

test( 'suggestions: two letters ask users/suggest; the list shows the labels as text; a click fills the field', async () => {
	api.respondWith( async ( method, route ) => ( route === 'wp-admin/v1/users/suggest' ? [ ...SUGGESTIONS, { label: '<img src=x onerror="window.__ran=1">', value: 'evil' } ] : {} ) );
	const wrapper = await mountUserNew( multisiteData() );
	await wrapper.find( '#adduser-email' ).setValue( 'd' );
	await settle();
	expect( api.calls ).toEqual( [] );
	await wrapper.find( '#adduser-email' ).setValue( 'de' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'GET', route: 'wp-admin/v1/users/suggest', payload: { term: 'de', autocomplete_type: 'add', autocomplete_field: 'user_login' } } ] );
	const items = wrapper.findAll( 'ul.ui-autocomplete li[role="option"]' );
	expect( items.map( ( item ) => item.text() ) ).toEqual( [ SUGGESTIONS[ 0 ].label, SUGGESTIONS[ 1 ].label, '<img src=x onerror="window.__ran=1">' ] );
	expect( wrapper.find( 'ul.ui-autocomplete img' ).exists() ).toBe( false );
	expect( wrapper.find( '#adduser-email' ).classes() ).toContain( 'open' );
	await items[ 1 ].trigger( 'mousedown' );
	await items[ 1 ].trigger( 'click' );
	await settle();
	expect( wrapper.find( '#adduser-email' ).element.value ).toBe( 'detachedu2' );
	expect( wrapper.find( 'ul.ui-autocomplete' ).exists() ).toBe( false );
	expect( wrapper.find( '#adduser-email' ).classes() ).not.toContain( 'open' );
} );

test( 'suggestions: only the newest answer is shown; Down and Enter choose; Escape closes', async () => {
	const pending = [];
	api.respondWith( ( method, route, payload ) => new Promise( ( resolve ) => pending.push( { term: payload.term, resolve } ) ) );
	const wrapper = await mountUserNew( multisiteData() );
	await wrapper.find( '#adduser-email' ).setValue( 'de' );
	await settle();
	await wrapper.find( '#adduser-email' ).setValue( 'det' );
	await settle();
	expect( pending.map( ( request ) => request.term ) ).toEqual( [ 'de', 'det' ] );
	pending[ 1 ].resolve( [ SUGGESTIONS[ 0 ] ] );
	await settle();
	pending[ 0 ].resolve( SUGGESTIONS );
	await settle();
	expect( wrapper.findAll( 'ul.ui-autocomplete li' ).map( ( item ) => item.text() ) ).toEqual( [ SUGGESTIONS[ 0 ].label ] );
	await wrapper.find( '#adduser-email' ).trigger( 'keydown', { key: 'Escape' } );
	expect( wrapper.find( 'ul.ui-autocomplete' ).exists() ).toBe( false );
	await wrapper.find( '#adduser-email' ).setValue( 'deta' );
	await settle();
	pending[ 2 ].resolve( SUGGESTIONS );
	await settle();
	await wrapper.find( '#adduser-email' ).trigger( 'keydown', { key: 'ArrowDown' } );
	await wrapper.find( '#adduser-email' ).trigger( 'keydown', { key: 'ArrowDown' } );
	expect( wrapper.find( '#adduser-email' ).attributes( 'aria-activedescendant' ) ).toBe( wrapper.findAll( 'ul.ui-autocomplete li' )[ 1 ].attributes( 'id' ) );
	await wrapper.find( '#adduser-email' ).trigger( 'keydown', { key: 'Enter' } );
	await settle();
	expect( wrapper.find( '#adduser-email' ).element.value ).toBe( 'detachedu2' );
	expect( api.calls.filter( ( call ) => call.method === 'POST' ) ).toEqual( [] );
} );

test( 'create on multisite: POST users with Username, Email, Role and Skip Confirmation Email; no password, names or notification', async () => {
	api.respondWith( async () => ( { redirect: 'user-new.php?update=addnoconfirmation&user_id=12', location: null } ) );
	const record = host();
	const wrapper = await mountUserNew( multisiteData( { existing: null } ), record );
	expect( wrapper.find( '#pass1' ).exists() ).toBe( false );
	await wrapper.find( '#user_login' ).setValue( 'detachedunew' );
	await wrapper.find( '#email' ).setValue( 'detachedunew@example.org' );
	await wrapper.find( '#noconfirmation' ).setValue( true );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users', payload: { fields: { user_login: 'detachedunew', email: 'detachedunew@example.org', role: 'subscriber', noconfirmation: '1' } } } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'user-new.php?update=addnoconfirmation&user_id=12', location: null }, null ] ] );
	await wrapper.find( '#noconfirmation' ).setValue( false );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( api.calls[ 1 ].payload.fields, 'noconfirmation' ) ).toBe( false );
} );

test( 'create on multisite: the signup errors (field null) show in the classic list', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 400, code: 'user_name', message: 'Usernames can only contain lowercase letters (a-z) and numbers.', data: { status: 400, field: null, errors: [ { code: 'user_name', message: 'Usernames can only contain lowercase letters (a-z) and numbers.', field: null } ] } } );
	} );
	const wrapper = await mountUserNew( multisiteData( { existing: null, create: multisiteCreate() } ) );
	await wrapper.find( '#user_login' ).setValue( 'Bad-Name' );
	await wrapper.find( '#email' ).setValue( 'bad@example.org' );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( wrapper.findAll( 'div.notice.error ul li' ).map( ( item ) => item.text() ) ).toEqual( [ 'Usernames can only contain lowercase letters (a-z) and numbers.' ] );
	expect( wrapper.find( '#user_login' ).element.value ).toBe( 'Bad-Name' );
} );

test( 'the messages and errors of update=: the messages in #message, the errors as paragraphs of one error notice', async () => {
	const wrapper = await mountUserNew( multisiteData( {
		messages: [ { markup: 'User has been added to your site. <a href="user-edit.php?user_id=9">Edit user</a>', type: 'updated' } ],
		errors: [ { code: 'does_not_exist', markup: 'The requested user does not exist.' } ],
	} ) );
	expect( wrapper.find( '#message p' ).text() ).toBe( 'User has been added to your site. Edit user' );
	expect( wrapper.find( '#message p a' ).attributes( 'href' ) ).toBe( 'user-edit.php?user_id=9' );
	expect( wrapper.findAll( 'div.notice.error.wp-admin-user-new-add-errors p' ).map( ( p ) => p.text() ) ).toEqual( [ 'The requested user does not exist.' ] );
} );

test( 'Add Existing User: plugin output of user_new_form (add-existing-user) with the not-saved note', async () => {
	const wrapper = await mountUserNew( multisiteData( { existing: existingForm( { hooksHtml: '<div class="detached-fixture-new-add-existing-user">Fixture new add-existing-user</div>' } ) } ) );
	expect( wrapper.find( 'form#adduser .detached-fixture-new-add-existing-user' ).text() ).toBe( 'Fixture new add-existing-user' );
	expect( wrapper.find( 'form#adduser .wp-admin-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	expect( singleData().existing ).toBeNull();
} );
