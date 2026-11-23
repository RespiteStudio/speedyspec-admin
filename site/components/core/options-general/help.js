import { computed, inject } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of General Settings: the classic screen's Overview tab and sidebar
 * (wp-admin/options-general.php, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply. As on the classic
 * screen, the paragraphs about the two addresses, the protocols and membership are left out
 * on a multisite network (`multisite` in the page's data, read from the frame's `framePage`).
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const Overview = {
	name: 'OptionsGeneralHelpOverview',
	components: { Interpolate },
	setup() {
		const page = inject( 'framePage', null );
		const multisite = computed( () => page?.value?.data?.multisite === true );
		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const text = {
			/* translators: %s: Documentation URL. */
			directories: computed( () => __( 'Though the terms refer to two different concepts, in practice, they can be the same address or different. For example, you can have the core WordPress installation files in the root directory (<code>https://example.com</code>), in which case the two URLs would be the same. Or the <a href="%s">WordPress files can be in a subdirectory</a> (<code>https://example.com/wordpress</code>). In that case, the WordPress URL and the site URL would be different.', 'default' ) ),
			documentationUrl: computed( () => __( 'https://developer.wordpress.org/advanced-administration/server/wordpress-in-directory/', 'default' ) ),
			/* translators: 1: http://, 2: https:// */
			protocols: computed( () => __( 'Both WordPress URL and site URL can start with either %1$s or %2$s. A URL starting with %2$s requires an SSL certificate, so be sure that you have one before changing to %2$s. With %2$s, a padlock will appear next to the address in the browser address bar. Both %2$s and the padlock signal that your site meets some basic security requirements, which can build trust with your visitors and with search engines.', 'default' ) ),
		};
		const protocols = [ { tag: 'code', text: 'http://' }, { tag: 'code', text: 'https://' } ];
		return { multisite, text, protocols };
	},
	template: `
		<p>{{ $__( 'The fields on this screen determine some of the basics of your site setup.', 'default' ) }}</p>
		<p>{{ $__( 'Most themes show the site title at the top of every page, in the title bar of the browser, and as the identifying name for syndicated feeds. Many themes also show the tagline.', 'default' ) }}</p>
		<template v-if="! multisite">
			<p>{{ $__( 'Two terms you will want to know are the WordPress URL and the site URL. The WordPress URL is where the core WordPress installation files are, and the site URL is the address a visitor uses in the browser to go to your site.', 'default' ) }}</p>
			<p><Interpolate :text="text.directories.value" :args="[ text.documentationUrl.value ]" :tags="{ a: { href: text.documentationUrl.value }, code: {} }" /></p>
			<p><Interpolate :text="text.protocols.value" :args="protocols" /></p>
			<p>{{ $__( 'If you want site visitors to be able to register themselves, check the membership box. If you want the site administrator to register every new user, leave the box unchecked. In either case, you can set a default user role for all new users.', 'default' ) }}</p>
		</template>
		<p>{{ $__( 'You can set the language, and WordPress will automatically download and install the translation files (available if your filesystem is writable).', 'default' ) }}</p>
		<p>{{ $__( 'UTC means Coordinated Universal Time.', 'default' ) }}</p>
		<p>{{ $__( 'You must click the Save Changes button at the bottom of the screen for new settings to take effect.', 'default' ) }}</p>
	`,
};

const Sidebar = {
	name: 'OptionsGeneralHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			documentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/settings-general-screen/">Documentation on General Settings</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = {
			documentation: computed( () => linkTarget( text.documentation.value, 'https://wordpress.org/documentation/article/settings-general-screen/' ) ),
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
