// Which static files a request may have: pure decisions on the normalised path (static.mjs staticKey),
// taken before the file system is looked at.

import { COMPONENT_ID } from './auth.mjs';

/** The lists themselves: read by the proxy, never served. */
const LIST_FILES = new Set( [ '/public-files.json', '/shared-files.json' ] );

const stripJs = ( name ) => ( name.endsWith( '.js' ) ? name.slice( 0, -3 ) : name );

/**
 * The tier of a normalised path.
 *
 * - `public`: on the public list (anyone).
 * - `shared`: on the shared list (any signed-in user).
 * - `page` with `contractId`: any other page file, named by the first two segments of its path
 *   below the area, as contract ids are exactly two segments (auth.mjs COMPONENT_ID):
 *   `/contracts/<a>/<b>.js` → `<a>/<b>`; `/components/<a>/<b>.js` and
 *   `/components/<a>/<b>/<anything>` → `<a>/<b>`. The id may still be invalid (an uppercase or
 *   dotted name): such an id is never allowed.
 * - `page` without `contractId`: anything else (a `/contracts/` path of more or fewer than two
 *   segments, a `/components/` path of fewer than two, any dot segment, the list files, any path
 *   outside the two areas that is on no list). Never served.
 *
 * @param {string} key
 * @param {Set<string>} publicFiles
 * @param {Set<string>} sharedFiles
 * @returns {{tier: 'public'|'shared'|'page', contractId?: string}}
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
	const [ , area, ...rest ] = key.split( '/' );
	if ( area === 'contracts' && rest.length === 2 ) {
		return { tier: 'page', contractId: rest[ 0 ] + '/' + stripJs( rest[ 1 ] ) };
	}
	if ( area === 'components' && rest.length === 2 ) {
		return { tier: 'page', contractId: rest[ 0 ] + '/' + stripJs( rest[ 1 ] ) };
	}
	if ( area === 'components' && rest.length > 2 ) {
		return { tier: 'page', contractId: rest[ 0 ] + '/' + rest[ 1 ] };
	}
	return { tier: 'page' };
}

/**
 * Whether a classified path may be served to a caller.
 *
 * @param {{tier: string, contractId?: string}} classification From classifyStatic().
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
	const id = classification.contractId;
	return typeof id === 'string' && COMPONENT_ID.test( id ) && session.components.has( id ) ? 'serve' : 'forbidden';
}
