/** @jest-environment jsdom */
// core/user-edit/form-state.js, the page's functional core: the values the form opens with,
// what the classic `form#your-profile` posts for them (classicPost()), and the "Display name
// publicly as" choices user-profile.js adds while typing (displayChoices()).
import { expect, test } from '@jest/globals';
import { classicPost, displayChoices, valuesOf } from '../../../site/components/core/user-edit/form-state.js';
import { LANGUAGE, editData, personal, profileData } from './data.mjs';

test( 'valuesOf: the stored values under the classic field names, the boxes as booleans, no password', () => {
	const data = profileData( { personal: personal( { richEditing: true, syntaxHighlighting: true, commentShortcuts: true, infiniteScrolling: false, language: LANGUAGE } ), contact: { methods: [ { name: 'detached_fixture_contact', label: 'Fixture contact' } ], emailConfirms: true, pendingEmail: null }, user: { ...profileData().user, contact: { detached_fixture_contact: 'handle' } } } );
	expect( valuesOf( data ) ).toEqual( {
		first_name: 'John',
		last_name: 'Doe',
		nickname: 'jdoe',
		display_name: 'John Doe',
		email: 'jdoe@example.org',
		url: 'https://example.org/jdoe',
		description: 'Writes things.',
		contact: { detached_fixture_contact: 'handle' },
		rich_editing: true,
		syntax_highlighting: true,
		comment_shortcuts: true,
		admin_bar_front: true,
		infinite_scrolling: false,
		admin_color: 'modern',
		locale: 'site-default',
		role: '',
		password: '',
	} );
	expect( valuesOf( editData() ).role ).toBe( 'author' );
} );

test( 'classicPost: each personal option as classic posts it, checked and unchecked', () => {
	const data = profileData( { personal: personal( { richEditing: false, syntaxHighlighting: false, commentShortcuts: false, infiniteScrolling: false } ) } );
	const checked = classicPost( data, { ...valuesOf( data ), rich_editing: true, syntax_highlighting: true, comment_shortcuts: true, admin_bar_front: true, infinite_scrolling: true } );
	expect( checked.rich_editing ).toBe( 'false' );
	expect( checked.syntax_highlighting ).toBe( 'false' );
	expect( checked.comment_shortcuts ).toBe( 'true' );
	expect( checked.admin_bar_front ).toBe( '1' );
	expect( checked.infinite_scrolling ).toBe( 'false' );
	const unchecked = classicPost( data, { ...valuesOf( data ), rich_editing: false, syntax_highlighting: false, comment_shortcuts: false, admin_bar_front: false, infinite_scrolling: false } );
	for ( const name of [ 'rich_editing', 'syntax_highlighting', 'comment_shortcuts', 'admin_bar_front', 'infinite_scrolling' ] ) {
		expect( Object.hasOwn( unchecked, name ) ).toBe( false );
	}
} );

test( 'classicPost: only the rows the data shows are included', () => {
	const data = profileData( { personal: personal( { richEditing: null, syntaxHighlighting: null, colorScheme: null, commentShortcuts: null, infiniteScrolling: null, language: null } ) } );
	const posted = classicPost( data, { ...valuesOf( data ), rich_editing: true, syntax_highlighting: true, comment_shortcuts: true, infinite_scrolling: true, admin_color: 'light', locale: 'ar', role: 'editor' } );
	expect( posted ).toEqual( {
		user_login: 'jdoe',
		admin_bar_front: '1',
		first_name: 'John',
		last_name: 'Doe',
		nickname: 'jdoe',
		display_name: 'John Doe',
		email: 'jdoe@example.org',
		url: 'https://example.org/jdoe',
		description: 'Writes things.',
	} );
} );

test( 'classicPost: the color scheme, the language and the contact methods when their rows show', () => {
	const data = profileData( { personal: personal( { language: LANGUAGE } ), contact: { methods: [ { name: 'detached_fixture_contact', label: 'Fixture contact' } ], emailConfirms: true, pendingEmail: null } } );
	const posted = classicPost( data, { ...valuesOf( data ), admin_color: 'light', locale: 'ar', contact: { detached_fixture_contact: '@me', not_shown: 'x' } } );
	expect( posted.admin_color ).toBe( 'light' );
	expect( posted.locale ).toBe( 'ar' );
	expect( posted.detached_fixture_contact ).toBe( '@me' );
	expect( Object.hasOwn( posted, 'not_shown' ) ).toBe( false );
} );

test( 'role only when shown: Edit User with promote_user posts the role, No role as empty; Profile never does', () => {
	const edit = editData();
	expect( classicPost( edit, { ...valuesOf( edit ), role: 'editor' } ).role ).toBe( 'editor' );
	expect( classicPost( edit, { ...valuesOf( edit ), role: '' } ).role ).toBe( '' );
	const own = profileData();
	expect( Object.hasOwn( classicPost( own, { ...valuesOf( own ), role: 'administrator' } ), 'role' ) ).toBe( false );
} );

test( 'classicPost: pass1 and pass2 only after Set New Password, pass2 equal to pass1', () => {
	const data = profileData();
	const closed = classicPost( data, valuesOf( data ) );
	expect( Object.hasOwn( closed, 'pass1' ) ).toBe( false );
	expect( Object.hasOwn( closed, 'pass2' ) ).toBe( false );
	const set = classicPost( data, { ...valuesOf( data ), password: 'Vq7#tR2!mW9z' } );
	expect( set.pass1 ).toBe( 'Vq7#tR2!mW9z' );
	expect( set.pass2 ).toBe( 'Vq7#tR2!mW9z' );
	// The password rows hidden (show_password_fields): never sent.
	const hidden = profileData( { account: { ...data.account, password: false } } );
	expect( Object.hasOwn( classicPost( hidden, { ...valuesOf( hidden ), password: 'x' } ), 'pass1' ) ).toBe( false );
} );

test( 'displayChoices: the typed names are added as user-profile.js adds them on blur, never removed', () => {
	const base = [ 'jdoe', 'John', 'Doe', 'John Doe', 'Doe John' ];
	const values = { first_name: 'John', last_name: 'Doe', nickname: 'jdoe', login: 'jdoe' };
	expect( displayChoices( base, values ) ).toEqual( base );
	// A new first name adds itself and both combinations; a new nickname adds itself.
	expect( displayChoices( base, { ...values, first_name: 'Johnny', nickname: 'JD' } ) ).toEqual( [ ...base, 'JD', 'Johnny', 'Johnny Doe', 'Doe Johnny' ] );
	// A cleared name adds nothing and removes nothing, as classic.
	expect( displayChoices( base, { ...values, first_name: '', last_name: '' } ) ).toEqual( base );
	// One name alone adds no combination.
	expect( displayChoices( [ 'jdoe' ], { ...values, first_name: 'Ann', last_name: '' } ) ).toEqual( [ 'jdoe', 'Ann' ] );
	// Tags are stripped, as user-profile.js strips them.
	expect( displayChoices( [ 'jdoe' ], { ...values, first_name: '', last_name: '', nickname: '<b>Bold</b> one' } ) ).toEqual( [ 'jdoe', 'Bold one' ] );
} );
