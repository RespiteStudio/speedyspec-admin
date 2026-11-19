/**
 * The classic admin notices of a native page: what its `admin_notices` callbacks print, which
 * WordPress captures on the page's classic screen (`GET wp-admin/v1/notices`). No Vue and no
 * document; `api` is injected.
 */

export const NOTICES_ROUTE = 'wp-admin/v1/notices';

// Classic screens shown in a frame print their own notices inside their document.
const LEGACY = 'core/legacy';

/**
 * Asks WordPress for the notices of a page, with the parameters the router takes for it.
 *
 * @param {object} api     REST client (`get( route, params )`).
 * @param {object} page    The page the router answered: `{ path, component }`.
 * @param {string} context Admin context of the page: 'site', 'network' or 'user'.
 * @return {Promise<{html: string, assets: object}[]>} The notices with markup, in order; none for
 *         a classic screen, and none when WordPress could not answer (a page shows without them).
 */
export async function loadPageNotices( api, page, context = 'site' ) {
	if ( ! page || typeof page.path !== 'string' || page.component === LEGACY ) {
		return [];
	}
	let answer;
	try {
		answer = await api.get( NOTICES_ROUTE, context === 'site' || ! context ? { path: page.path } : { path: page.path, context } );
	} catch {
		return [];
	}
	const assets = answer?.assets && typeof answer.assets === 'object' ? answer.assets : {};
	const list = Array.isArray( answer?.notices ) ? answer.notices : [];
	return list
		.filter( ( notice ) => typeof notice?.html === 'string' && notice.html.trim() !== '' )
		.map( ( notice ) => ( { html: notice.html, assets } ) );
}
