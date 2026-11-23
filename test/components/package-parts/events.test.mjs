/** @jest-environment jsdom */
// The updates.js document events (package-parts/events.js): the native Plugins pages trigger
// them on jQuery( document ) with the classic response shape, so plugin listeners still hear
// them; without jQuery nothing happens.
import { afterEach, expect, jest, test } from '@jest/globals';
import { announce, EVENTS } from '../../../site/components/core/package-parts/events.js';

const DETAIL = { slug: 'hello-dolly', plugin: 'hello-dolly/hello.php', pluginName: 'Hello Dolly', oldVersion: '1.6', newVersion: '1.7.2', errorCode: '', errorMessage: '' };

/** A jQuery double that records each trigger on the object it wraps. */
function stubJQuery() {
	const triggers = [];
	const jQuery = jest.fn( ( target ) => ( {
		trigger: ( name, detail ) => triggers.push( { target, name, detail } ),
	} ) );
	window.jQuery = jQuery;
	return triggers;
}

afterEach( () => {
	delete window.jQuery;
	jest.restoreAllMocks();
} );

test( 'the ten updates.js events, in classic names', () => {
	expect( [ ...EVENTS ].sort() ).toEqual( [
		'credential-modal-cancel',
		'wp-plugin-delete-error', 'wp-plugin-delete-success', 'wp-plugin-deleting',
		'wp-plugin-install-error', 'wp-plugin-install-success', 'wp-plugin-installing',
		'wp-plugin-update-error', 'wp-plugin-update-success', 'wp-plugin-updating',
	] );
} );

test( 'with jQuery, announce triggers the event once on the document with the detail', () => {
	const triggers = stubJQuery();
	announce( 'wp-plugin-install-success', DETAIL );
	expect( triggers ).toEqual( [ { target: document, name: 'wp-plugin-install-success', detail: DETAIL } ] );
} );

test( 'a name that is not one of the ten triggers nothing', () => {
	const triggers = stubJQuery();
	announce( 'wp-plugin-activate-success', DETAIL );
	expect( triggers ).toEqual( [] );
} );

test( 'without jQuery, nothing throws', () => {
	expect( () => announce( 'wp-plugin-updating', DETAIL ) ).not.toThrow();
} );

test( 'a listener that throws does not break the page: the error is logged', () => {
	const warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	window.jQuery = () => ( { trigger: () => {
		throw new Error( 'plugin listener' );
	} } );
	expect( () => announce( 'wp-plugin-deleting', DETAIL ) ).not.toThrow();
	expect( warn ).toHaveBeenCalledTimes( 1 );
} );

test( 'credentials never reach a listener: a job announced after resume() loses its credential fields', () => {
	const triggers = stubJQuery();
	const job = { kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', slug: 'a', hostname: 'h', username: 'u', password: 's3cret', connection_type: 'ftp', public_key: '/k.pub', private_key: '/k' } };
	announce( 'credential-modal-cancel', job );
	expect( triggers[ 0 ].detail ).toEqual( { kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', slug: 'a' } } );
	expect( JSON.stringify( triggers ) ).not.toContain( 's3cret' );
	// The job itself is left as it was.
	expect( job.body.password ).toBe( 's3cret' );
	announce( 'wp-plugin-update-error', { ...DETAIL, password: 's3cret' } );
	expect( triggers[ 1 ].detail ).toEqual( DETAIL );
} );
