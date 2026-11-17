import { createLoader } from './loader.js';
import { createContracts } from './contracts.js';

const importFn = ( specifier ) => import( specifier );

export const loader = createLoader( { importFn, document: globalThis.document } );
export const contracts = createContracts( { loader, importFn } );
