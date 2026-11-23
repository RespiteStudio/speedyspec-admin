import { adminHref } from '../dashboard-parts/links.js';

/*
 * The row actions of the list pages (Posts, Media) as WordPress describes them
 * (`{ action, text, ariaLabel, classes, request, url, newTab }`): which to show, whether one calls a
 * route, and the address of its link. Pure functions, shared by the list pages.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** Whether a row action calls a route WordPress described. Pure. */
export function isRequest( request ) {
	return Boolean( request ) && typeof request.route === 'string' && request.route !== '' && request.method === 'POST';
}

/**
 * The row actions to show: those with a route and those with an address, and those named in
 * `local` (actions the page runs itself: Quick Edit's form, Copy URL, Attach). Pure.
 *
 * @param {Array}    actions The row's actions.
 * @param {string[]} [local] Actions shown without a route or an address.
 * @return {Array} The actions to show, in order.
 */
export function shownActions( actions, local = [] ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && ( isRequest( action.request ) || ( typeof action.url === 'string' && action.url !== '' ) || local.includes( action.action ) ) );
}

/** The class of an action's link, as handle_row_actions() prints it. Pure. */
export const actionLinkClass = ( action ) => ( action.action === 'trash' || action.action === 'delete' ? 'submitdelete' : null );

/**
 * The address of an action's link: an admin path through the admin, an http(s) address as it is,
 * and `#` for anything else (another scheme, such as `javascript:`, is never a link). Pure.
 */
export function actionHref( action ) {
	const url = typeof action?.url === 'string' ? action.url.trim() : '';
	if ( url === '' || /[\u0000-\u001f\u007f]/.test( url ) ) {
		return '#';
	}
	if ( /^[a-z][a-z0-9+.-]*:/i.test( url ) ) {
		return /^https?:/i.test( url ) ? url : '#';
	}
	// Protocol-relative addresses (`//host`) leave the admin's origin: not an admin path.
	return url.startsWith( '//' ) ? '#' : adminHref( url );
}

/**
 * The span of a row action in row actions plugins filtered: the child of the row actions element
 * (`root`) that holds the clicked control, as row_actions() prints `<span class='{key}'>`. Pure
 * over the DOM.
 *
 * @param {Element} control The clicked link or button.
 * @param {Element} root    The row actions element.
 * @return {Element|null} The span, or null.
 */
export function actionSpan( control, root ) {
	let element = control ?? null;
	while ( element && element.parentElement !== root ) {
		element = element.parentElement ?? null;
		if ( element === root ) {
			return null;
		}
	}
	return element && String( element.tagName ?? '' ).toLowerCase() === 'span' ? element : null;
}

/** The classes of an action's span, as one string: its `classes` (else its key). Pure. */
const spanClass = ( action ) => {
	const classes = list( action?.classes ).filter( ( name ) => typeof name === 'string' && name !== '' );
	return classes.length > 0 ? classes.join( ' ' ) : String( action?.action ?? '' );
};

/**
 * The core action a span of filtered row actions is: its class is exactly the action's classes
 * (`inline hide-if-no-js` for Quick Edit, the key of the filter's array), so a plugin's own link
 * in a span of another class, or with a class added, is not a core action. Pure.
 *
 * @param {Element|null} span    The span (actionSpan()).
 * @param {Array}        actions The row's actions.
 * @return {object|null} The action, or null.
 */
export function spanAction( span, actions ) {
	const value = String( span?.getAttribute?.( 'class' ) ?? '' ).trim().split( /\s+/ ).join( ' ' );
	return value === '' ? null : list( actions ).find( ( action ) => action && spanClass( action ) === value ) ?? null;
}

/**
 * The row's actions that are still core's in its filtered row actions: those whose key is in the
 * row's `coreActions` (WordPress names the core actions the filter left as core gave them; a
 * plugin's replacement in the same span is not one). Without `coreActions` (an older
 * WordPress), all of them. Pure.
 *
 * @param {object} item    The row (`coreActions`).
 * @param {Array}  actions The row's actions.
 * @return {Array} The actions a click in the filtered HTML may run.
 */
export function coreActions( item, actions ) {
	if ( ! Array.isArray( item?.coreActions ) ) {
		return list( actions );
	}
	return list( actions ).filter( ( action ) => item.coreActions.includes( spanClass( action ) ) );
}

/**
 * The core action a click in row actions plugins filtered (`actionsHtml`) runs, with its control,
 * or null: none for a click its own handler prevented (a declined inline
 * `return showNotice.warn();`, a plugin's `return false;`), nor outside a link or button, nor in
 * a span that is not exactly a core action's. `event.currentTarget` is the row actions element.
 *
 * @param {Event} event   The click.
 * @param {Array} actions The row's actions that may run.
 * @return {{action: object, control: Element}|null} What to run.
 */
export function filteredAction( event, actions ) {
	if ( ! event || event.defaultPrevented ) {
		return null;
	}
	const control = event.target?.closest?.( 'a, button' ) ?? null;
	const action = control ? spanAction( actionSpan( control, event.currentTarget ?? null ), actions ) : null;
	return action ? { action, control } : null;
}

/** A request's body as an object (an empty PHP array arrives as `[]`). Pure. */
export const requestBody = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );

/**
 * The `.editinline` element a click came from, for the delegated rule of inline-edit-post.js and
 * inline-edit-tax.js (markup a plugin printed in the row actions that keeps the class opens the
 * row's Quick Edit). Null for a click its own handler prevented, or outside such an element, or
 * outside the row actions element (`event.currentTarget`). Pure over the DOM.
 *
 * @param {Event} event The click.
 * @return {Element|null} The element, or null.
 */
export function editinlineTrigger( event ) {
	if ( ! event || event.defaultPrevented ) {
		return null;
	}
	const control = event.target?.closest?.( '.editinline' ) ?? null;
	const root = event.currentTarget ?? null;
	if ( ! control || ( root && root.contains && ! root.contains( control ) ) ) {
		return null;
	}
	return control;
}
