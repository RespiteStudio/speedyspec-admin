import { computed, inject, shallowRef } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of Media Settings: the classic screen's Overview tab and sidebar
 * (wp-admin/options-media.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply. As on the classic
 * screen, the paragraph about Uploading Files is shown only when the upload paths can be
 * edited, which is never on a multisite network: the page's data says so
 * (`flags.uploadPaths`).
 *
 * The page's data is the frame's `framePage` until the page is shown: the router's answer,
 * which a save does not change. The page puts the settings it shows in `shownSettings`
 * (and clears it when it goes away), so that after a save that locks or unlocks the upload
 * paths the help says what the page now shows, as the classic screen does after its redirect.
 */

/** The settings the Media Settings page shows, null while it is not shown. */
export const shownSettings = shallowRef( null );

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const Overview = {
	name: 'OptionsMediaHelpOverview',
	setup() {
		const page = inject( 'framePage', null );
		const data = computed( () => shownSettings.value ?? page?.value?.data ?? {} );
		const uploadPaths = computed( () => data.value.flags?.uploadPaths === true );
		return { uploadPaths };
	},
	template: `
		<p>{{ $__( 'You can set maximum sizes for images inserted into your written content; you can also insert an image as Full Size.', 'default' ) }}</p>
		<p v-if="uploadPaths">{{ $__( 'Uploading Files allows you to choose the folder and path for storing your uploaded files.', 'default' ) }}</p>
		<p>{{ $__( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.', 'default' ) }}</p>
	`,
};

const Sidebar = {
	name: 'OptionsMediaHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-media-screen/">Documentation on Media Settings</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/settings-media-screen/' ) ),
			forums: computed( () => linkTarget( text.forums.value, 'https://wordpress.org/support/forums/' ) ),
		};
		return { text, links };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="text.documentation.value" :tags="{ a: { href: links.documentation.value } }" /></p>
		<p><Interpolate :text="text.forums.value" :tags="{ a: { href: links.forums.value } }" /></p>
	`,
};

/** The page's help, as core/frame reads it from the page module (see components/core/help-tabs.js). */
export const help = {
	tabs: [
		{ id: 'overview', title: () => __( 'Overview', 'default' ), component: Overview },
	],
	sidebar: Sidebar,
};
