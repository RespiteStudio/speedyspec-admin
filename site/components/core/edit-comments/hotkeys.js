/*
 * The Comments list's keyboard shortcuts, for users who turned them on (`hotkeys.enabled`, the
 * `comment_shortcuts` user option): what edit-comments.js sets up with jquery.table-hotkeys.js
 * (edit-comments.js:1253-1370), as a pure decision from a key press, which the page runs.
 *
 * - `j` / `k`: the next / previous row becomes the current one (`vim-current`); the first press
 *   picks the first row. At the last or first row they open the next or previous page, asking it
 *   to start on its first or last row (`hotkeys_highlight_first`, `hotkeys_highlight_last`).
 * - `x`: the current row's checkbox is toggled.
 * - `a`, `u`, `s`, `d`, `r`, `q`, `z`: the current row's action with the link class `vim-{key}`
 *   (Approve, Unapprove, Spam, Trash or Delete, Reply, Quick Edit, Not Spam or Restore); an action
 *   marked `vim-destructive` first moves the current row to the next one (or the previous one).
 * - `e`: the current row's Edit link is opened.
 * - `shift+x`: every row's checkbox is toggled (the select-all checkbox, as with Shift).
 * - `shift+a`, `shift+u`, `shift+s`, `shift+d`, `shift+t`, `shift+z`: the bulk action approve,
 *   unapprove, spam, delete, trash or untrash is chosen above the list and applied.
 *
 * Keys are read on `keypress`, never in a field (but a row's checkbox), nor with Ctrl, Alt or Meta.
 */

const ROW_KEYS = [ 'a', 'u', 's', 'd', 'r', 'q', 'z' ];
const BULK_KEYS = { a: 'approve', u: 'unapprove', s: 'spam', d: 'delete', t: 'trash', z: 'untrash' };

/** Whether a key event comes from a field where keys are typed (jquery.hotkeys' disableInInput). */
export function inField( target ) {
	if ( ! target || typeof target !== 'object' ) {
		return false;
	}
	const tag = String( target.tagName ?? target.localName ?? '' ).toLowerCase();
	if ( target.isContentEditable === true ) {
		return true;
	}
	if ( tag === 'input' ) {
		// noDisable: '.check-column input[type="checkbox"]'.
		const type = String( target.type ?? target.getAttribute?.( 'type' ) ?? '' ).toLowerCase();
		return ! ( type === 'checkbox' && typeof target.closest === 'function' && target.closest( '.check-column' ) );
	}
	return tag === 'textarea' || tag === 'select';
}

/**
 * What a key press asks for, or null.
 *
 * @param {{key: string, shiftKey?: boolean, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, target?: object}} event The key press.
 * @param {object} context
 * @param {number[]} context.ids     The ids of the rows shown, in order.
 * @param {number|null} context.current The current row, or null.
 * @param {(id: number, key: string) => ({action: string, destructive: boolean}|null)} context.actionOf The row's action for a key.
 * @return {object|null} `{ type: 'current', id }`, `{ type: 'page', which }`, `{ type: 'check', id }`,
 *   `{ type: 'action', id, action, current }`, `{ type: 'edit', id }`, `{ type: 'check-all' }`,
 *   `{ type: 'bulk', value }`, or null.
 */
export function hotkeyCommand( event, { ids, current, actionOf } ) {
	if ( ! event || typeof event.key !== 'string' || event.ctrlKey || event.altKey || event.metaKey || inField( event.target ) ) {
		return null;
	}
	const key = event.key.toLowerCase();
	const shift = Boolean( event.shiftKey );
	const rows = Array.isArray( ids ) ? ids : [];
	if ( shift ) {
		if ( key === 'x' ) {
			return { type: 'check-all' };
		}
		return Object.hasOwn( BULK_KEYS, key ) ? { type: 'bulk', value: BULK_KEYS[ key ] } : null;
	}
	const index = rows.indexOf( current );
	if ( key === 'j' || key === 'k' ) {
		if ( rows.length === 0 ) {
			return null;
		}
		if ( index === -1 ) {
			return { type: 'current', id: rows[ 0 ] };
		}
		const next = key === 'j' ? index + 1 : index - 1;
		if ( next < 0 || next >= rows.length ) {
			return { type: 'page', which: key === 'j' ? 'next' : 'prev' };
		}
		return { type: 'current', id: rows[ next ] };
	}
	if ( index === -1 ) {
		return null;
	}
	if ( key === 'x' ) {
		return { type: 'check', id: current };
	}
	if ( key === 'e' ) {
		return { type: 'edit', id: current };
	}
	if ( ! ROW_KEYS.includes( key ) ) {
		return null;
	}
	const found = actionOf?.( current, key ) ?? null;
	if ( ! found ) {
		return null;
	}
	// A destructive action moves on first: to the next row, else the previous one.
	let moved = current;
	if ( found.destructive ) {
		moved = rows[ index + 1 ] ?? rows[ index - 1 ] ?? current;
	}
	return { type: 'action', id: current, action: found.action, current: moved };
}

/**
 * The address of the next or previous page for the shortcuts: the pagination's link, without
 * earlier highlight arguments, asking for the first row (next) or the last (previous) — as
 * make_hotkeys_redirect() builds it. Null when there is no such page. Pure.
 *
 * @param {object} links The pagination's links (`next`, `prev`).
 * @param {'next'|'prev'} which Which page.
 * @return {string|null} The admin path.
 */
export function hotkeyPage( links, which ) {
	const link = links?.[ which ];
	if ( typeof link !== 'string' || link === '' ) {
		return null;
	}
	return link.replace( /&hotkeys_highlight_(first|last)=1/g, '' ) + '&hotkeys_highlight_' + ( which === 'next' ? 'first' : 'last' ) + '=1';
}

/** The row action a key runs on a row: the one whose link classes have `vim-{key}`. Pure. */
export function rowActionForKey( actions, key ) {
	const name = 'vim-' + key;
	const action = ( Array.isArray( actions ) ? actions : [] ).find( ( item ) => Array.isArray( item?.linkClasses ) && item.linkClasses.includes( name ) );
	return action ? { action: action.action, destructive: action.linkClasses.includes( 'vim-destructive' ) } : null;
}

/** The row the shortcuts start on: the first (`highlightFirst`), the last (`highlightLast`), or none. Pure. */
export function initialRow( ids, hotkeys ) {
	const rows = Array.isArray( ids ) ? ids : [];
	if ( ! hotkeys?.enabled || rows.length === 0 ) {
		return null;
	}
	if ( hotkeys.highlightFirst ) {
		return rows[ 0 ];
	}
	return hotkeys.highlightLast ? rows[ rows.length - 1 ] : null;
}
