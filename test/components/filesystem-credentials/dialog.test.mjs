/** @jest-environment jsdom */
// The Connection Information dialog (core/filesystem-credentials): the classic
// request-filesystem-credentials-form markup from WordPress's form data
// (wp_admin_filesystem_credentials_form()), the SSH key fields for `ssh`, the locks, a locked
// password that is shown as ***** and never sent, Cancel and Escape, focus back to the opener,
// and an error that runs nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { nextTick } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import FilesystemCredentials from '../../../site/components/core/filesystem-credentials.js';
import contract from '../../../site/contracts/core/filesystem-credentials.js';

/** The form WordPress describes. `over` replaces any of its keys. */
const form = ( over = {} ) => ( {
	heading: 'Connection Information',
	headingLevel: 1,
	description: 'To perform the requested action, WordPress needs to access your web server. Please enter your FTP or SSH credentials to proceed. If you do not remember your credentials, you should contact your web host.',
	error: null,
	types: [ { value: 'ftp', label: 'FTP' }, { value: 'ftps', label: 'FTPS (SSL)' }, { value: 'ssh', label: 'SSH2' } ],
	connectionType: 'ftp',
	hostname: 'ftp.example.org:21',
	username: 'deploy',
	publicKey: '/home/deploy/.ssh/id_rsa.pub',
	privateKey: '/home/deploy/.ssh/id_rsa',
	labels: { username: 'FTP/SSH Username', password: 'FTP/SSH Password' },
	hostnameLocked: false,
	usernameLocked: false,
	passwordLocked: false,
	connectionTypeLocked: false,
	publicKeyLocked: false,
	privateKeyLocked: false,
	...over,
} );

let opener;
beforeEach( () => {
	opener = document.createElement( 'button' );
	opener.textContent = 'Update Now';
	document.body.append( opener );
	opener.focus();
	delete window.__ran;
} );
afterEach( () => {
	jest.restoreAllMocks();
	delete window.__ran;
	document.body.innerHTML = '';
} );

/**
 * Mounts the dialog. The wrapper's `sent` lists each `submit` payload and `cancels` counts the
 * `cancel`s (listeners: @vue/test-utils' emitted() needs Vue's development build).
 */
async function mountDialog( data = form(), open = true ) {
	const sent = [];
	const cancels = [];
	const wrapper = mountPart( FilesystemCredentials, { props: { form: data, open, onSubmit: ( credentials ) => sent.push( credentials ), onCancel: () => cancels.push( true ) } } );
	await settle();
	return Object.assign( wrapper, { sent, cancels } );
}

test( 'the contract: shared (not a page), two segments, 1.0.0, form and open, submit and cancel', () => {
	expect( contract.id ).toBe( 'core/filesystem-credentials' );
	expect( contract.version ).toBe( '1.0.0' );
	expect( contract.page ).toBeUndefined();
	expect( contract.props ).toEqual( {
		form: { type: 'Object', required: true },
		open: { type: 'Boolean', required: false },
	} );
	expect( contract.emits ).toEqual( [ 'submit', 'cancel' ] );
} );

test( 'the fields from the form: heading, description, hostname, username, password, the connection types', async () => {
	const wrapper = await mountDialog();
	const dialog = wrapper.find( 'dialog#request-filesystem-credentials-dialog' );
	expect( dialog.attributes( 'open' ) ).toBeDefined();
	expect( dialog.attributes( 'aria-labelledby' ) ).toBe( 'request-filesystem-credentials-title' );
	const box = wrapper.find( '#request-filesystem-credentials-form.request-filesystem-credentials-form' );
	expect( box.find( 'h1#request-filesystem-credentials-title' ).text() ).toBe( 'Connection Information' );
	expect( box.find( '#request-filesystem-credentials-desc' ).text() ).toBe( form().description );
	expect( box.find( '#hostname' ).element.value ).toBe( 'ftp.example.org:21' );
	expect( box.find( '#hostname' ).attributes( 'aria-describedby' ) ).toBe( 'request-filesystem-credentials-desc' );
	expect( box.find( '#username' ).element.value ).toBe( 'deploy' );
	expect( box.find( 'label[for="username"] .field-title' ).text() ).toBe( 'FTP/SSH Username' );
	expect( box.find( '#password' ).attributes( 'type' ) ).toBe( 'password' );
	expect( box.find( '#password' ).element.value ).toBe( '' );
	expect( box.find( 'label[for="password"] .field-title' ).text() ).toBe( 'FTP/SSH Password' );
	expect( box.find( 'label[for="password"]' ).text() ).toContain( 'This password will not be stored on the server.' );
	const radios = box.findAll( 'input[name="connection_type"]' );
	expect( radios.map( ( radio ) => radio.attributes( 'id' ) ) ).toEqual( [ 'ftp', 'ftps', 'ssh' ] );
	expect( box.find( 'label[for="ftps"]' ).text() ).toBe( 'FTPS (SSL)' );
	expect( box.find( '#ftp' ).element.checked ).toBe( true );
	expect( box.find( 'button.cancel-button' ).text() ).toBe( 'Cancel' );
	expect( box.find( 'input#upgrade[type="submit"]' ).element.value ).toBe( 'Proceed' );
	for ( const id of [ 'hostname', 'username', 'password', 'ftp', 'ftps', 'ssh' ] ) {
		expect( box.find( '#' + id ).attributes( 'readonly' ) ).toBeUndefined();
	}
} );

test( 'a heading level other than 1 is an h2, as the classic form prints outside the Plugins screens', async () => {
	const wrapper = await mountDialog( form( { headingLevel: 2 } ) );
	expect( wrapper.find( 'h2#request-filesystem-credentials-title' ).exists() ).toBe( true );
	expect( wrapper.find( 'h1#request-filesystem-credentials-title' ).exists() ).toBe( false );
} );

test( 'the SSH keys show only for ssh; without SSH2 among the types there are none', async () => {
	const wrapper = await mountDialog();
	expect( wrapper.find( '#ssh-keys' ).isVisible() ).toBe( false );
	await wrapper.find( '#ssh' ).setValue( true );
	expect( wrapper.find( '#ssh-keys' ).isVisible() ).toBe( true );
	expect( wrapper.find( '#public_key' ).element.value ).toBe( '/home/deploy/.ssh/id_rsa.pub' );
	expect( wrapper.find( '#private_key' ).element.value ).toBe( '/home/deploy/.ssh/id_rsa' );
	expect( wrapper.find( '#public_key' ).attributes( 'aria-describedby' ) ).toBe( 'auth-keys-desc' );

	const ftpOnly = await mountDialog( form( { types: [ { value: 'ftp', label: 'FTP' } ] } ) );
	expect( ftpOnly.find( '#ssh-keys' ).exists() ).toBe( false );
} );

test( 'Proceed emits the typed credentials under the classic field names', async () => {
	const wrapper = await mountDialog();
	await wrapper.find( '#password' ).setValue( 's3cret' );
	await wrapper.find( '#ssh' ).setValue( true );
	await wrapper.find( 'form' ).trigger( 'submit' );
	expect( wrapper.sent ).toEqual( [ {
		hostname: 'ftp.example.org:21',
		username: 'deploy',
		password: 's3cret',
		connection_type: 'ssh',
		public_key: '/home/deploy/.ssh/id_rsa.pub',
		private_key: '/home/deploy/.ssh/id_rsa',
	} ] );
	// The typed password does not stay in the field once sent.
	expect( wrapper.find( '#password' ).element.value ).toBe( '' );
} );

test( 'without SSH2 among the types, no key fields are sent', async () => {
	const wrapper = await mountDialog( form( { types: [ { value: 'ftp', label: 'FTP' } ] } ) );
	await wrapper.find( '#password' ).setValue( 'pw' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	expect( wrapper.sent[ 0 ] ).toEqual( { hostname: 'ftp.example.org:21', username: 'deploy', password: 'pw', connection_type: 'ftp' } );
} );

test( 'locked fields are readonly and not sent; a locked password shows ***** and is never sent', async () => {
	const wrapper = await mountDialog( form( {
		hostnameLocked: true, usernameLocked: true, passwordLocked: true, connectionTypeLocked: true, connectionType: 'ssh', publicKeyLocked: true, privateKeyLocked: true,
	} ) );
	for ( const id of [ 'hostname', 'username', 'password', 'public_key', 'private_key' ] ) {
		expect( wrapper.find( '#' + id ).attributes( 'readonly' ) ).toBeDefined();
	}
	for ( const id of [ 'ftp', 'ftps', 'ssh' ] ) {
		expect( wrapper.find( '#' + id ).attributes( 'disabled' ) ).toBeDefined();
	}
	expect( wrapper.find( '#password' ).element.value ).toBe( '*****' );
	expect( wrapper.find( 'label[for="password"]' ).text() ).not.toContain( 'This password will not be stored on the server.' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	const sent = wrapper.sent[ 0 ];
	expect( sent ).toEqual( {} );
	expect( JSON.stringify( sent ) ).not.toContain( '*****' );
} );

test( 'a locked password alone: the other fields are sent, the password is not', async () => {
	const wrapper = await mountDialog( form( { passwordLocked: true } ) );
	await wrapper.find( 'form' ).trigger( 'submit' );
	const sent = wrapper.sent[ 0 ];
	expect( Object.keys( sent ) ).not.toContain( 'password' );
	expect( sent ).toEqual( { hostname: 'ftp.example.org:21', username: 'deploy', connection_type: 'ftp', public_key: '/home/deploy/.ssh/id_rsa.pub', private_key: '/home/deploy/.ssh/id_rsa' } );
} );

test( 'Escape emits cancel once, and the browser does not close the dialog by itself', async () => {
	const wrapper = await mountDialog();
	const dialog = wrapper.find( 'dialog' );
	const event = new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true, cancelable: true } );
	wrapper.find( '#hostname' ).element.dispatchEvent( event );
	expect( event.defaultPrevented ).toBe( true );
	const nativeCancel = new Event( 'cancel', { cancelable: true } );
	dialog.element.dispatchEvent( nativeCancel );
	expect( nativeCancel.defaultPrevented ).toBe( true );
	expect( wrapper.cancels ).toHaveLength( 1 );
	expect( wrapper.sent ).toEqual( [] );
} );

test( 'Cancel emits cancel', async () => {
	const wrapper = await mountDialog();
	await wrapper.find( 'button.cancel-button' ).trigger( 'click' );
	expect( wrapper.cancels ).toHaveLength( 1 );
} );

test( 'opening focuses the first field that can be typed in; closing empties the password and returns the focus to the opener', async () => {
	const wrapper = await mountDialog( form( { hostnameLocked: true } ), false );
	expect( wrapper.find( 'dialog' ).attributes( 'open' ) ).toBeUndefined();
	await wrapper.setProps( { open: true } );
	await settle();
	expect( document.activeElement ).toBe( wrapper.find( '#username' ).element );
	await wrapper.find( '#password' ).setValue( 's3cret' );
	await wrapper.setProps( { open: false } );
	await nextTick();
	expect( wrapper.find( 'dialog' ).attributes( 'open' ) ).toBeUndefined();
	expect( document.activeElement ).toBe( opener );
	await wrapper.setProps( { open: true } );
	await settle();
	expect( wrapper.find( '#password' ).element.value ).toBe( '' );
} );

test( 'a new form while open shows its values and its error', async () => {
	const wrapper = await mountDialog();
	await wrapper.setProps( { form: form( { username: 'other', error: '<strong>Error:</strong> Could not connect to the server.' } ) } );
	await settle();
	expect( wrapper.find( '#username' ).element.value ).toBe( 'other' );
	expect( wrapper.find( '.notice-error strong' ).text() ).toBe( 'Error:' );
} );

test( 'the error renders through InlineMarkup after the heading, and runs nothing', async () => {
	const wrapper = await mountDialog( form( { error: '<strong>Error:</strong> Could not connect.<img src=x onerror="window.__ran=1"><script>window.__ran=2</script>' } ) );
	const notice = wrapper.find( '#request-filesystem-credentials-title + .notice.notice-alt.notice-error' );
	expect( notice.attributes( 'role' ) ).toBe( 'alert' );
	expect( notice.find( 'strong' ).text() ).toBe( 'Error:' );
	expect( notice.text() ).toBe( 'Error: Could not connect.' );
	expect( notice.find( 'img' ).exists() ).toBe( false );
	expect( notice.find( 'script' ).exists() ).toBe( false );
	await settle();
	expect( window.__ran ).toBeUndefined();
} );

test( 'values from the data are text: markup in a hostname or a label runs nothing', async () => {
	const wrapper = await mountDialog( form( { hostname: '"><img src=x onerror="window.__ran=1">', labels: { username: '<img src=x onerror="window.__ran=1">', password: 'P' } } ) );
	expect( wrapper.find( '#hostname' ).element.value ).toBe( '"><img src=x onerror="window.__ran=1">' );
	expect( wrapper.find( 'label[for="username"] .field-title' ).text() ).toBe( '<img src=x onerror="window.__ran=1">' );
	expect( wrapper.find( 'img' ).exists() ).toBe( false );
	await settle();
	expect( window.__ran ).toBeUndefined();
} );
