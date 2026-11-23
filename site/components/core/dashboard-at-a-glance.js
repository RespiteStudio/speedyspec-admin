import { computed } from 'vue';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import AdminIcon from './dashboard-parts/icons.js';
import { adminHref } from './dashboard-parts/links.js';

/**
 * Default implementation of core/dashboard-at-a-glance: the At a Glance widget, in the markup
 * wp_dashboard_right_now() prints (`.main` with its list of counts, `#wp-version-message`, the
 * search engines line, then `.sub` with the storage quota and what plugins print at its end).
 *
 * Everything that depends on the site and the user comes as data: the published counts and
 * whether each links to its list, the comment counts (the moderated line `hidden` when there are
 * none), the version line (the theme linked when the user may switch themes, the "Update to"
 * button), the search engines line, the quota. Items plugins add (`dashboard_glance_items`), a
 * filtered version line (`update_right_now_text`) and the output of `rightnow_end` and
 * `activity_box_end` come as HTML (kit/LegacyHtml).
 */
export default {
	name: 'DashboardAtAGlance',
	components: { SlotOutlet, Interpolate, LegacyHtml, AdminIcon },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const counts = computed( () => ( Array.isArray( props.data.counts ) ? props.data.counts : [] ) );
		const glanceItems = computed( () => ( Array.isArray( props.data.glanceItems ) ? props.data.glanceItems : [] ) );
		const version = computed( () => props.data.version ?? {} );
		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		/* translators: 1: Version number, 2: Theme name. */
		const versionText = computed( () => __( 'WordPress %1$s running %2$s theme.', 'default' ) );
		const versionArgs = computed( () => [
			String( version.value.version ?? '' ),
			version.value.themesUrl ? { tag: 'a', attributes: { href: adminHref( version.value.themesUrl ) }, text: String( version.value.theme ?? '' ) } : String( version.value.theme ?? '' ),
		] );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { counts, glanceItems, version, versionText, versionArgs, slotContext, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<div class="main">
			<ul>
				<li v-for="item in counts" :key="item.type" :class="item.type + '-count'">
					<a v-if="item.url" :href="href( item.url )"><AdminIcon :name="item.type === 'post' ? 'pin' : 'page'" />{{ item.text }}</a>
					<span v-else><AdminIcon :name="item.type === 'post' ? 'pin' : 'page'" />{{ item.text }}</span>
				</li>
				<template v-if="data.comments">
					<li class="comment-count">
						<a :href="href( data.comments.approved.url )"><AdminIcon name="comment" /><span class="comments-count-text">{{ data.comments.approved.text }}</span></a>
					</li>
					<li :class="[ 'comment-mod-count', { hidden: data.comments.moderated.hidden } ]">
						<a :href="href( data.comments.moderated.url )"><AdminIcon name="post-comments" /><span class="comments-in-moderation-text">{{ data.comments.moderated.text }}</span></a>
					</li>
				</template>
				<li v-for="( item, index ) in glanceItems" :key="'glance-' + index"><LegacyHtml tag="span" :html="item" :assets="assets" /></li>
			</ul>
			<p id="wp-version-message">
				<span id="wp-version"><LegacyHtml v-if="typeof version.text === 'string'" tag="span" :html="version.text" :assets="assets" /><Interpolate v-else :text="versionText" :args="versionArgs" /></span>
				<a v-if="version.update" :href="href( version.update.url )" class="button" aria-describedby="wp-version">{{ version.update.text }}</a>
			</p>
			<p v-if="data.searchEngines" class="search-engines-info">
				<a :href="href( data.searchEngines.url )" :title="data.searchEngines.title || null"><AdminIcon name="info" />{{ data.searchEngines.text }}</a>
			</p>
		</div>
		<div v-if="data.quota || data.actions" class="sub">
			<template v-if="data.quota">
				<h3 class="mu-storage">{{ $__( 'Storage Space', 'default' ) }}</h3>
				<div class="mu-storage">
					<ul>
						<li class="storage-count">
							<a :href="href( data.quota.url )"><AdminIcon name="media" />{{ data.quota.allowed.text }}<span class="screen-reader-text"> ({{ $__( 'Manage Uploads', 'default' ) }})</span></a>
						</li><li :class="[ 'storage-count', { warning: data.quota.used.warning } ]">
							<a :href="href( data.quota.url )" class="musublink"><AdminIcon :name="data.quota.used.warning ? 'warning-triangle' : 'media'" />{{ data.quota.used.text }}<span class="screen-reader-text"> ({{ $__( 'Manage Uploads', 'default' ) }})</span></a>
						</li>
					</ul>
				</div>
			</template>
			<LegacyHtml v-if="data.actions" :html="data.actions" :assets="assets" />
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
