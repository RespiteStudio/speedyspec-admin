// What wp_admin_get_user_edit() gives (wp-includes/admin/user-edit-page.php), built for the
// Profile and Edit User component tests, and the page mounted the way the router mounts it, with
// a host that records the notices, what is spoken and where the router is sent. A test passes
// what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

export const INITIAL = 'Zq3!initial-generated-password';
// A name a user controls, as Review Focus 4 and F8 test it: text, never markup.
export const HOSTILE = 'O\'Brien & <img src=x onerror="window.__ran=1">';

export const LABELS = {
	password: 'New Password',
	generate: 'Set New Password',
	hide: 'Hide',
	hidePassword: 'Hide password',
	show: 'Show',
	showPassword: 'Show password',
	cancel: 'Cancel',
	cancelPassword: 'Cancel password change',
	repeat: 'Repeat New Password',
	repeatDescription: 'Type your new password again.',
	weakRow: 'Confirm Password',
	weakConfirm: 'Confirm use of weak password',
};

export const SCHEMES = [
	{ id: 'modern', name: 'Modern', colors: [ '#1e1e1e', '#3858e9', '#33f078' ], icons: { base: '#f3f1f1', focus: '#fff', current: '#fff' } },
	{ id: 'fresh', name: 'Default', colors: [ '#1d2327', '#2c3338', '#2271b1', '#72aee6' ], icons: { base: '#a7aaad', focus: '#72aee6', current: '#fff' } },
	{ id: 'light', name: 'Light', colors: [ '#e5e5e5', '#999', '#d64e07', '#04a4cc' ], icons: { base: '#999', focus: '#ccc', current: '#ccc' } },
];

export const ROLES = [
	{ value: 'subscriber', label: 'Subscriber' },
	{ value: 'contributor', label: 'Contributor' },
	{ value: 'author', label: 'Author' },
	{ value: 'editor', label: 'Editor' },
	{ value: 'administrator', label: 'Administrator' },
	{ value: '', label: '— No role for this site —' },
];

export const LANGUAGE = {
	options: [ { value: 'site-default', label: 'Site Default' }, { value: '', label: 'English (United States)' }, { value: 'ar', label: 'العربية' } ],
	selected: 'site-default',
};

/** Personal Options, as an administrator's own profile gives them. `over` replaces any key. */
export const personal = ( over = {} ) => ( {
	richEditing: null,
	syntaxHighlighting: false,
	colorScheme: { current: 'modern', schemes: SCHEMES, html: null },
	commentShortcuts: false,
	toolbar: true,
	infiniteScrolling: false,
	language: null,
	hooksHtml: { personal: null, profile: null },
	...over,
} );

/** Account Management of one's own profile, one session. `over` replaces any key. */
export const account = ( over = {} ) => ( {
	password: true,
	initialPassword: INITIAL,
	passwordLabels: LABELS,
	resetLink: null,
	sessions: { kind: 'only', label: 'Log Out Everywhere Else', description: 'You are only logged in at this location.', disabled: true },
	...over,
} );

/** The Application Passwords section with no rows. `over` replaces any key. */
export const applications = ( over = {} ) => ( {
	available: true,
	supported: true,
	basicAuth: false,
	sitesNotice: null,
	createHtml: null,
	items: [],
	environmentHelp: null,
	...over,
} );

export const ROW = { uuid: '6b1f0a3c-2d4e-4f50-8a6b-7c8d9e0f1a2b', name: 'Phone', created: 'November 22, 2026', lastUsed: '—', lastIp: '—' };

/** One's own Profile (`profile.php`). `over` replaces any of its keys. */
export const profileData = ( over = {} ) => ( {
	error: null,
	context: 'site',
	isProfilePage: true,
	title: 'Profile',
	heading: { title: 'Profile', addNew: null },
	menuCurrent: 'profile.php',
	messages: [],
	user: {
		id: 7,
		login: 'jdoe',
		email: 'jdoe@example.org',
		url: 'https://example.org/jdoe',
		firstName: 'John',
		lastName: 'Doe',
		nickname: 'jdoe',
		displayName: 'John Doe',
		description: 'Writes things.',
		locale: '',
		contact: {},
	},
	personal: personal(),
	name: { role: null, displayNames: [ 'jdoe', 'John', 'Doe', 'John Doe', 'Doe John' ] },
	contact: { methods: [], emailConfirms: true, pendingEmail: null },
	about: { heading: 'About Yourself', avatar: { url: 'https://secure.gravatar.com/avatar/abc?s=96', html: null, description: '<a href="https://gravatar.com/">You can change your profile picture on Gravatar</a>.' } },
	account: account(),
	applicationPasswords: applications(),
	hooksHtml: { show: null, edit: null },
	capabilities: null,
	submitLabel: 'Update Profile',
	referer: null,
	bodyClasses: [ 'profile-php' ],
	...over,
} );

/** Edit User of another user (`user-edit.php?user_id=9`), by an administrator. */
export const editData = ( over = {} ) => profileData( {
	isProfilePage: false,
	title: 'Edit User Jane Roe',
	heading: { title: 'Edit User Jane Roe', addNew: { label: 'Add User', path: 'user-new.php' } },
	menuCurrent: 'users.php',
	user: { ...profileData().user, id: 9, login: 'jroe', email: 'jroe@example.org', firstName: 'Jane', lastName: 'Roe', nickname: 'jroe', displayName: 'Jane Roe' },
	name: { role: { options: ROLES, selected: 'author' }, displayNames: [ 'jroe', 'Jane', 'Roe', 'Jane Roe', 'Roe Jane' ] },
	contact: { methods: [], emailConfirms: false, pendingEmail: null },
	about: { heading: 'About the user', avatar: null },
	account: account( {
		passwordLabels: { ...LABELS, repeatDescription: 'Type the new password again.' },
		resetLink: { label: 'Send Reset Link', description: 'Send Jane Roe a link to reset their password. This will not change their password, nor will it force a change.' },
		sessions: { kind: 'user', label: 'Log Out Everywhere', description: 'Log Jane Roe out of all locations.', disabled: false },
	} ),
	submitLabel: 'Update User',
	referer: 'http://localhost:8889/wp-admin/users.php',
	bodyClasses: [ 'user-edit-php' ],
	...over,
} );

export const loadContracts = async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'user-edit', 'user-password' ] );
};

/** Core's meter, answering `score` for every password, and its strings. Restore with unsetMeter(). */
export function setMeter( score = 4 ) {
	globalThis.wp = { passwordStrength: { meter: () => score } };
	globalThis.pwsL10n = { unknown: 'Password strength unknown', short: 'Very weak', bad: 'Weak', good: 'Medium', strong: 'Strong', mismatch: 'Mismatch' };
}
export function unsetMeter() {
	delete globalThis.wp;
	delete globalThis.pwsL10n;
}

/** A host that records what the page gives it: notices, speech and the router's targets. */
export function host( pathname = '/wp-admin/profile.php', search = '' ) {
	const record = { added: [], spoken: [], followed: [], refreshed: 0 };
	record.provide = {
		router: {
			follow: async ( target, options ) => {
				record.followed.push( [ target, options ?? null ] );
				return true;
			},
			refresh: async () => {
				record.refreshed++;
			},
			previousUrl: () => null,
		},
		speak: ( message ) => record.spoken.push( message ),
		notices: {
			add: ( notice ) => {
				record.added.push( notice );
				const id = 'notice-' + record.added.length;
				const element = document.createElement( 'div' );
				element.id = noticeElementId( id );
				element.tabIndex = -1;
				document.body.appendChild( element );
				return id;
			},
		},
		frameChannel: null,
		pageLocation: { origin: 'http://localhost', pathname, search },
	};
	return record;
}

/** Mounts the page (`core/user-edit`) with `data`; `provide` adds to what it injects. */
export async function mountUserEdit( data = profileData(), record = host(), provide = {} ) {
	const path = data.isProfilePage ? 'profile.php' : 'user-edit.php?user_id=' + data.user?.id;
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/user-edit', data, page: { path, title: data.isProfilePage ? 'Profile' : 'Edit User' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** An API error as runtime/api.js throws it. */
export const apiError = ( { status = 400, code = 'error', message = 'Error.', data = null } = {} ) => Object.assign( new Error( message ), { name: 'ApiError', status, code, data } );
