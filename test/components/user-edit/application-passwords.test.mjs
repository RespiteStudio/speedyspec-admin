/** @jest-environment jsdom */
// The Application Passwords section of Profile and Edit User
// (core/user-edit/application-passwords.js), as user-edit.php prints it and application-passwords.js
// drives it through wp/v2: Add (the notice with the password, Copy and Dismiss), Revoke after
// its confirm, Revoke all after its confirm, the rows read again from
// wp-admin/v1 users/{id}/application-passwords after each write, an empty name, the sites notice,
// the Basic Authentication and environment texts, and names as text.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { HOSTILE, ROW, apiError, applications, editData, loadContracts, mountUserEdit, profileData, setMeter, settle, unsetMeter } from './data.mjs';

const PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
const ROWS = 'wp-admin/v1/users/7/application-passwords';
const V2 = 'wp/v2/users/7/application-passwords';
let confirmed;
let clipboard;

beforeEach( async () => {
	api.reset();
	setMeter( 4 );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	confirmed = [];
	jest.spyOn( window, 'confirm' ).mockImplementation( ( text ) => {
		confirmed.push( text );
		return true;
	} );
	clipboard = [];
	Object.defineProperty( navigator, 'clipboard', { configurable: true, value: { writeText: async ( text ) => clipboard.push( text ) } } );
	delete window.__ran;
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	unsetMeter();
	delete navigator.clipboard;
	delete window.__ran;
	document.body.className = '';
	document.body.innerHTML = '';
} );

const routes = () => api.calls.map( ( call ) => [ call.method, call.route.split( '?' )[ 0 ] ] );

test( 'the section: heading, the classic text, the create form; the table hidden with no rows', async () => {
	const wrapper = await mountUserEdit();
	const section = wrapper.find( '#application-passwords-section.application-passwords' );
	expect( section.find( 'h2' ).text() ).toBe( 'Application Passwords' );
	expect( section.find( 'p' ).text() ).toBe( 'Application passwords allow authentication via non-interactive systems, such as XML-RPC or the REST API, without providing your actual password. Application passwords can be easily revoked. They cannot be used for traditional logins to your website.' );
	expect( section.find( '.create-application-password.form-wrap label[for="new_application_password_name"]' ).text() ).toBe( 'New Application Password Name' );
	expect( section.find( '#new_application_password_name_desc' ).text() ).toBe( 'Required to create an Application Password, but not to update the user.' );
	expect( section.find( '#do_new_application_password' ).text() ).toBe( 'Add Application Password' );
	expect( section.find( '.application-passwords-list-table-wrapper' ).isVisible() ).toBe( false );
} );

test( 'the rows: the table with its columns, each row and its Revoke; Revoke all at the bottom', async () => {
	const wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { items: [ ROW ] } ) } ) );
	const table = wrapper.find( '.application-passwords-list-table-wrapper table.wp-list-table.application-passwords-user' );
	expect( wrapper.find( '.application-passwords-list-table-wrapper' ).isVisible() ).toBe( true );
	expect( table.findAll( 'thead th' ).map( ( th ) => th.text() ) ).toEqual( [ 'Name', 'Created', 'Last Used', 'Last IP', 'Revoke' ] );
	const row = table.find( `tbody tr[data-uuid="${ ROW.uuid }"]` );
	// The name cell holds the responsive toggle's hidden text after the name, as classic.
	expect( row.find( 'th.column-name' ).element.firstChild.textContent ).toBe( 'Phone' );
	expect( row.find( 'th.column-name button.toggle-row .screen-reader-text' ).text() ).toBe( 'Show more details' );
	expect( [ '.column-created', '.column-last_used', '.column-last_ip' ].map( ( cell ) => row.find( cell ).text() ) ).toEqual( [ 'November 22, 2026', '—', '—' ] );
	expect( row.find( 'button.delete' ).attributes( 'aria-label' ) ).toBe( 'Revoke "Phone"' );
	expect( wrapper.find( '.tablenav.bottom #revoke-all-application-passwords' ).text() ).toBe( 'Revoke all application passwords' );
} );

test( 'add: posts the name to wp/v2, shows the password once with Copy and Dismiss, then reads the rows again', async () => {
	api.respondWith( async ( method, route ) => {
		if ( method === 'POST' ) {
			return { uuid: ROW.uuid, name: 'Phone', password: PASSWORD };
		}
		return { items: [ ROW ] };
	} );
	const wrapper = await mountUserEdit();
	await wrapper.find( '#new_application_password_name' ).setValue( 'Phone' );
	await wrapper.find( '#do_new_application_password' ).trigger( 'click' );
	await settle();
	expect( routes() ).toEqual( [ [ 'POST', V2 ], [ 'GET', ROWS ] ] );
	expect( api.calls[ 0 ].payload ).toEqual( { name: 'Phone' } );
	expect( api.calls[ 0 ].route ).toBe( V2 + '?_locale=user' );
	const notice = wrapper.find( '.new-application-password-notice.notice-success' );
	expect( notice.attributes( 'role' ) ).toBe( 'alert' );
	expect( notice.find( 'label[for="new-application-password-value"]' ).text() ).toBe( 'Your new password for Phone is:' );
	expect( notice.find( '#new-application-password-value' ).element.value ).toBe( PASSWORD );
	expect( notice.text() ).toContain( 'Be sure to save this in a safe location. You will not be able to retrieve it.' );
	expect( wrapper.find( '#new_application_password_name' ).element.value ).toBe( '' );
	expect( wrapper.find( `tr[data-uuid="${ ROW.uuid }"]` ).exists() ).toBe( true );

	await notice.find( 'button.copy-button' ).trigger( 'click' );
	await settle();
	expect( clipboard ).toEqual( [ PASSWORD ] );
	expect( wrapper.find( '.new-application-password-notice .success' ).classes() ).not.toContain( 'hidden' );
	expect( wrapper.record.spoken ).toContain( 'Application password has been copied to your clipboard.' );

	await wrapper.find( '.new-application-password-notice button.notice-dismiss' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '.new-application-password-notice' ).exists() ).toBe( false );
	expect( wrapper.text() ).not.toContain( PASSWORD );
} );

test( 'an empty name sends nothing and focuses the field, as application-passwords.js', async () => {
	const wrapper = await mountUserEdit();
	await wrapper.find( '#do_new_application_password' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
	expect( document.activeElement ).toBe( wrapper.find( '#new_application_password_name' ).element );
} );

test( 'a refused name shows WordPress\'s message after the form', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 400, code: 'application_password_empty_name', message: 'An application name is required to create an application password.' } );
	} );
	const wrapper = await mountUserEdit();
	await wrapper.find( '#new_application_password_name' ).setValue( ' ' );
	await wrapper.find( '#do_new_application_password' ).trigger( 'click' );
	await settle();
	const notice = wrapper.find( '.create-application-password + .notice.notice-error' );
	expect( notice.attributes( 'role' ) ).toBe( 'alert' );
	expect( notice.find( 'p' ).text() ).toBe( 'An application name is required to create an application password.' );
	expect( wrapper.find( '#do_new_application_password' ).classes() ).not.toContain( 'disabled' );
} );

test( 'revoke: confirms with the classic text, deletes the uuid through wp/v2, reads the rows and says so', async () => {
	api.respondWith( async ( method ) => ( method === 'DELETE' ? { deleted: true } : { items: [] } ) );
	const wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { items: [ ROW ] } ) } ) );
	await wrapper.find( `tr[data-uuid="${ ROW.uuid }"] button.delete` ).trigger( 'click' );
	await settle();
	expect( confirmed ).toEqual( [ 'Are you sure you want to revoke this password? This action cannot be undone.' ] );
	expect( routes() ).toEqual( [ [ 'DELETE', V2 + '/' + ROW.uuid ], [ 'GET', ROWS ] ] );
	expect( wrapper.find( `tr[data-uuid="${ ROW.uuid }"]` ).exists() ).toBe( false );
	expect( wrapper.find( '.application-passwords-list-table-wrapper' ).isVisible() ).toBe( false );
	expect( wrapper.find( '.create-application-password + .notice.notice-success p' ).text() ).toBe( 'Application password revoked.' );
} );

test( 'revoke: a refused confirm sends nothing', async () => {
	window.confirm.mockImplementation( () => false );
	const wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { items: [ ROW ] } ) } ) );
	await wrapper.find( `tr[data-uuid="${ ROW.uuid }"] button.delete` ).trigger( 'click' );
	await wrapper.find( '#revoke-all-application-passwords' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [] );
} );

test( 'revoke all: confirms with the classic text, deletes all through wp/v2, reads the rows and says so', async () => {
	api.respondWith( async ( method ) => ( method === 'DELETE' ? { deleted: true, count: 1 } : { items: [] } ) );
	const wrapper = await mountUserEdit( editData( { applicationPasswords: applications( { items: [ ROW ] } ) } ) );
	await wrapper.find( '#revoke-all-application-passwords' ).trigger( 'click' );
	await settle();
	expect( confirmed ).toEqual( [ 'Are you sure you want to revoke all passwords? This action cannot be undone.' ] );
	expect( routes() ).toEqual( [ [ 'DELETE', 'wp/v2/users/9/application-passwords' ], [ 'GET', 'wp-admin/v1/users/9/application-passwords' ] ] );
	expect( wrapper.find( '.create-application-password + .notice.notice-success p' ).text() ).toBe( 'All application passwords revoked.' );
} );

test( 'a failed answer: a failed revoke shows WordPress\'s message and keeps the row', async () => {
	api.respondWith( async () => {
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture revoke failure.' } );
	} );
	const wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { items: [ ROW ] } ) } ) );
	await wrapper.find( `tr[data-uuid="${ ROW.uuid }"] button.delete` ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '.create-application-password + .notice.notice-error p' ).text() ).toBe( 'Fixture revoke failure.' );
	expect( wrapper.find( `tr[data-uuid="${ ROW.uuid }"]` ).exists() ).toBe( true );
} );

test( 'a failed answer: a failed rows read after a write says so', async () => {
	api.respondWith( async ( method ) => {
		if ( method === 'POST' ) {
			return { uuid: ROW.uuid, name: 'Phone', password: PASSWORD };
		}
		throw apiError( { status: 500, code: 'fixture_failure', message: 'Fixture rows failure.' } );
	} );
	const wrapper = await mountUserEdit();
	await wrapper.find( '#new_application_password_name' ).setValue( 'Phone' );
	await wrapper.find( '#do_new_application_password' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#new-application-password-value' ).element.value ).toBe( PASSWORD );
	expect( wrapper.find( '.create-application-password ~ .notice.notice-error p' ).text() ).toBe( 'Fixture rows failure.' );
} );

test( 'the notices: the multisite sites notice, the Basic Authentication text instead of the form, plugin form output with the note', async () => {
	let wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { sitesNotice: 'Application passwords grant access to <a href="my-sites.php">all 2 sites in this installation that you have permissions on</a>.', createHtml: '<div class="detached-fixture-app-form">Fixture app form</div>' } ) } ) );
	expect( wrapper.find( '#application-passwords-section p a[href="my-sites.php"]' ).text() ).toBe( 'all 2 sites in this installation that you have permissions on' );
	expect( wrapper.find( '.create-application-password .detached-fixture-app-form' ).text() ).toBe( 'Fixture app form' );
	expect( wrapper.find( '.create-application-password .wp-admin-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );
	wrapper.unmount();
	wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { basicAuth: true } ) } ) );
	expect( wrapper.find( '.create-application-password' ).exists() ).toBe( false );
	expect( wrapper.find( '#application-passwords-section .notice.notice-error.inline' ).text() ).toBe( 'Your website appears to use Basic Authentication, which is not currently compatible with Application Passwords.' );
} );

test( 'null sections: no section for null; the HTTPS text and the environment help when unsupported', async () => {
	let wrapper = await mountUserEdit( profileData( { applicationPasswords: null } ) );
	expect( wrapper.find( '#application-passwords-section' ).exists() ).toBe( false );
	wrapper.unmount();
	wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { available: false, supported: false, environmentHelp: 'If this is a local website, you can <a href="https://developer.wordpress.org/apis/wp-config-php/#wp-environment-type">set the environment type</a> as <code>local</code> to enable application passwords.' } ) } ) );
	const paragraphs = wrapper.findAll( '#application-passwords-section > p' ).map( ( p ) => p.text() );
	expect( paragraphs.slice( 1 ) ).toEqual( [ 'The application password feature requires HTTPS, which is not enabled on this site.', 'If this is a local website, you can set the environment type as local to enable application passwords.' ] );
	expect( wrapper.find( '.create-application-password' ).exists() ).toBe( false );
} );

test( 'as text: an application password name with markup runs nothing, in the rows and the notice', async () => {
	api.respondWith( async ( method ) => ( method === 'POST' ? { uuid: 'u2', name: HOSTILE, password: PASSWORD } : { items: [ { ...ROW, uuid: 'u2', name: HOSTILE } ] } ) );
	const wrapper = await mountUserEdit( profileData( { applicationPasswords: applications( { items: [ { ...ROW, name: HOSTILE } ] } ) } ) );
	await wrapper.find( '#new_application_password_name' ).setValue( HOSTILE );
	await wrapper.find( '#do_new_application_password' ).trigger( 'click' );
	await settle();
	expect( window.__ran ).toBeUndefined();
	expect( wrapper.find( 'img[src="x"]' ).exists() ).toBe( false );
	expect( wrapper.find( 'tr[data-uuid="u2"] th' ).element.firstChild.textContent ).toBe( HOSTILE );
	expect( wrapper.find( '.new-application-password-notice strong' ).text() ).toBe( HOSTILE );
} );
