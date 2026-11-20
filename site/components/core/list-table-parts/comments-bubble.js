import { adminHref } from '../dashboard-parts/links.js';

/*
 * A post's comment bubble, comments_bubble()'s markup, shared by the list pages whose rows show
 * one (the Comments list's "In response to" column, the Posts list's Comments column).
 */

/** A post's comment bubble: comments_bubble()'s markup, from _wp_admin_comments_bubble(). */
const Bubble = {
	name: 'CommentsBubble',
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

export default Bubble;
