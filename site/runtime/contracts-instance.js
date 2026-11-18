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

let retries = 0;

/**
 * The import function of the loader and the contracts. `importModule` and `probe` are injected
 * for tests; the browser's dynamic import and a HEAD request by default.
 */
export function createImportFn( { importModule = ( specifier ) => import( specifier ), probe = probeStatus } = {} ) {
	return async ( specifier ) => {
		try {
			return await importModule( specifier );
		} catch ( error ) {
			const status = await probe( specifier );
			if ( status === 401 && unauthorized ) {
				unauthorized();
			}
			if ( status === 404 ) {
				throw Object.assign( new Error( 'Module not found: ' + specifier, { cause: error } ), { status } );
			}
			if ( status === 403 && PAGE_FILE.test( specifier ) ) {
				throw Object.assign( new Error( 'Module refused: ' + specifier, { cause: error } ), { status, code: 'admin_forbidden' } );
			}
			// The file is there and may be loaded now (say, after a new sign-in), but a browser may
			// remember the failed import of this URL: ask once more under a fresh one.
			if ( status === 200 ) {
				retries++;
				return importModule( specifier + ( specifier.includes( '?' ) ? '&' : '?' ) + 'retry=' + retries );
			}
			throw error;
		}
	};
}

const importFn = createImportFn();

export const loader = createLoader( { importFn, document: globalThis.document } );
export const contracts = createContracts( { loader, importFn } );
