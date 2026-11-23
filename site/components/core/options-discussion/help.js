import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of Discussion Settings: the classic screen's tab and sidebar
 * (wp-admin/options-discussion.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const Overview = {
	name: 'OptionsDiscussionHelpOverview',
	template: `
		<p>{{ $__( 'This screen provides many options for controlling the management and display of comments and links to your posts/pages. So many, in fact, they will not all fit here! :) Use the documentation links to get information on what each discussion setting does.', 'default' ) }}</p>
		<p>{{ $__( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.', 'default' ) }}</p>
	`,
};

const Sidebar = {
	name: 'OptionsDiscussionHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-discussion-screen/">Documentation on Discussion Settings</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/settings-discussion-screen/' ) ),
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
