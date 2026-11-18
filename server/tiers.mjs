// Which static files a request may have: pure decisions on the normalised path (static.mjs staticKey),
// taken before the file system is looked at.

import { COMPONENT_ID } from './auth.mjs';

/** The lists themselves: read by the proxy, never served. */
const LIST_FILES = new Set( [ '/public-files.json', '/shared-files.json' ] );
const PAGE_AREA = /^\/(contracts|components)\/(.+)$/;

/**
 * The tier of a normalised path.
 *
 * - `public`: on the public list (anyone).
 * - `shared`: on the shared list (any signed-in user).
 * - `page` with `contractId`: any other path under /contracts/ or /components/, named by its path
 *   (`/contracts/<id>.js` and `/components/<id>.js` → `<id>`; `/components/<id>/…` → see
 *   pageContractId()). `area` says which of the two.
 * - `page` without `contractId`: anything else, including any dot segment and the list files.
 *   Never served.
 *
 * @param {string} key
 * @param {Set<string>} publicFiles
 * @param {Set<string>} sharedFiles
 * @returns {{tier: 'public'|'shared'|'page', contractId?: string, area?: 'contracts'|'components'}}
 */
export function classifyStatic( key, publicFiles, sharedFiles ) {
	if ( typeof key !== 'string' || LIST_FILES.has( key ) || key.split( '/' ).some( ( s ) => s.startsWith( '.' ) ) ) {
		return { tier: 'page' };
	}
	if ( publicFiles.has( key ) ) {
		return { tier: 'public' };
	}
	if ( sharedFiles.has( key ) ) {
		return { tier: 'shared' };
	}
	const match = PAGE_AREA.exec( key );
	if ( ! match ) {
		return { tier: 'page' };
	}
	const rest = match[ 2 ].endsWith( '.js' ) ? match[ 2 ].slice( 0, -3 ) : match[ 2 ];
	return { tier: 'page', contractId: rest, area: match[ 1 ] };
}

/**
 * The contract a page file belongs to, given the ids the user may load: for a file under
 * /components/, the longest proper directory prefix of its name that is an allowed id
 * (`/components/core/options-general/timezone.js` → `core/options-general`); otherwise the
 * name itself. Null for a path that belongs to no contract.
 *
 * @param {{tier: string, contractId?: string, area?: string}} classification From classifyStatic().
 * @param {ReadonlySet<string>} allowed
 * @returns {string|null}
 */
export function pageContractId( classification, allowed ) {
	if ( classification?.tier !== 'page' || typeof classification.contractId !== 'string' ) {
		return null;
	}
	const name = classification.contractId;
	if ( classification.area === 'components' ) {
		const segments = name.split( '/' );
		for ( let n = segments.length - 1; n >= 1; n-- ) {
			const prefix = segments.slice( 0, n ).join( '/' );
			if ( allowed.has( prefix ) ) {
				return prefix;
			}
		}
	}
	return name;
}

/**
 * Whether a classified path may be served to a caller.
 *
 * @param {{tier: string, contractId?: string, area?: string}} classification From classifyStatic().
 * @param {{authenticated: boolean, components: ReadonlySet<string>}} session From the auth checker.
 * @returns {'serve'|'unauthenticated'|'forbidden'}
 */
export function mayServe( classification, session ) {
	if ( classification.tier === 'public' ) {
		return 'serve';
	}
	if ( ! session?.authenticated ) {
		return 'unauthenticated';
	}
	if ( classification.tier === 'shared' ) {
		return 'serve';
	}
	const id = pageContractId( classification, session.components );
	return id !== null && COMPONENT_ID.test( id ) && session.components.has( id ) ? 'serve' : 'forbidden';
}
