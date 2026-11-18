/**
 * The Writing Settings form as data: which fields there are, what changed since the last
 * save, and what an error response says about each field. No Vue, no document.
 *
 * The functions are the shared settings form's (see ../settings-form/state.js), bound to
 * Writing's fields.
 */
import { createFormState } from '../settings-form/state.js';

/** Editable fields of the screen, in screen order. The site has only some (see the page data). */
export const FIELDS = [
	'use_smilies',
	'use_balanceTags',
	'default_category',
	'default_post_format',
	'default_link_category',
	'mailserver_url',
	'mailserver_port',
	'mailserver_login',
	'mailserver_pass',
	'default_email_category',
	'ping_sites',
];

/** Fields whose input is kept when saving it fails: the text inputs. */
export const KEEP_INPUT = [ 'mailserver_url', 'mailserver_port', 'mailserver_login', 'mailserver_pass', 'ping_sites' ];

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT } );

/** The selects of the screen: field => the choices list in the settings and the type of its values. */
const SELECTS = {
	default_category: { list: 'categories', toValue: Number },
	default_post_format: { list: 'postFormats', toValue: String },
	default_link_category: { list: 'linkCategories', toValue: Number },
	default_email_category: { list: 'categories', toValue: Number },
};

/**
 * What the classic form posts where its select cannot show the stored value (ruling P7):
 * a stored category or post format that is not a choice (a deleted category, a format the
 * theme no longer supports) leaves no option selected, so the browser shows and posts the
 * first choice. Those fields are sent with the first choice at every save, whether or not
 * they changed. A select without choices posts nothing, and is not sent.
 *
 * @param {object} values   Form values.
 * @param {object} settings The settings the server last returned (with `choices`).
 * @return {object} Field => value to send.
 */
export function classicFields( values, settings = {} ) {
	const sent = {};
	for ( const [ field, { list, toValue } ] of Object.entries( SELECTS ) ) {
		const choices = settings?.choices?.[ list ];
		if ( ! Object.hasOwn( values, field ) || ! Array.isArray( choices ) || choices.length === 0 ) {
			continue;
		}
		if ( ! choices.some( ( choice ) => String( choice?.value ) === String( values[ field ] ) ) ) {
			sent[ field ] = toValue( choices[ 0 ].value );
		}
	}
	return sent;
}

/** The characters of wp_generate_password( 8, false ): letters and digits. */
const CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * A random string as the classic screen suggests for the secret mail address
 * (wp_generate_password( 8, false )), from the browser's cryptographic random numbers.
 *
 * @param {number} [length=8] Length.
 * @param {{getRandomValues: Function}} [source=globalThis.crypto] Random numbers.
 * @return {string} The string.
 */
export function randomString( length = 8, source = globalThis.crypto ) {
	const bytes = new Uint32Array( length );
	source.getRandomValues( bytes );
	let text = '';
	for ( const value of bytes ) {
		text += CHARACTERS[ value % CHARACTERS.length ];
	}
	return text;
}

/**
 * The label of a category choice as the classic selector shows it: three non-breaking
 * spaces per level before the name (Walker_CategoryDropdown).
 *
 * @param {{label: string, depth?: number}} choice Category choice.
 * @return {string} Label.
 */
export const categoryLabel = ( choice ) => ' '.repeat( Math.max( 0, Number( choice?.depth ) || 0 ) * 3 ) + String( choice?.label ?? '' );
