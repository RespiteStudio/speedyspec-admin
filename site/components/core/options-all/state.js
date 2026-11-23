/**
 * All Settings as data: the rows, their form values, and what a save sends. No Vue, no
 * document.
 */

/**
 * Sets a key of a values object as its own property, whatever its name: an option may be
 * named `__proto__`, which an assignment would take for the prototype.
 */
export function put( object, key, value ) {
	Object.defineProperty( object, key, { value, writable: true, enumerable: true, configurable: true } );
	return object;
}

/** A row's own entry of a values object, or undefined: never an Object.prototype member. */
export const own = ( object, key ) => ( object && Object.hasOwn( object, key ) ? object[ key ] : undefined );

/** The rows of a settings answer. */
export const rowsOf = ( settings ) => ( Array.isArray( settings?.rows ) ? settings.rows : [] );

/** The names of the rows that can be changed, in screen order. */
export const editableNames = ( rows ) => rows.filter( ( row ) => row?.editable === true ).map( ( row ) => row.name );

/** The form values: the value of each row that can be changed, keyed by option name. */
export function valuesOf( rows ) {
	const values = {};
	for ( const row of rows ) {
		if ( row?.editable === true ) {
			put( values, row.name, String( row.value ?? '' ) );
		}
	}
	return values;
}

/**
 * The value the classic form posts for a row: a textarea posts its line breaks as CR LF.
 *
 * @param {{multiline?: boolean}} row   Row.
 * @param {string}                value Value in the form.
 * @return {string} Value to send.
 */
export const postedValue = ( row, value ) => ( row?.multiline === true ? String( value ).replace( /\r?\n/g, '\r\n' ) : String( value ) );

/**
 * The rows whose value differs from the saved one, as the classic form would post them.
 *
 * A textarea's value is compared as posted, so that the line breaks the browser normalizes
 * are no change.
 *
 * @param {object[]}               rows   Rows.
 * @param {Object<string, string>} values Form values.
 * @param {Object<string, string>} saved  Saved values.
 * @return {Object<string, string>} Option name => value to send.
 */
export function changedRows( rows, values, saved ) {
	const changed = {};
	for ( const row of rows ) {
		if ( row?.editable !== true || ! Object.hasOwn( values, row.name ) || ! Object.hasOwn( saved, row.name ) ) {
			continue;
		}
		const value = postedValue( row, values[ row.name ] );
		if ( value !== postedValue( row, saved[ row.name ] ) ) {
			put( changed, row.name, value );
		}
	}
	return changed;
}
