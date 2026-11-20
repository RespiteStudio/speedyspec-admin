import InertHtml from '../../../kit/InertHtml.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import Bubble from '../list-table-parts/comments-bubble.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The cells of a Posts list row, in the markup WP_Posts_List_Table prints them (column_title()
 * with the lock, the level pads, the post states, the excerpt and the Quick Edit data,
 * handle_row_actions(), column_author(), column_default() for the taxonomies, column_comments(),
 * column_date()), from the row's data (wp_admin_posts_list_row()). The title, the "Parent Page:"
 * text, the states and the excerpt are content and show through kit/InertHtml, which runs
 * nothing; HTML that plugins filter (the row actions, the states, the term links, the date, the
 * avatar, plugin columns, add_inline_data) through kit/LegacyHtml, as classic prints it.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** Whether a row action calls a route WordPress described. Pure. */
export function isRequest( request ) {
	return Boolean( request ) && typeof request.route === 'string' && request.route !== '' && request.method === 'POST';
}

/** The row actions to show: Quick Edit, those with a route and those with an address. Pure. */
export function shownActions( actions ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && ( isRequest( action.request ) || ( typeof action.url === 'string' && action.url !== '' ) ) );
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

/** The title cell (column_title()). */
const Title = {
	name: 'EditPostsTitle',
	components: { InertHtml, LegacyHtml },
	props: {
		item: { type: Object, required: true },
		lock: { type: Object, default: null },
		expanded: { type: Boolean, default: false },
		buttonRef: { type: Function, default: null },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const title = () => props.item.title ?? {};
		const actions = () => shownActions( props.item.actions );
		return {
			title, actions, actionLinkClass, actionHref,
			pads: () => Math.max( 0, Number( title().pad ) || 0 ),
			hierarchyId: () => 'post-hierarchy-' + props.item.id,
			states: () => list( props.item.states ).filter( ( state ) => typeof state?.html === 'string' ),
			onAction: ( action, event ) => {
				if ( isRequest( action.request ) ) {
					event?.preventDefault?.();
					emit( 'act', props.item, action, event );
				}
			},
			onActionsHtml: ( event ) => emit( 'actions-html', props.item, event ),
			buttonEl: ( element ) => props.buttonRef?.( props.item.id, element ),
		};
	},
	template: `
		<div v-if="title().editUrl" class="locked-info"><span class="locked-avatar"><img v-if="lock?.avatarSrc" class="avatar avatar-18 photo" width="18" height="18" alt="" :src="lock.avatarSrc" :srcset="lock.avatarSrc2x ? lock.avatarSrc2x + ' 2x' : null" /><LegacyHtml v-else-if="lock?.avatarHtml" tag="span" :html="lock.avatarHtml" /></span>{{ ' ' }}<span class="locked-text">{{ lock?.text ?? '' }}</span></div>
		<strong><template v-for="n in pads()" :key="n"><span aria-hidden="true">{{ '—' }}</span>{{ ' ' }}</template><template v-if="title().editUrl"><a class="row-title" :href="actionHref( { url: title().editUrl } )" :aria-describedby="title().childOf ? hierarchyId() : null"><InertHtml tag="span" :html="title().html ?? ''" /><template v-if="title().noTitleExcerpt">{{ ' ' }}<span class="trimmed-post-excerpt">{{ title().noTitleExcerpt }}</span></template></a><span v-if="title().childOf" :id="hierarchyId()" class="hidden">{{ title().childOf }}</span></template><span v-else><InertHtml tag="span" :html="title().html ?? ''" /><template v-if="title().noTitleExcerpt">{{ ' ' }}<span class="trimmed-post-excerpt">{{ title().noTitleExcerpt }}</span></template><span v-if="title().childOf" :id="hierarchyId()" class="screen-reader-text">{{ ' (' + title().childOf + ')' }}</span></span><LegacyHtml v-if="typeof item.statesHtml === 'string'" tag="span" :html="item.statesHtml" /><template v-else-if="states().length">{{ ' — ' }}<span v-for="( state, index ) in states()" :key="state.key" class="post-state"><InertHtml tag="span" :html="state.html" />{{ index < states().length - 1 ? ', ' : '' }}</span></template><template v-if="title().parentText">{{ ' | ' }}<InertHtml tag="span" :html="title().parentText" /></template></strong>
		<template v-if="item.excerpt"><span v-if="item.excerpt.protected" class="protected-post-excerpt"><InertHtml tag="span" :html="item.excerpt.html ?? ''" /></span><InertHtml v-else tag="span" :html="item.excerpt.html ?? ''" /></template>
		<div v-if="typeof item.inlineHtml === 'string'" class="hidden" :id="'inline_' + item.id"><LegacyHtml :html="item.inlineHtml" /></div>
		<LegacyHtml v-if="typeof item.actionsHtml === 'string'" :class="[ 'row-actions', { visible: item.actionsVisible === true } ]" :html="item.actionsHtml" @click="onActionsHtml" />
		<div v-else-if="actions().length" :class="[ 'row-actions', { visible: item.actionsVisible === true } ]"><span v-for="( action, index ) in actions()" :key="action.action" :class="action.classes"><button v-if="action.action === 'inline'" :ref="buttonEl" type="button" class="button-link editinline" :aria-label="action.ariaLabel" :aria-expanded="expanded ? 'true' : 'false'" @click="onAction( action, $event )">{{ action.text }}</button><a v-else-if="action.newTab" :href="actionHref( action )" rel="bookmark" target="_blank" :aria-label="action.ariaLabel">{{ action.text }}</a><a v-else :href="actionHref( action )" :class="actionLinkClass( action )" :rel="action.action === 'view' ? 'bookmark' : null" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</a>{{ index < actions().length - 1 ? ' | ' : '' }}</span></div>
	`,
};

/** A taxonomy cell (column_default() for `categories`, `tags`, `taxonomy-{name}`). */
const Terms = {
	name: 'EditPostsTerms',
	components: { LegacyHtml },
	props: {
		terms: { type: Object, required: true },
	},
	setup: () => ( { href: ( path ) => adminHref( path ), list } ),
	template: `
		<LegacyHtml v-if="typeof terms.html === 'string'" tag="span" :html="terms.html" />
		<template v-else-if="list( terms.links ).length"><template v-for="( link, index ) in list( terms.links )" :key="index"><a :href="href( link.url )">{{ link.name }}</a>{{ index < list( terms.links ).length - 1 ? $__( ', ', 'default' ) : '' }}</template></template>
		<template v-else-if="terms.noTerms"><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ terms.noTerms }}</span></template>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table).
 *
 * Emits `act( item, action, event )` for a row action that calls a route or opens Quick Edit,
 * and `actions-html( item, event )` for a click in the row actions plugins filtered.
 * `buttonRef( id, element )` gives the page the Quick Edit buttons (the focus comes back to
 * them), `expanded` whether Quick Edit is open on this row (its `aria-expanded`), `lock` the lock
 * the row shows (state.js).
 */
export default {
	name: 'EditPostsCell',
	components: { Title, Terms, Bubble, LegacyHtml, InertHtml },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
		lock: { type: Object, default: null },
		expanded: { type: Boolean, default: false },
		buttonRef: { type: Function, default: null },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const terms = () => {
			const value = props.item?.terms?.[ props.column.key ];
			return value && typeof value === 'object' ? value : null;
		};
		return {
			cellHtml, terms,
			href: ( path ) => adminHref( path ),
			onAct: ( ...args ) => emit( 'act', ...args ),
			onActionsHtml: ( ...args ) => emit( 'actions-html', ...args ),
		};
	},
	template: `
		<Title v-if="column.key === 'title'" :item="item" :lock="lock" :expanded="expanded" :button-ref="buttonRef" @act="onAct" @actions-html="onActionsHtml" />
		<template v-else-if="column.key === 'author'"><a v-if="item.author" :href="href( item.author.url )">{{ item.author.name }}</a><template v-else><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ $__( '(no author)', 'default' ) }}</span></template></template>
		<Terms v-else-if="terms()" :terms="terms()" />
		<div v-else-if="column.key === 'comments'" class="post-com-count-wrapper"><Bubble v-if="item.bubble" :bubble="item.bubble" /></div>
		<template v-else-if="column.key === 'date'"><template v-if="item.date"><template v-if="typeof item.date.statusHtml === 'string'"><template v-if="item.date.statusHtml !== ''"><LegacyHtml tag="span" :html="item.date.statusHtml" /><br /></template></template><template v-else-if="item.date.status"><strong v-if="item.date.missed" class="error-message">{{ item.date.status }}</strong><template v-else>{{ item.date.status }}</template><br /></template><LegacyHtml v-if="typeof item.date.timeHtml === 'string'" tag="span" :html="item.date.timeHtml" /><template v-else>{{ item.date.time }}</template></template></template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
