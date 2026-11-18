import { computed } from 'vue';
import { __, sprintf } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';
import { safeUrl } from '../../../kit/url.js';

/**
 * The Site Icon row of General Settings (part of the page's implementation).
 *
 * The classic control chooses the image in the media library modal, a large classic
 * application that is not converted: this shows the current icon and links to the
 * Customizer's Site Identity section, which the admin opens as a hosted screen.
 */
export default {
	name: 'SiteIcon',
	components: { Interpolate },
	props: {
		icon: { type: Object, required: true },
		// Admin URL prefix of the site, e.g. `/wp-admin/`.
		base: { type: String, required: true },
	},
	setup( props ) {
		const filename = computed( () => String( props.icon.url ?? '' ).split( '?' )[ 0 ].split( '/' ).pop() ?? '' );
		const alt = computed( () => ( props.icon.alt
			? /* translators: %s: The selected image alt text. */ sprintf( __( 'App icon preview: Current image: %s', 'default' ), props.icon.alt )
			: /* translators: %s: The selected image filename. */ sprintf( __( 'App icon preview: The current image has no alternative text. The file name is: %s', 'default' ), filename.value ) ) );
		const description = computed( () => __( 'The Site Icon is what you see in browser tabs, bookmark bars, and within the WordPress mobile apps. It should be square and at least <strong>%1$s by %2$s</strong> pixels.', 'default' ) );
		const customize = computed( () => props.base + 'customize.php?autofocus%5Bsection%5D=title_tagline' );
		// The image source comes from the data: http(s) only.
		const src = computed( () => safeUrl( String( props.icon.url ?? '' ), { protocols: [ 'http:', 'https:' ] } ) );
		const shown = computed( () => Boolean( props.icon.id ) && src.value !== null );
		return { alt, description, customize, shown, src };
	},
	template: `
		<div v-if="shown" id="site-icon-preview" class="site-icon-preview settings has-site-icon">
			<img id="app-icon-preview" :src="src" class="app-icon-preview" :alt="alt">
		</div>
		<div class="site-icon-action-buttons">
			<a class="button" :href="customize">{{ icon.id ? $__( 'Change Site Icon', 'default' ) : $__( 'Choose a Site Icon', 'default' ) }}</a>
		</div>
		<p class="description"><Interpolate :text="description" :args="[ '512', '512' ]" :tags="{ strong: {} }" /></p>
	`,
};
