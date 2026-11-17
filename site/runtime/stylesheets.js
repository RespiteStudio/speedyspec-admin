/**
 * WordPress's own admin stylesheets, loaded through the proxy, in the
 * direction of the signed-in user's language. No Vue; the document is passed in.
 */

const DIRECTIONAL = [
	'/wp-includes/css/buttons',
	'/wp-admin/css/common',
	'/wp-admin/css/forms',
	'/wp-admin/css/admin-menu',
];
const SHARED = [ '/wp-includes/css/dashicons.css' ];

export const coreStylesheets = ( dir ) => [ ...SHARED, ...DIRECTIONAL.map( ( base ) => base + ( dir === 'rtl' ? '-rtl.css' : '.css' ) ) ];

/**
 * Makes the core stylesheet links in <head> match `dir` ('ltr' or 'rtl'), or
 * removes them for null. They go before the site's own stylesheets, which
 * therefore win where both style the same thing.
 */
export function syncStylesheets( doc, dir ) {
	const wanted = dir ? coreStylesheets( dir ) : [];
	const present = [ ...doc.head.querySelectorAll( 'link[data-wp-admin-core]' ) ];
	if ( present.length === wanted.length && present.every( ( link, i ) => link.getAttribute( 'href' ) === wanted[ i ] ) ) {
		return;
	}
	present.forEach( ( link ) => link.remove() );
	const before = doc.head.querySelectorAll( 'link[rel="stylesheet"]' )[ 0 ] ?? null;
	for ( const href of wanted ) {
		const link = doc.createElement( 'link' );
		link.setAttribute( 'rel', 'stylesheet' );
		link.setAttribute( 'href', href );
		link.setAttribute( 'data-wp-admin-core', '' );
		doc.head.insertBefore( link, before );
	}
}
