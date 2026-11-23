/*
 * The search of the installed themes, as theme.js's collection searches them on themes.php
 * (`themes.Collection.search()`, theme.js:213-245): a functional core the Themes page's shell
 * runs after its pause. A classic JavaScript rule, reproduced: WordPress decides nothing here.
 *
 * - The term is trimmed; RegExp characters are text; a space separates words, each of which
 *   must match somewhere, in any order (`^(?=.*one)(?=.*two).+`, case-insensitive).
 * - A theme matches when its name, id, description, author or tags do, markup removed from the
 *   name, description and author (as theme.js strips `<…>`), all joined as one haystack.
 * - An empty term matches every theme.
 */

const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const stripTags = ( value ) => text( value ).replace( /(<([^>]+)>)/gi, '' );

/** The pattern theme.js builds for a term, or null for an empty one. Pure. */
function pattern( term ) {
	const trimmed = text( term ).trim();
	if ( trimmed === '' ) {
		return null;
	}
	const escaped = trimmed.replace( /[-/\\^$*+?.()|[\]{}]/g, '\\$&' ).replace( / /g, ')(?=.*' );
	return { escaped, match: new RegExp( '^(?=.*' + escaped + ').+', 'i' ) };
}

/** What theme.js searches in a theme, as one string (its `_.union()` array, joined). Pure. */
const haystack = ( theme ) => [ stripTags( theme?.name ), text( theme?.id ), stripTags( theme?.description ), stripTags( theme?.author ), text( theme?.tags ) ].join( ',' );

/**
 * The ids of the themes a term finds, in the order given. Pure.
 *
 * @param {object[]} themes The cards (`id`, `name`, `description`, `author`, `tags`).
 * @param {string}   term   The term typed.
 * @return {string[]} The ids.
 */
export function matchThemes( themes, term ) {
	const list = Array.isArray( themes ) ? themes.filter( ( theme ) => theme && typeof theme.id === 'string' ) : [];
	const found = pattern( term );
	if ( ! found ) {
		return list.map( ( theme ) => theme.id );
	}
	return list.filter( ( theme ) => found.match.test( haystack( theme ) ) ).map( ( theme ) => theme.id );
}

/**
 * Whether a theme's card shows its author for a term, as theme.js sets `displayAuthor`: the term
 * matches the author and is longer than two characters (as escaped). Pure.
 *
 * @param {object} theme The card.
 * @param {string} term  The term typed.
 * @return {boolean} Whether the author shows.
 */
export function showsAuthor( theme, term ) {
	const found = pattern( term );
	return Boolean( found ) && found.escaped.length > 2 && found.match.test( text( theme?.author ) );
}
