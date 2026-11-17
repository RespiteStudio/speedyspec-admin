// Real loader and contracts over an in-memory module table (globalThis.__modules).
import { createLoader } from '../../site/runtime/loader.js';
import { createContracts } from '../../site/runtime/contracts.js';

export const importFn = async ( url ) => {
	if ( ! Object.hasOwn( globalThis.__modules, url ) ) {
		throw new Error( 'cannot load ' + url );
	}
	return globalThis.__modules[ url ];
};
export const loader = createLoader( { importFn } );
export const contracts = createContracts( { loader, importFn } );
