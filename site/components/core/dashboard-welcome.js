import { computed } from 'vue';
import { __, sprintf } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { decodeEntities } from '../../kit/Interpolate.js';
import { adminHref } from './dashboard-parts/links.js';

/**
 * Default implementation of core/dashboard-welcome: the Welcome panel's content, in the markup
 * wp_welcome_panel() prints (the header with wp-admin/images/dashboard-background.svg, inlined as
 * the classic panel inlines it, and the three columns).
 *
 * What depends on the site comes as data: the version shown (`displayVersion`), whether the theme
 * is a block theme (the second and third columns), whether the user may customize and the
 * Customizer's address.
 */
export default {
	name: 'DashboardWelcome',
	components: { SlotOutlet },
	props: {
		data: { type: Object, required: true },
		context: { type: String, default: 'site' },
	},
	setup( props ) {
		// Strings with character references are kept out of the template, which would decode them.
		const text = {
			/* translators: %s: Current WordPress version. */
			learnMore: computed( () => sprintf( __( 'Learn more about the %s version.', 'default' ), String( props.data.displayVersion ?? '' ) ) ),
			siteEditor: computed( () => decodeEntities( __( 'Design everything on your site &#8212; from the header down to the footer, all using blocks and patterns.', 'default' ) ) ),
			customizer: computed( () => decodeEntities( __( 'Configure your site&#8217;s logo, header, menus, and more in the Customizer.', 'default' ) ) ),
			styles: computed( () => decodeEntities( __( 'Switch up your site&#8217;s look & feel with Styles', 'default' ) ) ),
			stylesText: computed( () => decodeEntities( __( 'Tweak your site, or give it a whole new look! Get creative &#8212; how about a new color palette or font?', 'default' ) ) ),
			blockThemes: computed( () => decodeEntities( __( 'There is a new kind of WordPress theme, called a block theme, that lets you build the site you&#8217;ve always wanted &#8212; with blocks and styles.', 'default' ) ) ),
			blockThemesUrl: computed( () => __( 'https://wordpress.org/documentation/article/block-themes/', 'default' ) ),
		};
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { text, slotContext, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<div class="welcome-panel-content">
			<div class="welcome-panel-header-wrap">
				<div class="welcome-panel-header">
					<div class="welcome-panel-header-image">
						<svg preserveAspectRatio="xMidYMin slice" fill="none" viewBox="0 0 1232 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
						  <g clip-path="url(#a)">
						    <path fill="#151515" d="M0 0h1232v240H0z"/>
						    <ellipse cx="616" cy="232" fill="url(#b)" opacity=".05" rx="1497" ry="249"/>
						    <mask id="d" width="1000" height="400" x="232" y="20" maskUnits="userSpaceOnUse" style="mask-type:alpha">
						      <path fill="url(#c)" d="M0 0h1000v400H0z" transform="translate(232 20)"/>
						    </mask>
						    <g stroke-width="2" mask="url(#d)">
						      <path stroke="url(#e)" d="M387 20v1635"/>
						      <path stroke="url(#f)" d="M559.5 20v1635"/>
						      <path stroke="url(#g)" d="M732 20v1635"/>
						      <path stroke="url(#h)" d="M904.5 20v1635"/>
						      <path stroke="url(#i)" d="M1077 20v1635"/>
						    </g>
						  </g>
						  <defs>
						    <linearGradient id="e" x1="387.5" x2="387.5" y1="20" y2="1655" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#3858E9" stop-opacity="0"/>
						      <stop offset=".297" stop-color="#3858E9"/>
						      <stop offset=".734" stop-color="#3858E9"/>
						      <stop offset="1" stop-color="#3858E9" stop-opacity="0"/>
						      <stop offset="1" stop-color="#3858E9" stop-opacity="0"/>
						    </linearGradient>
						    <linearGradient id="f" x1="560" x2="560" y1="20" y2="1655" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#FFFCB5" stop-opacity="0"/>
						      <stop offset="0" stop-color="#FFFCB5" stop-opacity="0"/>
						      <stop offset=".297" stop-color="#FFFCB5"/>
						      <stop offset=".734" stop-color="#FFFCB5"/>
						      <stop offset="1" stop-color="#FFFCB5" stop-opacity="0"/>
						    </linearGradient>
						    <linearGradient id="g" x1="732.5" x2="732.5" y1="20" y2="1655" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#C7FFDB" stop-opacity="0"/>
						      <stop offset=".297" stop-color="#C7FFDB"/>
						      <stop offset=".693" stop-color="#C7FFDB"/>
						      <stop offset="1" stop-color="#C7FFDB" stop-opacity="0"/>
						    </linearGradient>
						    <linearGradient id="h" x1="905" x2="905" y1="20" y2="1655" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#FFB7A7" stop-opacity="0"/>
						      <stop offset=".297" stop-color="#FFB7A7"/>
						      <stop offset=".734" stop-color="#FFB7A7"/>
						      <stop offset="1" stop-color="#3858E9" stop-opacity="0"/>
						      <stop offset="1" stop-color="#FFB7A7" stop-opacity="0"/>
						    </linearGradient>
						    <linearGradient id="i" x1="1077.5" x2="1077.5" y1="20" y2="1655" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#7B90FF" stop-opacity="0"/>
						      <stop offset=".297" stop-color="#7B90FF"/>
						      <stop offset=".734" stop-color="#7B90FF"/>
						      <stop offset="1" stop-color="#3858E9" stop-opacity="0"/>
						      <stop offset="1" stop-color="#7B90FF" stop-opacity="0"/>
						    </linearGradient>
						    <radialGradient id="b" cx="0" cy="0" r="1" gradientTransform="matrix(0 249 -1497 0 616 232)" gradientUnits="userSpaceOnUse">
						      <stop stop-color="#3858E9"/>
						      <stop offset="1" stop-color="#151515" stop-opacity="0"/>
						    </radialGradient>
						    <radialGradient id="c" cx="0" cy="0" r="1" gradientTransform="matrix(0 765 -1912.5 0 500 -110)" gradientUnits="userSpaceOnUse">
						      <stop offset=".161" stop-color="#151515" stop-opacity="0"/>
						      <stop offset=".682"/>
						    </radialGradient>
						    <clipPath id="a">
						      <path fill="#fff" d="M0 0h1232v240H0z"/>
						    </clipPath>
						  </defs>
						</svg>
					</div>
					<h2>{{ $__( 'Welcome to WordPress!', 'default' ) }}</h2>
					<p>
						<a :href="href( 'about.php' )">{{ text.learnMore.value }}</a>
					</p>
				</div>
			</div>
			<div class="welcome-panel-column-container">
				<div class="welcome-panel-column">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
						<rect width="48" height="48" rx="4" fill="#1E1E1E"/>
						<path fill-rule="evenodd" clip-rule="evenodd" d="M32.0668 17.0854L28.8221 13.9454L18.2008 24.671L16.8983 29.0827L21.4257 27.8309L32.0668 17.0854ZM16 32.75H24V31.25H16V32.75Z" fill="white"/>
					</svg>
					<div class="welcome-panel-column-content">
						<h3>{{ $__( 'Author rich content with blocks and patterns', 'default' ) }}</h3>
						<p>{{ $__( 'Block patterns are pre-configured block layouts. Use them to get inspired or create new pages in a flash.', 'default' ) }}</p>
						<a :href="href( 'post-new.php?post_type=page' )">{{ $__( 'Add a new page', 'default' ) }}</a>
					</div>
				</div>
				<div class="welcome-panel-column">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
						<rect width="48" height="48" rx="4" fill="#1E1E1E"/>
						<path fill-rule="evenodd" clip-rule="evenodd" d="M18 16h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2zm12 1.5H18a.5.5 0 0 0-.5.5v3h13v-3a.5.5 0 0 0-.5-.5zm.5 5H22v8h8a.5.5 0 0 0 .5-.5v-7.5zm-10 0h-3V30a.5.5 0 0 0 .5.5h2.5v-8z" fill="#fff"/>
					</svg>
					<div class="welcome-panel-column-content">
						<template v-if="data.isBlockTheme">
							<h3>{{ $__( 'Customize your entire site with block themes', 'default' ) }}</h3>
							<p>{{ text.siteEditor.value }}</p>
							<a :href="href( 'site-editor.php' )">{{ $__( 'Open site editor', 'default' ) }}</a>
						</template>
						<template v-else>
							<h3>{{ $__( 'Start Customizing', 'default' ) }}</h3>
							<p>{{ text.customizer.value }}</p>
							<a v-if="data.canCustomize" class="load-customize hide-if-no-customize" :href="data.customizeUrl">{{ $__( 'Open the Customizer', 'default' ) }}</a>
						</template>
					</div>
				</div>
				<div class="welcome-panel-column">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
						<rect width="48" height="48" rx="4" fill="#1E1E1E"/>
						<path fill-rule="evenodd" clip-rule="evenodd" d="M31 24a7 7 0 0 1-7 7V17a7 7 0 0 1 7 7zm-7-8a8 8 0 1 1 0 16 8 8 0 0 1 0-16z" fill="#fff"/>
					</svg>
					<div class="welcome-panel-column-content">
						<template v-if="data.isBlockTheme">
							<h3>{{ text.styles.value }}</h3>
							<p>{{ text.stylesText.value }}</p>
							<a :href="href( 'site-editor.php?p=%2Fstyles' )">{{ $__( 'Edit styles', 'default' ) }}</a>
						</template>
						<template v-else>
							<h3>{{ $__( 'Discover a new way to build your site.', 'default' ) }}</h3>
							<p>{{ text.blockThemes.value }}</p>
							<a :href="text.blockThemesUrl.value">{{ $__( 'Learn about block themes', 'default' ) }}</a>
						</template>
					</div>
				</div>
			</div>
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
