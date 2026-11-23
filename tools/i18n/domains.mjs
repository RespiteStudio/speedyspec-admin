/**
 * Where each text domain may be used.
 *
 * `default` is WordPress core's own domain. The screens converted from core (General, Media,
 * Writing, Reading, Discussion and Privacy Settings, the Dashboard, Comments, Edit Comment, Posts, Media, Terms, Links, Users, Add User, Profile, Edit User, Authorize Application, the Connection Information and plugin information dialogs, and Plugins so far) use core's source strings byte for byte under that domain, so
 * that the language packs WordPress already has apply to them. Everything else the admin
 * site owns is `wp-admin-site`. A converted core page is added to this list (one place)
 * when it is converted. So are the shared parts converted from core's screen chrome (Screen
 * Options, meta boxes), whose strings come from class-wp-screen.php, template.php and
 * postbox.js, and the shared list table layer (core/list-table and its parts), whose strings
 * come from class-wp-list-table.php.
 */
export const CORE_PAGE_PATHS = [
	'site/components/core/options-general.js',
	'site/components/core/options-general/',
	'site/components/core/options-media.js',
	'site/components/core/options-media/',
	'site/components/core/options-writing.js',
	'site/components/core/options-writing/',
	'site/components/core/options-reading.js',
	'site/components/core/options-reading/',
	'site/components/core/options-discussion.js',
	'site/components/core/options-discussion/',
	'site/components/core/options-privacy.js',
	'site/components/core/options-privacy/',
	'site/components/core/options-all.js',
	'site/components/core/options-all/',
	'site/components/core/screen-options.js',
	'site/components/core/meta-box.js',
	'site/components/core/meta-box-holder.js',
	'site/components/core/dashboard.js',
	'site/components/core/dashboard/',
	'site/components/core/dashboard-parts/',
	'site/components/core/dashboard-welcome.js',
	'site/components/core/dashboard-browser-nag.js',
	'site/components/core/dashboard-php-nag.js',
	'site/components/core/dashboard-site-health.js',
	'site/components/core/dashboard-at-a-glance.js',
	'site/components/core/dashboard-network-right-now.js',
	'site/components/core/dashboard-activity.js',
	'site/components/core/dashboard-recent-comments.js',
	'site/components/core/dashboard-quick-draft.js',
	'site/components/core/dashboard-events-news.js',
	'site/components/core/list-table.js',
	'site/components/core/list-table-views.js',
	'site/components/core/list-table-search.js',
	'site/components/core/list-table-nav.js',
	'site/components/core/list-table-parts/',
	'site/components/core/inline-edit.js',
	'site/components/core/terms-checklist.js',
	'site/components/core/tags-suggest.js',
	// The password rows of the user forms (user-profile.js) and core's strength meter labels (pwsL10n).
	'site/components/core/user-password.js',
	'site/runtime/password-strength.js',
	'site/components/core/edit-comments.js',
	'site/components/core/edit-comments/',
	'site/components/core/edit-posts.js',
	'site/components/core/edit-posts/',
	'site/components/core/edit-tags.js',
	'site/components/core/edit-tags/',
	'site/components/core/term-edit.js',
	'site/components/core/link-manager.js',
	'site/components/core/link-manager/',
	'site/components/core/link-edit.js',
	'site/components/core/link-edit/',
	'site/components/core/upload.js',
	'site/components/core/upload/',
	'site/components/core/comment-edit.js',
	'site/components/core/comment-edit/',
	'site/components/core/comment-moderate.js',
	'site/components/core/users.js',
	'site/components/core/users/',
	'site/components/core/users-delete.js',
	'site/components/core/user-new.js',
	'site/components/core/user-new/',
	'site/components/core/user-edit.js',
	'site/components/core/user-edit/',
	'site/components/core/authorize-application.js',
	// The Connection Information dialog (request_filesystem_credentials()) and the plugin information
	// dialog (install_plugin_information()), shared by the Plugins pages.
	'site/components/core/filesystem-credentials.js',
	'site/components/core/plugin-information.js',
	// The Plugins list (plugins.php, WP_Plugins_List_Table, updates.js).
	'site/components/core/plugins.js',
	'site/components/core/plugins/',
	// Add Plugins (plugin-install.php, WP_Plugin_Install_List_Table, plugin-install.js, updates.js).
	'site/components/core/plugin-install.js',
	'site/components/core/plugin-install/',
	// The package layer both Plugins pages share (updates.js's texts, as its leave warning).
	'site/components/core/package-parts/',
];

/** Whether `path` (site-relative, with `/`) belongs to a converted core page. */
export const isCorePage = ( path ) => CORE_PAGE_PATHS.some( ( entry ) => ( entry.endsWith( '/' ) ? path.startsWith( entry ) : path === entry ) );
