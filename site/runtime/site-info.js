/**
 * The site's name and home address, read from the public REST index of the site being shown
 * (one request per site). No Vue, no document; `fetch` is injected.
 */
export function createSiteInfo( { fetch } ) {
	const infos = new Map(); // site id (or null) -> Promise<{ name: string, home: string }>

	function load( siteId ) {
		const base = siteId === null || siteId === undefined ? '/wp-json/' : '/sites/' + siteId + '/wp-json/';
		return fetch( base + '?_fields=name,home', { credentials: 'same-origin', headers: { Accept: 'application/json' } } )
			.then( ( response ) => ( response.ok ? response.json() : null ) )
			.then( ( body ) => {
				if ( typeof body?.name !== 'string' ) {
					throw new Error( 'No site name' );
				}
				return { name: body.name, home: typeof body.home === 'string' ? body.home : '' };
			} );
	}

	function info( siteId ) {
		const key = siteId ?? null;
		if ( ! infos.has( key ) ) {
			infos.set( key, load( key ).catch( () => {
				infos.delete( key );
				return { name: '', home: '' };
			} ) );
		}
		return infos.get( key );
	}

	return {
		/** Resolves to the name, or to '' when it cannot be read (a later call tries again). */
		siteName: ( siteId = null ) => info( siteId ).then( ( { name } ) => name ),
		/** Resolves to the home address (`home_url()`), or to '' when it cannot be read or the index has none. */
		siteHome: ( siteId = null ) => info( siteId ).then( ( { home } ) => home ),
	};
}
