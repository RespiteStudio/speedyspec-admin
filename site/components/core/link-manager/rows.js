import { __, sprintf } from '../../../runtime/text.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InertHtml from '../../../kit/InertHtml.js';
import { decodeEntities } from '../../../kit/Interpolate.js';
import { adminHref } from '../dashboard-parts/links.js';
import { actionHref } from '../list-table-parts/row-actions.js';

/*
 * The cells of a Links list row, in the markup WP_Links_List_Table prints them (column_name()
 * with handle_row_actions(), column_url(), column_categories(), column_rel(), column_visible(),
 * column_rating(), column_default()), from the row's data (wp_admin_links_list_row()). Names,
 * addresses and categories are text; plugin columns are their HTML (kit/LegacyHtml), as classic
 * prints them.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** Whether a row action deletes through a route WordPress described (`{ method: 'DELETE', path }`). Pure. */
export const isDelete = ( request ) => Boolean( request ) && request.method === 'DELETE' && typeof request.path === 'string' && request.path !== '';

/** The row actions to show, in order: those with an address and Delete with its route. Pure. */
export function linkActions( actions ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && (
		( typeof action.url === 'string' && action.url !== '' ) || isDelete( action.request )
	) );
}

/** An address a link of the list may lead to: http(s) as it is, anything else none (`#`). Pure. */
export const webHref = ( url ) => ( /^https?:\/\//i.test( text( url ).trim() ) ? text( url ).trim() : '#' );

/** The name cell (column_name() and handle_row_actions()). */
const Name = {
	name: 'LinkManagerName',
	props: {
		item: { type: Object, required: true },
	},
	emits: [ 'act' ],
	setup( props, { emit } ) {
		const name = () => props.item.name ?? {};
		return {
			name, actionHref, isDelete,
			actions: () => linkActions( props.item.actions ),
			label: () => sprintf( decodeEntities( __( 'Edit &#8220;%s&#8221;', 'default' ) ), text( name().text ) ),
			onAction: ( action, event ) => {
				event?.preventDefault?.();
				emit( 'act', props.item, action );
			},
		};
	},
	template: `
		<strong><a v-if="name().editUrl" class="row-title" :href="actionHref( { url: name().editUrl } )" :aria-label="label()">{{ name().text ?? '' }}</a><template v-else>{{ name().text ?? '' }}</template></strong>
		<div v-if="actions().length" class="row-actions"><span v-for="( action, index ) in actions()" :key="action.action" :class="action.action"><a v-if="isDelete( action.request )" href="#" :class="action.classes" @click="onAction( action, $event )">{{ action.text }}</a><a v-else :href="actionHref( action )" :class="action.classes">{{ action.text }}</a>{{ index < actions().length - 1 ? ' | ' : '' }}</span></div>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table). Emits `act( item, action )` for Delete.
 */
export default {
	name: 'LinkManagerCell',
	components: { Name, LegacyHtml, InertHtml },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
	},
	emits: [ 'act' ],
	setup( props, { emit } ) {
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const categories = () => ( Array.isArray( props.item?.categories ) ? props.item.categories : [] );
		return {
			cellHtml, categories, webHref,
			categoryError: () => ( props.item?.categories && ! Array.isArray( props.item.categories ) ? text( props.item.categories.error ) : null ),
			href: ( path ) => adminHref( path ),
			onAct: ( ...args ) => emit( 'act', ...args ),
		};
	},
	template: `
		<Name v-if="column.key === 'name'" :item="item" @act="onAct" />
		<a v-else-if="column.key === 'url'" :href="webHref( item.url?.href )">{{ item.url?.text ?? '' }}</a>
		<template v-else-if="column.key === 'categories'"><template v-if="categoryError() !== null">{{ categoryError() }}</template><template v-else><template v-for="( category, index ) in categories()" :key="index"><template v-if="index > 0">, </template><a v-if="category.url ? href( category.url ) !== '' : false" :href="href( category.url )">{{ category.name }}</a><template v-else>{{ category.name }}</template></template></template></template>
		<template v-else-if="column.key === 'rel'"><template v-if="item.rel">{{ item.rel }}</template><br v-else /></template>
		<template v-else-if="column.key === 'visible'">{{ item.visible ?? '' }}</template>
		<template v-else-if="column.key === 'rating'">{{ String( item.rating ?? '' ) }}</template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
