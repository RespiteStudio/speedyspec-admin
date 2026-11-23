import { computed, inject } from 'vue';
import { __, sprintf } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of the Dashboard: the classic screen's tabs and sidebar (wp-admin/_index.php for the
 * site and user Dashboards, wp-admin/network/index.php for the network Dashboard, their
 * add_help_tab() and set_help_sidebar() calls), with core's strings byte for byte so that
 * WordPress's translations apply. Which screen's help shows (`set`: `site` or `network`), which
 * lines of the Content tab show, and whether the version links to its documentation, WordPress
 * decides: the page data's `help` (`set`, `welcome`, `siteHealth`, `glance`, `comments`,
 * `quickDraft`, `version`, `versionUrl`), read from the frame's `framePage`.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const useHelp = () => {
	const page = inject( 'framePage', null );
	return computed( () => page?.value?.data?.help ?? {} );
};

const Overview = {
	name: 'DashboardHelpOverview',
	components: { Interpolate },
	setup() {
		// Strings with character references are kept out of the template, which would decode them.
		const text = computed( () => __( 'The Dashboard is the first place you will come to every time you log into your site. It is where you will find all your WordPress tools. If you need help, just click the &#8220;Help&#8221; tab above the screen title.', 'default' ) );
		return { text };
	},
	template: `
		<p>{{ $__( 'Welcome to your WordPress Dashboard!', 'default' ) }}</p>
		<p><Interpolate :text="text" /></p>
	`,
};

const Navigation = {
	name: 'DashboardHelpNavigation',
	template: `
		<p>{{ $__( 'The left-hand navigation menu provides links to all of the WordPress administration screens, with submenu items displayed on hover. You can minimize this menu to a narrow icon strip by clicking on the Collapse Menu arrow at the bottom.', 'default' ) }}</p>
		<p>{{ $__( 'Links in the Toolbar at the top of the screen connect your dashboard and the front end of your site, and provide access to your profile and helpful WordPress information.', 'default' ) }}</p>
	`,
};

const STRONG = { strong: {} };

const Layout = {
	name: 'DashboardHelpLayout',
	components: { Interpolate },
	setup() {
		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const text = {
			screenOptions: computed( () => __( '<strong>Screen Options</strong> &mdash; Use the Screen Options tab to choose which Dashboard boxes to show.', 'default' ) ),
			dragAndDrop: computed( () => __( '<strong>Drag and Drop</strong> &mdash; To rearrange the boxes, drag and drop by clicking on the title bar of the selected box and releasing when you see a gray dotted-line rectangle appear in the location you want to place the box.', 'default' ) ),
			boxControls: computed( () => __( '<strong>Box Controls</strong> &mdash; Click the title bar of the box to expand or collapse it. Some boxes added by plugins may have configurable content, and will show a &#8220;Configure&#8221; link in the title bar if you hover over it.', 'default' ) ),
		};
		return { text, tags: STRONG };
	},
	template: `
		<p>{{ $__( 'You can use the following controls to arrange your Dashboard screen to suit your workflow. This is true on most other administration screens as well.', 'default' ) }}</p>
		<p><Interpolate :text="text.screenOptions.value" :tags="tags" /></p>
		<p><Interpolate :text="text.dragAndDrop.value" :tags="tags" /></p>
		<p><Interpolate :text="text.boxControls.value" :tags="tags" /></p>
	`,
};

const Content = {
	name: 'DashboardHelpContent',
	components: { Interpolate },
	setup() {
		const help = useHelp();
		const text = {
			welcome: computed( () => __( '<strong>Welcome</strong> &mdash; Shows links for some of the most common tasks when setting up a new site.', 'default' ) ),
			siteHealth: computed( () => __( '<strong>Site Health Status</strong> &mdash; Informs you of any potential issues that should be addressed to improve the performance or security of your website.', 'default' ) ),
			glance: computed( () => __( '<strong>At a Glance</strong> &mdash; Displays a summary of the content on your site and identifies which theme and version of WordPress you are using.', 'default' ) ),
			activity: computed( () => __( '<strong>Activity</strong> &mdash; Shows upcoming scheduled posts, recently published posts, and posts published on this day in previous years.', 'default' ) ),
			comments: computed( () => __( '<strong>Recent Comments</strong> &mdash; Shows the most recent comments on your posts and allows you to moderate them.', 'default' ) ),
			quickDraft: computed( () => __( "<strong>Quick Draft</strong> &mdash; Allows you to create a new post and save it as a draft. Also displays links to the 3 most recent draft posts you've started.", 'default' ) ),
			/* translators: %s: WordPress Planet URL. */
			events: computed( () => __( '<strong>WordPress Events and News</strong> &mdash; Upcoming events near you as well as the latest news from the official WordPress project and the <a href="%s">WordPress Planet</a>.', 'default' ) ),
			planetUrl: computed( () => __( 'https://planet.wordpress.org/', 'default' ) ),
		};
		const tags = computed( () => ( { strong: {}, a: { href: text.planetUrl.value } } ) );
		return { help, text, tags };
	},
	template: `
		<p>{{ $__( 'The boxes on your Dashboard screen are:', 'default' ) }}</p>
		<p v-if="help.welcome"><Interpolate :text="text.welcome.value" :tags="tags" /></p>
		<p v-if="help.siteHealth"><Interpolate :text="text.siteHealth.value" :tags="tags" /></p>
		<p v-if="help.glance"><Interpolate :text="text.glance.value" :tags="tags" /></p>
		<p><Interpolate :text="text.activity.value" :tags="tags" /></p>
		<p v-if="help.comments"><Interpolate :text="text.comments.value" :tags="tags" /></p>
		<p v-if="help.quickDraft"><Interpolate :text="text.quickDraft.value" :tags="tags" /></p>
		<p><Interpolate :text="text.events.value" :args="[ text.planetUrl.value ]" :tags="tags" /></p>
	`,
};

const NetworkOverview = {
	name: 'DashboardHelpNetworkOverview',
	template: `
		<p>{{ $__( 'Welcome to your Network Admin. This area of the Administration Screens is used for managing all aspects of your Multisite Network.', 'default' ) }}</p>
		<p>{{ $__( 'From here you can:', 'default' ) }}</p>
		<ul>
			<li>{{ $__( 'Add and manage sites or users', 'default' ) }}</li>
			<li>{{ $__( 'Install and activate themes or plugins', 'default' ) }}</li>
			<li>{{ $__( 'Update your network', 'default' ) }}</li>
			<li>{{ $__( 'Modify global network settings', 'default' ) }}</li>
		</ul>
	`,
};

const NetworkQuickTasks = {
	name: 'DashboardHelpNetworkQuickTasks',
	components: { Interpolate },
	setup() {
		// Strings with markup or character references are kept out of the template.
		const text = {
			newUser: computed( () => __( 'To add a new user, <strong>click Create a New User</strong>.', 'default' ) ),
			newSite: computed( () => __( 'To add a new site, <strong>click Create a New Site</strong>.', 'default' ) ),
			searchUser: computed( () => __( 'To search for a user, <strong>enter an email address or username</strong>. Use a wildcard to search for a partial username, such as user&#42;.', 'default' ) ),
			searchSite: computed( () => __( 'To search for a site, <strong>enter the path or domain</strong>.', 'default' ) ),
		};
		return { text, tags: STRONG };
	},
	template: `
		<p>{{ $__( 'The Right Now widget on this screen provides current user and site counts on your network.', 'default' ) }}</p>
		<ul>
			<li><Interpolate :text="text.newUser.value" :tags="tags" /></li>
			<li><Interpolate :text="text.newSite.value" :tags="tags" /></li>
		</ul>
		<p>{{ $__( 'To search for a user or site, use the search boxes.', 'default' ) }}</p>
		<ul>
			<li><Interpolate :text="text.searchUser.value" :tags="tags" /></li>
			<li><Interpolate :text="text.searchSite.value" :tags="tags" /></li>
		</ul>
	`,
};

const NetworkSidebar = {
	name: 'DashboardHelpNetworkSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://developer.wordpress.org/advanced-administration/multisite/admin/">Documentation on the Network Admin</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forum/multisite/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://developer.wordpress.org/advanced-administration/multisite/admin/' ) ),
			forums: computed( () => linkTarget( text.forums.value, 'https://wordpress.org/support/forum/multisite/' ) ),
		};
		return { text, links };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="text.documentation.value" :tags="{ a: { href: links.documentation.value } }" /></p>
		<p><Interpolate :text="text.forums.value" :tags="{ a: { href: links.forums.value } }" /></p>
	`,
};

const SiteSidebar = {
	name: 'DashboardHelpSidebar',
	components: { Interpolate },
	setup() {
		const help = useHelp();
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/dashboard-screen/">Documentation on Dashboard</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/dashboard-screen/' ) ),
			forums: computed( () => linkTarget( text.forums.value, 'https://wordpress.org/support/forums/' ) ),
		};
		/* translators: %s: WordPress version. */
		const version = computed( () => sprintf( __( 'Version %s', 'default' ), String( help.value.version ?? '' ) ) );
		return { help, text, links, version };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="text.documentation.value" :tags="{ a: { href: links.documentation.value } }" /></p>
		<p><Interpolate :text="text.forums.value" :tags="{ a: { href: links.forums.value } }" /></p>
		<p><a v-if="help.versionUrl" :href="help.versionUrl">{{ version }}</a><template v-else>{{ version }}</template></p>
	`,
};

/** Whether WordPress chose the network screen's help for the page (its data's `help.set`). */
export const isNetworkHelp = ( page ) => page?.data?.help?.set === 'network';
const siteHelp = ( page ) => ! isNetworkHelp( page );

/** The sidebar of the help WordPress chose. */
const Sidebar = {
	name: 'DashboardHelpSidebarOfSet',
	components: { SiteSidebar, NetworkSidebar },
	setup() {
		const page = inject( 'framePage', null );
		return { network: computed( () => isNetworkHelp( page?.value ) ) };
	},
	template: `<NetworkSidebar v-if="network" /><SiteSidebar v-else />`,
};

/**
 * The page's help, as core/frame reads it from the page module (see components/core/help-tabs.js):
 * the site screen's tabs, or the network screen's when WordPress says so (`when`).
 */
export const help = {
	tabs: [
		{ id: 'overview', title: () => __( 'Overview', 'default' ), component: Overview, when: siteHelp },
		{ id: 'help-navigation', title: () => __( 'Navigation', 'default' ), component: Navigation, when: siteHelp },
		{ id: 'help-layout', title: () => __( 'Layout', 'default' ), component: Layout, when: siteHelp },
		{ id: 'help-content', title: () => __( 'Content', 'default' ), component: Content, when: siteHelp },
		{ id: 'overview', title: () => __( 'Overview', 'default' ), component: NetworkOverview, when: isNetworkHelp },
		{ id: 'quick-tasks', title: () => __( 'Quick Tasks', 'default' ), component: NetworkQuickTasks, when: isNetworkHelp },
	],
	sidebar: Sidebar,
};
