// What wp_admin_get_users_deletion() answers (wp-includes/admin/users-page.php), built for the
// Delete Users and Remove Users from Site confirmations' component tests, and the page mounted the
// way the router mounts it. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

/** A user to delete. `over` replaces any of its keys. */
export const deleting = ( id, { login = 'user' + id, current = false, hasContent = false, ...over } = {} ) => ( {
	id,
	login,
	current,
	hasContent,
	markup: current
		? 'ID #' + id + ': ' + login + ' <strong>The current user will not be deleted.</strong>'
		: ( hasContent
			? '<strong>' + login + '</strong> (ID #' + id + '): What should be done with the content owned by this user?'
			: '<strong>' + login + '</strong> (ID #' + id + '): This user does not have any content.' ),
	...over,
} );

/** A user to remove. */
export const removing = ( id, { login = 'user' + id, canRemove = true } = {} ) => ( {
	id,
	login,
	canRemove,
	markup: canRemove ? 'ID #' + id + ': ' + login : 'ID #' + id + ': ' + login + ' <strong>Sorry, you are not allowed to remove this user.</strong>',
} );

/** The Delete Users data. `over` replaces any of its keys. */
export const deletionData = ( over = {} ) => ( {
	refusal: null,
	title: 'Delete Users',
	intro: 'You have specified these users for deletion:',
	error: null,
	users: [ deleting( 7 ), deleting( 8, { hasContent: true } ) ],
	reassignOptions: [ { value: '', label: 'Select a user' }, { value: '1', label: 'admin (admin)' }, { value: '9', label: 'Nine (user9)' } ],
	optionLabels: { delete: 'Delete all content.', reassign: 'Attribute all content to another user.', reassignUser: 'Select a user to attribute the content to.' },
	formHtml: null,
	canSubmit: true,
	submitLabel: 'Confirm Deletion',
	none: 'There are no valid users selected for deletion.',
	referer: '/wp-admin/users.php?s=m',
	bodyClasses: [ 'users-php' ],
	...over,
} );

/** The Remove Users from Site data. `over` replaces any of its keys. */
export const removalData = ( over = {} ) => ( {
	refusal: null,
	title: 'Remove Users from Site',
	intro: 'You have specified these users for removal:',
	error: null,
	users: [ removing( 7 ), removing( 8, { canRemove: false } ) ],
	reassignOptions: [],
	optionLabels: null,
	formHtml: null,
	canSubmit: true,
	submitLabel: 'Confirm Removal',
	none: 'There are no valid users selected for removal.',
	referer: null,
	bodyClasses: [ 'users-php' ],
	...over,
} );

export const loadContracts = () => fillContracts( [ 'users-delete' ] );

/** A host that records what the page gives it: notices, speech and the router's targets. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/users.php', search: '?action=delete&users%5B%5D=7&users%5B%5D=8' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], refreshed: 0 };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message ) => record.spoken.push( message ),
		router: {
			navigate: async ( url ) => record.navigated.push( url ),
			follow: async ( answer ) => record.followed.push( answer ),
			refresh: async () => {
				record.refreshed++;
			},
		},
		frameChannel: null,
		pageLocation: location,
	};
	return record;
}

/** Mounts the confirmation (`core/users-delete`) with `data` at `path`; `provide` adds to what it injects. */
export async function mountDeletion( data = deletionData(), { path = 'users.php?action=delete&users[]=7&users[]=8', record = host(), provide = {} } = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/users-delete', data, page: { path, title: data.title ?? 'Delete Users' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure' ) => Object.assign( new Error( message ), { status, code } );
