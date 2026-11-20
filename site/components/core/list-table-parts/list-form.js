/*
 * The list form of the classic list screens (Comments, Posts, Media): what common.js checks before
 * a bulk action, the query a filter or search submits, where Screen Options lead and the hidden
 * columns. Pure functions, shared by the list pages.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The query of a list form (a GET form: `#comments-form`, `#posts-filter`) as the classic submit
 * sends it, less the fields a filter or search never sends (`skip`: the bulk actions, the
 * checked rows, Apply, the inline forms' fields). Pure.
 *
 * @param {Iterable<[string, string]>} entries The form's entries (FormData).
 * @param {object}      [replace] Values that replace the form's (e.g. `{ s: term }`).
 * @param {Set<string>} [skip]    Names left out.
 * @return {string} The query string, without `?`.
 */
export function formQuery( entries, replace = {}, skip = new Set() ) {
	const params = new URLSearchParams();
	const replaced = new Set();
	for ( const [ name, value ] of entries ) {
		if ( skip.has( name ) || typeof value !== 'string' ) {
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
