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

/** Whether a page ID is among a selector's choices. */
export const isChoice = ( list, value ) => Array.isArray( list ) && list.some( ( choice ) => choice.value === value );

/**
 * The values of the `blog_public` radio buttons a markup string has (the privacy selector's
 * output), in order.
 *
 * @param {string} html Markup.
 * @return {string[]} Values.
 */
export function radioValuesIn( html ) {
	const found = [];
	for ( const [ tag ] of String( html ?? '' ).matchAll( /<input\b[^>]*>/gi ) ) {
		const attribute = ( name ) => new RegExp( '\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i' ).exec( tag );
		const value = ( match ) => ( match ? match[ 1 ] ?? match[ 2 ] ?? match[ 3 ] ?? '' : null );
		if ( value( attribute( 'name' ) ) === 'blog_public' && String( value( attribute( 'type' ) ) ).toLowerCase() === 'radio' ) {
			found.push( value( attribute( 'value' ) ) ?? 'on' );
		}
	}
	return found;
}

/**
 * What the classic form posts, at each save, for the fields whose controls cannot always show
 * the stored value; the native save sends it whether or not the form changed, so that it
 * stores what a classic save stores (ruling P7):
 *
 * - A page selector posts nothing (saved as 0) when it is disabled (any choice but "A static
 *   page") or missing (no pages to list), and "— Select —" (0) when the stored page is not
 *   among its choices (e.g. a page that is now a draft): the browser shows the first option.
 * - The visibility checkbox is unchecked unless the stored value is `0`, and an unchecked
 *   box posts nothing, saved as `1`: a stored `-1` (left by a privacy plugin) becomes `1`.
 * - With the visibility radio buttons, a stored value that no radio button has leaves none
 *   checked, which posts nothing, saved as `1`.
 *
 * A field is listed when what the classic form posts differs from the stored value or from
 * the form value (which a change would otherwise send).
 *
 * @param {object}   values      Form values.
 * @param {object}   settings    Page data (the stored values and `choices`).
 * @param {object}   [options]
 * @param {boolean}  [options.privacySelector=false] Whether the radio buttons are shown.
 * @param {string[]} [options.radioValues=[]]        Values of the radio buttons shown (core and plugin).
 * @return {object} Field => value to send.
 */
export function classicFields( values, settings = {}, { privacySelector = false, radioValues = [] } = {} ) {
	const sent = {};
	const lists = { page_on_front: settings?.choices?.pageOnFront, page_for_posts: settings?.choices?.pageForPosts };

	for ( const field of PAGE_FIELDS ) {
		if ( ! Object.hasOwn( values, field ) ) {
			continue;
		}
		const shown = Array.isArray( lists[ field ] ) && lists[ field ].length > 0;
		const posted = values.show_on_front === 'page' && shown && isChoice( lists[ field ], values[ field ] ) ? values[ field ] : 0;
		if ( posted !== Number( settings?.[ field ] ?? 0 ) || posted !== values[ field ] ) {
			sent[ field ] = posted;
		}
	}

	if ( Object.hasOwn( values, 'blog_public' ) ) {
		const stored = String( settings?.blog_public ?? '' );
		if ( privacySelector ) {
			const chosen = String( values.blog_public );
			const result = radioValues.includes( chosen ) ? chosen : '1';
			if ( result !== stored || result !== chosen ) {
				sent.blog_public = result;
			}
		} else {
			const checked = values.blog_public === true;
			if ( ( checked ? '0' : '1' ) !== stored ) {
				sent.blog_public = checked;
			}
		}
	}

	return sent;
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
