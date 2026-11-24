/** @jest-environment jsdom */
// The upload of Add Themes: the form (install_themes_upload(), common.js's disabled submit), the
// package posted as FormData `themezip`, the result panel (update.php's upload-theme step:
// heading, log, complete actions, Activate), the overwrite comparison (Theme_Installer_Skin::
// do_overwrite(): rows, warnings, blocked, Replace and Cancel), what plugins filter there, the
// credentials retry, and the errors.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { DIRECTORY, UPLOAD, apiError, comparison, credentialsError, directory, host, installData, loadContracts, mountInstall, settle, uploadAnswer } from './data.mjs';

const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

/** Answers the directory with the canned cards and the rest with `answer( method, route, payload )`. */
const respond = ( answer ) => api.respondWith( async ( method, route, payload ) => ( route === DIRECTORY ? directory() : answer( method, route, payload ) ) );

/** Chooses a file in `#themezip` and submits the form. */
async function upload( wrapper, name = 'e2e-test-theme.zip' ) {
	const input = wrapper.find( '#themezip' );
	const file = new File( [ 'PK' ], name, { type: 'application/zip' } );
	Object.defineProperty( input.element, 'files', { value: [ file ], configurable: true } );
	await input.trigger( 'change' );
	await wrapper.find( 'form.wp-upload-form' ).trigger( 'submit' );
	await settle();
	return file;
}

test( 'the form: the help, the hidden label, #themezip for .zip, Install Now disabled until a file is chosen', async () => {
	respond( async () => ( {} ) );
	const wrapper = await mountInstall();
	const form = wrapper.find( '.upload-theme form.wp-upload-form' );
	expect( [ wrapper.find( '.upload-theme p.install-help' ).text(), form.find( 'label.screen-reader-text[for="themezip"]' ).text(), form.find( '#themezip' ).attributes( 'accept' ), form.attributes( 'enctype' ), wrapper.find( '#install-theme-submit' ).element.value, wrapper.find( '#install-theme-submit' ).element.disabled ] ).toEqual( [ 'If you have a theme in a .zip format, you may install or update it by uploading it here.', 'Theme zip file', '.zip', 'multipart/form-data', 'Install Now', true ] );
	const input = wrapper.find( '#themezip' );
	Object.defineProperty( input.element, 'files', { value: [ new File( [ 'PK' ], 'a.zip' ) ], configurable: true } );
	await input.trigger( 'change' );
	expect( wrapper.find( '#install-theme-submit' ).element.disabled ).toBe( false );
} );

test( 'result panel: Install Now posts the package as FormData themezip; the heading, the log and the actions replace the form; Activate follows its answer', async () => {
	const record = host();
	respond( async ( method, route ) => ( route === UPLOAD ? uploadAnswer() : { redirect: 'themes.php?activated=true', location: null } ) );
	const wrapper = await mountInstall( installData(), record );
	const file = await upload( wrapper );
	const sent = api.calls.find( ( call ) => call.route === UPLOAD );
	expect( [ sent.payload instanceof FormData, sent.payload.get( 'themezip' ) ] ).toEqual( [ true, file ] );
	expect( wrapper.find( 'form.wp-upload-form' ).exists() ).toBe( false );
	const panel = wrapper.find( '.upload-theme .wp-admin-theme-upload-result' );
	expect( [ panel.find( 'h2' ).text(), panel.findAll( 'p' ).slice( 0, 3 ).map( ( p ) => p.text() ) ] ).toEqual( [ 'Installing theme from uploaded file: e2e-test-theme.zip', [ 'Unpacking the package…', 'Installing the theme…', 'Theme installed successfully.' ] ] );
	const actions = panel.findAll( 'p:last-child a' );
	expect( actions.map( ( a ) => [ a.text(), a.attributes( 'href' ) ] ) ).toEqual( [ [ 'Live Preview', '/wp-admin/customize.php?theme=e2e-test-theme' ], [ 'Activate', '#' ], [ 'Go to Themes page', '/wp-admin/themes.php' ] ] );
	await actions[ 1 ].trigger( 'click' );
	await settle();
	expect( [ api.calls.at( -1 ), record.followed ] ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/activate', payload: { stylesheet: 'e2e-test-theme' } }, [ { redirect: 'themes.php?activated=true', location: null } ] ] );
} );

test( 'result panel: filtered complete actions are plugin output', async () => {
	respond( async () => uploadAnswer( 'installed', { actionsHtml: '<a class="detached-fixture-theme-complete" href="options-general.php">Fixture complete</a>' } ) );
	const wrapper = await mountInstall();
	await upload( wrapper );
	expect( wrapper.find( '.wp-admin-theme-upload-result .wp-admin-legacy-html a.detached-fixture-theme-complete' ).text() ).toBe( 'Fixture complete' );
} );

test( 'overwrite: the comparison with the marked value and the backup notice; Replace installed with uploaded posts the overwrite; Cancel and go back deletes the package', async () => {
	const record = host();
	respond( async ( method, route ) => {
		if ( route === UPLOAD ) {
			return uploadAnswer( 'exists', { overwrite: comparison() } );
		}
		if ( method === 'DELETE' ) {
			return { redirect: 'theme-install.php', location: null };
		}
		return uploadAnswer( 'installed', { log: [ 'Theme updated successfully.' ] } );
	} );
	const wrapper = await mountInstall( installData(), record );
	await upload( wrapper, 'e2e-test-theme-2.0.zip' );
	const panel = wrapper.find( '.wp-admin-theme-upload-result' );
	expect( panel.find( 'h2.update-from-upload-heading' ).text() ).toBe( 'This theme is already installed.' );
	const rows = panel.findAll( 'table.update-from-upload-comparison tr' );
	expect( rows.map( ( tr ) => tr.findAll( 'th, td' ).map( ( cell ) => cell.text() ) ).slice( 0, 3 ) ).toEqual( [ [ '', 'Installed', 'Uploaded' ], [ 'Theme name', 'E2E Test Theme', 'E2E Test Theme' ], [ 'Version', '1.0', '2.0' ] ] );
	expect( [ rows[ 5 ].findAll( 'td' )[ 2 ].classes(), panel.find( 'p.update-from-upload-notice' ).text() ] ).toEqual( [ [ 'warning' ], 'You are updating a theme. Be sure to back up your database and files first.' ] );
	await panel.find( 'a.update-from-upload-overwrite' ).trigger( 'click' );
	await settle();
	expect( [ api.calls.at( -1 ), wrapper.find( '.wp-admin-theme-upload-result' ).text() ] ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/themes/upload/41', payload: { overwrite: 'update-theme' } }, expect.stringContaining( 'Theme updated successfully.' ) ] );
	wrapper.unmount();

	const again = await mountInstall( installData(), record );
	await upload( again, 'e2e-test-theme-2.0.zip' );
	await again.find( 'p.update-from-upload-actions a.button:not(.update-from-upload-overwrite)' ).trigger( 'click' );
	await settle();
	expect( [ api.calls.at( -1 ), record.followed ] ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/themes/upload/41', payload: undefined }, [ { redirect: 'theme-install.php', location: null } ] ] );
} );

test( 'overwrite: a blocked comparison lists its reasons and offers only Cancel and go back', async () => {
	respond( async () => uploadAnswer( 'exists', { overwrite: comparison( { blocked: true, warnings: [ 'The PHP version on your server is 8.3.36, however the uploaded theme requires 99.0.' ] } ) } ) );
	const wrapper = await mountInstall();
	await upload( wrapper );
	const panel = wrapper.find( '.wp-admin-theme-upload-result' );
	expect( [ panel.find( 'ul.ul-disc li' ).text(), panel.find( 'a.update-from-upload-overwrite' ).exists(), panel.find( 'p.update-from-upload-actions a' ).text() ] ).toEqual( [ 'The PHP version on your server is 8.3.36, however the uploaded theme requires 99.0.', false, 'Cancel and go back' ] );
} );

test( 'overwrite: a credentials pause retries on the same package with them', async () => {
	respond( async ( method, route, payload ) => {
		if ( route === UPLOAD ) {
			throw credentialsError( { package: 41 } );
		}
		return payload?.credentials ? uploadAnswer() : {};
	} );
	const wrapper = await mountInstall();
	await upload( wrapper );
	const dialog = wrapper.find( '#request-filesystem-credentials-dialog' );
	await dialog.find( '#hostname' ).setValue( 'ftp.example.org' );
	await dialog.find( '#username' ).setValue( 'deploy' );
	await dialog.find( '#password' ).setValue( 's3cret' );
	await dialog.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( [ api.calls.at( -1 ).route, api.calls.at( -1 ).payload.credentials.password, wrapper.find( '.wp-admin-theme-upload-result h2' ).text() ] ).toEqual( [ 'wp-admin/v1/themes/upload/41', 's3cret', 'Installing theme from uploaded file: e2e-test-theme.zip' ] );
} );

test( 'errors: a refused upload (a .txt, a plugin zip) says the classic text in a page notice and keeps the form', async () => {
	respond( async () => {
		throw apiError( 'Only .zip archives may be uploaded.', 400, 'upload_not_zip' );
	} );
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await upload( wrapper, 'detached.txt' );
	expect( [ record.notices.map( ( notice ) => notice.message ), wrapper.find( 'form.wp-upload-form' ).exists() ] ).toEqual( [ [ 'Only .zip archives may be uploaded.' ], true ] );
} );

test( 'errors: a failed Cancel and go back says its error and keeps the comparison', async () => {
	respond( async ( method ) => {
		if ( method === 'DELETE' ) {
			throw apiError( 'Fixture cancel failure.' );
		}
		return uploadAnswer( 'exists', { overwrite: comparison() } );
	} );
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await upload( wrapper );
	await wrapper.find( 'p.update-from-upload-actions a.button:not(.update-from-upload-overwrite)' ).trigger( 'click' );
	await settle();
	expect( [ record.notices.map( ( notice ) => notice.message ), wrapper.find( 'h2.update-from-upload-heading' ).exists() ] ).toEqual( [ [ 'Fixture cancel failure.' ], true ] );
} );
