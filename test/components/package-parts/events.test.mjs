/** @jest-environment jsdom */
// The updates.js document events (package-parts/events.js): the native Plugins pages trigger
// them on jQuery( document ) with the classic response shape, so plugin listeners still hear
// them; without jQuery nothing happens.
import { afterEach, expect, jest, test } from '@jest/globals';
import { announce, classicJob, EVENTS } from '../../../site/components/core/package-parts/events.js';
import { emptyQueue, enqueue, settle, start, abandon } from '../../../site/components/core/package-parts/queue.js';

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

const CREDENTIALS = { hostname: 'h', username: 'u', password: 's3cret', connection_type: 'ftp', public_key: '/k.pub', private_key: '/k' };

// The jobs classic updates.js queues (wp.updates.ajax(): `{ action, data }`), with the data each
// caller builds: updatePlugin( { plugin, slug } ), installPlugin( { slug } ), deletePlugin( { plugin, slug } ).
test.each( [
	[ 'update', { plugin: 'a/a.php', slug: 'a' }, { action: 'update-plugin', data: { plugin: 'a/a.php', slug: 'a' } } ],
	[ 'install', { slug: 'a' }, { action: 'install-plugin', data: { slug: 'a' } } ],
	[ 'delete', { plugin: 'a/a.php', slug: 'a' }, { action: 'delete-plugin', data: { plugin: 'a/a.php', slug: 'a' } } ],
] )( 'classicJob maps a queued %s job to classic updates.js\'s job, without credentials or other fields', ( kind, body, classic ) => {
	const job = { kind, key: 'a/a.php', body: { ...body, ...CREDENTIALS, overwrite: '', screen: 'plugins' } };
	expect( classicJob( job ) ).toEqual( classic );
	expect( classicJob( job, 'plugin' ) ).toEqual( classic );
	expect( job.body.password ).toBe( 's3cret' );
} );

test( 'classicJob: not a queue job, or an unknown package type, gives null', () => {
	expect( classicJob( { action: 'update-plugin', data: {} } ) ).toBeNull();
	expect( classicJob( { kind: 'update', key: 'a', body: {} }, 'widget' ) ).toBeNull();
} );

test( 'credential-modal-cancel: each dropped job is announced once, in classic shape, without credentials', () => {
	const triggers = stubJQuery();
	let queue = enqueue( enqueue( emptyQueue(), { kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', slug: 'a' } } ), { kind: 'delete', key: 'b/b.php', body: { plugin: 'b/b.php', slug: 'b' } } );
	queue = settle( start( queue ).queue, 'a/a.php', { ok: false, error: { code: 'fs_credentials_required' } } );
	// A second prompt after an earlier resume: the bodies carry the earlier credentials.
	queue = { ...queue, jobs: queue.jobs.map( ( item ) => ( { ...item, body: { ...item.body, ...CREDENTIALS } } ) ) };
	for ( const dropped of abandon( queue ).dropped ) {
		announce( 'credential-modal-cancel', dropped );
	}
	expect( triggers.map( ( { name, detail } ) => [ name, detail ] ) ).toEqual( [
		[ 'credential-modal-cancel', { action: 'update-plugin', data: { plugin: 'a/a.php', slug: 'a' } } ],
		[ 'credential-modal-cancel', { action: 'delete-plugin', data: { plugin: 'b/b.php', slug: 'b' } } ],
	] );
	expect( JSON.stringify( triggers ) ).not.toContain( 's3cret' );
} );

test( 'a classic listener reading job.action and job.data.plugin works (core\'s own cancel listener)', () => {
	const read = [];
	window.jQuery = () => ( { trigger: ( name, job ) => read.push( [ job.action, job.data.plugin ] ) } );
	const warn = jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
	announce( 'credential-modal-cancel', { kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', slug: 'a' } } );
	expect( read ).toEqual( [ [ 'update-plugin', 'a/a.php' ] ] );
	expect( warn ).not.toHaveBeenCalled();
} );

test( 'the -ing events given a queue job carry the classic args (its data), as updates.js passes them', () => {
	const triggers = stubJQuery();
	announce( 'wp-plugin-updating', { kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', slug: 'a', ...CREDENTIALS } } );
	announce( 'wp-plugin-installing', { kind: 'install', key: 'a', body: { slug: 'a' } } );
	expect( triggers.map( ( { detail } ) => detail ) ).toEqual( [ { plugin: 'a/a.php', slug: 'a' }, { slug: 'a' } ] );
} );

test( 'credentials never reach a listener: a response detail and a classic job lose their credential fields', () => {
	const triggers = stubJQuery();
	announce( 'wp-plugin-update-error', { ...DETAIL, password: 's3cret' } );
	announce( 'credential-modal-cancel', { action: 'update-plugin', data: { plugin: 'a/a.php', slug: 'a', ...CREDENTIALS } } );
	expect( triggers.map( ( { detail } ) => detail ) ).toEqual( [ DETAIL, { action: 'update-plugin', data: { plugin: 'a/a.php', slug: 'a' } } ] );
	expect( JSON.stringify( triggers ) ).not.toContain( 's3cret' );
} );
