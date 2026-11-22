/** @jest-environment jsdom */
// Add User (core/user-new) in user-new.php's markup: the Add User form from the data, the
// password rows (core/user-password, `new`), the payload (POST users with the fields as the
// classic form posts them, pass2 equal to pass1 as user-profile.js copies it), the redirect
// followed, the errors in the classic error list with the typed values kept and the password
// emptied, a failed answer, what plugins print on user_new_form with the not-saved note, the
// messages, the refusal and Help.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h, ref } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import contract from '../../../site/contracts/core/user-new.js';
import { postedFields, fieldsOf } from '../../../site/components/core/user-new.js';
import { INITIAL, apiError, createForm, host, loadContracts, mountUserNew, setMeter, settle, singleData, unsetMeter } from './data.mjs';

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

const posted = () => api.calls.filter( ( call ) => call.method === 'POST' && call.route === 'wp-admin/v1/users' );
const LANGUAGE = { options: [ { value: 'site-default', label: 'Site Default' }, { value: '', label: 'English (United States)' }, { value: 'ar', label: 'العربية' } ], selected: 'site-default' };

async function fill( wrapper, values ) {
	for ( const [ id, value ] of Object.entries( values ) ) {
		await wrapper.find( '#' + id ).setValue( value );
	}
}

test( 'the contract: a page, two segments, 1.0.0, data and page, emits saved', () => {
	expect( contract.id ).toBe( 'core/user-new' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBe( true );
	expect( Object.keys( contract.props ).sort() ).toEqual( [ 'data', 'page' ] );
	expect( contract.emits ).toEqual( [ 'saved' ] );
} );

test( 'fields from data: form#createuser with every field, the default role, notification checked and the generated password', async () => {
	const wrapper = await mountUserNew();
	expect( wrapper.find( 'h2' ).exists() ).toBe( false );
	expect( wrapper.find( '.wp-admin-user-new > p' ).text() ).toBe( 'Create a brand new user and add them to this site.' );
	const form = wrapper.find( 'form#createuser' );
	expect( form.attributes( 'name' ) ).toBe( 'createuser' );
	expect( form.classes() ).toContain( 'validate' );
	expect( form.element.noValidate ).toBe( true );
	expect( form.find( 'input[name="action"]' ).element.value ).toBe( 'createuser' );
	expect( form.find( 'table.form-table' ).attributes( 'role' ) ).toBe( 'presentation' );
	expect( flat( form.find( 'label[for="user_login"]' ) ) ).toBe( 'Username (required)' );
	expect( form.find( 'tr.form-required #user_login' ).attributes( 'maxlength' ) ).toBe( '60' );
	expect( form.find( '#user_login' ).attributes( 'aria-required' ) ).toBe( 'true' );
	expect( flat( form.find( 'label[for="email"]' ) ) ).toBe( 'Email (required)' );
	expect( form.find( 'tr.form-required #email' ).attributes( 'type' ) ).toBe( 'email' );
	expect( form.find( 'label[for="first_name"]' ).text() ).toBe( 'First Name' );
	expect( form.find( 'label[for="last_name"]' ).text() ).toBe( 'Last Name' );
	expect( form.find( 'label[for="url"]' ).text() ).toBe( 'Website' );
	expect( form.find( '#url' ).attributes( 'type' ) ).toBe( 'url' );
	expect( form.find( '#locale' ).exists() ).toBe( false );
	expect( form.find( 'tr.user-pass1-wrap.form-required #pass1' ).element.value ).toBe( INITIAL );
	expect( form.find( '#send_user_notification' ).element.checked ).toBe( true );
	expect( form.find( 'label[for="send_user_notification"]' ).text() ).toBe( 'Send the new user an email about their account' );
	expect( form.find( '#role' ).element.value ).toBe( 'subscriber' );
	expect( form.findAll( '#role option' ).map( ( option ) => option.text() ) ).toEqual( [ 'Subscriber', 'Contributor', 'Author', 'Editor', 'Administrator' ] );
	expect( form.find( '#noconfirmation' ).exists() ).toBe( false );
	const submit = form.find( 'p.submit input#createusersub' );
	expect( submit.attributes( 'name' ) ).toBe( 'createuser' );
	expect( submit.element.value ).toBe( 'Add User' );
	expect( submit.element.disabled ).toBe( false );
	expect( document.body.classList.contains( 'user-new-php' ) ).toBe( true );
	expect( wrapper.find( '#ajax-response' ).exists() ).toBe( true );
	wrapper.unmount();
	expect( document.body.classList.contains( 'user-new-php' ) ).toBe( false );
} );

test( 'fields from data: the Language field with its options and Site Default, and no Role without promote_users', async () => {
	const wrapper = await mountUserNew( singleData( { create: createForm( { fields: { ...createForm().fields, language: LANGUAGE, role: null } } ) } ) );
	expect( wrapper.find( 'tr.user-language-wrap label[for="locale"]' ).text() ).toBe( 'Language' );
	expect( wrapper.find( 'tr.user-language-wrap .dashicons-translation' ).exists() ).toBe( true );
	expect( wrapper.findAll( '#locale option' ).map( ( option ) => [ option.element.value, option.text() ] ) ).toEqual( [ [ 'site-default', 'Site Default' ], [ '', 'English (United States)' ], [ 'ar', 'العربية' ] ] );
	expect( wrapper.find( '#locale' ).element.value ).toBe( 'site-default' );
	expect( wrapper.find( '#role' ).exists() ).toBe( false );
} );

test( 'fieldsOf and postedFields: the classic names, pass2 equal to pass1, unchecked boxes not sent', () => {
	const create = createForm( { fields: { ...createForm().fields, language: LANGUAGE } } );
	const fields = fieldsOf( create );
	expect( fields ).toEqual( { user_login: '', email: '', first_name: '', last_name: '', url: '', locale: 'site-default', role: 'subscriber', send_user_notification: true, noconfirmation: false } );
	expect( postedFields( { ...fields, user_login: 'u' }, create, 'pw' ) ).toEqual( {
		user_login: 'u', email: '', first_name: '', last_name: '', url: '', locale: 'site-default', pass1: 'pw', pass2: 'pw', send_user_notification: '1', role: 'subscriber',
	} );
	expect( Object.hasOwn( postedFields( { ...fields, send_user_notification: false }, create, 'pw' ), 'send_user_notification' ) ).toBe( false );
} );

test( 'payload and redirect: POST users with the fields as the form posts them, then the answer is followed', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?update=add&id=42', location: null } ) );
	const record = host();
	const wrapper = await mountUserNew( singleData( { create: createForm( { fields: { ...createForm().fields, language: LANGUAGE } } ) } ), record );
	await fill( wrapper, { user_login: 'new-user', email: 'new@example.org', first_name: 'O\'Brien', last_name: 'Tom & Co', url: 'https://example.org/' } );
	await wrapper.find( '#role' ).setValue( 'editor' );
	await wrapper.find( '#locale' ).setValue( 'ar' );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users', payload: { fields: {
		user_login: 'new-user', email: 'new@example.org', first_name: 'O\'Brien', last_name: 'Tom & Co', url: 'https://example.org/',
		locale: 'ar', pass1: INITIAL, pass2: INITIAL, send_user_notification: '1', role: 'editor',
	} } } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'users.php?update=add&id=42', location: null }, null ] ] );
} );

test( 'payload and redirect: unchecked notification is not sent, and a typed password is posted as pass1 and pass2', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?update=add&id=43', location: null } ) );
	const wrapper = await mountUserNew();
	await fill( wrapper, { user_login: 'quiet', email: 'quiet@example.org', pass1: 'typed-Strong-pass-1' } );
	await wrapper.find( '#send_user_notification' ).setValue( false );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	const fields = posted()[ 0 ].payload.fields;
	expect( Object.hasOwn( fields, 'send_user_notification' ) ).toBe( false );
	expect( fields.pass1 ).toBe( 'typed-Strong-pass-1' );
	expect( fields.pass2 ).toBe( 'typed-Strong-pass-1' );
} );

test( 'payload and redirect: Add User is disabled while a weak password is not confirmed, as user-profile.js does', async () => {
	setMeter( 1 );
	const wrapper = await mountUserNew();
	await fill( wrapper, { user_login: 'weak', email: 'weak@example.org', pass1: 'abc' } );
	await settle();
	expect( wrapper.find( 'tr.pw-weak' ).exists() ).toBe( true );
	expect( wrapper.find( '#createusersub' ).element.disabled ).toBe( true );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toEqual( [] );
	await wrapper.find( 'input.pw-checkbox' ).setValue( true );
	await settle();
	expect( wrapper.find( '#createusersub' ).element.disabled ).toBe( false );
} );

test( 'payload and redirect: Generate password asks users/generate-password', async () => {
	api.respondWith( async ( method, route ) => ( route === 'wp-admin/v1/users/generate-password' ? { password: 'Generated-Next-1' } : {} ) );
	const wrapper = await mountUserNew();
	await wrapper.find( 'button.wp-generate-pw' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'GET', route: 'wp-admin/v1/users/generate-password', payload: undefined } ] );
	expect( wrapper.find( '#pass1' ).element.value ).toBe( 'Generated-Next-1' );
} );

test( 'errors keep values: every error in the classic list, the typed values kept, the password emptied, nothing followed', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 400, code: 'user_login', message: 'Error: This username is already registered. Please choose another one.', data: { status: 400, field: null, errors: [
			{ code: 'user_login', message: '<strong>Error:</strong> This username is already registered. Please choose another one.', field: null },
			{ code: 'email_exists', message: '<strong>Error:</strong> This email is already registered. Please choose another one.', field: 'email' },
		] } } );
	} );
	const record = host();
	const wrapper = await mountUserNew( singleData(), record );
	await fill( wrapper, { user_login: 'taken', email: 'taken@example.org', first_name: 'Kept' } );
	await wrapper.find( '#role' ).setValue( 'author' );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	const items = wrapper.findAll( 'div.notice.error ul li' );
	expect( items.map( ( item ) => item.text() ) ).toEqual( [
		'Error: This username is already registered. Please choose another one.',
		'Error: This email is already registered. Please choose another one.',
	] );
	expect( items[ 0 ].find( 'strong' ).text() ).toBe( 'Error:' );
	expect( wrapper.find( '#user_login' ).element.value ).toBe( 'taken' );
	expect( wrapper.find( '#email' ).element.value ).toBe( 'taken@example.org' );
	expect( wrapper.find( '#first_name' ).element.value ).toBe( 'Kept' );
	expect( wrapper.find( '#role' ).element.value ).toBe( 'author' );
	expect( wrapper.find( '#pass1' ).element.value ).toBe( '' );
	expect( record.followed ).toEqual( [] );
	expect( record.added ).toEqual( [] );
	expect( record.spoken ).toEqual( [ 'Error: This username is already registered. Please choose another one.' ] );
	// A new attempt clears the list once it succeeds.
	api.respondWith( async () => ( { redirect: 'users.php?update=add&id=44', location: null } ) );
	await fill( wrapper, { pass1: 'Another-Strong-pass-2' } );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( posted()[ 1 ].payload.fields.pass2 ).toBe( 'Another-Strong-pass-2' );
	expect( wrapper.find( 'div.notice.error ul' ).exists() ).toBe( false );
} );

test( 'a failed answer: WordPress\'s message in a focused page notice; values and password kept; Add User enabled', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture failure.' } );
	} );
	const record = host();
	const wrapper = await mountUserNew( singleData(), record );
	await fill( wrapper, { user_login: 'kept', email: 'kept@example.org' } );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( record.added.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Fixture failure.' ] ] );
	expect( record.spoken ).toEqual( [ 'Fixture failure.' ] );
	expect( document.activeElement?.id ).toBe( noticeElementId( 'notice-1' ) );
	expect( wrapper.find( '#user_login' ).element.value ).toBe( 'kept' );
	expect( wrapper.find( '#pass1' ).element.value ).toBe( INITIAL );
	expect( wrapper.find( '#createusersub' ).element.disabled ).toBe( false );
	expect( wrapper.find( 'div.notice.error' ).exists() ).toBe( false );
	expect( record.followed ).toEqual( [] );
} );

test( 'a failed answer: a second submit while one is on its way is ignored', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( { redirect: 'users.php?update=add&id=45', location: null } );
	} ) );
	const wrapper = await mountUserNew();
	await fill( wrapper, { user_login: 'once', email: 'once@example.org' } );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#createusersub' ).element.disabled ).toBe( true );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	release();
	await settle();
} );

test( 'hooksHtml: user_new_form\'s output with its scripts and the not-saved note; its field is not posted', async () => {
	api.respondWith( async () => ( { redirect: 'users.php?update=add&id=46', location: null } ) );
	const hooksHtml = '<input name="detached_fixture_profile_note" class="detached-fixture-new-note"><div class="detached-fixture-new-add-new-user">Fixture new add-new-user</div>';
	const wrapper = await mountUserNew( singleData( { create: createForm( { hooksHtml } ) } ) );
	expect( wrapper.find( 'form#createuser .detached-fixture-new-add-new-user' ).text() ).toBe( 'Fixture new add-new-user' );
	expect( wrapper.find( 'form#createuser .wp-admin-user-new-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	await wrapper.find( 'input.detached-fixture-new-note' ).setValue( 'note' );
	await fill( wrapper, { user_login: 'hooked', email: 'hooked@example.org' } );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( posted()[ 0 ].payload.fields, 'detached_fixture_profile_note' ) ).toBe( false );
	const plain = await mountUserNew();
	expect( plain.find( '.wp-admin-user-new-plugin-note' ).exists() ).toBe( false );
} );

test( 'messages: User added. in #message, dismissible; the refusal and the load failure instead of the form', async () => {
	const wrapper = await mountUserNew( singleData( { messages: [ { markup: 'User added.', type: 'updated' } ] } ) );
	expect( wrapper.find( '#message' ).classes() ).toEqual( expect.arrayContaining( [ 'updated', 'notice', 'is-dismissible' ] ) );
	expect( wrapper.find( '#message p' ).text() ).toBe( 'User added.' );
	await wrapper.find( '#message .notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
	const refused = await mountUserNew( { refusal: { status: 403, heading: 'You need a higher level of permission.', message: 'Sorry, you are not allowed to create users.' }, title: 'Add User' } );
	expect( refused.find( '.wp-admin-user-new-error h2' ).text() ).toBe( 'You need a higher level of permission.' );
	expect( refused.find( '.wp-admin-user-new-error p' ).text() ).toBe( 'Sorry, you are not allowed to create users.' );
	expect( refused.find( 'form' ).exists() ).toBe( false );
	const failed = await mountUserNew( { failed: true } );
	expect( failed.find( '.wp-admin-user-new-failed' ).text() ).toBe( 'The Add User form could not be loaded.' );
} );

test( 'messages: new data (the page read again) empties the form and the errors', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 400, code: 'empty_email', message: 'Error: Please enter an email address.', data: { status: 400, field: 'email', errors: [ { code: 'empty_email', message: '<strong>Error:</strong> Please enter an email address.', field: 'email' } ] } } );
	} );
	const data = ref( singleData() );
	const record = host();
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/user-new', data: data.value, page: { path: 'user-new.php', title: 'Add User' } } ) }, { provide: record.provide } );
	await settle();
	await fill( wrapper, { user_login: 'x', email: 'y@example.org' } );
	await wrapper.find( 'form#createuser' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( 'div.notice.error ul li' ).exists() ).toBe( true );
	data.value = singleData( { messages: [ { markup: 'User added.', type: 'updated' } ], create: createForm( { initialPassword: 'Next-initial-password' } ) } );
	await settle();
	expect( wrapper.find( '#user_login' ).element.value ).toBe( '' );
	expect( wrapper.find( 'div.notice.error ul' ).exists() ).toBe( false );
	expect( wrapper.find( '#pass1' ).element.value ).toBe( 'Next-initial-password' );
} );

const HELP = {
	tabs: [
		{ id: 'overview', title: 'Overview', priority: 10, content: '<p>To add a new user to your site, fill in the form on this screen and click the Add User button at the bottom.</p><p>New users are automatically assigned a password, which they can change after logging in. You can view or edit the assigned password by clicking the Show Password button. The username cannot be changed once the user has been added.</p><p>By default, new users will receive an email letting them know they&#8217;ve been added as a user for your site. This email will also contain a password reset link. Uncheck the box if you do not want to send the new user a welcome email.</p><p>Remember to click the Add User button at the bottom of this screen when you are finished.</p>' },
		{ id: 'user-roles', title: 'User Roles', priority: 10, content: '<p>Here is a basic overview of the different user roles and the permissions associated with each one:</p><ul><li>Subscribers can read comments/comment/receive newsletters, etc. but cannot create regular site content.</li><li>Contributors can write and manage their posts but not publish posts or upload media files.</li><li>Authors can publish and manage their own posts, and are able to upload files.</li><li>Editors can publish posts, manage posts as well as manage other people&#8217;s posts, etc.</li><li>Administrators have access to all the administration features.</li></ul>' },
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/users-add-new-screen/">Documentation on Adding New Users</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

test( 'help: Overview and User Roles from the router, with the Adding New Users documentation in the sidebar', async () => {
	const wrapper = openHelp( null, HELP, { data: singleData() } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'User Roles' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.findAll( '#tab-panel-overview p' ) ).toHaveLength( 4 );
	await wrapper.findAll( '[role="tab"]' )[ 1 ].trigger( 'click' );
	await settle();
	expect( selected( wrapper ) ).toEqual( [ 'User Roles' ] );
	expect( wrapper.findAll( '#tab-panel-user-roles li' ) ).toHaveLength( 5 );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [
		'https://wordpress.org/documentation/article/users-add-new-screen/',
		'https://wordpress.org/support/forums/',
	] );
} );
