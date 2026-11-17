import { createLoader } from './loader.js';
import { createContracts } from './contracts.js';

let unauthorized = null;

/** Called when a module could not be imported because the proxy no longer accepts the session. */
export function onModuleUnauthorized( callback ) {
	unauthorized = callback;
}

// The browser does not say why an import failed: a root-relative module is asked for again,
// headers only, and a 401 means the session has ended (a 404 is a module that does not exist).
async function refusedForSession( specifier ) {
	if ( typeof specifier !== 'string' || ! specifier.startsWith( '/' ) || specifier.startsWith( '//' ) ) {
		return false;
	}
	try {
		const response = await globalThis.fetch( specifier, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' } );
		return response.status === 401;
	} catch {
		return false;
	}
}

const importFn = async ( specifier ) => {
	try {
		return await import( specifier );
	} catch ( error ) {
		if ( unauthorized && ( await refusedForSession( specifier ) ) ) {
			unauthorized();
		}
		throw error;
	}
};

export const loader = createLoader( { importFn, document: globalThis.document } );
export const contracts = createContracts( { loader, importFn } );
