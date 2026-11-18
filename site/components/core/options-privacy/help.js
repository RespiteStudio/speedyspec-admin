import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of Privacy Settings: the classic screen's tab and sidebar
 * (wp-admin/options-privacy.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const Overview = {
	name: 'OptionsPrivacyHelpOverview',
	template: `
		<p>{{ $__( 'The Privacy screen lets you either build a new privacy-policy page or choose one you already have to show.', 'default' ) }}</p>
		<p>{{ $__( 'This screen includes suggestions to help you write your own privacy policy. However, it is your responsibility to use these resources correctly, to provide the information required by your privacy policy, and to keep this information current and accurate.', 'default' ) }}</p>
	`,
};

const Sidebar = {
	name: 'OptionsPrivacyHelpSidebar',
	components: { Interpolate },
	setup() {
		const documentation = computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-privacy-screen/">Documentation on Privacy Settings</a>', 'default' ) );
		const link = computed( () => linkTarget( documentation.value, 'https://wordpress.org/documentation/article/settings-privacy-screen/' ) );
		return { documentation, link };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="documentation" :tags="{ a: { href: link } }" /></p>
	`,
};

/** The page's help, as core/frame reads it from the page module (see components/core/help-tabs.js). */
export const help = {
	tabs: [
		{ id: 'overview', title: () => __( 'Overview', 'default' ), component: Overview },
	],
	sidebar: Sidebar,
};
