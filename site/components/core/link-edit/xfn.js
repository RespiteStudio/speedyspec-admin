/*
 * The XHTML Friends Network rules of the link form's XFN box, as xfn.js applies them on the
 * client: `rel` is the checked choices' values, in order, or "me" alone when "another web address
 * of mine" is checked, which disables every other choice. Pure functions, a port of classic
 * JavaScript (wp-admin/js/xfn.js), not of a PHP rule.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The `rel` field's value: "me" when it is checked, else the checked values that are not empty
 * ("none" is the empty value), separated by spaces. Pure.
 *
 * @param {{me: boolean, values: string[]}} choices Whether "me" is checked, and the values of the
 *                                                  other checked choices, in document order.
 * @return {string} The relationship.
 */
export function composeRel( choices ) {
	if ( choices?.me === true ) {
		return 'me';
	}
	return list( choices?.values ).filter( ( value ) => typeof value === 'string' && value !== '' ).join( ' ' );
}

/**
 * Whether the other choices are disabled: when "another web address of mine" is checked. Pure.
 *
 * @param {{me: boolean}} choices The choices, see composeRel().
 * @return {boolean} Whether they are disabled.
 */
export const meDisables = ( choices ) => choices?.me === true;

/**
 * The id of a choice's input, as link_xfn_meta_box() prints it: the value, the group's name for
 * its "none" choice, and `romantic` for "sweetheart". Pure.
 *
 * @param {string} group The group's name.
 * @param {string} value The choice's value.
 * @return {string} The id.
 */
export function choiceId( group, value ) {
	if ( value === '' ) {
		return group;
	}
	return value === 'sweetheart' ? 'romantic' : value;
}
