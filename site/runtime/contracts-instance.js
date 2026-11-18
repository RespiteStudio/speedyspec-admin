import { createLoader } from './loader.js';
import { createContracts } from './contracts.js';

let unauthorized = null;

/** Called when a module could not be imported because the proxy no longer accepts the session. */
export function onModuleUnauthorized( callback ) {
	unauthorized = callback;
}

// The browser does not say why an import failed: a root-relative module is asked for again,
// headers only. A 401 means the session has ended; a 404 is a module that does not exist, and a
// 403 for a page file (under /contracts/ or /components/) one the user's role may not load. The
// error then carries the status (contracts.js tells a missing or a refused contract by it).
const PAGE_FILE = /^\/(?:contracts|components)\//;

async function probeStatus( specifier ) {
	if ( typeof specifier !== 'string' || ! specifier.startsWith( '/' ) || specifier.startsWith( '//' ) ) {
		return null;
	}
	try {
		const response = await globalThis.fetch( specifier, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' } );
		return response.status;
	} catch {
		return null;
	}
}

const importFn = async ( specifier ) => {
	try {
		return await import( specifier );
	} catch ( error ) {
		const status = await probeStatus( specifier );
		if ( status === 401 && unauthorized ) {
			unauthorized();
		}
		if ( status === 404 ) {
			throw Object.assign( new Error( 'Module not found: ' + specifier, { cause: error } ), { status } );
		}
		if ( status === 403 && PAGE_FILE.test( specifier ) ) {
			throw Object.assign( new Error( 'Module refused: ' + specifier, { cause: error } ), { status, code: 'admin_forbidden' } );
		}
		throw error;
	}
};

export const loader = createLoader( { importFn, document: globalThis.document } );
export const contracts = createContracts( { loader, importFn } );
