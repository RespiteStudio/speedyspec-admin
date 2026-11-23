/**
 * The Media Settings form as data: which fields there are, what changed since the last
 * save, and what an error response says about each field. No Vue, no document.
 *
 * The functions are the shared settings form's (see ../settings-form/state.js), bound to
 * Media's fields.
 */
import { createFormState } from '../settings-form/state.js';

/** Editable fields of the screen, in screen order. The site has only some (see the page data). */
export const FIELDS = [
	'thumbnail_size_w',
	'thumbnail_size_h',
	'thumbnail_crop',
	'medium_size_w',
	'medium_size_h',
	'large_size_w',
	'large_size_h',
	'upload_path',
	'upload_url_path',
	'uploads_use_yearmonth_folders',
];

/** The image size fields: number inputs. */
export const SIZES = [ 'thumbnail_size_w', 'thumbnail_size_h', 'medium_size_w', 'medium_size_h', 'large_size_w', 'large_size_h' ];

/** Fields whose input is kept when saving it fails. */
export const KEEP_INPUT = [ ...SIZES, 'upload_path', 'upload_url_path' ];

export const { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, describedBy, controlId } = createFormState( { fields: FIELDS, keepInput: KEEP_INPUT } );

/**
 * The value of an image size input: a number, or empty when the input is cleared (the
 * classic form posts the empty value, which is saved as 0).
 */
export const sizeValue = ( input ) => ( String( input ?? '' ).trim() === '' ? '' : Number( input ) );
