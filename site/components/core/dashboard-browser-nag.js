import { computed } from 'vue';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';

/**
 * Default implementation of core/dashboard-browser-nag: the browser warning widget, in the markup
 * wp_dashboard_browser_nag() prints (the browser's icon, the message with its update link, the
 * Browse Happy line and Dismiss), or, when a plugin filters `browse-happy-notice`, what the
 * filter leaves (kit/LegacyHtml).
 *
 * WordPress decides which message shows (`ie`, `insecure`, `outdated`, from the browser's
 * `User-Agent`), the browser's name, image and update address, and the Browse Happy address in
 * the user's language. Dismiss (`a.dismiss`) hides the box: core/meta-box-holder handles it.
 */
export default {
	name: 'DashboardBrowserNag',
	components: { SlotOutlet, Interpolate, LegacyHtml },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		// Strings with markup or quotes are kept out of the template.
		const text = {
			ie: computed( () => __( 'Internet Explorer does not give you the best WordPress experience. Switch to Microsoft Edge, or another more modern browser to get the most from your site.', 'default' ) ),
			/* translators: %s: Browser name and link. */
			insecure: computed( () => __( "It looks like you're using an insecure version of %s. Using an outdated browser makes your computer unsafe. For the best WordPress experience, please update your browser.", 'default' ) ),
			/* translators: %s: Browser name and link. */
			outdated: computed( () => __( "It looks like you're using an old version of %s. For the best WordPress experience, please update your browser.", 'default' ) ),
			/* translators: %s: Browse Happy URL. */
			learn: computed( () => __( 'Learn how to <a href="%s" class="update-browser-link">browse happy</a>', 'default' ) ),
			/* translators: 1: Browser update URL, 2: Browser name, 3: Browse Happy URL. */
			update: computed( () => __( '<a href="%1$s" class="update-browser-link">Update %2$s</a> or learn how to <a href="%3$s" class="browse-happy-link">browse happy</a>', 'default' ) ),
		};
		const browserLink = computed( () => [ { tag: 'a', attributes: { href: props.data.updateUrl }, text: String( props.data.name ?? '' ) } ] );
		// Which link a tag of the Browse Happy line is, by the address its placeholder takes.
		const happyLink = ( [ url ] ) => ( { href: url, class: url === props.data.updateUrl ? 'update-browser-link' : 'browse-happy-link' } );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { text, browserLink, happyLink, slotContext };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<LegacyHtml v-if="typeof data.html === 'string'" :html="data.html" :assets="assets" />
		<template v-else-if="data.message">
			<div v-if="data.image" class="alignright browser-icon"><img :src="data.image" alt=""></div>
			<p :class="[ 'browser-update-nag', { 'has-browser-icon': data.image } ]">
				<template v-if="data.message === 'ie'">{{ text.ie.value }}</template>
				<Interpolate v-else :text="data.message === 'insecure' ? text.insecure.value : text.outdated.value" :args="browserLink" />
			</p>
			<p>
				<Interpolate v-if="data.message === 'ie'" :text="text.learn.value" :args="[ data.browseHappyUrl ]" :tags="{ a: ( [ url ] ) => ( { href: url, class: 'update-browser-link' } ) }" />
				<Interpolate v-else :text="text.update.value" :args="[ data.updateUrl, data.name, data.browseHappyUrl ]" :tags="{ a: happyLink }" />
			</p>
			<p class="hide-if-no-js"><a href="" class="dismiss" :aria-label="$__( 'Dismiss the browser warning panel', 'default' )">{{ $__( 'Dismiss', 'default' ) }}</a></p>
			<div class="clear"></div>
		</template>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
