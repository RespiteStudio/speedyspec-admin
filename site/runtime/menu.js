/**
 * Admin menu logic: link targets, icon values and the current item.
 * No Vue, no document.
 */

const HTTP_URL = /^https?:\/\//i;
const DASHICON = /^dashicons-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SVG_DATA = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
const UNSAFE_URL_CHARS = /[\s\\"'<>`\u0000-\u001f\u007f]/;

/** The value when it is an absolute http(s) URL without characters that do not belong in one, else null. */
export function httpUrl( value ) {
	if ( typeof value !== 'string' || ! HTTP_URL.test( value ) || UNSAFE_URL_CHARS.test( value ) ) {
		return null;
	}
	try {
		new URL( value );
		return value;
	} catch {
		return null;
	}
}

/** Admin URL prefix of the site being shown: `/wp-admin/` or `/sites/{id}/wp-admin/`. */
export const adminBase = ( siteId ) => ( siteId === null || siteId === undefined ? '/wp-admin/' : '/sites/' + siteId + '/wp-admin/' );

/**
 * Link target of a menu path. Paths are relative to the admin base; root-relative
 * paths and http(s) URLs (registered by plugins) are kept as they are.
 */
export function menuHref( path, base ) {
	const value = String( path ?? '' );
	if ( httpUrl( value ) || ( value.startsWith( '/' ) && ! value.startsWith( '//' ) && ! UNSAFE_URL_CHARS.test( value ) ) ) {
		return value;
	}
	// Anything else, including a value a browser could read as `//host` (`/\host`, a tab
	// after the slash), stays a path under the admin base.
	return base + value;
}

/**
 * What to render for a classic menu icon value: a Dashicons class, an image
 * (root-relative, http(s) or a base64 SVG data URI), or nothing.
 *
 * @returns {{kind: 'dashicons', className: string}|{kind: 'image', src: string}|{kind: 'none'}}
 */
export function menuIcon( icon ) {
	if ( typeof icon !== 'string' || icon === '' ) {
		return { kind: 'none' };
	}
	if ( DASHICON.test( icon ) ) {
		return { kind: 'dashicons', className: icon };
	}
	if ( SVG_DATA.test( icon ) ) {
		return { kind: 'image', src: icon };
	}
	if ( UNSAFE_URL_CHARS.test( icon ) ) {
		return { kind: 'none' };
	}
	if ( icon.startsWith( '/' ) && ! icon.startsWith( '//' ) ) {
		return { kind: 'image', src: icon };
	}
	return httpUrl( icon ) ? { kind: 'image', src: icon } : { kind: 'none' };
}

/**
 * Stable list keys for menu paths: the path itself, so that an item keeps its component
 * (open submenu, focus) when items are added or removed around it, and a repeated path
 * gets a numbered key.
 */
export function uniqueKeys( paths ) {
	const seen = new Map();
	return paths.map( ( path ) => {
		const count = ( seen.get( path ) ?? 0 ) + 1;
		seen.set( path, count );
		return count === 1 ? String( path ) : path + '#' + count;
	} );
}

/** The current page path in the form menu paths use (`network/…`, `user/…` outside the site admin). */
export const currentMenuPath = ( { context, path } ) => ( context === 'site' || ! context ? path : context + '/' + path );

function split( path ) {
	const [ file, query = '' ] = String( path ).split( '?', 2 );
	return { file, params: [ ...new URLSearchParams( query ) ].map( ( [ k, v ] ) => k + '=' + v ) };
}

/** Number of query parameters of `item` when they all appear in `current` with the same file, else -1. */
function subsetScore( itemPath, current ) {
	const a = split( itemPath );
	if ( a.file !== current.file ) {
		return -1;
	}
	return a.params.every( ( p ) => current.params.includes( p ) ) ? a.params.length : -1;
}

/**
 * Finds the current menu item for `current` (a menu-form path): an exact
 * path-and-query match first, else the item with the same file whose query
 * arguments all appear in the current URL (the most specific wins). A matching
 * child brings its parent.
 *
 * @returns {{top: object, child: object|null}|null}
 */
export function findCurrent( items, current ) {
	if ( ! Array.isArray( items ) || items.length === 0 ) {
		return null;
	}
	const candidates = [];
	for ( const top of items ) {
		for ( const child of top.children ?? [] ) {
			candidates.push( { top, child, path: child.path } );
		}
		candidates.push( { top, child: null, path: top.path } );
	}

	const exact = candidates.find( ( c ) => c.path === current );
	if ( exact ) {
		return { top: exact.top, child: exact.child };
	}

	const parsed = split( current );
	let best = null;
	let bestScore = -1;
	for ( const candidate of candidates ) {
		const score = subsetScore( candidate.path, parsed );
		if ( score > bestScore ) {
			best = candidate;
			bestScore = score;
		}
	}
	return best ? { top: best.top, child: best.child } : null;
}
