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
		// A timer that does not keep a test process (Node) alive; browsers return a number.
		setTimer( resolve, timeout )?.unref?.();
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

/*
 * A page's own core stylesheets. A page module exports `stylesheets`: the handles of the
 * WordPress admin styles its classic screen loads besides the frame's (`dashboard`,
 * `site-health`, …), each a file in wp-admin/css/. They are the same for every visit of the
 * page (no decision of WordPress's), so the module states them.
 */

const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The URLs of a page's core stylesheets, in the direction `dir`: `/wp-admin/css/{handle}.css`,
 * or `{handle}-rtl.css` for rtl. Handles that are not plain lower-case names, duplicates and the
 * frame's own styles are left out.
 *
 * @param {string[]|null} handles Handles the page module exports as `stylesheets`.
 * @param {string}        dir     'ltr' or 'rtl'.
 * @return {string[]} URLs, in the order given.
 */
export function pageStylesheets( handles, dir ) {
	const frame = new Set( coreStylesheets( dir ) );
	const urls = [];
	for ( const handle of Array.isArray( handles ) ? handles : [] ) {
		if ( typeof handle !== 'string' || ! HANDLE.test( handle ) ) {
			continue;
		}
		const url = '/wp-admin/css/' + handle + ( dir === 'rtl' ? '-rtl.css' : '.css' );
		if ( ! frame.has( url ) && ! urls.includes( url ) ) {
			urls.push( url );
		}
	}
	return urls;
}

const shownPage = new WeakMap(); // document -> { key, links, done } of the newest page set
const loading = new WeakMap(); // page link -> Promise settled once it has loaded, failed or timed out

/**
 * Makes the page stylesheet links in <head> (`data-wp-admin-page`) match `urls`: after the core
 * links and before the site's own stylesheets, as a classic screen prints its styles after the
 * common ones. A link already there is kept, so that a file loads once while the user stays on
 * pages that need it; the links no longer wanted are removed once the new ones have loaded (or
 * after `timeout`), so that the page is never shown without them. A newer call supersedes an
 * older one that is still waiting.
 *
 * @param {Document} doc  Document.
 * @param {string[]} urls URLs (pageStylesheets()).
 * @return {Promise<void>} Settles once the new links have loaded, failed or timed out.
 */
export function syncPageStylesheets( doc, urls, { timeout = 5000, setTimer = ( fn, ms ) => globalThis.setTimeout( fn, ms ) } = {} ) {
	if ( typeof doc?.head?.querySelectorAll !== 'function' ) {
		return Promise.resolve();
	}
	const wanted = Array.isArray( urls ) ? urls : [];
	const key = wanted.join( '\n' );
	const current = shownPage.get( doc );
	const present = [ ...doc.head.querySelectorAll( 'link[data-wp-admin-page]' ) ];
	if ( current ? current.key === key : wanted.length === 0 && present.length === 0 ) {
		return current?.done ?? Promise.resolve();
	}
	const before = [ ...doc.head.querySelectorAll( 'link[rel="stylesheet"]' ) ].find( ( link ) => ! link.hasAttribute( 'data-wp-admin-core' ) && ! link.hasAttribute( 'data-wp-admin-page' ) ) ?? null;
	const loads = [];
	const links = wanted.map( ( href ) => {
		const kept = present.find( ( link ) => link.getAttribute( 'href' ) === href );
		if ( kept ) {
			// Still loading for an earlier call: wait for it too.
			loads.push( loading.get( kept ) ?? Promise.resolve() );
			return kept;
		}
		const link = doc.createElement( 'link' );
		link.setAttribute( 'rel', 'stylesheet' );
		link.setAttribute( 'href', href );
		link.setAttribute( 'data-wp-admin-page', '' );
		doc.head.insertBefore( link, before );
		const load = settled( link, timeout, setTimer );
		loading.set( link, load );
		loads.push( load );
		return link;
	} );
	const mine = { key, links };
	mine.done = Promise.all( loads ).then( () => {
		if ( shownPage.get( doc ) !== mine ) {
			return; // A newer call cleans up.
		}
		for ( const link of [ ...doc.head.querySelectorAll( 'link[data-wp-admin-page]' ) ] ) {
			if ( ! links.includes( link ) ) {
				link.remove();
			}
		}
	} );
	shownPage.set( doc, mine );
	return mine.done;
}
