import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import { toPagePath } from '../../../runtime/router.js';
import { adminBase } from '../../../runtime/menu.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of Reading Settings: the classic screen's tabs and sidebar
 * (wp-admin/options-reading.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply. As on the classic
 * screen, the second tab is titled "Site visibility" when the `blog_privacy_selector`
 * action has callbacks and "Search engine visibility" otherwise (the page data reports it
 * as `flags.privacySelector`; a save does not change it): two tabs with the same id, one
 * for each condition.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

/** Whether the router page's data has the visibility radio buttons. */
const privacySelector = ( page ) => page?.data?.flags?.privacySelector === true;

const Overview = {
	name: 'OptionsReadingHelpOverview',
	components: { Interpolate },
	setup() {
		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );
		const text = {
			/* translators: %s: URL to create a new page. */
			homepage: computed( () => __( 'You can choose what&#8217;s displayed on the homepage of your site. It can be posts in reverse chronological order (classic blog), or a fixed/static page. To set a static homepage, you first need to create two <a href="%s">Pages</a>. One will become the homepage, and the other will be where your posts are displayed.', 'default' ) ),
			/* translators: %s: Documentation URL. */
			feeds: computed( () => __( 'You can also control the display of your content in RSS feeds, including the maximum number of posts to display and whether to show full text or an excerpt. <a href="%s">Learn more about feeds</a>.', 'default' ) ),
			feedsUrl: computed( () => __( 'https://developer.wordpress.org/advanced-administration/wordpress/feeds/', 'default' ) ),
		};
		const newPage = computed( () => base.value + 'post-new.php?post_type=page' );
		const linkTags = { a: ( [ url ] ) => ( { href: url } ) };
		return { text, newPage, linkTags };
	},
	template: `
		<p>{{ $__( 'This screen contains the settings that affect the display of your content.', 'default' ) }}</p>
		<p><Interpolate :text="text.homepage.value" :args="[ newPage ]" :tags="linkTags" /></p>
		<p><Interpolate :text="text.feeds.value" :args="[ text.feedsUrl.value ]" :tags="linkTags" /></p>
		<p>{{ $__( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.', 'default' ) }}</p>
	`,
};

const SiteVisibility = {
	name: 'OptionsReadingHelpSiteVisibility',
	components: { Interpolate },
	setup() {
		// Kept out of the template: the strings have character references.
		const text = {
			crawled: computed( () => __( 'You can choose whether or not your site will be crawled by robots, ping services, and spiders. If you want those services to ignore your site, click the checkbox next to &#8220;Discourage search engines from indexing this site&#8221; and click the Save Changes button at the bottom of the screen.', 'default' ) ),
			reminder: computed( () => __( 'When this setting is in effect, a reminder is shown in the At a Glance box of the Dashboard that says, &#8220;Search engines discouraged&#8221;, to remind you that you have directed search engines to not crawl your site.', 'default' ) ),
		};
		return { text };
	},
	template: `
		<p><Interpolate :text="text.crawled.value" /></p>
		<p>{{ $__( 'Note that even when set to discourage search engines, your site is still visible on the web and not all search engines adhere to this directive.', 'default' ) }}</p>
		<p><Interpolate :text="text.reminder.value" /></p>
	`,
};

const Sidebar = {
	name: 'OptionsReadingHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-reading-screen/">Documentation on Reading Settings</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/settings-reading-screen/' ) ),
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
		{ id: 'site-visibility', title: () => __( 'Site visibility', 'default' ), component: SiteVisibility, when: privacySelector },
		{ id: 'site-visibility', title: () => __( 'Search engine visibility', 'default' ), component: SiteVisibility, when: ( page ) => ! privacySelector( page ) },
	],
	sidebar: Sidebar,
};
