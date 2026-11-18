/**
 * The notices service: `add({ type, message, dismissible })`, `dismiss(id)`,
 * `clear()` and the list `items`. A notice may carry one `action` ({ label, run }),
 * shown as a button next to the message. No Vue and no document; `reactive` is injected by the caller.
 */

const TYPES = [ 'success', 'error', 'warning', 'info' ];

/**
 * Id of the element that shows a notice in core/notices' default implementation, so that a
 * page can move focus to a notice it raised (the element takes focus programmatically).
 */
export const noticeElementId = ( id ) => 'wp-admin-' + id;

/** Live-region role for a notice type: errors and warnings interrupt, the rest wait. */
export const liveRole = ( type ) => ( type === 'error' || type === 'warning' ? 'alert' : 'status' );

export function createNotices( { reactive = ( value ) => value } = {} ) {
	const items = reactive( [] );
	let next = 0;

	function add( { type, message, dismissible = true, action } = {} ) {
		if ( typeof message !== 'string' || message === '' ) {
			return null;
		}
		const kind = TYPES.includes( type ) ? type : 'info';
		// The same notice raised again while it is shown (e.g. on every navigation) is not repeated.
		const shown = items.find( ( n ) => n.type === kind && n.message === message );
		if ( shown ) {
			return shown.id;
		}
		const id = 'notice-' + ++next;
		const notice = { id, type: kind, message, dismissible: dismissible !== false };
		if ( action && typeof action.label === 'string' && action.label !== '' && typeof action.run === 'function' ) {
			notice.action = { label: action.label, run: action.run };
		}
		items.push( notice );
		return id;
	}

	function dismiss( id ) {
		const index = items.findIndex( ( n ) => n.id === id );
		if ( index !== -1 ) {
			items.splice( index, 1 );
		}
	}

	/** Removes every notice, e.g. when the user signs out. */
	function clear() {
		items.splice( 0, items.length );
	}

	return { items, add, dismiss, clear };
}
