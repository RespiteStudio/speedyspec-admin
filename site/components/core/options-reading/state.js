/**
 * The Reading Settings form as data: which fields there are, the controls that take focus,
 * and the parts of a translated sentence around its placeholder. No Vue, no document.
 *
 * What the classic form posts where its controls cannot show the stored value is decided by
 * the endpoint (the values as the controls show them, and `unshown`), and replayed by the
 * shared settings form; the endpoint also saves the page selectors as 0 while the homepage
 * displays the latest posts, as the classic form's disabled selectors post nothing.
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

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT } );

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
