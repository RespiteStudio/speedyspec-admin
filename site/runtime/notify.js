/**
 * Reports a notice through the injected `notices` service ({ add({ type, message }) }),
 * or to the console when none is provided. No Vue, no document.
 */
export function notify( notices, message ) {
	if ( notices && typeof notices.add === 'function' ) {
		notices.add( { type: 'warning', message, dismissible: true } );
	} else {
		console.warn( message );
	}
}
