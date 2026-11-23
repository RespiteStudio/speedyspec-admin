/*
 * The package queue of the native Plugins pages (and, later, Themes and Updates): the install,
 * update and delete jobs a page sends one at a time, as updates.js's `wp.updates.queue` and
 * `ajaxLocked` do.
 *
 * A functional core under each page's imperative shell: every function here is pure. It takes a
 * queue and gives a new one (or the same one when nothing changes), and sends nothing. The page
 * sends the job start() gives, and reports how it ended through settle().
 *
 * - Queue: `{ jobs: Job[], running: Job|null, paused: boolean }`. `jobs` wait in order;
 *   `running` is the job sent and not yet settled; `paused` is set while WordPress waits for
 *   filesystem credentials.
 * - Job: `{ kind: 'update'|'delete'|'install', key: string, body: object }`, a plain object the
 *   page sends as it is. `key` names the package (a plugin file, a slug); a key queued or running
 *   is not queued twice, as updates.js's `is-enqueued` rows are not.
 * - A job that settles with WordPress's `fs_credentials_required` goes back to the front of the
 *   line and pauses the queue, as updates.js's credentialError() puts the request back. The page
 *   asks for the credentials (package-parts/credentials.js), then:
 *   - submitted: resume() adds them to the body of every job left and unpauses;
 *   - cancelled: abandon() empties the line and unpauses, as requestForCredentialsModalCancel()
 *     clears the queue and the lock, and gives the dropped jobs, which the page announces once
 *     each as `credential-modal-cancel` (package-parts/events.js). cancel() of single jobs never
 *     unpauses: only resume() and abandon() end a pause.
 */

const KINDS = [ 'update', 'delete', 'install' ];
const CREDENTIALS_REQUIRED = 'fs_credentials_required';

const isJob = ( job ) => KINDS.includes( job?.kind ) && typeof job.key === 'string' && job.key !== '' && job.body !== null && typeof job.body === 'object';
const hasKey = ( queue, key ) => queue.running?.key === key || queue.jobs.some( ( job ) => job.key === key );

/**
 * A queue with no jobs.
 *
 * @return {{jobs: object[], running: object|null, paused: boolean}} The queue.
 */
export function emptyQueue() {
	return { jobs: [], running: null, paused: false };
}

/**
 * Adds a job at the end of the line, unless its key is already queued or running, or it is not
 * a job (an unknown kind, no key, a body that is not an object).
 *
 * @param {object} queue The queue.
 * @param {{kind: string, key: string, body: object}} job The job.
 * @return {object} The queue with the job, or `queue` itself.
 */
export function enqueue( queue, job ) {
	if ( ! isJob( job ) || hasKey( queue, job.key ) ) {
		return queue;
	}
	return { ...queue, jobs: [ ...queue.jobs, { kind: job.kind, key: job.key, body: { ...job.body } } ] };
}

/**
 * Takes the next job to send: the first in line, when nothing runs and the queue is not paused.
 *
 * @param {object} queue The queue.
 * @return {{queue: object, job: object|null}} The queue with the job running and the job, or
 *         `queue` itself and null.
 */
export function start( queue ) {
	if ( queue.running || queue.paused || queue.jobs.length === 0 ) {
		return { queue, job: null };
	}
	const [ job, ...rest ] = queue.jobs;
	return { queue: { ...queue, jobs: rest, running: job }, job };
}

/**
 * Ends the running job with its outcome. Missing filesystem credentials (`error.code`
 * `fs_credentials_required`) put it back first in line and pause the queue; any other outcome
 * ends it.
 *
 * @param {object} queue   The queue.
 * @param {string} key     The running job's key.
 * @param {{ok: boolean, answer?: object, error?: object}} outcome How it ended.
 * @return {object} The queue, or `queue` itself when `key` is not running.
 */
export function settle( queue, key, outcome ) {
	if ( queue.running?.key !== key ) {
		return queue;
	}
	if ( outcome?.ok !== true && outcome?.error?.code === CREDENTIALS_REQUIRED ) {
		return { jobs: [ queue.running, ...queue.jobs ], running: null, paused: true };
	}
	return { ...queue, running: null };
}

/**
 * Drops a job that waits in line. A running job cannot be taken back.
 *
 * @param {object} queue The queue.
 * @param {string} key   The job's key.
 * @return {object} The queue without the job, or `queue` itself.
 */
export function cancel( queue, key ) {
	if ( ! queue.jobs.some( ( job ) => job.key === key ) ) {
		return queue;
	}
	return { ...queue, jobs: queue.jobs.filter( ( job ) => job.key !== key ) };
}

/**
 * Whether the queue waits for filesystem credentials.
 *
 * @param {object} queue The queue.
 * @return {boolean} Whether it is paused.
 */
export function needsCredentials( queue ) {
	return queue.paused === true;
}

/**
 * Unpauses the queue with the credentials the user gave, added to the body of every job left.
 * The queue given is not changed: the credentials are only in the queue this gives.
 *
 * @param {object} queue       The queue.
 * @param {object} credentials The fields of the Connection Information form.
 * @return {object} The queue, unpaused.
 */
export function resume( queue, credentials ) {
	return {
		...queue,
		paused: false,
		jobs: queue.jobs.map( ( job ) => ( { ...job, body: { ...job.body, ...credentials } } ) ),
	};
}

/**
 * Gives up the jobs that wait in line (the credentials dialog cancelled) and unpauses the queue,
 * as updates.js's requestForCredentialsModalCancel() empties `wp.updates.queue` and removes the
 * lock. A running job cannot be taken back and stays. The queue given is not changed.
 *
 * @param {object} queue The queue.
 * @return {{queue: object, dropped: object[]}} The queue with no job waiting, not paused, and the
 *         jobs dropped, in order (the page announces each as `credential-modal-cancel`).
 */
export function abandon( queue ) {
	return { queue: { jobs: [], running: queue.running, paused: false }, dropped: queue.jobs };
}
