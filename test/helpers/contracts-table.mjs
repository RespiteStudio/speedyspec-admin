/**
 * Fills the in-memory module table (globalThis.__modules) that the contracts-instance stub
 * imports from, with core contracts and their static implementations:
 * `/contracts/core/<name>.js` and `/components/core/<name>.js`.
 *
 * fillContracts( names: string[] ): Promise<void>
 * resetContracts(): void — empties the table, so the next test starts from no entries (call it
 * in `afterEach` when a test adds its own entries, such as an Error that fails a load).
 */
export async function fillContracts( names ) {
	globalThis.__modules = globalThis.__modules ?? {};
	for ( const name of names ) {
		globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../../site/contracts/core/' + name + '.js' );
		globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../../site/components/core/' + name + '.js' );
	}
}

export function resetContracts() {
	globalThis.__modules = {};
}
