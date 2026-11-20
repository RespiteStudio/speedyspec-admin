/**
 * Fills the in-memory module table (globalThis.__modules) that the contracts-instance stub
 * imports from, with core contracts and their static implementations:
 * `/contracts/core/<name>.js` and `/components/core/<name>.js`.
 *
 * fillContracts( names: string[] ): Promise<void>
 */
export async function fillContracts( names ) {
	globalThis.__modules = globalThis.__modules ?? {};
	for ( const name of names ) {
		globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../../site/contracts/core/' + name + '.js' );
		globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../../site/components/core/' + name + '.js' );
	}
}
