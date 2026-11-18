/**
 * A settings form as data: which fields there are, what changed since the last save,
 * and what an error response says about each field. No Vue, no document.
 *
 * Shared by the settings screens (see use-settings-form.js); each passes its own fields.
 */

/**
 * The functions of a settings form, bound to its fields.
 *
 * @param {object}   options
 * @param {string[]} options.fields       Editable fields of the screen, in screen order.
 * @param {string[]} [options.keepInput]  Fields whose input is kept when saving it fails;
 *                                        the others (selectors) show the saved value again.
 * @param {Object<string, string>} [options.controlIds] The control that takes focus for a
 *                                        field, where its id is not the field name.
 * @return {{valuesOf: Function, changedFields: Function, errorsOf: Function, valuesAfterPartialSave: Function, firstInvalid: Function, describedBy: Function, controlId: Function}}
 */
export function createFormState( { fields, keepInput = [], controlIds = {} } ) {
	const FIELDS = [ ...fields ];
	const KEEP_INPUT = new Set( keepInput );

	/** The values of the fields the site has, from the settings data. */
	function valuesOf( data ) {
		const values = {};
		for ( const field of FIELDS ) {
			if ( data && Object.hasOwn( data, field ) ) {
				values[ field ] = data[ field ];
			}
		}
		return values;
	}

	/** The fields whose value differs from the saved one; fixed fields are never sent. */
	function changedFields( values, saved, locked = [] ) {
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
	function errorsOf( error, fallback = '' ) {
		const fieldErrors = {};
		const notices = [];
		let settings = null;

		if ( error?.code === 'rest_invalid_param' && error.data?.params && typeof error.data.params === 'object' ) {
			for ( const [ field, message ] of Object.entries( error.data.params ) ) {
				if ( FIELDS.includes( field ) ) {
					fieldErrors[ field ] = String( message );
				}
			}
			notices.push( { type: 'error', message: String( error.message ?? '' ) } );
		} else if ( error?.code === 'admin_settings_errors' && Array.isArray( error.data?.errors ) ) {
			for ( const item of error.data.errors ) {
				if ( item?.field && FIELDS.includes( item.field ) && ! fieldErrors[ item.field ] ) {
					fieldErrors[ item.field ] = String( item.message );
				}
				notices.push( { type: item?.type ?? 'error', message: String( item?.message ?? '' ) } );
			}
			settings = error.data.settings && typeof error.data.settings === 'object' ? error.data.settings : null;
		} else {
			notices.push( { type: 'error', message: String( error?.message || fallback ) } );
		}

		return { fields: fieldErrors, notices: notices.filter( ( notice ) => notice.message !== '' ), settings };
	}

	/**
	 * The form values after a partial save: the saved values, except that a field with an
	 * error that keeps its input keeps what the user typed.
	 */
	function valuesAfterPartialSave( values, saved, errors ) {
		const next = { ...saved };
		for ( const field of Object.keys( errors ) ) {
			if ( KEEP_INPUT.has( field ) && Object.hasOwn( values, field ) ) {
				next[ field ] = values[ field ];
			}
		}
		return next;
	}

	/** The first field with an error, in screen order. */
	const firstInvalid = ( errors ) => FIELDS.find( ( field ) => Boolean( errors[ field ] ) ) ?? null;

	/** Ids an `aria-describedby` lists: the description's, then the error's when there is one. */
	function describedBy( field, description, errors ) {
		const ids = [];
		if ( description ) {
			ids.push( description );
		}
		if ( errors[ field ] ) {
			ids.push( field + '-error' );
		}
		return ids.length ? ids.join( ' ' ) : null;
	}

	/** The id of the control that takes focus for a field. */
	const controlId = ( field ) => controlIds[ field ] ?? field;

	return { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId };
}
