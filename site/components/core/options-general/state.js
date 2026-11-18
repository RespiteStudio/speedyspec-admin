/**
 * The General Settings form as data: which fields there are, what changed since the
 * last save, and what an error response says about each field. No Vue, no document.
 */

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
const KEEP_INPUT = new Set( [ 'blogname', 'blogdescription', 'siteurl', 'home', 'new_admin_email', 'date_format', 'time_format' ] );

/** The control that takes focus for a field, where its id is not the field name. */
const CONTROL_IDS = { date_format: 'date_format_custom', time_format: 'time_format_custom' };

export const controlId = ( field ) => CONTROL_IDS[ field ] ?? field;

/** The values of the fields the site has, from the settings data. */
export function valuesOf( data ) {
	const values = {};
	for ( const field of FIELDS ) {
		if ( data && Object.hasOwn( data, field ) ) {
			values[ field ] = data[ field ];
		}
	}
	return values;
}

/** The fields whose value differs from the saved one; fixed fields are never sent. */
export function changedFields( values, saved, locked = [] ) {
	const changed = {};
	for ( const field of FIELDS ) {
		if ( Object.hasOwn( values, field ) && ! locked.includes( field ) && values[ field ] !== saved[ field ] ) {
			changed[ field ] = values[ field ];
		}
	}
	return changed;
}

/**
 * What a failed save says.
 *
 * @param {{code?: string, message?: string, data?: object}} error ApiError.
 * @param {string} [fallback] Notice for an error without a WordPress message.
 * @return {{fields: Object<string, string>, notices: {type: string, message: string}[], settings: object|null}}
 *         Messages by field, the notices to show, and for a partial save (the classic
 *         screen saves the valid fields) the settings that were saved.
 */
export function errorsOf( error, fallback = '' ) {
	const fields = {};
	const notices = [];
	let settings = null;

	if ( error?.code === 'rest_invalid_param' && error.data?.params && typeof error.data.params === 'object' ) {
		for ( const [ field, message ] of Object.entries( error.data.params ) ) {
			if ( FIELDS.includes( field ) ) {
				fields[ field ] = String( message );
			}
		}
		notices.push( { type: 'error', message: String( error.message ?? '' ) } );
	} else if ( error?.code === 'admin_settings_errors' && Array.isArray( error.data?.errors ) ) {
		for ( const item of error.data.errors ) {
			if ( item?.field && FIELDS.includes( item.field ) && ! fields[ item.field ] ) {
				fields[ item.field ] = String( item.message );
			}
			notices.push( { type: item?.type ?? 'error', message: String( item?.message ?? '' ) } );
		}
		settings = error.data.settings && typeof error.data.settings === 'object' ? error.data.settings : null;
	} else {
		notices.push( { type: 'error', message: String( error?.message || fallback ) } );
	}

	return { fields, notices: notices.filter( ( notice ) => notice.message !== '' ), settings };
}

/**
 * The form values after a partial save: the saved values, except that a text field
 * with an error keeps what the user typed.
 */
export function valuesAfterPartialSave( values, saved, errors ) {
	const next = { ...saved };
	for ( const field of Object.keys( errors ) ) {
		if ( KEEP_INPUT.has( field ) && Object.hasOwn( values, field ) ) {
			next[ field ] = values[ field ];
		}
	}
	return next;
}

/** The first field with an error, in screen order. */
export const firstInvalid = ( errors ) => FIELDS.find( ( field ) => Boolean( errors[ field ] ) ) ?? null;

/** Ids an `aria-describedby` lists: the description's, then the error's when there is one. */
export function describedBy( field, description, errors ) {
	const ids = [];
	if ( description ) {
		ids.push( description );
	}
	if ( errors[ field ] ) {
		ids.push( field + '-error' );
	}
	return ids.length ? ids.join( ' ' ) : null;
}

/** Whether a format is one of the offered ones (else the Custom choice is selected). */
export const isPreset = ( format, choices ) => ( choices ?? [] ).some( ( choice ) => choice.value === format );

/** The `admin_email_updated` notice is due when the classic confirmation link led here. */
export function emailUpdated( path ) {
	const query = String( path ?? '' ).split( '?' )[ 1 ] ?? '';
	return new URLSearchParams( query ).has( 'admin_email_updated' );
}
