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
 * @param {object} api     REST client (`get( route, params )`).
 * @param {object} page    The page the router answered: `{ path, component }`.
 * @param {string} context Admin context of the page: 'site', 'network' or 'user'.
 * @return {Promise<{scripts: object[], styles: object[], ajaxurl: string}|null>} The assets, as
 *         LegacyHtml's loadAssets() takes them; null when there are none, for a classic screen
 *         (nothing is asked) and when WordPress could not answer (a page shows without them).
 */
export async function loadScreenAssets( api, page, context = 'site' ) {
	if ( ! page || typeof page.path !== 'string' || page.component === LEGACY ) {
		return null;
	}
	let answer;
	try {
		answer = await api.get( SCREEN_ASSETS_ROUTE, context === 'site' || ! context ? { path: page.path } : { path: page.path, context } );
	} catch {
		return null;
	}
	const scripts = list( answer?.scripts );
	const styles = list( answer?.styles );
	if ( scripts.length === 0 && styles.length === 0 ) {
		return null;
	}
	return { scripts, styles, ajaxurl: typeof answer.ajaxurl === 'string' ? answer.ajaxurl : '' };
}
