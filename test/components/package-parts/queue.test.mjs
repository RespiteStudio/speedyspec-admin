// The package queue (package-parts/queue.js): the pure reducers over the jobs a Plugins page
// sends one at a time, as updates.js's `wp.updates.queue` and `ajaxLocked` do. No request is
// sent here; each test feeds the reducers and reads the queue they give back.
import { expect, test } from '@jest/globals';
import { emptyQueue, enqueue, start, settle, cancel, needsCredentials, resume, abandon } from '../../../site/components/core/package-parts/queue.js';

const job = ( key, kind = 'update', body = { plugin: key } ) => ( { kind, key, body } );
const keys = ( queue ) => queue.jobs.map( ( item ) => item.key );

test( 'an empty queue has no jobs, nothing running, and is not paused', () => {
	const queue = emptyQueue();
	expect( queue.jobs ).toEqual( [] );
	expect( queue.running ).toBeNull();
	expect( needsCredentials( queue ) ).toBe( false );
	expect( start( queue ) ).toEqual( { queue, job: null } );
} );

test( 'enqueue keeps one job per key, whether the key is queued or running (updates.js is-enqueued)', () => {
	let queue = enqueue( emptyQueue(), job( 'a/a.php' ) );
	queue = enqueue( queue, job( 'a/a.php', 'delete' ) );
	expect( keys( queue ) ).toEqual( [ 'a/a.php' ] );
	expect( queue.jobs[ 0 ].kind ).toBe( 'update' );

	const started = start( queue );
	const again = enqueue( started.queue, job( 'a/a.php' ) );
	expect( keys( again ) ).toEqual( [] );
	expect( again.running.key ).toBe( 'a/a.php' );
} );

test( 'enqueue leaves the given queue unchanged and ignores a job without a known kind or a key', () => {
	const before = emptyQueue();
	const after = enqueue( before, job( 'a/a.php', 'install' ) );
	expect( before.jobs ).toEqual( [] );
	expect( keys( after ) ).toEqual( [ 'a/a.php' ] );
	expect( enqueue( before, job( 'b/b.php', 'activate' ) ) ).toBe( before );
	expect( enqueue( before, job( '', 'update' ) ) ).toBe( before );
	expect( enqueue( before, { kind: 'update', key: 'c/c.php', body: 'plugin=c' } ) ).toBe( before );
} );

test( 'start gives the first job, then nothing while it runs', () => {
	let queue = enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) );
	const first = start( queue );
	expect( first.job ).toEqual( job( 'a/a.php' ) );
	expect( first.queue.running ).toEqual( job( 'a/a.php' ) );
	expect( keys( first.queue ) ).toEqual( [ 'b/b.php' ] );
	queue = first.queue;
	const second = start( queue );
	expect( second.job ).toBeNull();
	expect( second.queue ).toBe( queue );
} );

test( 'settle ends the running job, then start gives the next', () => {
	let queue = enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) );
	queue = start( queue ).queue;
	queue = settle( queue, 'a/a.php', { ok: true, answer: { plugin: 'a/a.php' } } );
	expect( queue.running ).toBeNull();
	const next = start( queue );
	expect( next.job.key ).toBe( 'b/b.php' );
	// A failure other than missing credentials ends the job too.
	queue = settle( next.queue, 'b/b.php', { ok: false, error: { code: 'update_failed' } } );
	expect( queue.running ).toBeNull();
	expect( needsCredentials( queue ) ).toBe( false );
	expect( start( queue ).job ).toBeNull();
} );

test( 'settle of a key that is not running changes nothing', () => {
	const queue = start( enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) ) ).queue;
	expect( settle( queue, 'b/b.php', { ok: true } ) ).toBe( queue );
} );

test( 'cancel drops a queued job and not a running one', () => {
	let queue = enqueue( enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) ), job( 'c/c.php' ) );
	queue = start( queue ).queue;
	queue = cancel( queue, 'b/b.php' );
	expect( keys( queue ) ).toEqual( [ 'c/c.php' ] );
	const unchanged = cancel( queue, 'a/a.php' );
	expect( unchanged ).toBe( queue );
	expect( unchanged.running.key ).toBe( 'a/a.php' );
} );

test( 'a job that needs credentials pauses the queue, first in line again; resume attaches the credentials to every remaining body', () => {
	let queue = enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php', 'delete' ) );
	queue = start( queue ).queue;
	queue = settle( queue, 'a/a.php', { ok: false, error: { code: 'fs_credentials_required', data: { form: {} } } } );
	expect( needsCredentials( queue ) ).toBe( true );
	expect( queue.running ).toBeNull();
	expect( keys( queue ) ).toEqual( [ 'a/a.php', 'b/b.php' ] );
	// Paused: nothing starts until resume.
	expect( start( queue ) ).toEqual( { queue, job: null } );

	const credentials = { hostname: 'ftp.example.org', username: 'me', password: 's3cret', connection_type: 'ftp' };
	const resumed = resume( queue, credentials );
	expect( needsCredentials( resumed ) ).toBe( false );
	expect( resumed.jobs ).toEqual( [
		{ kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', ...credentials } },
		{ kind: 'delete', key: 'b/b.php', body: { plugin: 'b/b.php', ...credentials } },
	] );
	// The paused queue is left as it was: the credentials are only in the queue resume gives.
	expect( JSON.stringify( queue ) ).not.toContain( 's3cret' );
	expect( start( resumed ).job.body.password ).toBe( 's3cret' );
} );

test( 'cancel can empty a paused queue (the credentials dialog cancelled)', () => {
	let queue = enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) );
	queue = settle( start( queue ).queue, 'a/a.php', { ok: false, error: { code: 'fs_credentials_required' } } );
	for ( const key of keys( queue ) ) {
		queue = cancel( queue, key );
	}
	expect( queue.jobs ).toEqual( [] );
	expect( needsCredentials( queue ) ).toBe( true );
	// Resume without jobs only unpauses.
	expect( resume( queue, {} ) ).toEqual( emptyQueue() );
} );

test( 'abandon (the credentials dialog cancelled) empties the line and unpauses, giving the dropped jobs once; later jobs start', () => {
	let queue = enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php', 'delete' ) );
	queue = settle( start( queue ).queue, 'a/a.php', { ok: false, error: { code: 'fs_credentials_required' } } );
	const { queue: after, dropped } = abandon( queue );
	expect( dropped.map( ( item ) => item.key ) ).toEqual( [ 'a/a.php', 'b/b.php' ] );
	expect( after ).toEqual( emptyQueue() );
	expect( needsCredentials( after ) ).toBe( false );
	// The paused queue given is unchanged.
	expect( keys( queue ) ).toEqual( [ 'a/a.php', 'b/b.php' ] );
	// The next click works, as after classic's requestForCredentialsModalCancel().
	const next = start( enqueue( after, job( 'c/c.php', 'install', { slug: 'c' } ) ) );
	expect( next.job.key ).toBe( 'c/c.php' );
	// Nothing left to drop: abandoning again drops nothing.
	expect( abandon( after ).dropped ).toEqual( [] );
} );

test( 'abandon keeps a running job (it cannot be taken back)', () => {
	const queue = start( enqueue( enqueue( emptyQueue(), job( 'a/a.php' ) ), job( 'b/b.php' ) ) ).queue;
	const { queue: after, dropped } = abandon( queue );
	expect( dropped.map( ( item ) => item.key ) ).toEqual( [ 'b/b.php' ] );
	expect( after.running.key ).toBe( 'a/a.php' );
	expect( after.jobs ).toEqual( [] );
} );
