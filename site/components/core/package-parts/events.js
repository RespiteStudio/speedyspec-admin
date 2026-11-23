/*
 * The document events of updates.js, which the native Plugins pages trigger so that plugin
 * scripts listening for them still hear them (owner ruling "Native, plugin form lost": the
 * `updates` script itself is never loaded on these pages, so `wp.updates` is absent).
 *
 * Each event is triggered on `jQuery( document )` with one argument, the classic response shape
 * (`slug`, `plugin`, `pluginName`, `oldVersion`, `newVersion`, `errorCode`, `errorMessage`), as
 * updates.js triggers it. Without jQuery on the page, nothing happens. A listener that throws is
 * logged and does not stop the page.
 *
 * Filesystem credentials never reach a listener: the credential fields (`hostname`, `username`,
 * `password`, `connection_type`, `public_key`, `private_key`) are dropped from the detail and from
 * its `body` (a queued job, which resume() gave the credentials) before it is triggered.
 */

const CREDENTIAL_FIELDS = [ 'hostname', 'username', 'password', 'connection_type', 'public_key', 'private_key' ];

const withoutCredentials = ( value ) => Object.fromEntries( Object.entries( value ).filter( ( [ name ] ) => ! CREDENTIAL_FIELDS.includes( name ) ) );

/** A copy of the detail without credential fields, at its top level and in its `body`. */
function sanitized( detail ) {
	if ( ! detail || typeof detail !== 'object' ) {
		return detail;
	}
	const copy = withoutCredentials( detail );
	if ( copy.body && typeof copy.body === 'object' ) {
		copy.body = withoutCredentials( copy.body );
	}
	return copy;
}

/** The updates.js events these pages trigger, by their classic names. */
export const EVENTS = Object.freeze( [
	'wp-plugin-installing',
	'wp-plugin-install-success',
	'wp-plugin-install-error',
	'wp-plugin-updating',
	'wp-plugin-update-success',
	'wp-plugin-update-error',
	'wp-plugin-deleting',
	'wp-plugin-delete-success',
	'wp-plugin-delete-error',
	'credential-modal-cancel',
] );

/**
 * Triggers an updates.js event on the document through jQuery, when the page has jQuery.
 *
 * @param {string} name   One of EVENTS; any other name triggers nothing.
 * @param {object} detail The classic response shape, or the job (`credential-modal-cancel`); a
 *                        copy without credential fields is triggered.
 */
export function announce( name, detail ) {
	const jQuery = globalThis.window?.jQuery;
	if ( typeof jQuery !== 'function' || ! EVENTS.includes( name ) ) {
		return;
	}
	try {
		jQuery( globalThis.document ).trigger( name, sanitized( detail ) );
	} catch ( error ) {
		console.warn( `A listener of ${ name } failed:`, error );
	}
}
