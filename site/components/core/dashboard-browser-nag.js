import { computed } from 'vue';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';

const CLASS_NAME = /^[A-Za-z0-9_ -]*$/;

/**
 * The class of each link of a translated string, by the number of the placeholder in its `href`
 * (`%1$s`, or the Nth `%s`): `{ 1: 'update-browser-link', 3: 'browse-happy-link' }`. Only plain
 * class names are kept. Pure.
 *
 * @param {string} text Translated string.
 * @return {Object<number, string>} Classes by placeholder number.
 */
export function linkClasses( text ) {
	const classes = {};
	let next = 0;
	for ( const match of String( text ?? '' ).matchAll( /<a\s([^>]*)>|%(?:(\d+)\$)?s/g ) ) {
		if ( match[ 1 ] === undefined ) {
			next = match[ 2 ] ? next : next + 1;
			continue;
		}
		const href = /href="%(?:(\d+)\$)?s"/.exec( match[ 1 ] );
		const name = /class="([^"]*)"/.exec( match[ 1 ] );
		if ( href ) {
			const number = href[ 1 ] ? Number( href[ 1 ] ) : ++next;
			if ( name && CLASS_NAME.test( name[ 1 ] ) ) {
				classes[ number ] = name[ 1 ];
			}
		}
	}
	return classes;
}

/** An address argument of a link, with the link's class; shown as the address if a translation puts it in text. */
const linkArg = ( url, className ) => ( { url: String( url ?? '' ), className: className ?? null, toString: () => String( url ?? '' ) } );

/** The attributes of a link tag from the address argument its `href` placeholder took. */
const linkTag = ( [ arg ] ) => ( { href: arg?.url ?? String( arg ?? '' ), class: arg?.className ?? null } );

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
		// The Browse Happy line's arguments: each link's address carries the class its tag has in
		// the translated string (kit/Interpolate keeps no attribute written in a string).
		const happyArgs = computed( () => {
			const classes = linkClasses( text.update.value );
			return [ linkArg( props.data.updateUrl, classes[ 1 ] ), String( props.data.name ?? '' ), linkArg( props.data.browseHappyUrl, classes[ 3 ] ) ];
		} );
		const learnArgs = computed( () => [ linkArg( props.data.browseHappyUrl, linkClasses( text.learn.value )[ 1 ] ) ] );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { text, browserLink, happyArgs, learnArgs, linkTag, slotContext };
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
				<Interpolate v-if="data.message === 'ie'" :text="text.learn.value" :args="learnArgs" :tags="{ a: linkTag }" />
				<Interpolate v-else :text="text.update.value" :args="happyArgs" :tags="{ a: linkTag }" />
			</p>
			<p class="hide-if-no-js"><a href="" class="dismiss" :aria-label="$__( 'Dismiss the browser warning panel', 'default' )">{{ $__( 'Dismiss', 'default' ) }}</a></p>
			<div class="clear"></div>
		</template>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
