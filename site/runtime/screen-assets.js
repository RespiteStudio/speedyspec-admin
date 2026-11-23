/**
 * The scripts and styles a native page's classic screen queues on `admin_enqueue_scripts`,
 * which WordPress fires on the page's classic screen (`GET wp-admin/v1/screen-assets`). No Vue
 * and no document; `api` is injected.
 */

export const SCREEN_ASSETS_ROUTE = 'wp-admin/v1/screen-assets';

// Classic screens shown in a frame load their own assets inside their document.
const LEGACY = 'core/legacy';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Asks WordPress for the screen assets of a page, with the parameters the router takes for it.
 *
 * @param {object} api     REST client (`get( route, params, options )`).
 * @param {object} page    The page the router answered: `{ path, component }`.
 * @param {string} context Admin context of the page: 'site', 'network' or 'user'.
 * @param {object} options Passed to `api.get()`: `timeout` (ms) and `signal` (AbortSignal).
 * @return {Promise<{scripts: object[], styles: object[], ajaxurl: string, globals: object|null, pluginScripts: boolean}|null>}
 *         The assets, as LegacyHtml's loadAssets() takes them, with the screen's `globals` (see
 *         applyScreenGlobals()) and `pluginScripts`, whether WordPress says a script is not one
 *         of its own (see ranBefore()); null when there are none, for a classic screen
 *         (nothing is asked) and when WordPress could not answer (a page shows without them).
 */
export async function loadScreenAssets( api, page, context = 'site', options = {} ) {
	if ( ! page || typeof page.path !== 'string' || page.component === LEGACY ) {
		return null;
	}
	let answer;
	try {
		answer = await api.get( SCREEN_ASSETS_ROUTE, context === 'site' || ! context ? { path: page.path } : { path: page.path, context }, options );
	} catch {
		return null;
	}
	const scripts = list( answer?.scripts );
	const styles = list( answer?.styles );
	if ( scripts.length === 0 && styles.length === 0 ) {
		return null;
	}
	const globals = answer.globals && typeof answer.globals === 'object' && ! Array.isArray( answer.globals ) ? answer.globals : null;
	return { scripts, styles, ajaxurl: typeof answer.ajaxurl === 'string' ? answer.ajaxurl : '', globals, pluginScripts: answer.pluginScripts === true };
}

// The pages whose plugin scripts ran in this document, by ranKey().
const ran = new Set();

/**
 * The key of a page's screen in this document's ledger of plugin scripts: its admin context and
 * its path without the query string, so that two addresses of one screen (`index.php`,
 * `index.php?welcome=1`) are one. It is known before the page's assets are.
 *
 * @param {{path: string}} page    The page the router answered.
 * @param {string}         context Admin context of the page: 'site', 'network' or 'user'.
 * @return {string} The key.
 */
export function ranKey( page, context ) {
	return context + ':' + String( page.path ).split( '?' )[ 0 ];
}

/**
 * Whether the plugin scripts of a page ran in this document (see markRan()). Scripts run once
 * per document: a plugin script that binds to the screen's elements when it loads
 * (`$( function () { $( '#my-button' ).on( 'click', … ) } )`) would not bind to the page's new
 * elements, and running it again in place would bind delegated handlers twice. A classic screen
 * always loads in a new document, so the page host loads such a page in a new document too,
 * before it renders the page. Pages whose scripts are all WordPress's own (`pluginScripts`
 * false) are entered in place.
 *
 * @param {string} key The page's ranKey().
 * @return {boolean} Whether to load the page in a new document.
 */
export function ranBefore( key ) {
	return ran.has( key );
}

/**
 * Records that the plugin scripts of a page are about to run in this document (see ranBefore()).
 * Only an answer with `pluginScripts` is recorded.
 *
 * @param {object|null} assets What loadScreenAssets() gave.
 * @param {string}      key    The page's ranKey().
 */
export function markRan( assets, key ) {
	if ( assets?.pluginScripts ) {
		ran.add( key );
	}
}

// The globals a classic screen sets on `window` for its scripts (wp-admin/admin-header.php).
const GLOBAL_NAMES = [ 'pagenow', 'typenow', 'adminpage', 'thousandsSeparator', 'decimalPoint', 'isRtl' ];

/**
 * Sets the screen's globals on `win` as wp-admin/admin-header.php does before the screen's
 * scripts run (`Object.assign( window, … )`): `pagenow`, `typenow`, `adminpage`,
 * `thousandsSeparator`, `decimalPoint` and `isRtl`, each a string or a number. Returns a
 * function that puts back what was there before (or removes what was not), for when the page
 * goes.
 *
 * @param {object|null} globals The answer's `globals`.
 * @param {object}      win     Global object (`window`).
 * @return {Function} Withdraws them.
 */
export function applyScreenGlobals( globals, win = globalThis.window ) {
	if ( ! win || ! globals || typeof globals !== 'object' ) {
		return () => {};
	}
	const before = [];
	for ( const name of GLOBAL_NAMES ) {
		const value = globals[ name ];
		if ( typeof value !== 'string' && typeof value !== 'number' ) {
			continue;
		}
		before.push( [ name, Object.hasOwn( win, name ), win[ name ] ] );
		win[ name ] = value;
	}
	return () => {
		for ( const [ name, had, value ] of before.reverse() ) {
			if ( had ) {
				win[ name ] = value;
			} else {
				delete win[ name ];
			}
		}
	};
}
