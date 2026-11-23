/**
 * The classic admin notices of a native page: what its `admin_notices` callbacks print, which
 * WordPress captures on the page's classic screen (`GET wp-admin/v1/notices`). No Vue and no
 * document; `api` is injected.
 */

export const NOTICES_ROUTE = 'wp-admin/v1/notices';

// Classic screens shown in a frame print their own notices inside their document.
const LEGACY = 'core/legacy';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The classic admin's baseline scripts of an answer's assets: the scripts every classic screen
 * loads, which WordPress lists first and names in `baseline` (jQuery and the rest of `common`'s
 * dependencies), as LegacyHtml's loadAssets() takes them; null when there are none.
 *
 * @param {object} assets An answer's `assets`: `{ scripts, styles, ajaxurl, baseline }`.
 * @return {{scripts: object[], styles: object[], ajaxurl: string}|null} The baseline.
 */
export function baselineAssets( assets ) {
	const handles = new Set( list( assets?.baseline ).filter( ( handle ) => typeof handle === 'string' ) );
	const scripts = list( assets?.scripts ).filter( ( script ) => handles.has( script?.handle ) );
	if ( scripts.length === 0 ) {
		return null;
	}
	return { scripts, styles: [], ajaxurl: typeof assets.ajaxurl === 'string' ? assets.ajaxurl : '' };
}

/**
 * Asks WordPress for the notices of a page, with the parameters the router takes for it.
 *
 * @param {object} api              REST client (`get( route, params, options )`).
 * @param {object} page             The page the router answered: `{ path, component }`.
 * @param {string} context          Admin context of the page: 'site', 'network' or 'user'.
 * @param {object} options          Passed to `api.get()`: `timeout` (ms) and `signal` (AbortSignal).
 * @return {Promise<{notices: {html: string, assets: object}[], baseline: object|null}>} The
 *         notices with markup, in order, and the classic baseline scripts of the answer (see
 *         baselineAssets()), which the page host loads when the page's screen assets cannot be
 *         had. None of either for a classic screen (nothing is asked), and when WordPress could
 *         not answer or the request was given up (a page shows without them).
 */
export async function loadPageNotices( api, page, context = 'site', options = {} ) {
	const none = { notices: [], baseline: null };
	if ( ! page || typeof page.path !== 'string' || page.component === LEGACY ) {
		return none;
	}
	let answer;
	try {
		answer = await api.get( NOTICES_ROUTE, context === 'site' || ! context ? { path: page.path } : { path: page.path, context }, options );
	} catch {
		return none;
	}
	const assets = answer?.assets && typeof answer.assets === 'object' ? answer.assets : {};
	return {
		notices: list( answer?.notices )
			.filter( ( notice ) => typeof notice?.html === 'string' && notice.html.trim() !== '' )
			.map( ( notice ) => ( { html: notice.html, assets } ) ),
		baseline: baselineAssets( assets ),
	};
}
