/** @jest-environment jsdom */
// The package queue's shell (package-parts/runner.js) the Plugins pages share: one job at a time,
// each posted to its route; a key already queued is not queued again; a credentials pause asks,
// then resumes every waiting job with the credentials as one object, or, cancelled, hands back the
// dropped jobs once and lets a later job start; reset() drops the answers on their way.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import * as api from '../../helpers/api-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { usePackageQueue } from '../../../site/components/core/package-parts/runner.js';

const credentialsError = () => Object.assign( new Error( 'Filesystem credentials are required.' ), { code: 'fs_credentials_required', data: { form: { heading: 'Connection Information' } } } );

/** Mounts a page using the queue; `answers` records the callbacks, `asked` the credentials asks. */
function mountQueue( { give = null, held = null } = {} ) {
	const record = { begun: [], succeeded: [], failed: [], dropped: [], asked: [] };
	const credentials = {
		current: () => held,
		ask: async ( form ) => {
			record.asked.push( form );
			return typeof give === 'function' ? give() : give;
		},
	};
	let packages;
	mountPart( {
		setup() {
			packages = usePackageQueue( {
				credentials,
				path: ( job ) => 'wp-admin/v1/plugins/' + job.kind,
				begin: ( job ) => record.begun.push( job.key ),
				succeed: ( job, answer ) => record.succeeded.push( [ job.key, answer ] ),
				fail: ( job, error ) => record.failed.push( [ job.key, error.message ] ),
				dropped: ( jobs ) => record.dropped.push( jobs.map( ( job ) => job.key ) ),
			} );
			return () => h( 'div' );
		},
	} );
	return { packages, record };
}

beforeEach( () => api.reset() );
afterEach( () => api.reset() );

test( 'jobs run one at a time, each posted to its route with its body; a queued key is not queued again', async () => {
	const releases = [];
	api.respondWith( ( method, route, payload ) => new Promise( ( resolve ) => releases.push( () => resolve( { ok: payload.slug } ) ) ) );
	const { packages, record } = mountQueue();
	const queued = [];
	expect( packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } }, () => queued.push( 'a' ) ) ).toBe( true );
	expect( packages.add( { kind: 'update', key: 'b', body: { slug: 'b' } }, () => queued.push( 'b' ) ) ).toBe( true );
	expect( packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } }, () => queued.push( 'again' ) ) ).toBe( false );
	expect( queued ).toEqual( [ 'a', 'b' ] );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/plugins/install', payload: { slug: 'a' } } ] );
	releases.shift()();
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: 'wp-admin/v1/plugins/update', payload: { slug: 'b' } } );
	releases.shift()();
	await settle();
	expect( record.begun ).toEqual( [ 'a', 'b' ] );
	expect( record.succeeded ).toEqual( [ [ 'a', { ok: 'a' } ], [ 'b', { ok: 'b' } ] ] );
} );

test( 'a failed job is the page\'s to show, and the next job starts', async () => {
	api.respondWith( async ( method, route, payload ) => {
		if ( payload.slug === 'a' ) {
			throw new Error( 'Download failed.' );
		}
		return {};
	} );
	const { packages, record } = mountQueue();
	packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } } );
	packages.add( { kind: 'install', key: 'b', body: { slug: 'b' } } );
	await settle();
	expect( record.failed ).toEqual( [ [ 'a', 'Download failed.' ] ] );
	expect( record.succeeded.map( ( [ key ] ) => key ) ).toEqual( [ 'b' ] );
} );

test( 'credentials pause: submitted, the job and the waiting ones resume with the credentials as one object', async () => {
	api.respondWith( async ( method, route, payload ) => {
		if ( ! payload.credentials ) {
			throw credentialsError();
		}
		return {};
	} );
	const typed = { hostname: 'ftp.example.org', password: 's3cret' };
	const { packages, record } = mountQueue( { give: typed } );
	packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } } );
	packages.add( { kind: 'install', key: 'b', body: { slug: 'b' } } );
	await settle();
	expect( record.asked ).toEqual( [ { heading: 'Connection Information' } ] );
	expect( api.calls.map( ( call ) => [ call.payload.slug, call.payload.credentials ?? null ] ) ).toEqual( [ [ 'a', null ], [ 'a', typed ], [ 'b', typed ] ] );
	expect( record.failed ).toEqual( [] );
	expect( record.succeeded.map( ( [ key ] ) => key ) ).toEqual( [ 'a', 'b' ] );
} );

test( 'credentials pause: cancelled, the waiting jobs are handed back once, and a later job starts', async () => {
	let needs = true;
	api.respondWith( async () => {
		if ( needs ) {
			throw credentialsError();
		}
		return {};
	} );
	const { packages, record } = mountQueue( { give: null } );
	packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } } );
	packages.add( { kind: 'install', key: 'b', body: { slug: 'b' } } );
	await settle();
	expect( record.dropped ).toEqual( [ [ 'a', 'b' ] ] );
	expect( record.failed ).toEqual( [] );
	needs = false;
	packages.add( { kind: 'install', key: 'c', body: { slug: 'c' } } );
	await settle();
	expect( record.succeeded.map( ( [ key ] ) => key ) ).toEqual( [ 'c' ] );
} );

test( 'reset drops an answer on its way, and the queue is empty', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( {} );
	} ) );
	const { packages, record } = mountQueue();
	packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } } );
	packages.add( { kind: 'install', key: 'b', body: { slug: 'b' } } );
	await settle();
	packages.reset();
	release();
	await settle();
	expect( record.succeeded ).toEqual( [] );
	expect( api.calls ).toHaveLength( 1 );
	// A key from before the reset can be queued again.
	expect( packages.add( { kind: 'install', key: 'a', body: { slug: 'a' } } ) ).toBe( true );
} );

test( 'busy while a job runs or waits, false once the last settles and after reset()', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = resolve;
	} ) );
	const { packages } = mountQueue();
	expect( packages.busy.value ).toBe( false );
	packages.add( { kind: 'update', key: 'a/a.php', body: {} } );
	packages.add( { kind: 'update', key: 'b/b.php', body: {} } );
	await settle();
	expect( packages.busy.value ).toBe( true );
	release( {} );
	await settle();
	expect( packages.busy.value ).toBe( true );
	release( {} );
	await settle();
	expect( packages.busy.value ).toBe( false );
	packages.add( { kind: 'update', key: 'c/c.php', body: {} } );
	expect( packages.busy.value ).toBe( true );
	packages.reset();
	expect( packages.busy.value ).toBe( false );
} );

test( 'add attaches the held credentials as one object to the job\'s body; without any, the body is as given', async () => {
	const held = { hostname: 'ftp.example.org', password: 's3cret' };
	const { packages } = mountQueue( { held } );
	const body = { slug: 'a' };
	packages.add( { kind: 'install', key: 'a', body } );
	await settle();
	const bare = mountQueue();
	bare.packages.add( { kind: 'install', key: 'b', body: { slug: 'b' } } );
	await settle();
	expect( [ api.calls.map( ( call ) => call.payload ), body ] ).toEqual( [ [ { slug: 'a', credentials: held }, { slug: 'b' } ], { slug: 'a' } ] );
} );
