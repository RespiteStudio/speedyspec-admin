// Pure helpers for the detached admin proxy: routing, upstream resolution and header handling.

const SITE_PREFIX = /^\/sites\/(\d+)(?=\/|$)/;
const ALWAYS_PROXIED_SCREENS = new Set( [ 'admin-ajax.php', 'admin-post.php', 'async-upload.php', 'load-scripts.php', 'load-styles.php' ] );
const ASSET_DIRS = [ 'css/', 'js/', 'images/' ];

const HOP_BY_HOP = new Set( [ 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection' ] );
const SPOOFABLE = new Set( [ 'x-wp-detached-admin', 'x-wp-detached-admin-secret', 'x-wp-admin-frame', 'host' ] );
// Client-address headers only a trusted proxy in front of this one may set.
const CLIENT_ADDRESS = new Set( [ 'forwarded', 'x-real-ip' ] );

/**
 * Decides how a request is answered.
 *
 * Returns 'proxy' (forward to WordPress), 'notfound' (never forwarded) or 'spa' (static file or index.html).
 *
 * A GET or HEAD of a screen whose query has both `wp_scrape_key` and `wp_scrape_nonce` is proxied
 * whatever Sec-Fetch-Dest says: it is wp_edit_theme_plugin_file()'s loopback, the request WordPress
 * makes to its own theme-editor.php or plugin-editor.php (admin_url(), which after the cut-over is
 * this admin) to check that an edited active PHP file still runs. Answered with the static shell,
 * it would hold no scrape result and every such edit would be reverted.
 *
 * @param {string} method
 * @param {string} pathname
 * @param {string|undefined} secFetchDest Absent means a document (curl, old browsers).
 * @param {string|undefined} frameHeader Value of X-WP-Admin-Frame.
 * @param {string} [search] Query string, with or without the leading `?`.
 */
export function classify( method, pathname, secFetchDest, frameHeader, search = '' ) {
	// A site prefix never changes how a path is treated.
	const rest = pathname.replace( SITE_PREFIX, '' );

	if ( rest === '/wp-cron.php' || rest === '/xmlrpc.php' ) {
		return 'notfound';
	}
	if ( rest === '/wp-login.php' || /^\/(wp-json|wp-content|wp-includes)(\/|$)/.test( rest ) ) {
		return 'proxy';
	}
	if ( rest !== '/wp-admin' && ! rest.startsWith( '/wp-admin/' ) ) {
		return 'spa';
	}

	// Compared case-insensitively: the decoded form is what the upstream web server will see.
	const inside = rest.slice( '/wp-admin/'.length ).toLowerCase();
	if ( ASSET_DIRS.some( ( dir ) => inside.startsWith( dir ) ) ) {
		return 'proxy';
	}
	// A screen is a PHP file, a directory index, or anything that reaches a PHP file through trailing path
	// information (`edit.php/x.css`, `edit.php;x.css`, `edit.php?x`), whatever the upstream is configured to do.
	const isScreen = inside === '' || inside.endsWith( '/' ) || /\.php(?=$|[/;?#])/.test( inside );
	// Anything else is a static WordPress asset.
	if ( ! isScreen ) {
		return 'proxy';
	}
	if ( ALWAYS_PROXIED_SCREENS.has( inside.split( /[/;?#]/ )[ 0 ] ) ) {
		return 'proxy';
	}
	if ( method !== 'GET' && method !== 'HEAD' ) {
		return 'proxy';
	}
	if ( frameHeader === '1' || isScrapeLoopback( inside, search ) ) {
		return 'proxy';
	}
	const dest = secFetchDest || 'document';
	return dest === 'document' ? 'spa' : 'proxy';
}

/** Whether a screen request (`inside`: the path under wp-admin/) carries both scrape parameters. */
function isScrapeLoopback( inside, search ) {
	if ( ! /\.php$/.test( inside ) ) {
		return false;
	}
	const params = new URLSearchParams( String( search ).startsWith( '?' ) ? search.slice( 1 ) : String( search ) );
	return ( params.get( 'wp_scrape_key' ) ?? '' ) !== '' && ( params.get( 'wp_scrape_nonce' ) ?? '' ) !== '';
}

/**
 * Maps an admin path to the WordPress origin, path and Host header.
 *
 * For `/sites/{id}/...` the site's home is used; every other path uses `base`.
 *
 * @param {string} pathname
 * @param {Map<number, {home: string}>} sites
 * @param {string} [base] Upstream URL for non-site paths.
 * @param {string} [hostOverride] Host header for non-site paths.
 * @returns {{origin: string, path: string, host: string}|null} Null for an unknown site id.
 */
export function resolveUpstream( pathname, sites, base, hostOverride ) {
	const match = SITE_PREFIX.exec( pathname );
	if ( ! match ) {
		const url = new URL( base );
		return { origin: url.origin, path: pathname, host: hostOverride || url.host };
	}
	const site = sites.get( Number( match[ 1 ] ) );
	if ( ! site ) {
		return null;
	}
	const home = new URL( site.home );
	const rest = pathname.slice( match[ 0 ].length );
	return { origin: home.origin, path: home.pathname.replace( /\/+$/, '' ) + rest, host: home.host };
}

/**
 * Rewrites a Location pointing at one of `origins` onto the admin origin; anything else is returned as is.
 *
 * When `site` ({ id, home }) is given and the Location is under that site's home, the result keeps the
 * `/sites/{id}` prefix so it stays inside that site's admin.
 */
export function rewriteLocation( location, { origins, adminOrigin, site } ) {
	const under = ( prefix ) => location === prefix || [ '/', '?', '#' ].some( ( c ) => location.startsWith( prefix + c ) );
	if ( site ) {
		const home = new URL( site.home );
		const prefix = home.origin + home.pathname.replace( /\/+$/, '' );
		if ( under( prefix ) ) {
			return adminOrigin + '/sites/' + site.id + location.slice( prefix.length );
		}
	}
	for ( const origin of origins ) {
		if ( under( origin ) ) {
			return adminOrigin + location.slice( origin.length );
		}
	}
	return location;
}

/**
 * Removes hop-by-hop headers, any header named by Connection, and headers only the proxy may set
 * (`Forwarded` and `X-Real-IP` too, unless `trustProxy`).
 */
export function filterRequestHeaders( headers, { trustProxy = false } = {} ) {
	const named = new Set( String( headers.connection || '' ).split( ',' ).map( ( h ) => h.trim().toLowerCase() ).filter( Boolean ) );
	const out = {};
	for ( const [ name, value ] of Object.entries( headers ) ) {
		const key = name.toLowerCase();
		if ( HOP_BY_HOP.has( key ) || named.has( key ) || SPOOFABLE.has( key ) || key.startsWith( 'x-forwarded-' ) || key.startsWith( 'proxy-' ) ) {
			continue;
		}
		if ( ! trustProxy && CLIENT_ADDRESS.has( key ) ) {
			continue;
		}
		out[ key ] = value;
	}
	return out;
}

/**
 * Same as filterRequestHeaders, for the response direction (without the request-only spoofable set).
 */
export function filterResponseHeaders( headers ) {
	const named = new Set( String( headers.connection || '' ).split( ',' ).map( ( h ) => h.trim().toLowerCase() ).filter( Boolean ) );
	const out = {};
	for ( const [ name, value ] of Object.entries( headers ) ) {
		const key = name.toLowerCase();
		if ( HOP_BY_HOP.has( key ) || named.has( key ) ) {
			continue;
		}
		out[ key ] = value;
	}
	return out;
}

const SESSION_ROUTE = '/wp-admin/v1/session';

/** A REST route as WordPress compares it: leading slash, no trailing slash, any letter case. */
const isSessionRoute = ( route ) => typeof route === 'string' && ( '/' + route.replace( /^\/+/, '' ) ).replace( /\/+$/, '' ).toLowerCase() === SESSION_ROUTE;

/**
 * Whether a proxied request signs the user out: a DELETE of the session route (by path or
 * `rest_route`, with or without a site prefix, method given directly or through `_method` or
 * X-HTTP-Method-Override), or wp-login.php?action=logout.
 *
 * @param {string} method
 * @param {string} pathname Decoded path.
 * @param {string} search Query string, with or without the leading `?`.
 * @param {object} headers Request headers.
 */
export function isSignOut( method, pathname, search, headers = {} ) {
	const rest = pathname.replace( SITE_PREFIX, '' );
	const params = new URLSearchParams( search.startsWith( '?' ) ? search.slice( 1 ) : search );
	if ( rest === '/wp-login.php' ) {
		return params.get( 'action' ) === 'logout';
	}
	const json = /^\/wp-json(?=\/|$)/i;
	const targetsSession = ( json.test( rest ) && isSessionRoute( rest.replace( json, '' ) ) ) || isSessionRoute( params.get( 'rest_route' ) );
	if ( ! targetsSession ) {
		return false;
	}
	const override = params.get( '_method' ) ?? headers[ 'x-http-method-override' ] ?? '';
	return String( method ).toUpperCase() === 'DELETE' || String( override ).toUpperCase() === 'DELETE';
}

const USERS_ROUTE = /^\/wp\/v2\/users(?:\/|$)/i;
const USER_SCREENS = /^\/wp-admin\/(?:network\/|user\/)?(?:user-edit|users|profile)\.php$/i;
// The native plugin writes (wp-admin/v1/plugins and every route under it) and core's.
const PLUGINS_ROUTE = /^\/(?:wp-admin\/v1|wp\/v2)\/plugins(?:\/|$)/i;
const PLUGIN_SCREENS = /^\/wp-admin\/(?:network\/)?plugins\.php$/i;
const UPDATE_SCREENS = /^\/wp-admin\/(?:network\/)?update\.php$/i;
// The native theme writes (wp-admin/v1/themes and every route under it) and the file editors' save.
const THEMES_ROUTE = /^\/wp-admin\/v1\/themes(?:\/|$)/i;
const FILE_SAVE_ROUTE = /^\/wp-admin\/v1\/file-editor\/save\/?$/i;
const THEME_SCREENS = /^\/wp-admin\/(?:network\/)?themes\.php$/i;
const FILE_EDITOR_SCREENS = /^\/wp-admin\/(?:network\/)?(?:theme|plugin)-editor\.php$/i;

/** Whether a REST route, as WordPress compares it (leading slash, any letter case), matches `pattern`. */
const routeMatches = ( pattern, route ) => typeof route === 'string' && pattern.test( '/' + route.replace( /^\/+/, '' ) );

/**
 * Whether a proxied request may change the capabilities of the user making it. The proxy then
 * forgets that user's cached page components, so a page the change hides goes at once, not when
 * the entry expires. Other users' entries expire by themselves. It matches, with or without a site
 * prefix:
 *
 * - any write (a method other than GET or HEAD, given directly or through `_method` or
 *   X-HTTP-Method-Override) to core's `wp/v2/users` REST route (by path or `rest_route`) or to the
 *   classic user-edit.php, users.php and profile.php screens;
 * - any write to the native `wp-admin/v1/plugins` routes (the route itself and every route under
 *   it) or to core's `wp/v2/plugins`, by path or `rest_route`, and to the classic plugins.php;
 * - plugins.php with a non-empty `action` or `action2` in the query, whatever the method (classic
 *   activates and deactivates with a GET), and update.php with an `action` (it installs, updates
 *   and activates with a GET);
 * - any write to the native `wp-admin/v1/themes` routes (the route itself and every route under
 *   it) and to `wp-admin/v1/file-editor/save`, by path or `rest_route`; themes.php with a non-empty
 *   `action` in the query, whatever the method (classic switches and deletes with a GET), or any
 *   write to it; any write to the classic theme-editor.php and plugin-editor.php.
 *
 * Plugins are here because activating, deactivating, updating or deleting a plugin can add or
 * remove capabilities: a plugin may grant them on activation (`add_cap()`, `user_has_cap`) and
 * take them away when it goes. Themes and the file editors are here for the same reason: a
 * theme's `functions.php` runs once it is active, so switching to a theme, updating or deleting
 * one, or saving an edited active file (a theme's or a plugin's) can add or remove them.
 *
 * It does not match the native user pages' writes, which go to `wp-admin/v1/users/*`: none of
 * those routes can change the signed-in user's own capabilities (the bulk role change skips
 * one's own ID, the profile save drops one's own role, delete refuses oneself, Remove is per
 * site and the REST router checks capabilities on every request). A future route that can (a
 * super admin grant in the network batch, say) must be added here.
 *
 * It does not match admin-ajax.php: the classic plugin and update writes the screens still on the
 * legacy path send there (network/plugins.php, update-core.php), the classic editors' Ajax save
 * (`edit-theme-plugin-file`) and the Customizer's `customize_save` (which can switch the theme)
 * carry their action in the body, which the proxy does not read. The cached entry's 30-second
 * lifetime bounds those.
 *
 * @param {string} method
 * @param {string} pathname Decoded path.
 * @param {string} search Query string, with or without the leading `?`.
 * @param {object} headers Request headers.
 */
export function changesOwnCapabilities( method, pathname, search, headers = {} ) {
	const params = new URLSearchParams( search.startsWith( '?' ) ? search.slice( 1 ) : search );
	const rest = pathname.replace( SITE_PREFIX, '' );
	const given = ( name ) => ( params.get( name ) ?? '' ) !== '';
	// The classic screens that write with a GET.
	if ( ( PLUGIN_SCREENS.test( rest ) && ( given( 'action' ) || given( 'action2' ) ) ) || ( ( UPDATE_SCREENS.test( rest ) || THEME_SCREENS.test( rest ) ) && given( 'action' ) ) ) {
		return true;
	}
	const override = String( params.get( '_method' ) ?? headers[ 'x-http-method-override' ] ?? '' ).toUpperCase();
	const effective = override !== '' ? override : String( method ).toUpperCase();
	const read = ( m ) => m === 'GET' || m === 'HEAD';
	if ( read( String( method ).toUpperCase() ) && read( effective ) ) {
		return false;
	}
	const json = /^\/wp-json(?=\/|$)/i;
	const route = json.test( rest ) ? rest.replace( json, '' ) : null;
	const restRoute = params.get( 'rest_route' );
	return [ USER_SCREENS, PLUGIN_SCREENS, THEME_SCREENS, FILE_EDITOR_SCREENS ].some( ( pattern ) => pattern.test( rest ) )
		|| [ USERS_ROUTE, PLUGINS_ROUTE, THEMES_ROUTE, FILE_SAVE_ROUTE ].some( ( pattern ) => routeMatches( pattern, route ) || routeMatches( pattern, restRoute ) );
}
