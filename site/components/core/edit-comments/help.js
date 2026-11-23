import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';

/*
 * The help of the Comments screen: the classic screen's tabs and sidebar
 * (wp-admin/edit-comments.php:205-233, its add_help_tab() and set_help_sidebar() calls), with
 * core's strings byte for byte so that WordPress's translations apply.
 */

/** The target of the link in a translated string (translations may point to a localized page), else `fallback`. */
function linkTarget( text, fallback ) {
	const match = /<a\s[^>]*href="([^"]*)"/i.exec( text );
	return match ? match[ 1 ] : fallback;
}

const STRONG = { strong: {} };

const Overview = {
	name: 'EditCommentsHelpOverview',
	template: `
		<p>{{ $__( 'You can manage comments made on your site similar to the way you manage posts and other content. This screen is customizable in the same ways as other management screens, and you can act on comments using the on-hover action links or the bulk actions.', 'default' ) }}</p>
	`,
};

const Moderating = {
	name: 'EditCommentsHelpModerating',
	components: { Interpolate },
	setup() {
		// Strings with markup or character references are kept out of the template.
		const text = {
			author: computed( () => __( 'In the <strong>Author</strong> column, in addition to the author&#8217;s name, email address, and site URL, the commenter&#8217;s IP address is shown. Clicking on this link will show you all the comments made from this IP address.', 'default' ) ),
			comment: computed( () => __( 'In the <strong>Comment</strong> column, hovering over any comment gives you options to approve, reply (and approve), quick edit, edit, spam mark, or trash that comment.', 'default' ) ),
			response: computed( () => __( 'In the <strong>In response to</strong> column, there are three elements. The text is the name of the post that inspired the comment, and links to the post editor for that entry. The View Post link leads to that post on your live site. The small bubble with the number in it shows the number of approved comments that post has received. If there are pending comments, a red notification circle with the number of pending comments is displayed. Clicking the notification circle will filter the comments screen to show only pending comments on that post.', 'default' ) ),
			submitted: computed( () => __( 'In the <strong>Submitted on</strong> column, the date and time the comment was left on your site appears. Clicking on the date/time link will take you to that comment on your live site.', 'default' ) ),
		};
		return { text, tags: STRONG };
	},
	template: `
		<p>{{ $__( 'A red bar on the left means the comment is waiting for you to moderate it.', 'default' ) }}</p>
		<p><Interpolate :text="text.author.value" :tags="tags" /></p>
		<p><Interpolate :text="text.comment.value" :tags="tags" /></p>
		<p><Interpolate :text="text.response.value" :tags="tags" /></p>
		<p><Interpolate :text="text.submitted.value" :tags="tags" /></p>
		<p>{{ $__( 'Many people take advantage of keyboard shortcuts to moderate their comments more quickly. Use the link to the side to learn more.', 'default' ) }}</p>
	`,
};

const LINKS = {
	comments: 'https://wordpress.org/documentation/article/comments-screen/',
	spam: 'https://wordpress.org/documentation/article/understand-comment-spam/',
	shortcuts: 'https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments',
	forums: 'https://wordpress.org/support/forums/',
};

const Sidebar = {
	name: 'EditCommentsHelpSidebar',
	components: { Interpolate },
	setup() {
		const text = {
			comments: computed( () => __( '<a href="https://wordpress.org/documentation/article/comments-screen/">Documentation on Comments</a>', 'default' ) ),
			spam: computed( () => __( '<a href="https://wordpress.org/documentation/article/understand-comment-spam/">Documentation on Comment Spam</a>', 'default' ) ),
			shortcuts: computed( () => __( '<a href="https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments">Documentation on Keyboard Shortcuts</a>', 'default' ) ),
			forums: computed( () => __( '<a href="https://wordpress.org/support/forums/">Support forums</a>', 'default' ) ),
		};
		const links = Object.fromEntries( Object.keys( LINKS ).map( ( key ) => [ key, computed( () => linkTarget( text[ key ].value, LINKS[ key ] ) ) ] ) );
		return { text, links };
	},
	template: `
		<p><strong>{{ $__( 'For more information:', 'default' ) }}</strong></p>
		<p><Interpolate :text="text.comments.value" :tags="{ a: { href: links.comments.value } }" /></p>
		<p><Interpolate :text="text.spam.value" :tags="{ a: { href: links.spam.value } }" /></p>
		<p><Interpolate :text="text.shortcuts.value" :tags="{ a: { href: links.shortcuts.value } }" /></p>
		<p><Interpolate :text="text.forums.value" :tags="{ a: { href: links.forums.value } }" /></p>
	`,
};

/** The page's help, as core/frame reads it from the page module (see components/core/help-tabs.js). */
export const help = {
	tabs: [
		{ id: 'overview', title: () => __( 'Overview', 'default' ), component: Overview },
		{ id: 'moderating-comments', title: () => __( 'Moderating Comments', 'default' ), component: Moderating },
	],
	sidebar: Sidebar,
};
