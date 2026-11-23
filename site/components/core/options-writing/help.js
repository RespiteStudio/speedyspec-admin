import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of Writing Settings: the classic screen's tabs and sidebar
 * (wp-admin/options-writing.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply. As on the classic
 * screen, the "Post Via Email" tab is shown only when post by email is enabled and the
 * "Update Services" tab only when the update services are (the
 * `enable_post_by_email_configuration` and `enable_update_services_configuration` filters,
 * which the page's data reports as `flags`; a save does not change them).
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

/** Whether the router page's data has a part of the screen. */
const shows = ( flag ) => ( page ) => page?.data?.flags?.[ flag ] === true;

const Overview = {
	name: 'OptionsWritingHelpOverview',
	template: `
		<p>{{ $__( 'You can submit content in several different ways; this screen holds the settings for all of them. The top section controls the editor within the dashboard, while the rest control external publishing methods. For more information on any of these methods, use the documentation links.', 'default' ) }}</p>
		<p>{{ $__( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.', 'default' ) }}</p>
	`,
};

const PostViaEmail = {
	name: 'OptionsWritingHelpPostViaEmail',
	components: { Interpolate },
	setup() {
		// Kept out of the template: the string has a character reference.
		const text = computed( () => __( 'Post via email settings allow you to send your WordPress installation an email with the content of your post. You must set up a secret email account with POP3 access to use this, and any mail received at this address will be posted, so it&#8217;s a good idea to keep this address very secret.', 'default' ) );
		return { text };
	},
	template: `
		<p><Interpolate :text="text" /></p>
	`,
};

const UpdateServices = {
	name: 'OptionsWritingHelpUpdateServices',
	template: `
		<p>{{ $__( 'If desired, WordPress will automatically alert various services of your new posts.', 'default' ) }}</p>
	`,
};

const Sidebar = {
	name: 'OptionsWritingHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-writing-screen/">Documentation on Writing Settings</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/settings-writing-screen/' ) ),
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
		{ id: 'options-postemail', title: () => __( 'Post Via Email', 'default' ), component: PostViaEmail, when: shows( 'postByEmail' ) },
		{ id: 'options-services', title: () => __( 'Update Services', 'default' ), component: UpdateServices, when: shows( 'updateServices' ) },
	],
	sidebar: Sidebar,
};
