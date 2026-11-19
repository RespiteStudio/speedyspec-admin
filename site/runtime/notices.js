/**
 * The notices service: `add({ type, message, dismissible, scope })` (or `add({ html, assets, scope })`), `dismiss(id)`,
 * `dismissScope(scope)`, `clear()` and the list `items`. A notice raised with `scope: 'page'`
 * belongs to the page that raised it (e.g. "Settings saved."): the page host withdraws it
 * when the user leaves the page, as a classic screen's notices go with the screen. A notice may carry one `action` ({ label, run }),
 * shown as a button next to the message, and `markup`: the message as HTML with links or
 * code, as WordPress's endpoints send it, which core/notices shows through the kit's
 * InlineMarkup in place of `message` (which stays the plain text, used to tell notices apart).
 * A notice may instead carry `html`: what a classic `admin_notices` callback printed, captured by
 * the `wp-admin/v1/notices` endpoint (with its `assets`, `{ scripts, styles, ajaxurl }`), which
 * core/notices shows as it is, through the kit's LegacyHtml; its `message` is empty and the HTML
 * tells it apart. No Vue and no document; `reactive` is injected by the caller.
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

	function add( { type, message, dismissible = true, action, markup, html, assets, scope } = {} ) {
		const captured = typeof html === 'string' && html !== '';
		if ( ! captured && ( typeof message !== 'string' || message === '' ) ) {
			return null;
		}
		const kind = TYPES.includes( type ) ? type : 'info';
		const text = captured ? '' : message;
		const owner = typeof scope === 'string' && scope !== '' ? scope : undefined;
		// The same notice raised again while it is shown (e.g. on every navigation) is not repeated.
		// A notice of another scope is another notice: withdrawing one never removes the other.
		const shown = items.find( ( n ) => n.type === kind && n.message === text && n.html === ( captured ? html : undefined ) && n.scope === owner );
		if ( shown ) {
			return shown.id;
		}
		const id = 'notice-' + ++next;
		const notice = { id, type: kind, message: text, dismissible: dismissible !== false };
		if ( captured ) {
			notice.html = html;
			notice.assets = assets && typeof assets === 'object' ? assets : {};
		} else if ( typeof markup === 'string' && markup !== '' ) {
			notice.markup = markup;
		}
		if ( owner !== undefined ) {
			notice.scope = owner;
		}
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

	/** Removes the notices raised with a scope, e.g. `page` when the user leaves the page. */
	function dismissScope( scope ) {
		for ( let index = items.length - 1; index >= 0; index-- ) {
			if ( items[ index ].scope === scope ) {
				items.splice( index, 1 );
			}
		}
	}

	/** Removes every notice, e.g. when the user signs out. */
	function clear() {
		items.splice( 0, items.length );
	}

	return { items, add, dismiss, dismissScope, clear };
}
