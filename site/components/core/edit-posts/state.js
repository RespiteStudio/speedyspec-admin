/*
 * The Posts list's state, and how each answer changes it: pure functions, with no Vue and no
 * document. What changed comes as data (the Quick Edit answer's row, the lock check's answer);
 * these functions only place it, as inline-edit-post.js places what admin-ajax.php and the
 * heartbeat answer.
 *
 * The state: `{ items, locks }`: `items` the rows shown, in order; `locks` per row id
 * `{ locked, text, avatarHtml, avatarSrc, avatarSrc2x }`, the lock shown in the row's
 * `.locked-info` and whether the row has the `wp-locked` class.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The lock a row shows when it is read (column_title()'s `.locked-info`, the `wp-locked` class). Pure. */
export function rowLock( row ) {
	const lock = row?.lock && typeof row.lock === 'object' ? row.lock : null;
	return {
		locked: list( row?.classes ).includes( 'wp-locked' ),
		text: typeof lock?.text === 'string' ? lock.text : '',
		avatarHtml: typeof lock?.avatarHtml === 'string' && lock.avatarHtml !== '' ? lock.avatarHtml : null,
		avatarSrc: null,
		avatarSrc2x: null,
	};
}

/** The state of a list's data (wp_admin_get_posts_list()). Pure. */
export function listState( data ) {
	const items = list( data?.items ).filter( ( item ) => item && Number.isInteger( item.id ) );
	return { items, locks: Object.fromEntries( items.map( ( item ) => [ item.id, rowLock( item ) ] ) ) };
}

/** The rows with `row` in place of the row `id`; without one, the row leaves. Pure. */
export function replaceRow( rows, id, row ) {
	return row && typeof row === 'object' ? rows.map( ( item ) => ( item.id === id ? row : item ) ) : rows.filter( ( item ) => item.id !== id );
}

/**
 * The state after Quick Edit's answer (`{ id, row }`): its row replaces the post's, as
 * inline-edit-post.js puts the row admin-ajax.php printed in place of the old one. Pure.
 */
export function afterInline( state, { id, answer } ) {
	const row = answer?.row && typeof answer.row === 'object' ? answer.row : null;
	const locks = { ...state.locks };
	delete locks[ id ];
	if ( row ) {
		locks[ row.id ] = rowLock( row );
	}
	return { ...state, items: replaceRow( state.items, id, row ), locks };
}

/**
 * The locks after an answer of `GET posts/locks` (`{ [id]: { text, avatarSrc, avatarSrc2x } }`),
 * as inline-edit-post.js handles `heartbeat-tick.wp-check-locked-posts`: a row in the answer that
 * is not locked yet gets the text, the avatar and the `wp-locked` class; a locked row that is
 * not in the answer loses the class and its `.locked-info` is emptied. Pure.
 *
 * @param {object} locks  The locks shown, by row id.
 * @param {object} answer The answer.
 * @return {object} The locks.
 */
export function applyLocks( locks, answer ) {
	const found = answer && typeof answer === 'object' && ! Array.isArray( answer ) ? answer : {};
	const next = { ...locks };
	for ( const [ key, current ] of Object.entries( locks ) ) {
		const data = Object.hasOwn( found, key ) && found[ key ] && typeof found[ key ] === 'object' ? found[ key ] : null;
		if ( data && ! current.locked ) {
			next[ key ] = {
				locked: true,
				text: typeof data.text === 'string' ? data.text : '',
				avatarHtml: data.avatarSrc ? null : current.avatarHtml,
				avatarSrc: typeof data.avatarSrc === 'string' && data.avatarSrc !== '' ? data.avatarSrc : null,
				avatarSrc2x: typeof data.avatarSrc2x === 'string' && data.avatarSrc2x !== '' ? data.avatarSrc2x : null,
			};
		} else if ( ! data && current.locked ) {
			next[ key ] = { locked: false, text: '', avatarHtml: null, avatarSrc: null, avatarSrc2x: null };
		}
	}
	return next;
}

/** A row's classes with `wp-locked` as its lock says. Pure. */
export function lockedClasses( classes, lock ) {
	const rest = list( classes ).filter( ( name ) => name !== 'wp-locked' );
	return lock?.locked ? [ ...rest, 'wp-locked' ] : rest;
}

/**
 * The fields of the list form (`#posts-filter`) that a filter or search never sends: the bulk
 * actions, the checked rows, Apply and Empty Trash, the nonces, and the Quick Edit and Bulk Edit
 * fields (their rows are in the table, inside the form, as classic).
 */
export const BULK_FIELDS = new Set( [
	'action', 'action2', 'post[]', 'bulk_edit', 'delete_all', 'delete_all2', 'filter_action', '_wpnonce', '_wp_http_referer', '_inline_edit',
	'post_title', 'post_name', 'mm', 'jj', 'aa', 'hh', 'mn', 'ss', 'post_author', 'post_password', 'keep_private', 'post_category[]',
	'indeterminate_post_category[]', 'post_parent', 'menu_order', 'page_template', 'comment_status', 'ping_status', '_status', 'sticky', 'post_format',
	'post_view', 'screen',
] );

/** Whether a field of the list form is one a filter or search never sends. Pure. */
export const isBulkField = ( name ) => BULK_FIELDS.has( name ) || String( name ).startsWith( 'tax_input[' );
