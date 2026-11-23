// What wp_admin_get_users_list() and the Users routes answer (wp-includes/admin/users-page.php),
// built for the Users list's component tests, and the page mounted the way the router mounts it.
// A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { column, settle };

const REFERER = 'wp_http_referer=%2Fwp-admin%2Fusers.php';

/** The row actions of a user (wp_admin_users_list_row()): Edit, Delete, View, Send password reset. */
export const actionsOf = ( id, login = 'user' + id ) => [
	{ action: 'edit', text: 'Edit', ariaLabel: null, classes: [], url: 'user-edit.php?user_id=' + id + '&' + REFERER, request: null },
	{ action: 'delete', text: 'Delete', ariaLabel: null, classes: [ 'submitdelete' ], url: 'users.php?action=delete&user=' + id, request: null },
	{ action: 'view', text: 'View', ariaLabel: 'View posts by ' + login, classes: [], url: 'http://localhost:8889/author/' + login + '/', request: null },
	{ action: 'resetpassword', text: 'Send password reset', ariaLabel: null, classes: [ 'resetpassword' ], url: null, request: { method: 'POST', path: 'users/bulk', body: { action: 'resetpassword', ids: [ id ] } } },
];

/** A row of the list. `over` replaces any of its keys. */
export const row = ( id, { login = 'user' + id, ...over } = {} ) => ( {
	id,
	classes: [],
	selectable: true,
	checkboxLabel: 'Select ' + login,
	rowHeaderLabel: login,
	roleClasses: [ 'editor' ],
	username: { login, superAdmin: false, editUrl: 'user-edit.php?user_id=' + id + '&' + REFERER, avatar: 'https://secure.gravatar.com/avatar/' + id + '?s=32', avatarHtml: null },
	name: 'First' + id + ' Last' + id,
	nameUnknown: false,
	email: { text: login + '@example.org', href: 'mailto:' + login + '@example.org' },
	roles: [ 'Editor' ],
	posts: { count: 0, text: '0', url: null, label: null },
	actions: actionsOf( id, login ),
	actionsHtml: null,
	coreActions: null,
	cells: {},
	...over,
} );

export const sortable = ( orderby, url ) => ( { orderby, initialDesc: false, abbr: '', description: '', url } );

/** The views: All, Administrator, Editor. */
export const views = ( current = 'all' ) => [
	{ key: 'all', label: 'All (3)', labelHtml: 'All <span class="count">(3)</span>', count: 3, url: 'users.php', current: current === 'all' },
	{ key: 'administrator', label: 'Administrator (1)', labelHtml: 'Administrator <span class="count">(1)</span>', count: 1, url: 'users.php?role=administrator', current: current === 'administrator' },
	{ key: 'editor', label: 'Editor (2)', labelHtml: 'Editor <span class="count">(2)</span>', count: 2, url: 'users.php?role=editor', current: current === 'editor' },
];

/** The role change (wp_dropdown_roles(), then No role). */
export const roleChange = () => ( {
	label: 'Change role to…',
	button: 'Change',
	options: [
		{ value: 'subscriber', label: 'Subscriber' },
		{ value: 'editor', label: 'Editor' },
		{ value: 'administrator', label: 'Administrator' },
		{ value: 'none', label: '— No role for this site —' },
	],
} );

/** The page's data. `over` replaces any of its keys. */
export const usersData = ( over = {} ) => ( {
	query: {},
	refusal: null,
	title: 'Users',
	headings: { views: 'Filter users list', pagination: 'Users list navigation', list: 'Users list' },
	heading: { addNew: { label: 'Add User', path: 'user-new.php' }, search: null },
	messages: [],
	columns: [
		column( 'cb', '' ),
		column( 'username', 'Username', { primary: true, sortable: sortable( 'login', 'users.php?orderby=login&order=asc' ) } ),
		column( 'name', 'Name' ),
		column( 'email', 'Email', { sortable: sortable( 'email', 'users.php?orderby=email&order=asc' ) } ),
		column( 'role', 'Role' ),
		column( 'posts', 'Posts', { num: true } ),
	],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'users' ],
	views: views(),
	viewsHtml: null,
	bulkActions: [ { value: 'delete', label: 'Delete' }, { value: 'resetpassword', label: 'Send password reset' } ],
	search: { shown: true, value: '', label: 'Search Users', inputId: 'user-search-input', keep: [] },
	pagination: { total: 3, totalText: '3 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	screenOptions: null,
	roleChange: roleChange(),
	extraNav: { restrict: null, after: null },
	items: [ row( 7 ), row( 8 ), row( 9 ) ],
	noItems: 'No users found.',
	bodyClasses: [ 'users-php' ],
	...over,
} );

export const loadContracts = () => fillContracts( [ 'users', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav' ] );

/** A host that records what the page gives it: notices, speech and the router's targets. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/users.php', search: '' } ) {
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

/** Mounts the Users list page (`core/users`) with `data`; `provide` adds to what it injects. */
export async function mountUsers( data = usersData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/users', data, page: { path: 'users.php', title: 'Users' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The ids of the rows shown, in order. */
export const rowIds = ( wrapper ) => wrapper.findAll( '#the-list > tr[id^="user-"]' ).map( ( tr ) => Number( tr.attributes( 'id' ).slice( 5 ) ) );

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure' ) => Object.assign( new Error( message ), { status, code } );
