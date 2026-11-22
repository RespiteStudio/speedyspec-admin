import InertHtml from '../../../kit/InertHtml.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { adminHref } from '../dashboard-parts/links.js';
import { actionHref } from '../list-table-parts/row-actions.js';

/*
 * The cells of a terms list row, in the markup WP_Terms_List_Table prints them (column_name() with
 * the Quick Edit data, handle_row_actions(), column_description(), column_slug(), column_posts(),
 * column_links(), column_default()), from the row's data (wp_admin_terms_list_row()). The name
 * (escaped, its level's pad included) and the description (kses'd) are content and show through
 * kit/InertHtml, which runs nothing; HTML that plugins filter (the row actions, plugin columns)
 * through kit/LegacyHtml, as classic prints it.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** Whether a row action deletes through a route WordPress described (`{ method: 'DELETE', path }`). Pure. */
export const isDelete = ( request ) => Boolean( request ) && request.method === 'DELETE' && typeof request.path === 'string' && request.path !== '';

/**
 * The row actions to show, in order: those with an address, Quick Edit (the page opens its form)
 * and Delete with its route. Pure.
 */
export function termActions( actions ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && (
		( typeof action.url === 'string' && action.url !== '' ) || action.action === 'inline' || isDelete( action.request )
	) );
}

/** The name cell (column_name() and handle_row_actions()). */
const Name = {
	name: 'EditTagsName',
	components: { InertHtml, LegacyHtml },
	props: {
		item: { type: Object, required: true },
		expanded: { type: Boolean, default: false },
		buttonRef: { type: Function, default: null },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const name = () => props.item.name ?? {};
		return {
			name, actionHref, isDelete,
			actions: () => termActions( props.item.actions ),
			onAction: ( action, event ) => {
				event?.preventDefault?.();
				emit( 'act', props.item, action, event );
			},
			onActionsHtml: ( event ) => emit( 'actions-html', props.item, event ),
			buttonEl: ( element ) => props.buttonRef?.( props.item.id, element ),
		};
	},
	template: `
		<strong><a v-if="name().editUrl" class="row-title" :href="actionHref( { url: name().editUrl } )"><InertHtml tag="span" :html="name().html ?? ''" /></a><InertHtml v-else tag="span" :html="name().html ?? ''" /></strong><br />
		<div v-if="item.inline" class="hidden" :id="'inline_' + item.id"><div class="name">{{ item.inline.name }}</div><div class="slug">{{ item.inline.slug }}</div><div class="parent">{{ item.inline.parent }}</div></div>
		<LegacyHtml v-if="typeof item.actionsHtml === 'string'" class="row-actions" :html="item.actionsHtml" @click="onActionsHtml" />
		<div v-else-if="actions().length" class="row-actions"><span v-for="( action, index ) in actions()" :key="action.action" :class="action.classes"><button v-if="action.action === 'inline'" :ref="buttonEl" type="button" class="button-link editinline" :aria-label="action.ariaLabel" :aria-expanded="expanded ? 'true' : 'false'" @click="onAction( action, $event )">{{ action.text }}</button><a v-else-if="isDelete( action.request )" href="#" class="delete-tag aria-button-if-js" role="button" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</a><a v-else-if="action.newTab" :href="actionHref( action )" target="_blank" :aria-label="action.ariaLabel">{{ action.text }}</a><a v-else :href="actionHref( action )" :aria-label="action.ariaLabel">{{ action.text }}</a>{{ index < actions().length - 1 ? ' | ' : '' }}</span></div>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table).
 *
 * Emits `act( item, action, event )` for Quick Edit and Delete, and `actions-html( item, event )`
 * for a click in the row actions plugins filtered. `buttonRef( id, element )` gives the page the
 * Quick Edit buttons (the focus comes back to them), `expanded` whether Quick Edit is open on this
 * row (its `aria-expanded`).
 */
export default {
	name: 'EditTagsCell',
	components: { Name, LegacyHtml, InertHtml },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
		expanded: { type: Boolean, default: false },
		buttonRef: { type: Function, default: null },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const count = () => ( props.item?.count && typeof props.item.count === 'object' ? props.item.count : null );
		return {
			cellHtml, count,
			href: ( path ) => adminHref( path ),
			isCount: () => props.column.key === 'posts' || props.column.key === 'links',
			onAct: ( ...args ) => emit( 'act', ...args ),
			onActionsHtml: ( ...args ) => emit( 'actions-html', ...args ),
		};
	},
	template: `
		<Name v-if="column.key === 'name'" :item="item" :expanded="expanded" :button-ref="buttonRef" @act="onAct" @actions-html="onActionsHtml" />
		<template v-else-if="column.key === 'description'"><InertHtml v-if="typeof item.description === 'string'" tag="span" :html="item.description" /><template v-else><span aria-hidden="true">{{ '—' }}</span><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'No description', 'default' ) }}</span></template></template>
		<template v-else-if="column.key === 'slug'">{{ item.slug ?? '' }}</template>
		<template v-else-if="isCount()"><template v-if="count()"><a v-if="count().url ? href( count().url ) !== '' : false" :href="href( count().url )">{{ count().text }}</a><template v-else>{{ count().text }}</template></template></template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
