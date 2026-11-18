/**
 * The General Settings form as data: which fields there are, what changed since the
 * last save, and what an error response says about each field. No Vue, no document.
 *
 * The functions are the shared settings form's (see ../settings-form/state.js), bound to
 * General's fields.
 */
import { createFormState } from '../settings-form/state.js';

/** Editable fields of the screen, in screen order. */
export const FIELDS = [
	'blogname',
	'blogdescription',
	'siteurl',
	'home',
	'new_admin_email',
	'users_can_register',
	'default_role',
	'WPLANG',
	'timezone_string',
	'date_format',
	'time_format',
	'start_of_week',
];

/** Fields whose input is kept when saving it fails; selectors show the saved value again. */
export const KEEP_INPUT = [ 'blogname', 'blogdescription', 'siteurl', 'home', 'new_admin_email', 'date_format', 'time_format' ];

/** The control that takes focus for a field, where its id is not the field name. */
export const CONTROL_IDS = { date_format: 'date_format_custom', time_format: 'time_format_custom' };

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT, controlIds: CONTROL_IDS } );

/** The selects whose classic control shows its first option over a stored value it does not have. */
const SELECTS = { default_role: 'roles', start_of_week: 'weekdays' };

/**
 * What the native save sends at every save, whether or not the form changed, so that it
 * stores what a classic save stores (ruling P7):
 *
 * - the Membership checkbox when the page data lists it in `unshown` (unchecked over a stored
 *   value it cannot show, for which the classic form posts nothing): the value the form has;
 * - the New User Default Role and Week Starts On selects over a stored value that is not a
 *   choice (a role that no longer exists, a day out of range): no option is selected, so the
 *   browser shows and posts the first one.
 *
 * The language and timezone selectors are not covered: their values come normalized from
 * the server (see the General checklist).
 *
 * @param {object} values   Form values.
 * @param {object} settings The settings the server last returned (with `choices`).
 * @return {object} Field => value to send.
 */
export function classicFields( values, settings = {} ) {
	const sent = {};
	for ( const field of Array.isArray( settings?.unshown ) ? settings.unshown : [] ) {
		if ( FIELDS.includes( field ) && Object.hasOwn( values, field ) ) {
			sent[ field ] = values[ field ];
		}
	}
	for ( const [ field, list ] of Object.entries( SELECTS ) ) {
		const choices = settings?.choices?.[ list ];
		if ( Object.hasOwn( values, field ) && Array.isArray( choices ) && choices.length > 0 && ! choices.some( ( choice ) => String( choice?.value ) === String( values[ field ] ) ) ) {
			sent[ field ] = choices[ 0 ].value;
		}
	}
	return sent;
}

/** Whether a format is one of the offered ones (else the Custom choice is selected). */
export const isPreset = ( format, choices ) => ( choices ?? [] ).some( ( choice ) => choice.value === format );

/** The `admin_email_updated` notice is due when the classic confirmation link led here. */
export function emailUpdated( path ) {
	const query = String( path ?? '' ).split( '?' )[ 1 ] ?? '';
	return new URLSearchParams( query ).has( 'admin_email_updated' );
}
