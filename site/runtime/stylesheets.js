/**
 * WordPress's own admin stylesheets, loaded through the proxy, in the
 * direction of the signed-in user's language. No Vue; the document is passed in.
 *
 * `edit` is in the list because every classic admin page loads it (it is part of the
 * `wp-admin` style bundle): classic screen selectors in it, such as Discussion
 * Settings' `.options-discussion-php .indent-children ul`, then apply on native pages.
 */

const DIRECTIONAL = [
	'/wp-includes/css/buttons',
	'/wp-admin/css/common',
	'/wp-admin/css/forms',
	'/wp-admin/css/edit',
	'/wp-admin/css/admin-menu',
];
const SHARED = [ '/wp-includes/css/dashicons.css' ];

export const coreStylesheets = ( dir ) => [ ...SHARED, ...DIRECTIONAL.map( ( base ) => base + ( dir === 'rtl' ? '-rtl.css' : '.css' ) ) ];

const shown = new WeakMap(); // document -> { key, links } of the newest set

/** Resolves once the link has loaded or failed, or after `timeout` ms, whichever is first. */
function settled( link, timeout, setTimer ) {
	return new Promise( ( resolve ) => {
		link.addEventListener( 'load', resolve, { once: true } );
		link.addEventListener( 'error', resolve, { once: true } );
		setTimer( resolve, timeout );
	} );
}

/**
 * Makes the core stylesheet links in <head> match `dir` ('ltr' or 'rtl'), or
 * removes them for null. They go before the site's own stylesheets, which
 * therefore win where both style the same thing.
 *
 * On a change of direction the new links are added first and the old ones are
 * removed only once the new ones have loaded (or after `timeout`), so the page
 * is never shown without the admin styles. A newer call supersedes an older one
 * that is still waiting.
 *
 * @returns {Promise<void>} Settles when the old links are gone.
 */
export function syncStylesheets( doc, dir, { timeout = 5000, setTimer = ( fn, ms ) => globalThis.setTimeout( fn, ms ) } = {} ) {
	const wanted = dir ? coreStylesheets( dir ) : [];
	const key = wanted.join( '\n' );
	const current = shown.get( doc );
	if ( current ? current.key === key : wanted.length === 0 ) {
		return Promise.resolve();
	}
	const before = doc.head.querySelectorAll( 'link[data-wp-admin-core]' )[ 0 ] ?? doc.head.querySelectorAll( 'link[rel="stylesheet"]' )[ 0 ] ?? null;
	const links = wanted.map( ( href ) => {
		const link = doc.createElement( 'link' );
		link.setAttribute( 'rel', 'stylesheet' );
		link.setAttribute( 'href', href );
		link.setAttribute( 'data-wp-admin-core', '' );
		doc.head.insertBefore( link, before );
		return link;
	} );
	const mine = { key, links };
	shown.set( doc, mine );
	return Promise.all( links.map( ( link ) => settled( link, timeout, setTimer ) ) ).then( () => {
		if ( shown.get( doc ) !== mine ) {
			return; // A newer call cleans up.
		}
		for ( const link of [ ...doc.head.querySelectorAll( 'link[data-wp-admin-core]' ) ] ) {
			if ( ! links.includes( link ) ) {
				link.remove();
			}
		}
	} );
}
