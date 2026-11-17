// Real loader and contracts over an in-memory module table (globalThis.__modules).
import { createLoader } from '../../site/runtime/loader.js';
import { createContracts } from '../../site/runtime/contracts.js';

export const importFn = async ( url ) => {
	// A missing entry is a 404, as contracts-instance.js reports it; an Error entry is thrown as is.
	if ( ! Object.hasOwn( globalThis.__modules, url ) ) {
		throw Object.assign( new Error( 'cannot load ' + url ), { status: 404 } );
	}
	const entry = globalThis.__modules[ url ];
	if ( entry instanceof Error ) {
		throw entry;
	}
	return entry;
};
export const loader = createLoader( { importFn } );
export const contracts = createContracts( { loader, importFn } );
export const onModuleUnauthorized = () => {};
