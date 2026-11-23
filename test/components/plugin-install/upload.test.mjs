/** @jest-environment jsdom */
// The upload of Add Plugins: the Upload Plugin toggle and the upload tab, the form
// (install_plugins_upload(), common.js's disabled submit), the package posted as FormData, the
// result panel (update.php's upload-plugin step: heading, log, complete actions), the overwrite
// comparison (Plugin_Installer_Skin::do_overwrite(): rows, warnings, blocked, Replace and Cancel),
// what plugins filter there, the credentials retry on the same package, and the errors.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, comparison, credentialsError, host, installData, loadContracts, mountInstall, settle, uploadAnswer } from './data.mjs';

const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;
const UPLOAD = 'wp-admin/v1/plugins/upload';

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
	delete window.__ran;
	jest.restoreAllMocks();
	resetContracts();
} );

/** Chooses a file in `#pluginzip` and submits the form. */
async function upload( wrapper, name = 'e2e-test-plugin-1.0.zip' ) {
	const input = wrapper.find( '#pluginzip' );
	const file = new File( [ 'PK' ], name, { type: 'application/zip' } );
	Object.defineProperty( input.element, 'files', { value: [ file ], configurable: true } );
	await input.trigger( 'change' );
	await wrapper.find( 'form.wp-upload-form' ).trigger( 'submit' );
	await settle();
	return file;
}

test( 'the toggle shows the form in place and hides it again; on the upload tab it leads back and the form is open', async () => {
	const wrapper = await mountInstall();
	const root = () => wrapper.find( '.wp-admin-plugin-install' );
	expect( root().classes() ).not.toContain( 'show-upload-view' );
	await wrapper.find( 'a.upload-view-toggle' ).trigger( 'click' );
	expect( root().classes() ).toContain( 'show-upload-view' );
	expect( wrapper.find( 'a.upload-view-toggle' ).attributes( 'aria-expanded' ) ).toBe( 'true' );
	await wrapper.find( 'a.upload-view-toggle' ).trigger( 'click' );
	expect( root().classes() ).not.toContain( 'show-upload-view' );
	wrapper.unmount();

	const record = host();
	const tab = await mountInstall( installData( 'upload' ), record );
	const toggle = tab.find( 'a.upload-view-toggle' );
	expect( toggle.attributes( 'href' ) ).toBe( '/wp-admin/plugin-install.php' );
	expect( toggle.attributes( 'role' ) ).toBeUndefined();
	expect( tab.find( '.wp-admin-plugin-install' ).classes() ).toContain( 'plugin-install-tab-upload' );
	expect( tab.find( '.upload-plugin-wrap' ).exists() ).toBe( false );
	expect( tab.find( '.upload-plugin form.wp-upload-form' ).exists() ).toBe( true );
	expect( tab.find( '.wp-filter' ).exists() ).toBe( false );
} );

test( 'the form: the help, the hidden label, #pluginzip for .zip, Install Now disabled until a file is chosen, and the plugins\' output after it', async () => {
	const wrapper = await mountInstall( installData( 'upload', { upload: { ...installData( 'upload' ).upload, hooksHtml: '<div class="detached-fixture-upload">Fixture upload</div>' } } ) );
	await settle();
	expect( wrapper.find( '.upload-plugin p.install-help' ).text() ).toBe( 'If you have a plugin in a .zip format, you may install or update it by uploading it here.' );
	expect( wrapper.find( 'label.screen-reader-text[for="pluginzip"]' ).text() ).toBe( 'Plugin zip file' );
	const form = wrapper.find( 'form.wp-upload-form' );
	expect( form.attributes( 'enctype' ) ).toBe( 'multipart/form-data' );
	const submit = wrapper.find( '#install-plugin-submit' );
	expect( submit.element.value ).toBe( 'Install Now' );
	expect( submit.element.disabled ).toBe( true );
	expect( wrapper.find( '.detached-fixture-upload' ).text() ).toBe( 'Fixture upload' );
	const input = wrapper.find( '#pluginzip' );
	Object.defineProperty( input.element, 'files', { value: [ new File( [ 'PK' ], 'a.zip' ) ], configurable: true } );
	await input.trigger( 'change' );
	expect( wrapper.find( '#install-plugin-submit' ).element.disabled ).toBe( false );
} );

test( 'the form: a relative admin link in what plugins print after it opens through the router', async () => {
	const record = host();
	const wrapper = await mountInstall( installData( 'upload', { upload: { ...installData( 'upload' ).upload, hooksHtml: '<div class="detached-fixture-upload"><a class="rel" href="plugins.php?detached_fixture_upload=1">Fixture plugins</a><a class="off" href="https://example.org/" target="_blank">Off</a></div>' } } ), record );
	await settle();
	await wrapper.find( '.detached-fixture-upload a.rel' ).trigger( 'click' );
	await wrapper.find( '.detached-fixture-upload a.off' ).trigger( 'click' );
	expect( record.navigated ).toEqual( [ '/wp-admin/plugins.php?detached_fixture_upload=1' ] );
} );

test( 'result panel: Install Now posts the package as FormData; the heading, the log and the actions replace the form; Activate Plugin follows its answer', async () => {
	const record = host();
	api.respondWith( async ( method, route ) => ( route === UPLOAD ? uploadAnswer() : { redirect: 'plugins.php?activate=true', location: null } ) );
	const wrapper = await mountInstall( installData( 'upload' ), record );
	const file = await upload( wrapper );
	expect( api.calls[ 0 ].route ).toBe( UPLOAD );
	expect( api.calls[ 0 ].payload ).toBeInstanceOf( FormData );
	expect( api.calls[ 0 ].payload.get( 'pluginzip' ) ).toBe( file );
	expect( wrapper.find( 'form.wp-upload-form' ).exists() ).toBe( false );
	const panel = wrapper.find( '.wp-admin-plugin-upload-result' );
	expect( panel.find( 'h2' ).text() ).toBe( 'Installing plugin from uploaded file: e2e-test-plugin-1.0.zip' );
	expect( panel.findAll( 'p' ).slice( 0, 3 ).map( ( p ) => p.text() ) ).toEqual( [ 'Unpacking the package…', 'Installing the plugin…', 'Plugin installed successfully.' ] );
	const actions = panel.findAll( 'p:last-child a' );
	expect( actions.map( ( a ) => [ a.text(), a.attributes( 'href' ), a.classes() ] ) ).toEqual( [
		[ 'Activate Plugin', '#', [ 'button', 'button-primary' ] ],
		[ 'Go to Plugin Installer', '/wp-admin/plugin-install.php', [] ],
	] );
	await actions[ 0 ].trigger( 'click' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/plugins/activate', payload: { plugin: 'e2e-test-plugin/e2e-test-plugin.php' } } );
	expect( record.followed ).toEqual( [ { redirect: 'plugins.php?activate=true', location: null } ] );
} );

test( 'result panel: filtered complete actions are plugin output; a relative link in them opens through the router', async () => {
	const record = host();
	api.respondWith( async () => uploadAnswer( 'installed', { actionsHtml: '<a class="button button-primary" href="plugins.php?action=activate&amp;plugin=e2e-test-plugin%2Fe2e-test-plugin.php&amp;_wpnonce=abc" target="_parent">Activate Plugin</a> <a href="update.php?action=fixture">Fixture</a>' } ) );
	const wrapper = await mountInstall( installData( 'upload' ), record );
	await upload( wrapper );
	await settle();
	const links = wrapper.findAll( '.wp-admin-plugin-upload-result .wp-admin-legacy-html a' );
	expect( links.map( ( a ) => a.text() ) ).toEqual( [ 'Activate Plugin', 'Fixture' ] );
	await links[ 0 ].trigger( 'click' );
	await links[ 1 ].trigger( 'click' );
	expect( record.navigated ).toEqual( [ '/wp-admin/plugins.php?action=activate&plugin=e2e-test-plugin%2Fe2e-test-plugin.php&_wpnonce=abc', '/wp-admin/update.php?action=fixture' ] );
} );

test( 'overwrite: the comparison table with the marked value, the backup notice, Replace current with uploaded posts the overwrite, Cancel and go back deletes the package', async () => {
	const record = host();
	api.respondWith( async ( method, route ) => {
		if ( route === UPLOAD ) {
			return uploadAnswer( 'exists', { overwrite: comparison() } );
		}
		if ( method === 'DELETE' ) {
			return { redirect: 'plugin-install.php', location: null };
		}
		return uploadAnswer( 'installed', { heading: 'Installing plugin from uploaded file: e2e-test-plugin-2.0.zip', log: [ 'Plugin updated successfully.' ] } );
	} );
	const wrapper = await mountInstall( installData( 'upload' ), record );
	await upload( wrapper, 'e2e-test-plugin-2.0.zip' );
	const panel = wrapper.find( '.wp-admin-plugin-upload-result' );
	expect( panel.find( 'h2.update-from-upload-heading' ).text() ).toBe( 'This plugin is already installed.' );
	const rows = panel.findAll( 'table.update-from-upload-comparison tr' );
	expect( rows.map( ( tr ) => tr.findAll( 'th, td' ).map( ( cell ) => cell.text() ) ) ).toEqual( [
		[ '', 'Current', 'Uploaded' ],
		[ 'Plugin name', 'E2E Test Plugin', 'E2E Test Plugin' ],
		[ 'Version', '1.0', '2.0' ],
		[ 'Author', 'WordPress', 'WordPress' ],
		[ 'Required WordPress version', '-', '-' ],
		[ 'Required PHP version', '-', '7.4' ],
	] );
	expect( rows[ 5 ].findAll( 'td' )[ 2 ].classes() ).toEqual( [ 'warning' ] );
	expect( rows[ 1 ].find( 'td.name-label' ).exists() ).toBe( true );
	expect( panel.find( 'p.update-from-upload-notice a' ).attributes( 'href' ) ).toBe( 'https://developer.wordpress.org/advanced-administration/security/backup/' );
	expect( panel.find( 'p.update-from-upload-expired.hidden' ).text() ).toBe( 'The uploaded file has expired. Please go back and upload it again.' );
	const replace = panel.find( 'p.update-from-upload-actions a.update-from-upload-overwrite' );
	expect( replace.text() ).toBe( 'Replace current with uploaded' );
	await replace.trigger( 'click' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/plugins/upload/41', payload: { overwrite: 'update-plugin' } } );
	expect( wrapper.find( '.wp-admin-plugin-upload-result' ).text() ).toContain( 'Plugin updated successfully.' );
	wrapper.unmount();

	api.calls.length = 0;
	const again = await mountInstall( installData( 'upload' ), record );
	await upload( again, 'e2e-test-plugin-2.0.zip' );
	await again.find( 'p.update-from-upload-actions a.button:not(.update-from-upload-overwrite)' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'DELETE', route: 'wp-admin/v1/plugins/upload/41', payload: undefined } );
	expect( record.followed ).toEqual( [ { redirect: 'plugin-install.php', location: null } ] );
} );

test( 'overwrite: a blocked comparison lists its reasons and offers only Cancel and go back; filtered table and actions are plugin output', async () => {
	api.respondWith( async () => uploadAnswer( 'exists', { overwrite: comparison( { blocked: true, warnings: [ 'The PHP version on your server is 8.3.36, however the uploaded plugin requires 99.0.' ] } ) } ) );
	const wrapper = await mountInstall( installData( 'upload' ) );
	await upload( wrapper );
	const panel = wrapper.find( '.wp-admin-plugin-upload-result' );
	expect( panel.find( 'p.update-from-upload-notice' ).exists() ).toBe( false );
	expect( panel.text() ).toContain( 'The plugin cannot be updated due to the following:' );
	expect( panel.findAll( 'ul.ul-disc li' ).map( ( li ) => li.text() ) ).toEqual( [ 'The PHP version on your server is 8.3.36, however the uploaded plugin requires 99.0.' ] );
	expect( panel.find( 'a.update-from-upload-overwrite' ).exists() ).toBe( false );
	expect( panel.find( 'p.update-from-upload-actions a' ).text() ).toBe( 'Cancel and go back' );
	wrapper.unmount();

	api.respondWith( async () => uploadAnswer( 'exists', { overwrite: comparison( { tableHtml: '<table class="update-from-upload-comparison fixture"><tr><td>Fixture</td></tr></table>', actionsHtml: '<a class="fixture-action" href="#">Fixture action</a>' } ) } ) );
	const filtered = await mountInstall( installData( 'upload' ) );
	await upload( filtered );
	await settle();
	expect( filtered.find( '.wp-admin-legacy-html table.fixture' ).text() ).toBe( 'Fixture' );
	expect( filtered.find( '.update-from-upload-actions.wp-admin-legacy-html a.fixture-action' ).text() ).toBe( 'Fixture action' );
} );

test( 'credentials: an upload that needs them asks, then retries on the same package; cancelled, the package is deleted', async () => {
	api.respondWith( async ( method, route, payload ) => {
		if ( route === UPLOAD ) {
			throw credentialsError( { package: 52 } );
		}
		if ( method === 'DELETE' ) {
			return { redirect: 'plugin-install.php', location: null };
		}
		return uploadAnswer( 'installed', { package: 52, ok: payload.credentials?.password } );
	} );
	const wrapper = await mountInstall( installData( 'upload' ) );
	await upload( wrapper );
	const dialog = wrapper.find( '#request-filesystem-credentials-dialog' );
	await dialog.find( '#hostname' ).setValue( 'ftp.example.org' );
	await dialog.find( '#username' ).setValue( 'deploy' );
	await dialog.find( '#password' ).setValue( 's3cret' );
	await dialog.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/plugins/upload/52', payload: { overwrite: '', credentials: { hostname: 'ftp.example.org', username: 'deploy', password: 's3cret', connection_type: 'ftp' } } } );
	expect( wrapper.find( '.wp-admin-plugin-upload-result h2' ).exists() ).toBe( true );
	wrapper.unmount();

	api.calls.length = 0;
	const again = await mountInstall( installData( 'upload' ) );
	await upload( again );
	await again.find( '#request-filesystem-credentials-dialog button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'DELETE', route: 'wp-admin/v1/plugins/upload/52', payload: undefined } );
	expect( again.find( 'form.wp-upload-form' ).exists() ).toBe( true );
} );

test( 'credentials: cancelled on an overwrite, the package is deleted and the form shows again, not the stale comparison', async () => {
	api.respondWith( async ( method, route ) => {
		if ( route === UPLOAD ) {
			return uploadAnswer( 'exists', { overwrite: comparison() } );
		}
		if ( method === 'DELETE' ) {
			return { redirect: 'plugin-install.php', location: null };
		}
		throw credentialsError( { package: 41 } );
	} );
	const wrapper = await mountInstall( installData( 'upload' ) );
	await upload( wrapper );
	await wrapper.find( 'a.update-from-upload-overwrite' ).trigger( 'click' );
	await settle();
	await wrapper.find( '#request-filesystem-credentials-dialog button.cancel-button' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'DELETE', route: 'wp-admin/v1/plugins/upload/41', payload: undefined } );
	expect( wrapper.find( '.wp-admin-plugin-upload-result' ).exists() ).toBe( false );
	expect( wrapper.find( 'form.wp-upload-form' ).exists() ).toBe( true );
} );

test( 'errors: no file and a .txt file show WordPress\'s classic texts in a page notice, and the form stays', async () => {
	const record = host();
	api.respondWith( async ( method, route, payload ) => {
		throw payload.get( 'pluginzip' ) ? apiError( 'Only .zip archives may be uploaded.', 400, 'upload_not_zip' ) : apiError( 'Please select a file', 400, 'upload_missing' );
	} );
	const wrapper = await mountInstall( installData( 'upload' ), record );
	await upload( wrapper, 'notes.txt' );
	expect( record.notices.at( -1 ) ).toMatchObject( { type: 'error', message: 'Only .zip archives may be uploaded.' } );
	expect( wrapper.find( 'form.wp-upload-form' ).exists() ).toBe( true );
	// Without a file the button is disabled (common.js); were it sent, WordPress answers its text.
	const input = wrapper.find( '#pluginzip' );
	Object.defineProperty( input.element, 'files', { value: [], configurable: true } );
	await input.trigger( 'change' );
	expect( wrapper.find( '#install-plugin-submit' ).element.disabled ).toBe( true );
	await wrapper.find( 'form.wp-upload-form' ).trigger( 'submit' );
	await settle();
	expect( record.notices.at( -1 ) ).toMatchObject( { type: 'error', message: 'Please select a file' } );
} );

test( 'a failed answer: the overwrite, the cancel and Activate Plugin say WordPress\'s message', async () => {
	const record = host();
	api.respondWith( async ( method, route ) => {
		if ( route === UPLOAD ) {
			return uploadAnswer( 'exists', { overwrite: comparison() } );
		}
		throw apiError( 'Fixture failure.' );
	} );
	const wrapper = await mountInstall( installData( 'upload' ), record );
	await upload( wrapper );
	await wrapper.find( 'a.update-from-upload-overwrite' ).trigger( 'click' );
	await settle();
	expect( record.notices.at( -1 ) ).toMatchObject( { type: 'error', message: 'Fixture failure.' } );
	await wrapper.find( 'p.update-from-upload-actions a.button:not(.update-from-upload-overwrite)' ).trigger( 'click' );
	await settle();
	expect( record.notices ).toHaveLength( 2 );
	wrapper.unmount();

	api.respondWith( async ( method, route ) => {
		if ( route === UPLOAD ) {
			return uploadAnswer();
		}
		throw apiError( 'Sorry, you are not allowed to activate this plugin.', 403 );
	} );
	const activate = await mountInstall( installData( 'upload' ), record );
	await upload( activate );
	await activate.find( '.wp-admin-plugin-upload-result a.button-primary' ).trigger( 'click' );
	await settle();
	expect( record.notices.at( -1 ) ).toMatchObject( { message: 'Sorry, you are not allowed to activate this plugin.' } );
} );

test( 'as text: the log and the comparison values run nothing', async () => {
	api.respondWith( async () => uploadAnswer( 'exists', {
		heading: 'Installing plugin from uploaded file: <img src=x onerror="window.__ran=1">.zip',
		log: [ 'Unpacking<script>window.__ran=1</script>' ],
		overwrite: comparison( { rows: [ { label: 'Plugin name', current: 'a', uploaded: '<img src=x onerror="window.__ran=1">', differs: true } ] } ),
	} ) );
	const wrapper = await mountInstall( installData( 'upload' ) );
	await upload( wrapper );
	expect( wrapper.find( '.wp-admin-plugin-upload-result img' ).exists() ).toBe( false );
	expect( wrapper.find( '.wp-admin-plugin-upload-result script' ).exists() ).toBe( false );
	expect( window.__ran ).toBeUndefined();
} );
