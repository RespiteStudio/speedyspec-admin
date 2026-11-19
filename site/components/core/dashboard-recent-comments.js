import { computed } from 'vue';
import { __, _x } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The row actions as _wp_dashboard_recent_comments_row() labels them: the link text, the
 * accessible name and the link's classes, by action (`approve`, `unapprove`, `edit`, `spam`,
 * `trash`, `delete`, `view`).
 */
function actionLabels() {
	return {
		approve: { text: __( 'Approve', 'default' ), label: __( 'Approve this comment', 'default' ), class: 'vim-a aria-button-if-js' },
		unapprove: { text: __( 'Unapprove', 'default' ), label: __( 'Unapprove this comment', 'default' ), class: 'vim-u aria-button-if-js' },
		edit: { text: __( 'Edit', 'default' ), label: __( 'Edit this comment', 'default' ), class: null },
		/* translators: "Mark as spam" link. */
		spam: { text: _x( 'Spam', 'verb', 'default' ), label: __( 'Mark this comment as spam', 'default' ), class: 'vim-s vim-destructive aria-button-if-js' },
		trash: { text: _x( 'Trash', 'verb', 'default' ), label: __( 'Move this comment to the Trash', 'default' ), class: 'delete vim-d vim-destructive aria-button-if-js' },
		delete: { text: __( 'Delete Permanently', 'default' ), label: __( 'Delete this comment permanently', 'default' ), class: 'delete vim-d vim-destructive aria-button-if-js' },
		view: { text: __( 'View', 'default' ), label: __( 'View this comment', 'default' ), class: 'comment-link' },
	};
}

/**
 * The row actions to show, in order, each with the separator WordPress says precedes it
 * (`separator`, the classic row's rule). Actions without an address (Reply, which opens the
 * inline reply form of the classic screen's script) are left out until the Dashboard moderates
 * comments itself. Pure.
 *
 * @param {object[]|null} actions The row's `actions`.
 * @return {object[]} Each `{ action, url, hidden, separator }`.
 */
export function rowActions( actions ) {
	return list( actions ).filter( ( action ) => typeof action?.url === 'string' && action.url !== '' ).map( ( action ) => ( { ...action, separator: action.separator === true } ) );
}

/**
 * Default implementation of core/dashboard-recent-comments: the Recent Comments widget, in the
 * markup wp_dashboard_recent_comments() prints (`#latest-comments`, `#the-comment-list` with a
 * row per comment, the comment views), or "No comments to show.".
 *
 * Which comments, their classes, author, avatar, excerpt, which row actions apply and their
 * addresses, and the views with their counts come as data; HTML that plugins filter (the author
 * link, the avatar, the row actions, the views) comes as HTML (kit/LegacyHtml). The row actions
 * lead to the classic `comment.php` actions.
 */
export default {
	name: 'DashboardRecentComments',
	components: { SlotOutlet, Interpolate, LegacyHtml, Format },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const comments = computed( () => list( props.data.comments ) );
		const views = computed( () => list( props.data.views ) );
		const viewsHtml = computed( () => ( Array.isArray( props.data.viewsHtml ) ? props.data.viewsHtml : null ) );
		const labels = computed( actionLabels );
		const text = {
			/* translators: 1: Comment author, 2: Post link, 3: Notification if the comment is pending. */
			fromOn: computed( () => __( 'From %1$s on %2$s %3$s', 'default' ) ),
			/* translators: 1: Comment author, 2: Notification if the comment is pending. */
			from: computed( () => __( 'From %1$s %2$s', 'default' ) ),
			/* translators: 1: Type of comment, 2: Post link, 3: Notification if the comment is pending. */
			typeOn: computed( () => _x( '%1$s on %2$s %3$s', 'dashboard', 'default' ) ),
			/* translators: 1: Type of comment, 2: Notification if the comment is pending. */
			type: computed( () => _x( '%1$s %2$s', 'dashboard', 'default' ) ),
		};
		const countArgs = ( view ) => [ { tag: 'span', attributes: { class: view.countClass }, text: String( view.countText ?? view.count ?? '' ) } ];
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		// As the classic row: a comment (not a pingback or other type) with its avatar shown.
		const hasAvatar = ( comment ) => comment.type === 'comment' && Boolean( comment.avatar || comment.avatarHtml );
		return { comments, views, viewsHtml, labels, text, countArgs, rowActions, hasAvatar, slotContext, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<p v-if="! comments.length">{{ $__( 'No comments to show.', 'default' ) }}</p>
		<div v-else id="latest-comments" class="activity-block table-view-list">
			<ul id="the-comment-list">
				<li v-for="comment in comments" :key="comment.id" :id="'comment-' + comment.id" :class="comment.classes">
					<LegacyHtml v-if="comment.avatarHtml" tag="span" :html="comment.avatarHtml" :assets="assets" />
					<img v-else-if="comment.avatar" alt="" :src="comment.avatar" class="avatar avatar-50 photo" height="50" width="50" loading="lazy" decoding="async">
					<div :class="[ 'dashboard-comment-wrap', 'has-row-actions', { 'has-avatar': hasAvatar( comment ) } ]">
						<p class="comment-meta">
							<Format :text="comment.type === 'comment' ? ( comment.post ? text.fromOn.value : text.from.value ) : ( comment.post ? text.typeOn.value : text.type.value )">
								<template #arg1>
									<cite v-if="comment.type === 'comment'" class="comment-author">
										<LegacyHtml v-if="comment.author.html" tag="span" :html="comment.author.html" :assets="assets" />
										<a v-else-if="comment.author.url" :href="comment.author.url" class="url" :rel="comment.author.rel">{{ comment.author.name }}</a>
										<template v-else>{{ comment.author.name }}</template>
									</cite>
									<strong v-else>{{ comment.typeLabel }}</strong>
								</template>
								<template #arg2>
									<a v-if="comment.post" :href="comment.post.url">{{ comment.post.title }}</a>
									<span v-else class="approve">{{ $__( '[Pending]', 'default' ) }}</span>
								</template>
								<template #arg3><span class="approve">{{ $__( '[Pending]', 'default' ) }}</span></template>
							</Format>
						</p>
						<p v-if="comment.type !== 'comment'" class="comment-author">
							<LegacyHtml v-if="comment.author.html" tag="span" :html="comment.author.html" :assets="assets" />
							<a v-else-if="comment.author.url" :href="comment.author.url" class="url" :rel="comment.author.rel">{{ comment.author.name }}</a>
							<template v-else>{{ comment.author.name }}</template>
						</p>
						<blockquote><p>{{ comment.excerpt }}</p></blockquote>
						<p v-if="comment.actionsHtml" class="row-actions"><LegacyHtml tag="span" :html="comment.actionsHtml" :assets="assets" /></p>
						<p v-else-if="rowActions( comment.actions ).length" class="row-actions"><span v-for="action in rowActions( comment.actions )" :key="action.action" :class="[ action.action, { hidden: action.hidden } ]"><template v-if="action.separator"> | </template><a :href="href( action.url )" :class="labels[ action.action ]?.class ?? null" :aria-label="labels[ action.action ]?.label ?? null">{{ labels[ action.action ]?.text ?? action.action }}</a></span></p>
					</div>
				</li>
			</ul>
			<template v-if="viewsHtml || views.length">
				<!-- translators: Hidden accessibility text. -->
				<h3 class="screen-reader-text">{{ $__( 'View more comments', 'default' ) }}</h3>
				<ul class="subsubsub">
					<template v-if="viewsHtml">
						<template v-for="( view, index ) in viewsHtml" :key="view.key"><li :class="view.key"><LegacyHtml tag="span" :html="view.html" :assets="assets" /><template v-if="index < viewsHtml.length - 1">{{ ' |' }}</template></li>{{ ' ' }}</template>
					</template>
					<template v-else>
						<template v-for="( view, index ) in views" :key="view.key"><li :class="view.key"><a :href="href( view.url )" :class="{ current: view.current }" :aria-current="view.current ? 'page' : null"><Interpolate :text="view.format ?? view.label" :args="countArgs( view )" :tags="{ span: { class: 'count' } }" /></a><template v-if="index < views.length - 1">{{ ' |' }}</template></li>{{ ' ' }}</template>
					</template>
				</ul>
			</template>
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
