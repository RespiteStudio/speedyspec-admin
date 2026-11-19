/**
 * Where each text domain may be used.
 *
 * `default` is WordPress core's own domain. The screens converted from core (General, Media,
 * Writing, Reading, Discussion and Privacy Settings so far) use core's source strings byte for byte under that domain, so
 * that the language packs WordPress already has apply to them. Everything else the admin
 * site owns is `wp-admin-site`. A converted core page is added to this list (one place)
 * when it is converted. So are the shared parts converted from core's screen chrome (Screen
 * Options, meta boxes), whose strings come from class-wp-screen.php, template.php and
 * postbox.js.
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
];

/** Whether `path` (site-relative, with `/`) belongs to a converted core page. */
export const isCorePage = ( path ) => CORE_PAGE_PATHS.some( ( entry ) => ( entry.endsWith( '/' ) ? path.startsWith( entry ) : path === entry ) );
