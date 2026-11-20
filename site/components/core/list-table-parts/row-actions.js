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

/** The address of an action's link: an admin path through the admin, another address as it is. Pure. */
export function actionHref( action ) {
	const url = typeof action?.url === 'string' ? action.url : '';
	if ( url === '' ) {
		return '#';
	}
	return /^[a-z][a-z0-9+.-]*:/i.test( url ) ? url : adminHref( url );
}

/** A request's body as an object (an empty PHP array arrives as `[]`). Pure. */
export const requestBody = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );
