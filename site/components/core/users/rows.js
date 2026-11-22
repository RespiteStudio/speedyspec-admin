import LegacyHtml from '../../../kit/LegacyHtml.js';
import InertHtml from '../../../kit/InertHtml.js';
import { adminHref } from '../dashboard-parts/links.js';
import { actionHref, isRequest, requestBody } from '../list-table-parts/row-actions.js';

/*
 * The cells of a Users list row, in the markup WP_Users_List_Table::single_row() prints them (the
 * avatar and login with the super admin mark and the row actions, the name, the email link, the
 * roles, the posts count), from the row's data (wp_admin_users_list_row()). Logins, names, emails
 * and roles are text; plugin columns, a filtered avatar and filtered row actions are their HTML
 * (kit/LegacyHtml), as classic prints them.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/**
 * A row action's request as the shared helpers read it: WordPress describes Send password reset as
 * `{ method: 'POST', path: 'users/bulk', body }` under `wp-admin/v1`. Pure.
 *
 * @param {object|null} request The action's request.
 * @return {{route: string, method: string, body: object}|null} The request with its route, or null.
 */
export function actionRequest( request ) {
	if ( ! request || typeof request.path !== 'string' || request.path === '' ) {
		return null;
	}
	const routed = { route: 'wp-admin/v1/' + request.path.replace( /^\/+/, '' ), method: request.method, body: requestBody( request ) };
	return isRequest( routed ) ? routed : null;
}

/** The row actions to show, in order: those with an address and those with a route. Pure. */
export function userActions( actions ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && (
		( typeof action.url === 'string' && action.url !== '' ) || actionRequest( action.request ) !== null
	) );
}

/** The `href` of the email link: only a `mailto:` address, else none. Pure. */
export const mailHref = ( href ) => ( /^mailto:/i.test( text( href ).trim() ) && ! /[\u0000-\u001f\u007f]/.test( text( href ) ) ? text( href ).trim() : null );

/** The username cell (column `username` with handle_row_actions()). */
const Username = {
	name: 'UsersUsername',
	components: { LegacyHtml },
	props: {
		item: { type: Object, required: true },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const username = () => props.item.username ?? {};
		return {
			username, actionHref, actionRequest,
			actions: () => userActions( props.item.actions ),
			editHref: () => ( username().editUrl ? actionHref( { url: username().editUrl } ) : '' ),
			avatarSrc: () => ( typeof username().avatar === 'string' && /^https?:\/\//i.test( username().avatar ) ? username().avatar : null ),
			onAction: ( action, event ) => {
				event?.preventDefault?.();
				emit( 'act', props.item, action );
			},
			onActionsHtml: ( event ) => emit( 'actions-html', props.item, event ),
		};
	},
	template: `
		<LegacyHtml v-if="typeof username().avatarHtml === 'string'" tag="span" :html="username().avatarHtml" /><img v-else-if="avatarSrc()" alt="" :src="avatarSrc()" class="avatar avatar-32 photo" height="32" width="32" loading="lazy" decoding="async" />{{ ' ' }}<strong><a v-if="editHref()" :href="editHref()">{{ username().login ?? '' }}</a><template v-else>{{ username().login ?? '' }}</template><template v-if="username().superAdmin">{{ ' — ' + $__( 'Super Admin', 'default' ) }}</template></strong>
		<LegacyHtml v-if="typeof item.actionsHtml === 'string'" class="row-actions" :html="item.actionsHtml" @click="onActionsHtml" />
		<div v-else-if="actions().length" class="row-actions"><span v-for="( action, index ) in actions()" :key="action.action" :class="action.action"><a v-if="actionRequest( action.request )" href="#" :class="action.classes" :aria-label="action.ariaLabel || null" @click="onAction( action, $event )">{{ action.text }}</a><a v-else :href="actionHref( action )" :class="action.classes" :aria-label="action.ariaLabel || null">{{ action.text }}</a>{{ index < actions().length - 1 ? ' | ' : '' }}</span></div>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table). Emits `act( item, action )` for an
 * action with a route, and `actions-html( item, event )` for a click in filtered row actions.
 */
export default {
	name: 'UsersCell',
	components: { Username, LegacyHtml, InertHtml },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const posts = () => props.item?.posts ?? {};
		return {
			cellHtml, posts, mailHref,
			roles: () => list( props.item?.roles ).map( text ).join( ', ' ),
			postsHref: () => ( posts().url ? adminHref( posts().url ) : '' ),
			onAct: ( ...args ) => emit( 'act', ...args ),
			onActionsHtml: ( ...args ) => emit( 'actions-html', ...args ),
		};
	},
	template: `
		<Username v-if="column.key === 'username'" :item="item" @act="onAct" @actions-html="onActionsHtml" />
		<template v-else-if="column.key === 'name'"><template v-if="item.nameUnknown === true"><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ item.name ?? '' }}</span></template><template v-else>{{ item.name ?? '' }}</template></template>
		<a v-else-if="column.key === 'email'" :href="mailHref( item.email?.href )">{{ item.email?.text ?? '' }}</a>
		<template v-else-if="column.key === 'role'">{{ roles() }}</template>
		<template v-else-if="column.key === 'posts'"><a v-if="postsHref()" :href="postsHref()" class="edit"><span aria-hidden="true">{{ posts().text ?? '' }}</span><span class="screen-reader-text">{{ posts().label ?? '' }}</span></a><template v-else>{{ posts().text ?? '' }}</template></template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
