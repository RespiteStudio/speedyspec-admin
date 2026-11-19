import { computed } from 'vue';
import { __, sprintf } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';

/**
 * Default implementation of core/dashboard-php-nag: the PHP update widget, in the markup
 * wp_dashboard_php_nag() prints (the message, "What is PHP…", the recommended version, "Learn
 * more about updating PHP", the host's annotation and its "Update PHP" button).
 *
 * WordPress decides which message shows (`insecure-future`, `insecure`, `future`, `outdated`),
 * the version, the recommended version and the addresses (filtered by the host); the box itself
 * (its title, warning icon and classes) is the holder's.
 */
export default {
	name: 'DashboardPhpNag',
	components: { SlotOutlet, Interpolate },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const version = computed( () => String( props.data.phpVersion ?? '' ) );
		const message = computed( () => {
			switch ( props.data.message ) {
				case 'insecure-future':
					/* translators: %s: The server PHP version. */
					return sprintf( __( 'Your site is running on an outdated version of PHP (%s), which does not receive security updates and soon will not be supported by WordPress. Ensure that PHP is updated on your server as soon as possible. Otherwise you will not be able to upgrade WordPress.', 'default' ), version.value );
				case 'insecure':
					/* translators: %s: The server PHP version. */
					return sprintf( __( 'Your site is running on an outdated version of PHP (%s), which does not receive security updates. It should be updated.', 'default' ), version.value );
				case 'future':
					/* translators: %s: The server PHP version. */
					return sprintf( __( 'Your site is running on an outdated version of PHP (%s), which soon will not be supported by WordPress. Ensure that PHP is updated on your server as soon as possible. Otherwise you will not be able to upgrade WordPress.', 'default' ), version.value );
				case 'outdated':
					/* translators: %s: The server PHP version. */
					return sprintf( __( 'Your site is running on an outdated version of PHP (%s), which should be updated.', 'default' ), version.value );
				default:
					return null;
			}
		} );
		// Strings with markup or character references are kept out of the template.
		const text = {
			about: computed( () => __( 'PHP is one of the programming languages used to build WordPress. Newer versions of PHP receive regular security updates and may increase your site&#8217;s performance.', 'default' ) ),
			/* translators: %s: The minimum recommended PHP version. */
			recommended: computed( () => sprintf( __( 'The minimum recommended version of PHP is %s.', 'default' ), String( props.data.recommendedVersion ?? '' ) ) ),
			/* translators: %s: Default Update PHP page URL. */
			annotation: computed( () => __( 'This resource is provided by your web host, and is specific to your site. For more information, <a href="%s" target="_blank">see the official WordPress documentation</a>.', 'default' ) ),
		};
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { message, text, slotContext, annotationLink: ( [ href ] ) => ( { href, target: '_blank' } ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<template v-if="message">
			<p class="bigger-bolder-text">{{ message }}</p>

			<p>{{ $__( 'What is PHP and how does it affect my site?', 'default' ) }}</p>
			<p>
				<Interpolate :text="text.about.value" />
				<template v-if="data.recommendedVersion">{{ ' ' + text.recommended.value }}</template>
			</p>

			<p class="button-container">
				<a class="button button-primary" :href="data.updateUrl" target="_blank">{{ $__( 'Learn more about updating PHP', 'default' ) }}<span class="screen-reader-text">{{ ' ' + $__( '(opens in a new tab)', 'default' ) }}</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a>
			</p>
			<p v-if="data.defaultUpdateUrl" class="description"><Interpolate :text="text.annotation.value" :args="[ data.defaultUpdateUrl ]" :tags="{ a: annotationLink }" /></p>
			<p v-if="data.directUpdateUrl" class="button-container"><a class="button button-primary" :href="data.directUpdateUrl" target="_blank">{{ $__( 'Update PHP', 'default' ) }}<span class="screen-reader-text">{{ ' ' + $__( '(opens in a new tab)', 'default' ) }}</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a></p>
		</template>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
