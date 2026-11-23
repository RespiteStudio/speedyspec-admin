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
 * A queued package job (package-parts/queue.js, `{ kind, key, body }`) is never handed to a
 * listener as it is: announce() turns it into what updates.js passes (classicJob()). For
 * `credential-modal-cancel`, the classic job `{ action, data }` (updates.js triggers it once per
 * job dropped from its queue; the page announces each job abandon() gives, once); for the other
 * events, its `data`, the arguments updates.js passes to `wp-plugin-updating` and the like.
 *
 * Filesystem credentials never reach a listener: a `credentials` key (the one object the routes
 * take them as, which a queued job carries after resume()) is dropped at every level of the
 * detail, and the credential fields (`hostname`, `username`, `password`, `connection_type`,
 * `public_key`, `private_key`) are dropped from the detail and from its `body` or `data`, before
 * it is triggered.
 */

const CREDENTIAL_FIELDS = [ 'hostname', 'username', 'password', 'connection_type', 'public_key', 'private_key' ];
// How deep withoutCredentialObjects() reads a detail (a detail is a few levels; this bounds a cycle).
const MAX_DEPTH = 8;

const withoutCredentials = ( value ) => Object.fromEntries( Object.entries( value ).filter( ( [ name ] ) => ! CREDENTIAL_FIELDS.includes( name ) ) );

/** A copy of `value` without a `credentials` key at any level (arrays and plain objects). Pure. */
function withoutCredentialObjects( value, depth = 0 ) {
	if ( ! value || typeof value !== 'object' ) {
		return value;
	}
	if ( depth >= MAX_DEPTH ) {
		return Array.isArray( value ) ? [] : {};
	}
	if ( Array.isArray( value ) ) {
		return value.map( ( item ) => withoutCredentialObjects( item, depth + 1 ) );
	}
	return Object.fromEntries( Object.entries( value ).filter( ( [ name ] ) => name !== 'credentials' ).map( ( [ name, item ] ) => [ name, withoutCredentialObjects( item, depth + 1 ) ] ) );
}

/**
 * The data updates.js gives each queued action, by package type and job kind: the keys its
 * callers pass (updatePlugin( { plugin, slug } ), installPlugin( { slug } ),
 * deletePlugin( { plugin, slug } )).
 */
const CLASSIC_DATA = {
	plugin: { update: [ 'plugin', 'slug' ], install: [ 'slug' ], delete: [ 'plugin', 'slug' ] },
};

const isQueueJob = ( value ) => typeof value?.kind === 'string' && typeof value.key === 'string' && value.body !== null && typeof value.body === 'object';

/**
 * A queued package job as classic updates.js queues it: `{ action: '<kind>-<type>', data }`, with
 * only the data keys updates.js builds for that action (never credentials). Pure.
 *
 * @param {{kind: string, key: string, body: object}} job  A job of package-parts/queue.js.
 * @param {string}                                     type Optional. The package type. Default 'plugin'.
 * @return {{action: string, data: object}|null} The classic job, or null for something that is
 *         not a queue job, or an unknown type or kind.
 */
export function classicJob( job, type = 'plugin' ) {
	const keys = isQueueJob( job ) ? CLASSIC_DATA[ type ]?.[ job.kind ] : undefined;
	if ( ! keys ) {
		return null;
	}
	const data = Object.fromEntries( keys.filter( ( key ) => job.body[ key ] !== undefined ).map( ( key ) => [ key, job.body[ key ] ] ) );
	return { action: `${ job.kind }-${ type }`, data };
}

/** The detail as updates.js passes it for `name`, without credential fields. */
function sanitized( name, detail ) {
	if ( isQueueJob( detail ) ) {
		const classic = classicJob( detail );
		return name === 'credential-modal-cancel' ? classic : classic?.data;
	}
	if ( ! detail || typeof detail !== 'object' ) {
		return detail;
	}
	const copy = withoutCredentials( withoutCredentialObjects( detail ) );
	for ( const nested of [ 'body', 'data' ] ) {
		if ( copy[ nested ] && typeof copy[ nested ] === 'object' ) {
			copy[ nested ] = withoutCredentials( copy[ nested ] );
		}
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
	// A card's Activate on Add Plugins (updates.js activatePluginSuccess() and activatePluginError()).
	'wp-plugin-activate-success',
	'wp-plugin-activate-error',
] );

/**
 * Triggers an updates.js event on the document through jQuery, when the page has jQuery.
 *
 * @param {string} name   One of EVENTS; any other name triggers nothing.
 * @param {object} detail The classic response shape, or a queued job (turned into classicJob()
 *                        for `credential-modal-cancel`, its data for the others); a copy without
 *                        credential fields is triggered.
 */
export function announce( name, detail ) {
	const jQuery = globalThis.window?.jQuery;
	if ( typeof jQuery !== 'function' || ! EVENTS.includes( name ) ) {
		return;
	}
	try {
		jQuery( globalThis.document ).trigger( name, sanitized( name, detail ) );
	} catch ( error ) {
		console.warn( `A listener of ${ name } failed:`, error );
	}
}
