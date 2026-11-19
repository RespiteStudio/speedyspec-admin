/*
 * The Comments list's state, and how each answer of a comment route changes it: pure functions,
 * with no Vue and no document. What changed comes as data (the answer's row, views, pagination,
 * bubble, extra rows, title and undo notice); these functions only place it, as edit-comments.js
 * and wp-lists place what admin-ajax.php answers:
 *
 * - an action WordPress marks `dims` (Approve and Unapprove in All) toggles the row's
 *   `unapproved` class in place, and the answer's row then replaces it;
 * - an action WordPress marks `removes` takes the row out; after Trash and Spam (an answer with
 *   `undo`) the row is kept hidden with its undo row; the first extra row not already shown then
 *   comes into the list (theExtraList), unless it was an undo;
 * - Quick Edit's answer row replaces the row; a reply's row comes after the comment replied to.
 *
 * The state: `{ items, extra, views, viewsHtml, pagination, title, hidden, undos }`: `hidden` the ids
 * of rows taken out but kept for their undo row (or waiting for an answer), `undos` the undo
 * notice of each such row (`{ kind, message, author, request, avatar, avatarHtml }`).
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const without = ( ids, id ) => ids.filter( ( item ) => item !== id );
const withId = ( ids, id ) => ( ids.includes( id ) ? ids : [ ...ids, id ] );

/** The state of a list's data (wp_admin_get_comments_list()). Pure. */
export function listState( data ) {
	return {
		items: list( data?.items ),
		extra: list( data?.extra ),
		views: list( data?.views ),
		viewsHtml: data?.viewsHtml ?? null,
		pagination: data?.pagination ?? null,
		title: typeof data?.title === 'string' ? data.title : '',
		hidden: [],
		undos: {},
	};
}

/** A row with its `unapproved` class toggled, as wp-lists dims it. Pure. */
export function toggleUnapproved( row ) {
	const classes = list( row?.classes );
	return { ...row, classes: classes.includes( 'unapproved' ) ? classes.filter( ( name ) => name !== 'unapproved' ) : [ ...classes, 'unapproved' ] };
}

/** The rows with the post's comment bubble WordPress sent (`.post-com-count-{postId}`). Pure. */
export function withBubble( rows, bubble ) {
	if ( ! bubble || typeof bubble !== 'object' || ! Number.isInteger( bubble.postId ) ) {
		return rows;
	}
	return rows.map( ( row ) => ( row?.response?.bubble?.postId === bubble.postId ? { ...row, response: { ...row.response, bubble } } : row ) );
}

/** The rows with `row` in place of the row `id`; without one, the row leaves. Pure. */
export function replaceRow( rows, id, row ) {
	return row ? rows.map( ( item ) => ( item.id === id ? row : item ) ) : rows.filter( ( item ) => item.id !== id );
}

/**
 * The list after a row left it: the first extra row that is not shown comes in at the end (as
 * edit-comments.js moves the first row of `#the-extra-comment-list`), taken from the extra rows the
 * list held, then from those of the answer (a fresh read's rows after the page); the extra rows
 * are then the answer's, less those shown. Pure.
 *
 * @param {object[]} items       Rows shown.
 * @param {object[]} extra       The extra rows the list held.
 * @param {object[]|undefined} answerExtra The answer's extra rows, or undefined for none sent.
 * @return {{items: object[], extra: object[]}} The rows and the extra rows.
 */
export function refill( items, extra, answerExtra ) {
	const shown = new Set( items.map( ( item ) => item.id ) );
	const pool = [ ...list( extra ), ...list( answerExtra ) ];
	const next = pool.find( ( row ) => row && ! shown.has( row.id ) );
	const rows = next ? [ ...items, next ] : items;
	if ( next ) {
		shown.add( next.id );
	}
	const remaining = Array.isArray( answerExtra ) ? answerExtra : list( extra );
	return { items: rows, extra: remaining.filter( ( row ) => row && ! shown.has( row.id ) ) };
}

/** The parts of an answer that every answer updates: views, pagination, title, the bubble, the extra rows. Pure. */
export function withAnswerParts( state, answer ) {
	if ( ! answer || typeof answer !== 'object' ) {
		return state;
	}
	const next = { ...state };
	if ( Array.isArray( answer.views ) && answer.views.length > 0 ) {
		next.views = answer.views;
	}
	if ( Object.hasOwn( answer, 'viewsHtml' ) && Object.hasOwn( answer, 'views' ) ) {
		next.viewsHtml = answer.viewsHtml ?? null;
	}
	if ( answer.pagination && typeof answer.pagination === 'object' ) {
		next.pagination = answer.pagination;
	}
	if ( typeof answer.title === 'string' && answer.title !== '' ) {
		next.title = answer.title;
	}
	next.items = withBubble( next.items, answer.bubble );
	next.extra = withBubble( list( next.extra ), answer.bubble );
	return next;
}

/** The state with the row `id` taken out at once (wp-lists' delete), waiting for the answer. Pure. */
export function hideRow( state, id ) {
	return { ...state, hidden: withId( state.hidden, id ) };
}

/** The state with the row `id` shown again (a failed action). Pure. */
export function showRow( state, id ) {
	return { ...state, hidden: without( state.hidden, id ) };
}

/** The state with the row `id` dimmed at once (wp-lists' dim), waiting for the answer. Pure. */
export function dimRow( state, id ) {
	return { ...state, items: state.items.map( ( item ) => ( item.id === id ? toggleUnapproved( item ) : item ) ) };
}

/**
 * The state after the answer of a row action that calls a moderation route.
 *
 * @param {object} state  The list's state.
 * @param {object} args
 * @param {object} args.row    The row acted on (as shown before the action).
 * @param {object} args.action The row action (`removes`, `dims`).
 * @param {object} args.answer The answer.
 * @return {object} The state.
 */
export function afterModeration( state, { row, action, answer } ) {
	const id = row.id;
	let next = { ...state, undos: { ...state.undos } };
	const newRow = answer?.row ?? null;
	if ( action?.removes === true ) {
		const undo = answer?.undo && typeof answer.undo === 'object' && answer.undo.request ? answer.undo : null;
		if ( undo ) {
			// Kept hidden, with its undo row: Undo shows it again.
			next.undos[ id ] = { ...undo, avatar: row.author?.avatar ?? null, avatarHtml: row.author?.avatarHtml ?? null };
			next.hidden = withId( next.hidden, id );
		} else if ( newRow ) {
			// Still listed: shown as it is now.
			next.items = replaceRow( next.items, id, newRow );
			next.hidden = without( next.hidden, id );
		} else {
			next.items = replaceRow( next.items, id, null );
			next.hidden = without( next.hidden, id );
		}
		if ( undo || ! newRow ) {
			// The row left: the next one comes in (theExtraList).
			const filled = refill( next.items, next.extra, answer?.extra );
			next.items = filled.items;
			next.extra = filled.extra;
		}
	} else if ( action?.dims === true ) {
		// Dimmed at once; the answer's row is the comment as it is now.
		next.items = newRow ? replaceRow( next.items, id, newRow ) : next.items;
		if ( Array.isArray( answer?.extra ) ) {
			next.extra = answer.extra.filter( ( item ) => ! next.items.some( ( shown ) => shown.id === item.id ) );
		}
	} else {
		next.items = replaceRow( next.items, id, newRow );
		if ( Array.isArray( answer?.extra ) ) {
			next.extra = answer.extra.filter( ( item ) => ! next.items.some( ( shown ) => shown.id === item.id ) );
		}
	}
	return withAnswerParts( next, answer );
}

/**
 * The state after an undo row's Undo was answered: the undo row goes and the comment's row comes
 * back as the answer gives it (it leaves when it is no longer listed). As edit-comments.js, no
 * extra row goes back. Pure.
 */
export function afterUndo( state, { id, answer } ) {
	const undos = { ...state.undos };
	delete undos[ id ];
	const next = { ...state, undos, hidden: without( state.hidden, id ), items: replaceRow( state.items, id, answer?.row ?? null ) };
	return withAnswerParts( next, answer );
}

/** The state with the undo row of `id` gone and its row shown again (Undo clicked, waiting for the answer). Pure. */
export function restoring( state, id ) {
	const undos = { ...state.undos };
	delete undos[ id ];
	return { ...state, undos, hidden: without( state.hidden, id ) };
}

/** The state after Quick Edit's answer: its row replaces the comment's. Pure. */
export function afterEdit( state, { id, answer } ) {
	return withAnswerParts( { ...state, items: replaceRow( state.items, id, answer?.row ?? null ) }, answer );
}

/**
 * The state after a reply's answer, as commentReply.show() places it: the comment replied to is
 * shown as it is now (`parent.row`); the reply's row (`replyRow`) comes right after it. In the
 * Pending view, a parent that the reply approved leaves the list and no reply row comes in
 * (edit-comments.js returns there). Pure.
 *
 * @param {object} state The list's state.
 * @param {object} args
 * @param {number} args.parentId The comment replied to.
 * @param {object} args.answer   The answer.
 * @param {string} args.view     The list's `comment_status`.
 * @return {object} The state.
 */
export function afterReply( state, { parentId, answer, view } ) {
	let items = state.items;
	const parent = answer?.parent && typeof answer.parent === 'object' ? answer.parent : null;
	if ( parent?.row ) {
		items = replaceRow( items, parentId, parent.row );
	} else if ( parent && parent.approved === true && view === 'moderated' ) {
		return withAnswerParts( { ...state, items: replaceRow( items, parentId, null ) }, answer );
	}
	const reply = answer?.replyRow ?? answer?.row ?? null;
	if ( reply && ! items.some( ( item ) => item.id === reply.id ) ) {
		const index = items.findIndex( ( item ) => item.id === parentId );
		items = [ ...items ];
		items.splice( index < 0 ? 0 : index + 1, 0, reply );
	}
	return withAnswerParts( { ...state, items }, answer );
}

/**
 * The query of the list form (`#comments-form`, a GET form) as the classic submit sends it, less
 * the bulk fields (the actions, the checked rows, Apply and Empty), wp-lists' own fields
 * (`_total`, `_per_page`, `_page`) and the inline form's, which a filter or search never needs. Pure.
 *
 * @param {Iterable<[string, string]>} entries The form's entries (FormData).
 * @param {object} [replace] Values that replace the form's (e.g. `{ s: term }`).
 * @return {string} The query string, without `?`.
 */
export function listQuery( entries, replace = {} ) {
	const params = new URLSearchParams();
	const replaced = new Set();
	for ( const [ name, value ] of entries ) {
		if ( BULK_FIELDS.has( name ) || typeof value !== 'string' ) {
			continue;
		}
		if ( Object.hasOwn( replace, name ) ) {
			if ( ! replaced.has( name ) ) {
				replaced.add( name );
				params.append( name, String( replace[ name ] ) );
			}
			continue;
		}
		params.append( name, value );
	}
	for ( const [ name, value ] of Object.entries( replace ) ) {
		if ( ! replaced.has( name ) ) {
			params.append( name, String( value ) );
		}
	}
	return params.toString();
}

/** The fields of the list form that only a bulk action, wp-lists or the inline form send. */
export const BULK_FIELDS = new Set( [
	'action', 'action2', 'delete_comments[]', 'bulk_action', 'delete_all', 'delete_all2', '_destroy_nonce', '_total', '_per_page', '_page', '_wpnonce', '_wp_http_referer',
	'replycontent', 'newcomment_author', 'newcomment_author_email', 'newcomment_author_url', 'comment_ID', 'comment_post_ID',
] );

/**
 * What common.js says before a bulk action, or null when it may run: "Please select a bulk action
 * to perform." without an action, "Please select at least one item to perform this action on."
 * without a checked row. Returns the notice's id and which of the two messages. Pure.
 *
 * @param {string} value   The action chosen (`-1` for none).
 * @param {number} checked How many rows are checked.
 * @return {{id: string, kind: 'action'|'items'}|null} The check that failed.
 */
export function bulkCheck( value, checked ) {
	if ( value === '-1' || value === '' || value === null || value === undefined ) {
		return { id: 'no-bulk-action-selected', kind: 'action' };
	}
	return checked > 0 ? null : { id: 'no-items-selected', kind: 'items' };
}

/**
 * Whether an address is the one shown: a bulk answer that leads back to it is not a navigation
 * (router.follow() does not reload the list then). Pure.
 *
 * @param {string} url   Address (absolute).
 * @param {{pathname: string, search: string}} where The location.
 * @return {boolean} Whether it is the same path and query.
 */
export function isCurrentAddress( url, where ) {
	try {
		const target = new URL( url, 'http://x.invalid' );
		return target.pathname + target.search === String( where?.pathname ?? '' ) + String( where?.search ?? '' );
	} catch {
		return false;
	}
}

/**
 * The address the Screen Options apply leads to: the list's, without `paged`, `pagenum` and
 * `apage`, as set_screen_options() redirects to the referer. Pure.
 *
 * @param {{pathname: string, search: string}} where The location.
 * @return {string} Path and query.
 */
export function afterScreenOptions( where ) {
	const params = new URLSearchParams( String( where?.search ?? '' ) );
	for ( const name of [ 'paged', 'pagenum', 'apage' ] ) {
		params.delete( name );
	}
	const query = params.toString();
	return String( where?.pathname ?? '' ) + ( query ? '?' + query : '' );
}

/** The hidden columns' keys after a Screen Options column checkbox changed. Pure. */
export function hiddenColumns( current, key, hidden ) {
	const keys = list( current ).filter( ( item ) => item !== key );
	return hidden ? [ ...keys, key ] : keys;
}
