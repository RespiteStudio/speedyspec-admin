/** @jest-environment jsdom */
// The filesystem credentials a page holds (package-parts/credentials.js): asked through the
// Connection Information dialog, kept in memory for the page's lifetime only, never written to
// localStorage, sessionStorage, the address or the history, and emptied when the page goes.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { useCredentials } from '../../../site/components/core/package-parts/credentials.js';

const FORM = { heading: 'Connection Information', types: [ { value: 'ftp', label: 'FTP' } ], connectionType: 'ftp' };
const TYPED = { hostname: 'ftp.example.org', username: 'me', password: 's3cret', connection_type: 'ftp' };

/** Mounts a page that uses the credentials; gives the wrapper and what useCredentials() returned. */
function mountPage() {
	let held;
	const wrapper = mountPart( {
		setup() {
			held = useCredentials();
			return () => h( 'div' );
		},
	} );
	return { wrapper, credentials: held };
}

let writes;
let address;
beforeEach( () => {
	writes = [ jest.spyOn( Storage.prototype, 'setItem' ), jest.spyOn( history, 'pushState' ), jest.spyOn( history, 'replaceState' ) ];
	address = location.href;
} );
afterEach( () => {
	jest.restoreAllMocks();
} );

/** Asserts nothing was stored outside the page's memory. */
function expectNothingStored() {
	for ( const spy of writes ) {
		expect( spy ).not.toHaveBeenCalled();
	}
	expect( localStorage.length ).toBe( 0 );
	expect( sessionStorage.length ).toBe( 0 );
	expect( location.href ).toBe( address );
	expect( location.href ).not.toContain( 's3cret' );
}

test( 'ask opens the dialog with the form and resolves the submitted fields; the page keeps them', async () => {
	const { credentials } = mountPage();
	expect( credentials.open.value ).toBe( false );
	expect( credentials.current() ).toBeNull();

	const asked = credentials.ask( FORM );
	expect( credentials.open.value ).toBe( true );
	expect( credentials.form.value ).toEqual( FORM );

	credentials.submit( TYPED );
	await expect( asked ).resolves.toEqual( TYPED );
	expect( credentials.open.value ).toBe( false );
	expect( credentials.current() ).toEqual( TYPED );
	expectNothingStored();
} );

test( 'only the credential fields are kept', async () => {
	const { credentials } = mountPage();
	const asked = credentials.ask( FORM );
	credentials.submit( { ...TYPED, _fs_nonce: 'x', other: 'y' } );
	await expect( asked ).resolves.toEqual( TYPED );
	expect( credentials.current() ).toEqual( TYPED );
} );

test( 'cancel resolves null, closes the dialog and forgets what was held', async () => {
	const { credentials } = mountPage();
	const first = credentials.ask( FORM );
	credentials.submit( TYPED );
	await first;
	const second = credentials.ask( { ...FORM, error: 'Could not connect.' } );
	credentials.cancel();
	await expect( second ).resolves.toBeNull();
	expect( credentials.open.value ).toBe( false );
	expect( credentials.current() ).toBeNull();
	expectNothingStored();
} );

test( 'current() gives a copy: changing it changes nothing held', async () => {
	const { credentials } = mountPage();
	const asked = credentials.ask( FORM );
	credentials.submit( TYPED );
	await asked;
	credentials.current().password = 'changed';
	expect( credentials.current().password ).toBe( 's3cret' );
} );

test( 'a second ask while the dialog is open resolves the first with null and shows the new form', async () => {
	const { credentials } = mountPage();
	const first = credentials.ask( FORM );
	const second = credentials.ask( { ...FORM, error: 'again' } );
	await expect( first ).resolves.toBeNull();
	expect( credentials.form.value.error ).toBe( 'again' );
	credentials.submit( TYPED );
	await expect( second ).resolves.toEqual( TYPED );
} );

test( 'clear() on unmount empties what was held and resolves a pending ask with null', async () => {
	const { wrapper, credentials } = mountPage();
	const first = credentials.ask( FORM );
	credentials.submit( TYPED );
	await first;
	const pending = credentials.ask( FORM );
	wrapper.unmount();
	await flushPromises();
	await expect( pending ).resolves.toBeNull();
	expect( credentials.current() ).toBeNull();
	expect( credentials.open.value ).toBe( false );
	expect( credentials.form.value ).toBeNull();
	expectNothingStored();
} );

test( 'clear() empties what was held while the page stays', async () => {
	const { credentials } = mountPage();
	const asked = credentials.ask( FORM );
	credentials.submit( TYPED );
	await asked;
	credentials.clear();
	expect( credentials.current() ).toBeNull();
} );
