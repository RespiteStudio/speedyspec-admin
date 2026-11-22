/*
 * The terms list's state, and how each answer changes it: pure functions, with no Vue and no
 * document (the functional core under core/edit-tags's imperative shell). What changed comes as
 * data (the add, Quick Edit and delete answers of the Terms routes, wp_admin_terms_list_answer());
 * these functions only place it, as tags.js and inline-edit-tax.js place what admin-ajax.php
 * answers.
 *
 * The state: `{ items, pagination, noItems, parent, emptied }`: `items` the rows shown, in order;
 * `pagination` the list's count and links; `noItems` the empty text; `parent` the add form's
 * parent dropdown (`{ options, html, selected }`, or null); `emptied` whether a delete left the
 * list without terms (tags.js's updateTableNavCount() then hides the navigation and search box).
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const isRow = ( value ) => Boolean( value ) && typeof value === 'object' && Number.isInteger( value.id );

/** The state of a list's data (wp_admin_get_terms_list()). Pure. */
export function listState( data ) {
	return {
		items: list( data?.items ).filter( isRow ),
		pagination: data?.pagination && typeof data.pagination === 'object' ? data.pagination : null,
		noItems: typeof data?.noItems === 'string' ? data.noItems : null,
		parent: data?.addForm?.parent && typeof data.addForm.parent === 'object' ? data.addForm.parent : null,
		emptied: false,
	};
}

/**
 * The rows with `row` placed as tags.js places an added term: right after its parent's row when
 * that row is on the page, else first. A row already shown with the same id leaves first. Pure.
 *
 * @param {object[]} items    The rows.
 * @param {object}   row      The row to place.
 * @param {number}   parentId The parent term's id (0 or -1 for none).
 * @return {object[]} The rows.
 */
export function placeRow( items, row, parentId ) {
	const rest = list( items ).filter( ( item ) => item.id !== row.id );
	const index = Number( parentId ) > 0 ? rest.findIndex( ( item ) => item.id === Number( parentId ) ) : -1;
	if ( index < 0 ) {
		return [ row, ...rest ];
	}
	return [ ...rest.slice( 0, index + 1 ), row, ...rest.slice( index + 1 ) ];
}

/** The rows with `row` in place of the row with its id. Pure. */
export function replaceRow( items, row ) {
	return list( items ).map( ( item ) => ( item.id === row?.id ? row : item ) );
}

/** The rows without the row `id`. Pure. */
export function removeRow( items, id ) {
	return list( items ).filter( ( item ) => item.id !== id );
}

/**
 * Where the focus goes after the row `id` is deleted, as tags.js chooses it: the next row, else
 * the previous one, else none (the name field of the add form). Pure.
 *
 * @param {object[]} items The rows, the deleted one still among them.
 * @param {number}   id    The deleted row's id.
 * @return {{id: number|null}} The row to focus.
 */
export function nextFocus( items, id ) {
	const rows = list( items );
	const index = rows.findIndex( ( item ) => item.id === id );
	if ( index < 0 ) {
		return { id: null };
	}
	const next = rows[ index + 1 ] ?? rows[ index - 1 ] ?? null;
	return { id: next ? next.id : null };
}

/** What every list answer replaces: the parent dropdown, the count and the empty text. Pure. */
function common( state, answer ) {
	return {
		...state,
		parent: answer && Object.hasOwn( answer, 'parentOptions' ) ? ( answer.parentOptions && typeof answer.parentOptions === 'object' ? answer.parentOptions : null ) : state.parent,
		pagination: answer?.pagination && typeof answer.pagination === 'object' ? answer.pagination : state.pagination,
		noItems: typeof answer?.noItems === 'string' ? answer.noItems : state.noItems,
	};
}

/**
 * The state after an add's answer: its `row` goes right after the parent's row when that row is
 * shown, else its `parentRow` (the term with its parents' names, at level 0; null on a flat
 * taxonomy, then the row) goes first, as tags.js inserts `noparents` or `parents`. Pure.
 *
 * @param {object} state    The state.
 * @param {object} answer   The answer.
 * @param {number} parentId The parent the form posted.
 * @return {object} The state.
 */
export function afterAdd( state, answer, parentId ) {
	const next = { ...common( state, answer ), emptied: false };
	const row = isRow( answer?.row ) ? answer.row : null;
	if ( ! row ) {
		return next;
	}
	const parent = Number( parentId );
	const shown = parent > 0 && state.items.some( ( item ) => item.id === parent );
	const placed = shown ? row : ( isRow( answer?.parentRow ) ? answer.parentRow : row );
	return { ...next, items: placeRow( state.items, placed, parent ) };
}

/** The state after a Quick Edit's answer: its row replaces the term's. Pure. */
export function afterInline( state, answer ) {
	const next = common( state, answer );
	return isRow( answer?.row ) ? { ...next, items: replaceRow( state.items, answer.row ) } : next;
}

/**
 * The state after a delete's answer: the row leaves; the list is `emptied` when no term is left,
 * as tags.js's updateTableNavCount() counts them. Pure.
 */
export function afterDelete( state, id, answer ) {
	const next = common( state, answer );
	const total = Number( next.pagination?.total ?? 0 );
	return { ...next, items: removeRow( state.items, id ), emptied: total < 1 };
}
