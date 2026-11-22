/*
 * The functional core of Profile and Edit User: pure functions from the page's data and the
 * form's values to the values the form opens with (valuesOf()), to what the classic
 * `form#your-profile` posts (classicPost()), and to the "Display name publicly as" choices that
 * user-profile.js adds while typing (displayChoices()). The component (user-edit.js and its
 * sections) is the imperative shell over it.
 */

const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** Whether a Personal Options row is shown: the data gives null for a hidden row. */
const shown = ( value ) => value !== null && value !== undefined;

/** The contact methods the Contact Info section shows (`{ name, label }`). */
export const contactMethods = ( data ) => list( data?.contact?.methods ).filter( ( method ) => typeof method?.name === 'string' && method.name !== '' );

/**
 * The values the form opens with, under the classic field names: the stored text values, the
 * checkboxes as booleans (checked or not), the selected scheme, language and role, the contact
 * methods' values in `contact`, and no password (`password`: what the password rows give, empty
 * until Set New Password).
 *
 * @param {object} data The page's data.
 * @return {object} The values.
 */
export function valuesOf( data ) {
	const user = data?.user ?? {};
	const personal = data?.personal ?? {};
	const contact = {};
	for ( const method of contactMethods( data ) ) {
		contact[ method.name ] = text( user.contact?.[ method.name ] );
	}
	return {
		first_name: text( user.firstName ),
		last_name: text( user.lastName ),
		nickname: text( user.nickname ),
		display_name: text( user.displayName ),
		email: text( user.email ),
		url: text( user.url ),
		description: text( user.description ),
		contact,
		rich_editing: personal.richEditing === true,
		syntax_highlighting: personal.syntaxHighlighting === true,
		comment_shortcuts: personal.commentShortcuts === true,
		admin_bar_front: personal.toolbar === true,
		infinite_scrolling: personal.infiniteScrolling === true,
		admin_color: text( personal.colorScheme?.current ),
		locale: text( personal.language?.selected ),
		role: text( data?.name?.role?.selected ),
		password: '',
	};
}

/**
 * What the classic `form#your-profile` posts for the values: only the fields of the rows the data
 * shows; a checkbox as its classic value when checked and absent when not (`rich_editing`,
 * `syntax_highlighting` and `infinite_scrolling` `'false'`, `comment_shortcuts` `'true'`,
 * `admin_bar_front` `'1'`); the read-only `user_login`; `pass1` and `pass2` (equal, as
 * user-profile.js's submit handler copies it) only when the password rows show and a password was
 * set (Set New Password), as the hidden field is disabled otherwise.
 *
 * @param {object} data   The page's data.
 * @param {object} values The form's values (see valuesOf()).
 * @return {object} The `fields` of `POST users/{id}`.
 */
export function classicPost( data, values ) {
	const personal = data?.personal ?? {};
	const posted = { user_login: text( data?.user?.login ) };
	const box = ( row, name, value ) => {
		if ( shown( row ) && values[ name ] === true ) {
			posted[ name ] = value;
		}
	};
	box( personal.richEditing, 'rich_editing', 'false' );
	box( personal.syntaxHighlighting, 'syntax_highlighting', 'false' );
	if ( shown( personal.colorScheme ) ) {
		posted.admin_color = text( values.admin_color );
	}
	box( personal.commentShortcuts, 'comment_shortcuts', 'true' );
	box( personal.toolbar, 'admin_bar_front', '1' );
	box( personal.infiniteScrolling, 'infinite_scrolling', 'false' );
	if ( shown( personal.language ) ) {
		posted.locale = text( values.locale );
	}
	if ( shown( data?.name?.role ) ) {
		posted.role = text( values.role );
	}
	for ( const name of [ 'first_name', 'last_name', 'nickname', 'display_name', 'email', 'url' ] ) {
		posted[ name ] = text( values[ name ] );
	}
	for ( const method of contactMethods( data ) ) {
		posted[ method.name ] = text( values.contact?.[ method.name ] );
	}
	posted.description = text( values.description );
	const password = text( values.password );
	if ( data?.account?.password === true && password !== '' ) {
		posted.pass1 = password;
		posted.pass2 = password;
	}
	return posted;
}

/**
 * The "Display name publicly as" choices after the names were typed, as user-profile.js adds them
 * when a name field loses focus: the nickname, the username, the first and last names and, with
 * both, "First Last" and "Last First", each with its tags stripped and added at the end when it is
 * not a choice yet. Nothing is removed, as classic.
 *
 * @param {string[]} base   The choices so far (the data's `name.displayNames` at first).
 * @param {object}   values `first_name`, `last_name`, `nickname` and `login`.
 * @return {string[]} The choices.
 */
export function displayChoices( base, values ) {
	const choices = list( base ).map( text );
	const first = text( values?.first_name );
	const last = text( values?.last_name );
	const inputs = [ text( values?.nickname ), text( values?.login ), first, last ];
	if ( first !== '' && last !== '' ) {
		inputs.push( first + ' ' + last, last + ' ' + first );
	}
	for ( const value of inputs ) {
		if ( value === '' ) {
			continue;
		}
		const stripped = value.replace( /<\/?[a-z][^>]*>/gi, '' );
		if ( ! choices.includes( stripped ) ) {
			choices.push( stripped );
		}
	}
	return choices;
}
