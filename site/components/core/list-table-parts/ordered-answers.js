/**
 * How long the list pages (Comments, the Dashboard, Posts) let a request take before it fails
 * (milliseconds), so that a request that hangs cannot hold up the answers after it.
 */
export const ANSWER_TIMEOUT = 60000;

/**
 * Answers applied in the order their requests were sent, whatever order they arrive in.
 *
 * Shared by the list pages (list-table-parts/; it was comment-parts/ before the Posts batch). Each
 * answer of a comment moderation route is a snapshot of the list when the server answered
 * (views, totals, title, menu counts), so the newest request's must be the last applied, as
 * classic's lastConfidentTime keeps a late, older total from replacing a newer one.
 *
 * `ordered( promise, apply, fail )` waits for the promise, then calls `apply( value )` or
 * `fail( error )` once every request sent before it has been applied; it resolves once its
 * answer is applied (or dropped), never rejects. A callback that throws is reported (`report`)
 * and the queue goes on.
 *
 * `reset()` drops every answer still to come: they apply nothing and fail nothing. A page calls
 * it when its data changes (the answers are about a list no longer shown) and when it unmounts
 * (nothing may write to the frame after the page has gone).
 *
 * With `timeout` (milliseconds), a request still unanswered after it fails with `timeoutError()`,
 * so that a hung request cannot hold up the answers after it; its late answer is dropped.
 *
 * @param {object}   [options]
 * @param {Function} [options.report]       Called with what an apply or fail callback threw.
 * @param {number}   [options.timeout]      Milliseconds before an unanswered request fails;
 *                                          0 for none.
 * @param {Function} [options.timeoutError] Makes the error of a timed-out request.
 * @param {object}   [options.timers]       `setTimeout`/`clearTimeout` (tests).
 * @return {{ordered: Function, reset: Function}}
 */
export function orderedAnswers( { report = defaultReport, timeout = 0, timeoutError = () => new Error( '' ), timers = globalThis } = {} ) {
	let generation = 0;
	let sent = 0;
	let nextToApply = 1;
	const settled = new Map();

	function drain() {
		while ( settled.has( nextToApply ) ) {
			const entry = settled.get( nextToApply );
			settled.delete( nextToApply );
			nextToApply++;
			try {
				if ( entry.outcome.ok ) {
					entry.apply?.( entry.outcome.value );
				} else {
					entry.fail?.( entry.outcome.error );
				}
			} catch ( error ) {
				report( error );
			} finally {
				entry.done();
			}
		}
	}

	function withTimeout( promise ) {
		if ( ! ( timeout > 0 ) ) {
			return Promise.resolve( promise );
		}
		let timer = null;
		const expired = new Promise( ( resolve, reject ) => {
			timer = timers.setTimeout( () => reject( timeoutError() ), timeout );
		} );
		return Promise.race( [ Promise.resolve( promise ), expired ] ).finally( () => timers.clearTimeout( timer ) );
	}

	function ordered( promise, apply, fail ) {
		const seq = ++sent;
		const mine = generation;
		return new Promise( ( done ) => {
			withTimeout( promise ).then( ( value ) => ( { ok: true, value } ), ( error ) => ( { ok: false, error } ) ).then( ( outcome ) => {
				if ( mine !== generation ) {
					done();
					return;
				}
				settled.set( seq, { outcome, apply, fail, done } );
				drain();
			} );
		} );
	}

	function reset() {
		generation++;
		sent = 0;
		nextToApply = 1;
		// Those already answered and waiting for an older one: dropped, their promises resolved.
		for ( const entry of settled.values() ) {
			entry.done();
		}
		settled.clear();
	}

	return { ordered, reset };
}

function defaultReport( error ) {
	console.error( 'Could not apply an answer:', error );
}
