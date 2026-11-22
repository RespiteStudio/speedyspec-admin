// What wp_admin_get_user_new() gives (wp-includes/admin/user-new-page.php), built for Add User's
// component tests, and the page mounted the way the router mounts it, with a host that records
// the notices, what is spoken and where the router is sent. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

export const INITIAL = 'Zq3!initial-generated-password';
export const PATH = 'user-new.php';

export const ROLES = [
	{ value: 'subscriber', label: 'Subscriber' },
	{ value: 'contributor', label: 'Contributor' },
	{ value: 'author', label: 'Author' },
	{ value: 'editor', label: 'Editor' },
	{ value: 'administrator', label: 'Administrator' },
];

export const LABELS = {
	password: 'Password',
	generate: 'Generate password',
	hide: 'Hide',
	hidePassword: 'Hide password',
	show: 'Show',
	showPassword: 'Show password',
	weakRow: 'Confirm Password',
	weakConfirm: 'Confirm use of weak password',
};

/** The single site Add User form (`create`). `over` replaces any of its keys. */
export const createForm = ( over = {} ) => ( {
	fields: {
		names: true,
		website: true,
		language: null,
		password: true,
		notify: { checked: true },
		role: { options: ROLES, selected: 'subscriber' },
	},
	noconfirmation: false,
	initialPassword: INITIAL,
	passwordLabels: LABELS,
	hooksHtml: null,
	...over,
} );

/** The single site page. `over` replaces any of its keys. */
export const singleData = ( over = {} ) => ( {
	refusal: null,
	title: 'Add User',
	messages: [],
	errors: [],
	existing: null,
	create: createForm(),
	bodyClasses: [ 'user-new-php' ],
	...over,
} );

/** The multisite Add Existing User form (`existing`), as a network administrator gets it. */
export const existingForm = ( over = {} ) => ( {
	label: 'Email or Username',
	help: 'Enter the email address or username of an existing user on this network to invite them to this site. That person will be sent an email asking them to confirm the invite.',
	type: 'text',
	roles: ROLES,
	defaultRole: 'subscriber',
	noconfirmation: true,
	suggest: true,
	hooksHtml: null,
	...over,
} );

/** The multisite Add User form (`create`), as a network administrator gets it. */
export const multisiteCreate = ( over = {} ) => createForm( {
	fields: { names: false, website: false, language: null, password: false, notify: false, role: { options: ROLES, selected: 'subscriber' } },
	noconfirmation: true,
	initialPassword: null,
	...over,
} );

/** The multisite page of a network administrator: both forms. */
export const multisiteData = ( over = {} ) => singleData( { existing: existingForm(), create: multisiteCreate(), ...over } );

export const loadContracts = async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'user-new', 'user-password' ] );
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
export function host( search = '', pathname = '/wp-admin/user-new.php' ) {
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
		// No suggestion delay: tests do not wait.
		userSuggestDelay: 0,
	};
	return record;
}

/** Mounts Add User (`core/user-new`) with `data`; `provide` adds to what it injects. */
export async function mountUserNew( data = singleData(), record = host(), provide = {}, path = PATH ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/user-new', data, page: { path, title: data.title ?? '' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** An API error as runtime/api.js throws it. */
export const apiError = ( { status = 400, code = 'error', message = 'Error.', data = null } = {} ) => Object.assign( new Error( message ), { name: 'ApiError', status, code, data } );
