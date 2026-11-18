/**
 * Where each text domain may be used.
 *
 * `default` is WordPress core's own domain. The screens converted from core (General and
 * Media Settings so far) use core's source strings byte for byte under that domain, so
 * that the language packs WordPress already has apply to them. Everything else the admin
 * site owns is `wp-admin-site`. A converted core page is added to this list (one place)
 * when it is converted.
 */
export const CORE_PAGE_PATHS = [
	'site/components/core/options-general.js',
	'site/components/core/options-general/',
	'site/components/core/options-media.js',
	'site/components/core/options-media/',
];

/** Whether `path` (site-relative, with `/`) belongs to a converted core page. */
export const isCorePage = ( path ) => CORE_PAGE_PATHS.some( ( entry ) => ( entry.endsWith( '/' ) ? path.startsWith( entry ) : path === entry ) );
