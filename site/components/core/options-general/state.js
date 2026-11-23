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

/** Whether a format is one of the offered ones (else the Custom choice is selected). */
export const isPreset = ( format, choices ) => ( choices ?? [] ).some( ( choice ) => choice.value === format );
