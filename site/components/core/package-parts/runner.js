import { ref } from 'vue';
import api from '@wp-admin/api';
import { abandon, emptyQueue, enqueue, isBusy, needsCredentials, resume, settle, start } from './queue.js';

/*
 * The imperative shell around the package queue (queue.js, the functional core) that the Plugins
 * pages share, as updates.js runs `wp.updates.queue`: one job at a time, each posted to its route;
 * a job that answers `fs_credentials_required` pauses the queue and asks for the filesystem
 * credentials (package-parts/credentials.js): submitted, the queue resumes with them as one
 * `credentials` object; cancelled, the waiting jobs are dropped (abandon()) and handed back once.
 *
 * What a job means on the page (its texts, its row or card, its events) is the page's: the
 * runner calls back `begin( job )`, `succeed( job, answer )`, `fail( job, error )` and
 * `dropped( jobs )`. Answers that arrive after reset() are dropped. `busy` says whether a job
 * runs or waits (queue.js isBusy()), for the page's leave warning (package-parts/leave-warning.js).
 */

/**
 * The package queue of a page. Call it in the page's `setup()`.
 *
 * @param {object}   options
 * @param {object}   options.credentials The page's useCredentials().
 * @param {( job: object ) => string} options.path The route a job posts to.
 * @param {( job: object ) => void} options.begin Called when a job starts.
 * @param {( job: object, answer: object ) => void} options.succeed Called with a job's answer.
 * @param {( job: object, error: object ) => void} options.fail Called with a job's error (not a credentials pause).
 * @param {( jobs: object[] ) => void} options.dropped Called with the jobs a cancelled credentials dialog drops.
 * @return {{add: Function, reset: Function, busy: import('vue').Ref<boolean>}} `add( job,
 *         onQueued )` queues a job (`{ kind, key, body }`), calls `onQueued()` and starts the
 *         queue, and returns whether it was queued (a key already queued or running is not);
 *         `reset()` empties the queue and drops the answers still on their way; `busy` is true
 *         while a job runs or waits.
 */
export function usePackageQueue( { credentials, path, begin, succeed, fail, dropped } ) {
	let queue = emptyQueue();
	let generation = 0;
	const busy = ref( false );

	// Every change of the queue goes through here, so that `busy` follows it.
	function setQueue( next ) {
		queue = next;
		busy.value = isBusy( next );
	}

	async function askCredentials( error, at ) {
		const values = await credentials.ask( error?.data?.form ?? {} );
		if ( at !== generation ) {
			return;
		}
		if ( values ) {
			// The routes take the form's fields as one `credentials` object.
			setQueue( resume( queue, { credentials: values } ) );
			return;
		}
		const { queue: rest, dropped: jobs } = abandon( queue );
		setQueue( rest );
		dropped( jobs );
	}

	async function pump() {
		const { queue: next, job } = start( queue );
		if ( ! job ) {
			return;
		}
		setQueue( next );
		const at = generation;
		begin( job );
		let outcome;
		try {
			outcome = { ok: true, answer: await api.post( path( job ), job.body ) };
		} catch ( error ) {
			outcome = { ok: false, error };
		}
		if ( at !== generation ) {
			return;
		}
		setQueue( settle( queue, job.key, outcome ) );
		if ( outcome.ok ) {
			succeed( job, outcome.answer );
		} else if ( needsCredentials( queue ) ) {
			await askCredentials( outcome.error, at );
			if ( at !== generation ) {
				return;
			}
		} else {
			fail( job, outcome.error );
		}
		pump();
	}

	function add( job, onQueued = () => {} ) {
		const next = enqueue( queue, job );
		if ( next === queue ) {
			return false;
		}
		setQueue( next );
		onQueued();
		pump();
		return true;
	}

	function reset() {
		generation++;
		setQueue( emptyQueue() );
	}

	return { add, reset, busy };
}
