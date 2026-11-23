import { computed, onBeforeUnmount, shallowRef } from 'vue';

/*
 * The filesystem credentials a native page holds while it is shown, as updates.js's
 * `wp.updates.filesystemCredentials` holds them for the page load.
 *
 * The typed fields live only in this closure, in the page's memory. They are never written to
 * localStorage, sessionStorage, the address or the history, and never put in reactive state:
 * the dialog's form (`form`) is WordPress's description of the fields, which holds no password.
 * They are emptied when the page goes (on unmount), on clear(), and when the user cancels the
 * dialog (credentials WordPress asked for again are known not to work).
 */

// The fields of the classic request-filesystem-credentials-form, by their posted names.
const FIELDS = [ 'hostname', 'username', 'password', 'connection_type', 'public_key', 'private_key' ];

const pick = ( values ) => Object.fromEntries( FIELDS.filter( ( name ) => typeof values?.[ name ] === 'string' ).map( ( name ) => [ name, values[ name ] ] ) );

/**
 * Call it in the page's `setup()`, and render core/filesystem-credentials with `form` and
 * `open`, its `submit` bound to submit() and its `cancel` to cancel().
 *
 * - `ask( form )`: opens the dialog with WordPress's form (the `data.form` of an
 *   `fs_credentials_required` error); resolves the submitted fields, or null when cancelled. A
 *   second ask while the dialog is open resolves the first with null.
 * - `current()`: a copy of the fields last submitted, or null: what the page adds to the body
 *   of a job it queues later.
 * - `clear()`: forgets the fields and closes the dialog (a pending ask resolves null). It runs
 *   on unmount.
 *
 * @return {{ask: Function, clear: Function, current: Function, submit: Function, cancel: Function, form: object, open: object}}
 */
export function useCredentials() {
	let held = null;
	let pending = null;
	const form = shallowRef( null );

	function answer( value ) {
		const resolve = pending;
		pending = null;
		form.value = null;
		resolve?.( value );
	}

	function ask( description ) {
		answer( null );
		return new Promise( ( resolve ) => {
			pending = resolve;
			form.value = description && typeof description === 'object' ? description : {};
		} );
	}

	function submit( values ) {
		held = pick( values );
		answer( { ...held } );
	}

	function cancel() {
		held = null;
		answer( null );
	}

	function clear() {
		held = null;
		answer( null );
	}

	onBeforeUnmount( clear );

	return {
		ask,
		clear,
		current: () => ( held ? { ...held } : null ),
		submit,
		cancel,
		form,
		open: computed( () => form.value !== null ),
	};
}
