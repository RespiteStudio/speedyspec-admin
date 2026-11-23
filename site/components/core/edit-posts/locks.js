import { ANSWER_TIMEOUT, orderedAnswers } from '../list-table-parts/ordered-answers.js';

/** The route that says which of the shown posts another user is editing (wp_check_locked_posts()). */
export const LOCKS_ROUTE = 'wp-admin/v1/posts/locks';

/** How often the locks are checked: inline-edit-post.js sets the heartbeat to 10 seconds. */
export const LOCKS_INTERVAL = 10000;

/**
 * The lock check of the Posts list, as inline-edit-post.js asks the heartbeat
 * (`wp-check-locked-posts`): every `interval` milliseconds, while the document is shown, it asks
 * `GET posts/locks` for the posts shown and gives the answer to `onAnswer`. As the heartbeat, a
 * check is sent only once the previous one has answered (or failed, or timed out), so a slow
 * server never has several on their way. `stop()` ends the checks and drops the answer still to
 * come (list-table-parts/ordered-answers.js), so nothing is applied after the page has gone.
 *
 * @param {object}   options
 * @param {Function} options.request  `( ids, postType ) => Promise` (api.get on LOCKS_ROUTE).
 * @param {Function} options.ids      The ids of the rows shown.
 * @param {Function} options.postType The list's post type.
 * @param {Function} options.onAnswer Called with each answer.
 * @param {Function} [options.visible] Whether the document is shown.
 * @param {number}   [options.interval]
 * @param {object}   [options.timers]  `setInterval`/`clearInterval`/`setTimeout`/`clearTimeout` (tests).
 * @return {{start: Function, stop: Function, check: Function}}
 */
export function lockPoller( { request, ids, postType, onAnswer, visible = () => globalThis.document?.visibilityState !== 'hidden', interval = LOCKS_INTERVAL, timers = globalThis } ) {
	const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT, timers } );
	let handle = null;
	// The check on its way, if any (a token: stop() forgets it, and its late end changes nothing).
	let pending = null;

	function check() {
		const shown = ( ids() ?? [] ).filter( ( id ) => Number.isInteger( id ) );
		if ( handle === null || pending !== null || ! visible() || shown.length === 0 ) {
			return Promise.resolve();
		}
		const mine = {};
		pending = mine;
		return answers.ordered( Promise.resolve().then( () => request( shown, postType() ) ), ( answer ) => onAnswer( answer ), ( error ) => {
			// As the heartbeat: a failed check changes nothing, the next one asks again.
			console.warn( 'Could not check the post locks:', error );
		} ).finally( () => {
			if ( pending === mine ) {
				pending = null;
			}
		} );
	}

	return {
		start() {
			if ( handle === null ) {
				handle = timers.setInterval( check, interval );
			}
		},
		stop() {
			if ( handle !== null ) {
				timers.clearInterval( handle );
				handle = null;
			}
			pending = null;
			answers.reset();
		},
		check,
	};
}
