/**
 * The Discussion Settings form as data: which fields there are, what the classic form posts
 * for the fields whose controls cannot show the stored value, and the radio buttons of the
 * classic avatar list. No Vue, no document.
 *
 * The functions are the shared settings form's (see ../settings-form/state.js), bound to
 * Discussion's fields.
 */
import { createFormState } from '../settings-form/state.js';

/** Editable fields of the screen, in screen order. */
export const FIELDS = [
	'default_pingback_flag',
	'default_ping_status',
	'default_comment_status',
	'require_name_email',
	'comment_registration',
	'close_comments_for_old_posts',
	'close_comments_days_old',
	'show_comments_cookies_opt_in',
	'thread_comments',
	'thread_comments_depth',
	'page_comments',
	'comments_per_page',
	'default_comments_page',
	'comment_order',
	'comments_notify',
	'moderation_notify',
	'wp_notes_notify',
	'comment_moderation',
	'comment_previously_approved',
	'comment_max_links',
	'moderation_keys',
	'disallowed_keys',
	'show_avatars',
	'avatar_rating',
	'avatar_default',
];

/** The number inputs. */
export const NUMBERS = [ 'close_comments_days_old', 'comments_per_page', 'comment_max_links' ];

/** Fields whose input is kept when saving it fails: the number inputs and the text areas. */
export const KEEP_INPUT = [ ...NUMBERS, 'moderation_keys', 'disallowed_keys' ];

/** The "Maximum Rating" values, in screen order. */
export const RATINGS = [ 'G', 'PG', 'R', 'X' ];

/**
 * The control that takes focus for a field whose control id is not the field name: the
 * first radio button of a group.
 *
 * @param {object} [settings] Page data (the avatar choices).
 * @return {Object<string, string>} Field => control id.
 */
export function controlIdsFor( settings ) {
	const first = settings?.choices?.avatarDefault?.[ 0 ]?.value;
	return {
		avatar_rating: 'avatar_rating_G',
		// The classic list gives its radio buttons the same ids (`avatar_{value}`).
		avatar_default: first === undefined ? 'avatar_rating_G' : 'avatar_' + first,
	};
}

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT } );

/**
 * The value of a number input: a number, or empty when the input is cleared (the classic
 * form posts the empty value, which is saved as 0).
 */
export const numberValue = ( input ) => ( String( input ?? '' ).trim() === '' ? '' : Number( input ) );

/**
 * The radio buttons named `name` a markup string has, in order.
 *
 * @param {string} html Markup.
 * @param {string} name Name of the radio buttons.
 * @return {{value: string, checked: boolean}[]} The radio buttons.
 */
export function radiosIn( html, name ) {
	const found = [];
	for ( const [ tag ] of String( html ?? '' ).matchAll( /<input\b[^>]*>/gi ) ) {
		const attribute = ( attr ) => new RegExp( '\\s' + attr + '(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+)))?(?=[\\s/>])', 'i' ).exec( tag );
		const value = ( match ) => ( match ? match[ 1 ] ?? match[ 2 ] ?? match[ 3 ] ?? '' : null );
		if ( value( attribute( 'name' ) ) === name && String( value( attribute( 'type' ) ) ).toLowerCase() === 'radio' ) {
			found.push( { value: value( attribute( 'value' ) ) ?? 'on', checked: attribute( 'checked' ) !== null } );
		}
	}
	return found;
}

/**
 * The default avatar the classic avatar list (plugin markup) posts: the value of its
 * checked radio button, or empty when none is checked (the classic form posts nothing).
 *
 * @param {string} html Markup of the list.
 * @return {string} Value.
 */
export const checkedAvatarIn = ( html ) => radiosIn( html, 'avatar_default' ).find( ( radio ) => radio.checked )?.value ?? '';

/**
 * What the native save sends, at each save, whether or not the form changed, so that it
 * stores what a classic save stores (ruling P7):
 *
 * - the fields the page data lists in `unshown`, whose stored value the controls cannot
 *   show (an unchecked box over a stored `0` or `closed`, a select over a value it does not
 *   have, which shows its first option, a radio group with no matching button, an empty or
 *   non-numeric number, the missing notes option and default avatar): the value the form
 *   has, which is what the control shows, or what the user chose since;
 * - with the classic avatar list (plugin markup), the default avatar its checked radio
 *   button posts (empty for none, which is saved as nothing posted).
 *
 * @param {object}      values                  Form values.
 * @param {object}      settings                Page data.
 * @param {object}      [options]
 * @param {string|null} [options.avatarFromList] The default avatar the classic list posts, null
 *                                              without the classic list.
 * @return {object} Field => value to send.
 */
export function classicFields( values, settings = {}, { avatarFromList = null } = {} ) {
	const sent = {};
	for ( const field of Array.isArray( settings?.unshown ) ? settings.unshown : [] ) {
		if ( FIELDS.includes( field ) && Object.hasOwn( values, field ) ) {
			sent[ field ] = values[ field ];
		}
	}
	if ( typeof avatarFromList === 'string' && Object.hasOwn( values, 'avatar_default' ) ) {
		sent.avatar_default = avatarFromList;
	}
	return sent;
}
