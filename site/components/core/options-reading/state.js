/**
 * The Reading Settings form as data: which fields there are, what the classic form posts
 * for the page selectors, and the parts of a translated sentence around its placeholder.
 * No Vue, no document.
 *
 * The functions are the shared settings form's (see ../settings-form/state.js), bound to
 * Reading's fields.
 */
import { createFormState } from '../settings-form/state.js';
import { decodeEntities } from '../../../kit/Interpolate.js';

/** Editable fields of the screen, in screen order. The site has only some (see the page data). */
export const FIELDS = [
	'show_on_front',
	'page_on_front',
	'page_for_posts',
	'posts_per_page',
	'posts_per_rss',
	'rss_use_excerpt',
	'blog_public',
	'blog_charset',
];

/** Fields whose input is kept when saving it fails: the text and number inputs. */
export const KEEP_INPUT = [ 'posts_per_page', 'posts_per_rss', 'blog_charset' ];

/** The page selectors, which the classic screen disables unless "A static page" is chosen. */
export const PAGE_FIELDS = [ 'page_on_front', 'page_for_posts' ];

/**
 * The control that takes focus for a field whose control id is not the field name.
 *
 * @param {boolean} privacySelector Whether the visibility radio buttons are shown.
 * @return {Object<string, string>} Field => control id.
 */
export const controlIdsFor = ( privacySelector ) => ( {
	show_on_front: 'show-on-front-posts',
	rss_use_excerpt: 'rss-use-full-text',
	blog_public: privacySelector ? 'blog-public' : 'blog_public',
} );

/**
 * The checkbox values of the screen: the "Discourage search engines" checkbox posts `0`
 * when checked and nothing when unchecked. With the visibility radio buttons there is no
 * checkbox: `blog_public` is the value of the chosen radio button.
 *
 * @param {boolean} privacySelector Whether the visibility radio buttons are shown.
 * @return {Object<string, Array>} Field => [ on-value, off-value ].
 */
export const checkboxValuesFor = ( privacySelector ) => ( privacySelector ? {} : { blog_public: [ '0', null ] } );

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT } );

/**
 * The page selectors as the classic form posts them: a disabled selector (any choice but
 * "A static page") or a missing one (no pages to list) posts nothing, which saves 0. The
 * values to set before a save, so that the native save writes the same.
 *
 * @param {object} values  Form values.
 * @param {object} choices Page data `choices` (`pageOnFront`, `pageForPosts`).
 * @return {object} Field => 0 for each page selector that posts nothing.
 */
export function unpostedPages( values, choices = {} ) {
	const lists = { page_on_front: choices?.pageOnFront, page_for_posts: choices?.pageForPosts };
	const cleared = {};
	for ( const field of PAGE_FIELDS ) {
		if ( ! Object.hasOwn( values, field ) ) {
			continue;
		}
		const shown = Array.isArray( lists[ field ] ) && lists[ field ].length > 0;
		if ( values.show_on_front !== 'page' || ! shown ) {
			cleared[ field ] = 0;
		}
	}
	return cleared;
}

/**
 * A translated sentence with one placeholder for a control (`Homepage: %s`), as the text
 * before and after it. Character references are decoded and `%%` is a percent sign; a
 * translation without the placeholder puts the control at the end.
 *
 * @param {string} text Translated sentence.
 * @return {{before: string, after: string}} Text around the control.
 */
export function aroundPlaceholder( text ) {
	const source = String( text ?? '' );
	const match = /%(?:1\$)?s/.exec( source.replace( /%%/g, '\u0000\u0000' ) );
	const clean = ( part ) => decodeEntities( part.replace( /%%/g, '%' ) );
	if ( ! match ) {
		return { before: clean( source ), after: '' };
	}
	return { before: clean( source.slice( 0, match.index ) ), after: clean( source.slice( match.index + match[ 0 ].length ) ) };
}

/**
 * The label of a page choice as the classic selector shows it: three non-breaking spaces
 * per level before the title (Walker_PageDropdown).
 *
 * @param {{label: string, depth?: number}} choice Page choice.
 * @return {string} Label.
 */
export const pageLabel = ( choice ) => ' '.repeat( Math.max( 0, Number( choice?.depth ) || 0 ) * 3 ) + String( choice?.label ?? '' );
