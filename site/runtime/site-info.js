/**
 * The site's name, read from the public REST index of the site being shown.
 * No Vue, no document; `fetch` is injected.
 */
export function createSiteInfo( { fetch } ) {
	const names = new Map(); // site id (or null) -> Promise<string>

	function load( siteId ) {
		const base = siteId === null || siteId === undefined ? '/wp-json/' : '/sites/' + siteId + '/wp-json/';
		return fetch( base + '?_fields=name', { credentials: 'same-origin', headers: { Accept: 'application/json' } } )
			.then( ( response ) => ( response.ok ? response.json() : null ) )
			.then( ( body ) => {
				if ( typeof body?.name !== 'string' ) {
					throw new Error( 'No site name' );
				}
				return body.name;
			} );
	}

	return {
		/** Resolves to the name, or to '' when it cannot be read (a later call tries again). */
		siteName( siteId = null ) {
			const key = siteId ?? null;
			if ( ! names.has( key ) ) {
				names.set( key, load( key ).catch( () => {
					names.delete( key );
					return '';
				} ) );
			}
			return names.get( key );
		},
	};
}
