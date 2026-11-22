/** @jest-environment jsdom */
// Authorize Application (core/authorize-application) as WordPress's data describes it
// (wp-admin/authorize-application.php): the card, the texts, the name field, the plugins' form
// output with the note, the classic refusal, and Approve: the route it posts, the location it
// follows (refusing javascript:, data: and vbscript:), the admin target, the password shown once
// with Copy, the empty name's error, a failed answer, and names that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import contract from '../../../site/contracts/core/authorize-application.js';
import { APP_ID, CHUNKED, HOSTILE, PASSWORD, ROUTE, answer, apiError, authorizeData, host, loadContracts, mountAuthorize, refusalData, settle } from './data.mjs';

const bodyClass = document.body.className;
let clipboard;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	clipboard = [];
	Object.defineProperty( navigator, 'clipboard', { configurable: true, value: { writeText: async ( text ) => clipboard.push( text ) } } );
	delete window.__ran;
} );
afterEach( () => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
	delete navigator.clipboard;
	delete window.__ran;
	document.body.className = bodyClass;
	document.body.innerHTML = '';
} );

const approveBody = ( over = {} ) => ( {
	app_name: 'Acme App',
	app_id: APP_ID,
	success_url: 'https://app.example.org/done',
	reject_url: 'https://app.example.org/done?success=false',
	approve: true,
	...over,
} );

test( 'the contract: a page, two segments, 1.0.0, data and page, emits saved', () => {
	expect( contract.id ).toBe( 'core/authorize-application' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBe( true );
	expect( Object.keys( contract.props ).sort() ).toEqual( [ 'data', 'page' ] );
	expect( contract.emits ).toEqual( [ 'saved' ] );
} );

test( 'the card: the heading, the intro with the name in strong, the name field, Approve and Reject with their descriptions, the body class', async () => {
	const wrapper = await mountAuthorize();
	const card = wrapper.find( '.card.auth-app-card' );
	expect( card.find( 'h2.title' ).text() ).toBe( 'An application would like to connect to your account.' );
	expect( card.find( 'p' ).text() ).toBe( 'Would you like to give the application identifying itself as Acme App access to your account? You should only do this if you trust the application in question.' );
	expect( card.find( 'p strong' ).text() ).toBe( 'Acme App' );
	const form = card.find( 'form.form-wrap' );
	expect( form.find( 'label[for="app_name"]' ).text() ).toBe( 'New Application Password Name' );
	const name = form.find( 'input#app_name' );
	expect( [ name.attributes( 'type' ), name.attributes( 'name' ), name.element.value, name.element.required ] ).toEqual( [ 'text', 'app_name', 'Acme App', true ] );
	const approve = form.find( 'input#approve' );
	expect( [ approve.attributes( 'type' ), approve.attributes( 'name' ), approve.element.value, approve.attributes( 'aria-describedby' ) ] ).toEqual( [ 'submit', 'approve', 'Yes, I approve of this connection', 'description-approve' ] );
	expect( approve.classes() ).toEqual( [ 'button', 'button-primary' ] );
	expect( form.find( 'p#description-approve' ).text() ).toBe( 'You will be sent to https://app.example.org/done?site_url=http%3A%2F%2Flocalhost&user_login=pat&password=[------]' );
	expect( form.find( 'p#description-approve strong code' ).exists() ).toBe( true );
	const reject = form.find( 'input#reject' );
	expect( [ reject.attributes( 'type' ), reject.attributes( 'name' ), reject.element.value, reject.attributes( 'aria-describedby' ) ] ).toEqual( [ 'submit', 'reject', 'No, I do not approve of this connection', 'description-reject' ] );
	expect( reject.classes() ).toEqual( [ 'button', 'button-secondary' ] );
	expect( form.find( 'p#description-reject' ).text() ).toBe( 'You will be sent to https://app.example.org/done?success=false' );
	expect( document.body.classList.contains( 'authorize-application-php' ) ).toBe( true );
	expect( wrapper.find( '.wp-admin-authorize-application-plugin-note' ).exists() ).toBe( false );
} );

test( 'sites notice: the multisite notice shows after the intro, its link kept', async () => {
	const wrapper = await mountAuthorize( authorizeData( { sitesNotice: 'This will grant access to <a href="my-sites.php">all 2 sites in this installation that you have permissions on</a>.' } ) );
	const notice = wrapper.findAll( '.auth-app-card > p' )[ 1 ];
	expect( notice.text() ).toBe( 'This will grant access to all 2 sites in this installation that you have permissions on.' );
	expect( notice.find( 'a' ).attributes( 'href' ) ).toBe( 'my-sites.php' );
} );

test( 'location followed: Approve posts the request with the name field\'s value and loads the success URL WordPress answered', async () => {
	const location = 'https://app.example.org/done?site_url=http%3A%2F%2Flocalhost&user_login=pat&password=' + PASSWORD;
	api.respondWith( async () => answer( { location, password: PASSWORD, chunked: CHUNKED } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: ROUTE, payload: approveBody() } ] );
	expect( wrapper.record.assigned ).toEqual( [ location ] );
	expect( wrapper.record.notices ).toEqual( [] );
	expect( wrapper.find( '#new-application-password-value' ).exists() ).toBe( false );
} );

test( 'location followed: a scheme the application registered is loaded as given; Enter in the name field approves', async () => {
	api.respondWith( async () => answer( { location: 'acme-app://callback?password=' + PASSWORD, password: PASSWORD, chunked: CHUNKED } ) );
	const wrapper = await mountAuthorize( authorizeData( { request: { appName: 'Acme App', appId: '', successUrl: 'acme-app://callback', rejectUrl: 'acme-app://callback?success=false' } } ) );
	await wrapper.find( 'form.form-wrap' ).trigger( 'submit' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload ) ).toEqual( [ approveBody( { app_id: '', success_url: 'acme-app://callback', reject_url: 'acme-app://callback?success=false' } ) ] );
	expect( wrapper.record.assigned ).toEqual( [ 'acme-app://callback?password=' + PASSWORD ] );
} );

test.each( [
	[ 'javascript:alert(1)' ],
	[ 'JavaScript://app.example.org/%0Aalert(1)' ],
	[ ' javascript:alert(1)' ],
	[ 'java\tscript:alert(1)' ],
	[ 'data:text/html,<script>alert(1)</script>' ],
	[ 'vbscript://app.example.org/msgbox' ],
	[ 'not a url' ],
] )( 'location followed: %j is refused, said in a page notice, and nothing loads', async ( location ) => {
	api.respondWith( async () => answer( { location, password: PASSWORD, chunked: CHUNKED } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.assigned ).toEqual( [] );
	expect( wrapper.record.followed ).toEqual( [] );
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Invalid URL format.' ] ] );
	expect( wrapper.text() ).not.toContain( PASSWORD );
} );

test( 'admin target: an answer in the admin goes through the router', async () => {
	api.respondWith( async () => answer( { redirect: '' } ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.followed ).toEqual( [ { redirect: '' } ] );
	expect( wrapper.record.assigned ).toEqual( [] );
} );

test( 'password notice: without a success URL the form is replaced by the password, chunked, with Copy and the save warning; the data never holds it', async () => {
	jest.useFakeTimers( { doNotFake: [ 'nextTick', 'setImmediate', 'queueMicrotask' ] } );
	api.respondWith( async () => answer( { password: PASSWORD, chunked: CHUNKED } ) );
	const data = authorizeData( { request: { appName: 'Acme App', appId: APP_ID, successUrl: null, rejectUrl: null }, texts: { ...authorizeData().texts, approveDescription: 'You will be given a password to manually enter into the application in question.', rejectDescription: 'You will be returned to the WordPress Dashboard, and no changes will be made.' } } );
	const wrapper = await mountAuthorize( data );
	await wrapper.find( 'input#app_name' ).setValue( 'My Phone' );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload ) ).toEqual( [ approveBody( { app_name: 'My Phone', success_url: '', reject_url: '' } ) ] );
	expect( wrapper.find( 'form.form-wrap' ).exists() ).toBe( false );
	const notice = wrapper.find( '.auth-app-card .notice.notice-success.notice-alt' );
	expect( notice.attributes( 'role' ) ).toBe( 'alert' );
	expect( notice.find( 'label[for="new-application-password-value"]' ).text() ).toBe( 'Your new password for My Phone is:' );
	expect( notice.find( 'label strong' ).text() ).toBe( 'My Phone' );
	const field = notice.find( 'input#new-application-password-value' );
	expect( [ field.element.value, field.attributes( 'readonly' ) !== undefined, field.classes() ] ).toEqual( [ CHUNKED, true, [ 'code' ] ] );
	expect( notice.findAll( 'p' )[ 1 ].text() ).toBe( 'Be sure to save this in a safe location. You will not be able to retrieve it.' );
	expect( document.activeElement ).toBe( notice.element );
	expect( wrapper.record.assigned ).toEqual( [] );

	await notice.find( 'button.copy-button' ).trigger( 'click' );
	await settle();
	expect( clipboard ).toEqual( [ CHUNKED ] );
	expect( notice.find( '.success' ).classes() ).not.toContain( 'hidden' );
	expect( wrapper.record.spoken ).toContain( 'Application password has been copied to your clipboard.' );
	jest.advanceTimersByTime( 3000 );
	await settle();
	expect( notice.find( '.success' ).classes() ).toContain( 'hidden' );
	expect( JSON.stringify( data ) ).not.toContain( PASSWORD );
} );

test( 'die screen: the classic refusal\'s message and Go Back link instead of the card', async () => {
	const wrapper = await mountAuthorize( refusalData() );
	expect( wrapper.find( '.card' ).exists() ).toBe( false );
	const error = wrapper.find( '.wp-admin-authorize-application-error' );
	expect( error.find( 'p' ).text() ).toBe( 'Application passwords are not available for your account. Please contact the site administrator for assistance.' );
	const back = error.find( 'a' );
	expect( back.text() ).toBe( 'Go Back' );
	expect( back.attributes( 'href' ) ).toBe( 'https://app.example.org/done?success=false&error=disabled' );

	const invalid = await mountAuthorize( refusalData( { status: 500, message: 'The Authorize Application request is not allowed. Invalid URL format. The application ID must be a UUID.', link: null } ) );
	expect( invalid.find( '.wp-admin-authorize-application-error' ).text() ).toBe( 'The Authorize Application request is not allowed. Invalid URL format. The application ID must be a UUID.' );
	expect( invalid.find( '.wp-admin-authorize-application-error a' ).exists() ).toBe( false );

	const dashboard = await mountAuthorize( refusalData( { link: { text: 'Go Back', url: 'index.php' } } ) );
	expect( dashboard.find( '.wp-admin-authorize-application-error a' ).attributes( 'href' ) ).toBe( 'index.php' );

	const unsafe = await mountAuthorize( refusalData( { link: { text: 'Go Back', url: 'javascript:alert(1)' } } ) );
	expect( unsafe.find( '.wp-admin-authorize-application-error a' ).exists() ).toBe( false );
	expect( api.calls ).toEqual( [] );
} );

test( 'die screen: data that failed says so', async () => {
	const wrapper = await mountAuthorize( { failed: true } );
	expect( wrapper.find( '.wp-admin-authorize-application-failed' ).text() ).toBe( 'The Authorize Application request could not be loaded.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
} );

test( 'formHtml: what wp_authorize_application_password_form prints shows before Approve, with the not-saved note', async () => {
	const wrapper = await mountAuthorize( authorizeData( { formHtml: '<div class="detached-fixture-authorize-form">Fixture authorize form</div>' } ) );
	expect( wrapper.find( '.detached-fixture-authorize-form' ).text() ).toBe( 'Fixture authorize form' );
	expect( wrapper.find( '.wp-admin-authorize-application-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	const html = wrapper.find( 'form.form-wrap' ).html();
	expect( html.indexOf( 'detached-fixture-authorize-form' ) ).toBeGreaterThan( html.indexOf( 'id="app_name"' ) );
	expect( html.indexOf( 'detached-fixture-authorize-form' ) ).toBeLessThan( html.indexOf( 'id="approve"' ) );
} );

test( 'a failed answer: Approve\'s error is said in a page notice, nothing is followed, and Approve works again', async () => {
	api.respondWith( async () => {
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message, notice.scope ] ) ).toEqual( [ [ 'error', 'Fixture failure.', 'page' ] ] );
	expect( wrapper.record.spoken ).toEqual( [ 'Fixture failure.' ] );
	expect( wrapper.record.assigned ).toEqual( [] );
	expect( wrapper.find( 'form.form-wrap' ).exists() ).toBe( true );
	const approve = wrapper.find( 'input#approve' );
	expect( approve.classes() ).not.toContain( 'disabled' );
	await approve.trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 2 );
} );

test( 'a failed answer: while Approve waits, a second click sends nothing and the button is marked disabled', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = resolve;
	} ) );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'input#approve' ).classes() ).toContain( 'disabled' );
	expect( wrapper.find( 'input#approve' ).attributes( 'aria-disabled' ) ).toBe( 'true' );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
	release( answer( { location: 'https://app.example.org/done?password=x' } ) );
	await settle();
	expect( wrapper.record.assigned ).toEqual( [ 'https://app.example.org/done?password=x' ] );
} );

test( 'A11: the name can be changed; an empty name posts nothing new to name, shows WordPress\'s error and focuses the field', async () => {
	api.respondWith( async () => {
		throw apiError( 'An application name is required to create an application password.', 400, 'application_password_empty_name' );
	} );
	const wrapper = await mountAuthorize();
	await wrapper.find( 'input#app_name' ).setValue( '' );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls.map( ( call ) => call.payload ) ).toEqual( [ approveBody( { app_name: '' } ) ] );
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'An application name is required to create an application password.' ] ] );
	expect( document.activeElement ).toBe( wrapper.find( 'input#app_name' ).element );
	expect( wrapper.record.assigned ).toEqual( [] );

	api.respondWith( async () => answer( { location: 'https://app.example.org/done?password=x' } ) );
	await wrapper.find( 'input#app_name' ).setValue( 'Renamed App' );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 1 ].payload ).toEqual( approveBody( { app_name: 'Renamed App' } ) );
} );

test( 'texts as InlineMarkup: a hostile app name in the texts, the field and the password notice runs nothing', async () => {
	const escaped = 'O\'Brien &amp; &lt;img src=x onerror="window.__ran=1"&gt;';
	api.respondWith( async () => answer( { password: PASSWORD, chunked: CHUNKED } ) );
	const wrapper = await mountAuthorize( authorizeData( {
		request: { appName: HOSTILE, appId: '', successUrl: null, rejectUrl: null },
		texts: { intro: 'Would you like to give the application identifying itself as <strong>' + escaped + '</strong> access to your account? <img src=x onerror="window.__ran=1">', approveDescription: 'x', rejectDescription: 'y' },
		formHtml: null,
	} ) );
	await settle();
	expect( wrapper.find( '.auth-app-card p strong' ).text() ).toBe( HOSTILE );
	expect( wrapper.find( 'input#app_name' ).element.value ).toBe( HOSTILE );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( 'label[for="new-application-password-value"] strong' ).text() ).toBe( HOSTILE );
	expect( wrapper.find( '.auth-app-card img' ).exists() ).toBe( false );
	expect( window.__ran ).toBeUndefined();
} );

test.each( [
	[ 'vbscript://app.example.org/msgbox' ],
	[ 'VBScript://app.example.org/msgbox' ],
	[ 'data:text/html,x' ],
] )( 'a success URL the page will not load (%j): Approve says so and posts nothing, so no password is created', async ( successUrl ) => {
	const wrapper = await mountAuthorize( authorizeData( { request: { appName: 'Acme App', appId: APP_ID, successUrl, rejectUrl: 'https://app.example.org/no' } } ) );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
	expect( wrapper.record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Invalid URL format.' ] ] );
	expect( wrapper.record.assigned ).toEqual( [] );
	expect( wrapper.find( 'input#approve' ).classes() ).not.toContain( 'disabled' );
} );

test( 'a success URL the page loads: Approve posts; without a success URL it posts too', async () => {
	api.respondWith( async () => answer( { location: 'acme-app://callback?password=x' } ) );
	const wrapper = await mountAuthorize( authorizeData( { request: { appName: 'Acme App', appId: '', successUrl: 'acme-app://callback', rejectUrl: null } } ) );
	await wrapper.find( 'input#approve' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toHaveLength( 1 );
} );
