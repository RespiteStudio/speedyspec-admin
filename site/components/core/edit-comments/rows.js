import InertHtml from '../../../kit/InertHtml.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import Format from '../dashboard-parts/format.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The cells of a Comments list row, in the markup WP_Comments_List_Table prints them
 * (column_author(), column_comment() with its `#inline-{id}` Quick Edit source and the row
 * actions of handle_row_actions(), column_response() with comments_bubble(), column_date()), from
 * the row's data (wp_admin_comments_list_row()). The comment's text is shown through kit/InertHtml,
 * which runs nothing; HTML that plugins filter (the author name, the avatar, the row actions, the
 * post thumbnail, plugin columns) through kit/LegacyHtml, as classic prints it.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** Whether a row action calls a route WordPress described. Pure. */
export function isRequest( request ) {
	return Boolean( request ) && typeof request.route === 'string' && request.route !== '' && ( request.method === 'POST' || request.method === 'DELETE' );
}

/** The inline form a row action opens (`edit` for Quick Edit, `replyto` for Reply), or null. Pure. */
export function inlineAction( action ) {
	if ( action?.action === 'quickedit' ) {
		return 'edit';
	}
	return action?.action === 'reply' ? 'replyto' : null;
}

/** The row actions to show: each with a route or an address. Pure. */
export function shownActions( actions ) {
	return list( actions ).filter( ( action ) => action && typeof action.action === 'string' && ( isRequest( action.request ) || ( typeof action.url === 'string' && action.url !== '' ) ) );
}

/** The author of a row: column_author()'s markup. */
const Author = {
	name: 'EditCommentsAuthor',
	components: { LegacyHtml },
	props: {
		author: { type: Object, required: true },
	},
	setup: () => ( { href: ( path ) => adminHref( path ) } ),
	template: `
		<strong><LegacyHtml v-if="author.nameHtml" tag="span" :html="author.nameHtml" /><template v-else><LegacyHtml v-if="author.avatarHtml" tag="span" :html="author.avatarHtml" /><img v-else-if="author.avatar" alt="" :src="author.avatar" class="avatar avatar-32 photo" height="32" width="32" loading="lazy" decoding="async" />{{ author.avatar || author.avatarHtml ? ' ' : '' }}{{ author.name }}</template></strong><br />
		<template v-if="author.url ? Boolean( author.urlDisplay ) : false"><a :href="author.url" rel="noopener noreferrer">{{ author.urlDisplay }}</a><br /></template>
		<template v-if="author.email"><a :href="'mailto:' + author.email">{{ author.email }}</a><br /></template>
		<a v-if="author.ip ? Boolean( author.ipUrl ) : false" :href="href( author.ipUrl )">{{ author.ip }}</a>
	`,
};

/** A post's comment bubble: comments_bubble()'s markup, from _wp_admin_comments_bubble(). */
export const Bubble = {
	name: 'EditCommentsBubble',
	props: {
		bubble: { type: Object, required: true },
	},
	setup: () => ( { href: ( path ) => adminHref( path ) } ),
	template: `
		<template v-if="bubble.kind === 'none'"><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ bubble.approvedLabel }}</span></template>
		<template v-else-if="bubble.kind === 'approved'">
			<a v-if="bubble.approvedUrl" :href="href( bubble.approvedUrl )" class="post-com-count post-com-count-approved"><span class="comment-count-approved" aria-hidden="true">{{ bubble.approvedText }}</span><span class="screen-reader-text">{{ bubble.approvedLabel }}</span></a>
			<span v-else class="post-com-count post-com-count-approved"><span class="comment-count-approved" aria-hidden="true">{{ bubble.approvedText }}</span><span class="screen-reader-text">{{ bubble.approvedLabel }}</span></span>
		</template>
		<span v-else class="post-com-count post-com-count-no-comments"><span class="comment-count comment-count-no-comments" aria-hidden="true">{{ bubble.approvedText }}</span><span class="screen-reader-text">{{ bubble.approvedLabel }}</span></span>
		<a v-if="bubble.pending > 0 ? Boolean( bubble.pendingUrl ) : false" :href="href( bubble.pendingUrl )" class="post-com-count post-com-count-pending"><span class="comment-count-pending" aria-hidden="true">{{ bubble.pendingText }}</span><span class="screen-reader-text">{{ bubble.pendingLabel }}</span></a>
		<span v-else class="post-com-count post-com-count-pending post-com-count-no-pending"><span class="comment-count comment-count-no-pending" aria-hidden="true">{{ bubble.pendingText }}</span><span class="screen-reader-text">{{ bubble.pendingLabel }}</span></span>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table).
 *
 * Emits `act( item, action, event )` for a row action that calls a route or opens an inline form,
 * `actions-html( item, event )` for a click in the row actions plugins filtered, and `toggle( item )`
 * when the comment's text is double-clicked (edit-comments.js:809). `buttonRef( id, action )` gives
 * the Reply and Quick Edit buttons to the page (focus comes back to them), and `expanded` is the
 * inline form open on this row (`edit` or `replyto`), for their `aria-expanded`.
 */
export default {
	name: 'EditCommentsCell',
	components: { Author, Bubble, InertHtml, LegacyHtml, Format },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
		expanded: { type: String, default: null },
		buttonRef: { type: Function, default: null },
	},
	emits: [ 'act', 'actions-html', 'toggle' ],
	setup( props, { emit } ) {
		const href = ( path ) => adminHref( path );
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const actions = () => shownActions( props.item.actions );
		const onAction = ( action, event ) => {
			event?.preventDefault?.();
			emit( 'act', props.item, action, event );
		};
		const linkRole = ( action ) => ( list( action.linkClasses ).includes( 'aria-button-if-js' ) ? 'button' : null );
		return {
			href, cellHtml, actions, onAction, linkRole, inlineAction,
			buttonEl: ( action ) => ( element ) => props.buttonRef?.( props.item.id, action.action, element ),
			onActionsHtml: ( event ) => emit( 'actions-html', props.item, event ),
			onToggle: () => emit( 'toggle', props.item ),
		};
	},
	template: `
		<template v-if="column.key === 'author'"><Author :author="item.author" /></template>
		<template v-else-if="column.key === 'comment'">
			<div class="comment-author"><Author :author="item.author" /></div>
			<template v-if="item.parent"><Format :text="$__( 'In reply to %s.', 'default' )"><template #arg1><a :href="item.parent.url">{{ item.parent.name }}</a></template></Format></template>
			<InertHtml :html="item.contentHtml ?? ''" @dblclick="onToggle" />
			<div v-if="item.inline" :id="'inline-' + item.id" class="hidden">
				<textarea class="comment" rows="1" cols="1" :value="item.inline.content" readonly></textarea>
				<div class="author-email">{{ item.inline.email }}</div>
				<div class="author">{{ item.inline.author }}</div>
				<div class="author-url">{{ item.inline.url }}</div>
				<div class="comment_status">{{ item.inline.status }}</div>
			</div>
			<LegacyHtml v-if="item.actionsHtml" :class="[ 'row-actions', { visible: item.actionsVisible } ]" :html="item.actionsHtml" @click="onActionsHtml" />
			<div v-else-if="actions().length" :class="[ 'row-actions', { visible: item.actionsVisible } ]"><span v-for="action in actions()" :key="action.action" :class="action.classes"><template v-if="action.separator"> | </template><button v-if="inlineAction( action )" :ref="buttonEl( action )" type="button" :data-comment-id="String( item.id )" :data-post-id="String( item.postId )" :data-action="inlineAction( action )" :class="action.linkClasses" :aria-expanded="expanded === inlineAction( action ) ? 'true' : 'false'" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</button><a v-else-if="action.request" :href="href( action.url )" :class="action.linkClasses" :role="linkRole( action )" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</a><a v-else :href="href( action.url )" :class="action.linkClasses?.length ? action.linkClasses : null" :aria-label="action.ariaLabel">{{ action.text }}</a></span></div>
		</template>
		<template v-else-if="column.key === 'response'">
			<div v-if="item.response" class="response-links"><LegacyHtml v-if="item.response.thumbnailHtml" tag="span" :html="item.response.thumbnailHtml" /><a v-if="item.response.editUrl" :href="href( item.response.editUrl )" class="comments-edit-item-link">{{ item.response.title }}</a><template v-else>{{ item.response.title }}</template><a :href="item.response.viewUrl" class="comments-view-item-link">{{ item.response.viewLabel }}</a><span :class="[ 'post-com-count-wrapper', 'post-com-count-' + item.postId ]"><Bubble v-if="item.response.bubble" :bubble="item.response.bubble" /></span>{{ ' ' }}</div>
		</template>
		<template v-else-if="column.key === 'date'">
			<div class="submitted-on"><a v-if="item.date?.url" :href="item.date.url">{{ item.date.text }}</a><template v-else>{{ item.date?.text }}</template></div>
		</template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
