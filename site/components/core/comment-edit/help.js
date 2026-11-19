import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of the Edit Comment screen: the classic screen's tab and sidebar
 * (wp-admin/comment.php:61-75, its add_help_tab() and set_help_sidebar() calls), with core's
 * strings byte for byte so that WordPress's translations apply. WordPress registers the same
 * help for the page (register_admin_help_tab()), which takes this tab's place when it is sent.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const Overview = {
	name: 'CommentEditHelpOverview',
	template: `
		<p>{{ $__( 'You can edit the information left in a comment if needed. This is often useful when you notice that a commenter has made a typographical error.', 'default' ) }}</p>
		<p>{{ $__( 'You can also moderate the comment from this screen using the Status box, where you can also change the timestamp of the comment.', 'default' ) }}</p>
	`,
};

const LINKS = {
	comments: 'https://wordpress.org/documentation/article/comments-screen/',
	forums: 'https://wordpress.org/support/forums/',
};

const Sidebar = {
	name: 'CommentEditHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			comments: computed( () => __( '<a href="https://wordpress.org/documentation/article/comments-screen/">Documentation on Comments</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = Object.fromEntries( Object.keys( LINKS ).map( ( key ) => [ key, computed( () => linkTarget( text[ key ].value, LINKS[ key ] ) ) ] ) );
		return { text, links };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="text.comments.value" :tags="{ a: { href: links.comments.value } }" /></p>
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
