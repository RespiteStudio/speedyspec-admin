/** @jest-environment jsdom */
// The Users list page (core/users) as WordPress's data describes it (WP_Users_List_Table,
// wp-admin/users.php): the heading, the views, the search, the sortable headers, the pagination,
// Screen Options, the cells and row actions, the messages, plugin output, the refusal, and names
// that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { apiError, column, host, loadContracts, mountUsers, row, rowIds, settle, usersData, views } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	delete window.__ran;
	jest.restoreAllMocks();
	resetContracts();
} );

const cell = ( wrapper, id, key ) => wrapper.find( '#user-' + id + ' .column-' + key );

test( 'heading from data: Add User, the GET form without an id, the search box, the table ids and the body class', async () => {
	const wrapper = await mountUsers();
	const add = wrapper.find( 'a.page-title-action' );
	expect( add.text() ).toBe( 'Add User' );
	expect( add.attributes( 'href' ) ).toBe( '/wp-admin/user-new.php' );
	expect( wrapper.find( 'hr.wp-header-end' ).exists() ).toBe( true );
	const form = wrapper.find( 'form.wp-admin-users-form' );
	expect( form.attributes( 'method' ) ).toBe( 'get' );
	expect( form.attributes( 'id' ) ).toBeUndefined();
	expect( wrapper.find( '#posts-filter' ).exists() ).toBe( false );
	expect( wrapper.find( '#user-search-input' ).exists() ).toBe( true );
	expect( rowIds( wrapper ) ).toEqual( [ 7, 8, 9 ] );
	expect( wrapper.find( '#user-7 input[type="checkbox"]' ).attributes( 'name' ) ).toBe( 'users[]' );
	expect( document.body.classList.contains( 'users-php' ) ).toBe( true );
	wrapper.unmount();
	expect( document.body.classList.contains( 'users-php' ) ).toBe( false );
} );

test( 'heading from data: Add Existing User on multisite, and no button without one', async () => {
	let wrapper = await mountUsers( usersData( { heading: { addNew: { label: 'Add Existing User', path: 'user-new.php' }, search: null } } ) );
	expect( wrapper.find( 'a.page-title-action' ).text() ).toBe( 'Add Existing User' );
	wrapper.unmount();
	wrapper = await mountUsers( usersData( { heading: { addNew: null, search: null } } ) );
	expect( wrapper.find( 'a.page-title-action' ).exists() ).toBe( false );
} );

test( 'views: each role view links to its list, with its count, the current one marked, and the role kept in the form', async () => {
	const record = host();
	const wrapper = await mountUsers( usersData( { views: views( 'editor' ), query: { role: 'editor' } } ), record );
	const links = wrapper.findAll( 'ul.subsubsub li a' );
	expect( links.map( ( a ) => [ a.text(), a.attributes( 'href' ) ] ) ).toEqual( [
		[ 'All (3)', '/wp-admin/users.php' ],
		[ 'Administrator (1)', '/wp-admin/users.php?role=administrator' ],
		[ 'Editor (2)', '/wp-admin/users.php?role=editor' ],
	] );
	expect( wrapper.find( 'ul.subsubsub li.editor a' ).attributes( 'aria-current' ) ).toBe( 'page' );
	expect( wrapper.find( 'ul.subsubsub li.editor .count' ).text() ).toBe( '(2)' );
	// As users.php: the role stays in the form, so a search keeps the view.
	expect( wrapper.find( 'form input[type="hidden"][name="role"]' ).element.value ).toBe( 'editor' );
	await wrapper.find( '#user-search-input' ).setValue( 'jo' );
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/users.php?s=jo&role=editor&paged=1' ] );
} );

test( 'headings from data: the hidden views, pagination and list headings of users.php', async () => {
	const pagination = { total: 5, totalText: '5 items', perPage: 2, page: 1, pages: 3, pagesText: '3', links: { first: null, prev: null, next: 'users.php?paged=2', last: 'users.php?paged=3' } };
	const wrapper = await mountUsers( usersData( { pagination } ) );
	expect( wrapper.findAll( 'h2.screen-reader-text' ).map( ( h2 ) => h2.text() ) ).toEqual( [ 'Filter users list', 'Users list navigation', 'Users list' ] );
	// The list's heading is right before its table.
	expect( wrapper.find( 'table.wp-list-table' ).element.previousElementSibling.textContent ).toBe( 'Users list' );
} );

test( 'views: a view list plugins filtered shows their HTML', async () => {
	const wrapper = await mountUsers( usersData( { viewsHtml: { all: '<a href="users.php">All</a>', fixture: '<a href="users.php?detached_fixture_view=1" class="acme">Fixture view</a>' } } ) );
	expect( wrapper.find( 'ul.subsubsub li.fixture a.acme' ).text() ).toBe( 'Fixture view' );
} );

test( 'search subtitle and noItems: the term as text, "No users found.", and a search navigates with the form\'s fields', async () => {
	const record = host();
	const wrapper = await mountUsers( usersData( { heading: { addNew: null, search: '<b>x</b>' }, items: [], roleChange: null } ), record );
	expect( wrapper.find( '.subtitle' ).text() ).toBe( 'Search results for: <b>x</b>' );
	expect( wrapper.find( '.subtitle strong' ).text() ).toBe( '<b>x</b>' );
	expect( wrapper.find( '#the-list tr.no-items td' ).text() ).toBe( 'No users found.' );
	expect( wrapper.find( '#new_role' ).exists() ).toBe( false );
	await wrapper.find( '#user-search-input' ).setValue( 'jazz' );
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/users.php?s=jazz&paged=1' ] );
	expect( api.calls ).toEqual( [] );
} );

test( 'sortable headers: Username and Email link to the sorted list; Name, Role and Posts do not', async () => {
	const wrapper = await mountUsers();
	expect( wrapper.find( 'thead th#username a' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php?orderby=login&order=asc' );
	expect( wrapper.find( 'thead th#email a' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php?orderby=email&order=asc' );
	for ( const key of [ 'name', 'role', 'posts' ] ) {
		expect( wrapper.find( 'thead th#' + key + ' a' ).exists() ).toBe( false );
	}
} );

test( 'pagination: the page links and the typed page go through the admin', async () => {
	const pagination = { total: 5, totalText: '5 items', perPage: 2, page: 2, pages: 3, pagesText: '3', links: { first: 'users.php?s=m', prev: 'users.php?s=m', next: 'users.php?s=m&paged=3', last: 'users.php?s=m&paged=3' } };
	const wrapper = await mountUsers( usersData( { pagination, query: { s: 'm', paged: '2' } } ) );
	expect( wrapper.find( '.tablenav.top .displaying-num' ).text() ).toBe( '5 items' );
	expect( wrapper.find( '.tablenav.top a.next-page' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php?s=m&paged=3' );
	expect( wrapper.find( '.tablenav.bottom a.last-page' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php?s=m&paged=3' );
	expect( wrapper.find( '.tablenav.top #current-page-selector' ).element.value ).toBe( '2' );
} );

test( 'Screen Options: the columns and the per page offered for screen users; a hidden column and Apply are saved', async () => {
	let offered = null;
	const data = usersData( {
		screenOptions: { tableColumns: [ { key: 'name', label: 'Name', hidden: false }, { key: 'email', label: 'Email', hidden: true } ], legend: 'Columns', perPage: { option: 'users_per_page', value: 20, label: 'Number of items per page:' }, viewMode: null, settingsHtml: null },
		columns: usersData().columns.map( ( c ) => ( c.key === 'email' ? { ...c, hidden: true } : c ) ),
	} );
	const record = host();
	api.respondWith( async ( method, route, payload ) => ( payload?.perPage ? { redirect: 'users.php', location: null } : {} ) );
	const wrapper = await mountUsers( data, record, { screenOptions: { set: ( options ) => {
		offered = options;
		return () => {};
	} } } );
	expect( offered.tableColumns.map( ( c ) => [ c.key, c.hidden ] ) ).toEqual( [ [ 'name', false ], [ 'email', true ] ] );
	expect( offered.pagination ).toEqual( { option: 'users_per_page', value: 20, label: 'Number of items per page:' } );
	expect( wrapper.find( 'thead th#email' ).classes() ).toContain( 'hidden' );
	await offered.onChange( 'hide-column', { key: 'name', hidden: true } );
	await settle();
	expect( api.calls[ 0 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/screen-preferences/users', payload: { columnsHidden: [ 'email', 'name' ] } } );
	expect( wrapper.find( 'thead th#name' ).classes() ).toContain( 'hidden' );
	await offered.onApply( { perPage: 2 } );
	await settle();
	expect( api.calls[ 1 ] ).toEqual( { method: 'POST', route: 'wp-admin/v1/screen-preferences/users', payload: { perPage: 2, referer: 'users.php' } } );
	expect( record.followed ).toEqual( [ { redirect: 'users.php', location: null } ] );
} );

test( 'cells from data: the avatar and login, the name, the email link, the roles and the posts count, as single_row() prints them', async () => {
	const unknown = row( 8, { name: 'Unknown', nameUnknown: true, roles: [ 'Editor', 'Author' ], username: { ...row( 8 ).username, superAdmin: true } } );
	const wrapper = await mountUsers( usersData( { items: [ row( 7 ), unknown ] } ) );
	const username = cell( wrapper, 7, 'username' );
	expect( username.element.tagName ).toBe( 'TH' );
	expect( username.find( 'img.avatar' ).attributes( 'src' ) ).toBe( 'https://secure.gravatar.com/avatar/7?s=32' );
	expect( username.find( 'strong a' ).text() ).toBe( 'user7' );
	expect( cell( wrapper, 8, 'username' ).find( 'strong' ).text() ).toBe( 'user8 — Super Admin' );
	expect( cell( wrapper, 7, 'name' ).text() ).toBe( 'First7 Last7' );
	// An unknown name is a dash, and "Unknown" for screen readers.
	expect( cell( wrapper, 8, 'name' ).find( 'span[aria-hidden="true"]' ).text() ).toBe( '—' );
	expect( cell( wrapper, 8, 'name' ).find( '.screen-reader-text' ).text() ).toBe( 'Unknown' );
	const email = cell( wrapper, 7, 'email' ).find( 'a' );
	expect( email.text() ).toBe( 'user7@example.org' );
	expect( email.attributes( 'href' ) ).toBe( 'mailto:user7@example.org' );
	expect( cell( wrapper, 8, 'role' ).text() ).toBe( 'Editor, Author' );
	expect( cell( wrapper, 7, 'posts' ).text() ).toBe( '0' );
	expect( cell( wrapper, 7, 'posts' ).find( 'a' ).exists() ).toBe( false );
	expect( wrapper.find( '#user-7 .row-actions' ).text() ).toBe( 'Edit | Delete | View | Send password reset' );
	expect( wrapper.findAll( '#user-7 .row-actions > span' ).map( ( span ) => span.classes() ) ).toEqual( [ [ 'edit' ], [ 'delete' ], [ 'view' ], [ 'resetpassword' ] ] );
	expect( wrapper.find( '#user-7 .row-actions .delete a' ).classes() ).toEqual( [ 'submitdelete' ] );
	expect( wrapper.find( '#user-7 .row-actions .delete a' ).attributes( 'href' ) ).toBe( '/wp-admin/users.php?action=delete&user=7' );
	expect( wrapper.find( '#user-7 .row-actions .view a' ).attributes( 'href' ) ).toBe( 'http://localhost:8889/author/user7/' );
	expect( wrapper.find( '#user-7 .row-actions .view a' ).attributes( 'aria-label' ) ).toBe( 'View posts by user7' );
} );

test( 'posts link: a count opens the native posts list of the author, with its hidden label', async () => {
	const wrapper = await mountUsers( usersData( { items: [ row( 7, { posts: { count: 3, text: '3', url: 'edit.php?author=7', label: '3 posts by this author' } } ) ] } ) );
	const link = cell( wrapper, 7, 'posts' ).find( 'a.edit' );
	expect( link.attributes( 'href' ) ).toBe( '/wp-admin/edit.php?author=7' );
	expect( link.find( 'span[aria-hidden="true"]' ).text() ).toBe( '3' );
	expect( link.find( '.screen-reader-text' ).text() ).toBe( '3 posts by this author' );
} );

test( 'editUrl: the username and Edit open the edit screen with wp_http_referer; without one, the login is text and there is no Edit', async () => {
	const own = row( 8, { username: { ...row( 8 ).username, editUrl: 'profile.php?wp_http_referer=%2Fwp-admin%2Fusers.php' }, actions: [ { action: 'edit', text: 'Edit', ariaLabel: null, classes: [], url: 'profile.php?wp_http_referer=%2Fwp-admin%2Fusers.php', request: null } ] } );
	const plain = row( 9, { username: { ...row( 9 ).username, editUrl: null }, actions: [] } );
	const wrapper = await mountUsers( usersData( { items: [ row( 7 ), own, plain ] } ) );
	expect( cell( wrapper, 7, 'username' ).find( 'strong a' ).attributes( 'href' ) ).toBe( '/wp-admin/user-edit.php?user_id=7&wp_http_referer=%2Fwp-admin%2Fusers.php' );
	expect( wrapper.find( '#user-7 .row-actions .edit a' ).attributes( 'href' ) ).toBe( '/wp-admin/user-edit.php?user_id=7&wp_http_referer=%2Fwp-admin%2Fusers.php' );
	expect( cell( wrapper, 8, 'username' ).find( 'strong a' ).attributes( 'href' ) ).toBe( '/wp-admin/profile.php?wp_http_referer=%2Fwp-admin%2Fusers.php' );
	expect( cell( wrapper, 9, 'username' ).find( 'strong a' ).exists() ).toBe( false );
	expect( cell( wrapper, 9, 'username' ).find( 'strong' ).text() ).toBe( 'user9' );
	expect( wrapper.find( '#user-9 .row-actions' ).exists() ).toBe( false );
} );

test( 'request action: row Send password reset posts its request and follows the answer', async () => {
	const record = host();
	api.respondWith( async () => ( { redirect: 'users.php?reset_count=1&update=resetpassword', location: null } ) );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#user-8 .row-actions .resetpassword a' ).trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/users/bulk', payload: { action: 'resetpassword', ids: [ 8 ] } } ] );
	expect( record.followed ).toEqual( [ { redirect: 'users.php?reset_count=1&update=resetpassword', location: null } ] );
} );

test( 'a failed answer: a refused row password reset is said in a page notice, and nothing is followed', async () => {
	const record = host();
	api.respondWith( async () => {
		throw apiError( 'Sorry, you are not allowed to edit this user.', 403, 'edit_users' );
	} );
	const wrapper = await mountUsers( usersData(), record );
	await wrapper.find( '#user-8 .row-actions .resetpassword a' ).trigger( 'click' );
	await settle();
	expect( record.notices.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Sorry, you are not allowed to edit this user.' ] ] );
	expect( record.spoken ).toEqual( [ 'Sorry, you are not allowed to edit this user.' ] );
	expect( record.followed ).toEqual( [] );
} );

test( 'messages: each message is its own notice with its type, and the Edit user link of update=add', async () => {
	const messages = [
		{ markup: 'You cannot delete the current user.', type: 'error' },
		{ markup: 'Other users have been deleted.', type: 'updated' },
	];
	let wrapper = await mountUsers( usersData( { messages } ) );
	const shown = wrapper.findAll( '.wp-admin-users > .notice' );
	expect( shown.map( ( notice ) => [ notice.attributes( 'id' ), notice.classes().filter( ( name ) => name !== 'notice' && name !== 'is-dismissible' ), notice.find( 'p' ).text() ] ) ).toEqual( [
		[ 'message', [ 'error' ], 'You cannot delete the current user.' ],
		[ 'message', [ 'updated' ], 'Other users have been deleted.' ],
	] );
	await shown[ 0 ].find( '.notice-dismiss' ).trigger( 'click' );
	expect( wrapper.findAll( '.wp-admin-users > .notice' ) ).toHaveLength( 1 );
	wrapper.unmount();
	wrapper = await mountUsers( usersData( { messages: [ { markup: 'New user created. <a href="user-edit.php?user_id=9&amp;wp_http_referer=%2Fwp-admin%2Fusers.php">Edit user</a>', type: 'updated' } ] } ) );
	const link = wrapper.find( '#message p a' );
	expect( link.text() ).toBe( 'Edit user' );
	expect( link.attributes( 'href' ) ).toContain( 'user-edit.php?user_id=9&wp_http_referer=%2Fwp-admin%2Fusers.php' );
} );

test( 'plugin cells, actionsHtml, extraNav: a plugin column, filtered row actions and the navigation hooks show their HTML', async () => {
	const columns = [ ...usersData().columns, column( 'detached_fixture', 'Fixture user', { core: false } ) ];
	const filtered = row( 7, {
		cells: { detached_fixture: { html: '<em class="acme">user-7</em>', error: false } },
		actionsHtml: '<span class="edit"><a href="user-edit.php?user_id=7">Edit</a> | </span><span class="delete"><a class="submitdelete" href="users.php?action=delete&amp;user=7&amp;_wpnonce=abc">Delete</a> | </span><span class="detached_fixture_user"><a class="detached-fixture-user-action" href="users.php?detached_fixture_user_action=7">Fixture user action</a></span>',
		coreActions: [ 'edit', 'delete' ],
	} );
	const extraNav = {
		restrict: { top: { html: '<select name="detached_fixture_has_note"><option value="">All</option><option value="1" selected>With note</option></select>', error: false }, bottom: { html: '', error: false } },
		after: { top: { html: '<div class="detached-fixture-extra-nav">Fixture extra navigation</div>', error: false }, bottom: { html: '<div class="detached-fixture-extra-nav">Fixture extra navigation</div>', error: false } },
	};
	const record = host();
	const wrapper = await mountUsers( usersData( { columns, items: [ filtered ], extraNav } ), record );
	expect( wrapper.find( '#user-7 td.column-detached_fixture em.acme' ).text() ).toBe( 'user-7' );
	expect( wrapper.find( '#user-7 .row-actions a.detached-fixture-user-action' ).text() ).toBe( 'Fixture user action' );
	expect( wrapper.findAll( '.tablenav.top .detached-fixture-extra-nav' ) ).toHaveLength( 1 );
	expect( wrapper.findAll( '.tablenav.bottom .detached-fixture-extra-nav' ) ).toHaveLength( 1 );
	// The restrict hook prints inside the role change's div, after the button.
	expect( wrapper.find( '.tablenav.top .alignleft.actions select[name="detached_fixture_has_note"]' ).exists() ).toBe( true );
	// A core action in the filtered HTML opens its native address, never the nonce link.
	await wrapper.find( '#user-7 .row-actions .delete a' ).trigger( 'click' );
	await settle();
	expect( record.navigated ).toEqual( [ '/wp-admin/users.php?action=delete&user=7' ] );
	// The search sends the plugin's field with the form.
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( record.navigated[ 1 ] ).toBe( '/wp-admin/users.php?s=&detached_fixture_has_note=1&paged=1' );
} );

test( 'the refusal shows the classic heading and message instead of the list', async () => {
	const wrapper = await mountUsers( { query: {}, refusal: { status: 403, heading: 'You need a higher level of permission.', message: 'Sorry, you are not allowed to list users.' }, title: 'Users' } );
	expect( wrapper.find( '.wp-admin-users-error h2' ).text() ).toBe( 'You need a higher level of permission.' );
	expect( wrapper.find( '.wp-admin-users-error p' ).text() ).toBe( 'Sorry, you are not allowed to list users.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
} );

test( 'names as text: a name, login and email holding <img onerror> and O\'Brien & run nothing and show as written', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const user = row( 7, {
		login: evil,
		name: 'O\'Brien & ' + evil,
		email: { text: evil, href: 'javascript:alert(1)' },
		roles: [ evil ],
		actions: [ { action: 'view', text: 'View', ariaLabel: 'View posts by ' + evil, classes: [], url: 'javascript:alert(1)', request: null } ],
	} );
	const wrapper = await mountUsers( usersData( { items: [ user ] } ) );
	await settle();
	expect( wrapper.find( '#the-list img:not(.avatar)' ).exists() ).toBe( false );
	expect( cell( wrapper, 7, 'username' ).find( 'strong a' ).text() ).toBe( evil );
	expect( cell( wrapper, 7, 'name' ).text() ).toBe( 'O\'Brien & ' + evil );
	expect( cell( wrapper, 7, 'email' ).find( 'a' ).attributes( 'href' ) ).toBeUndefined();
	expect( wrapper.find( '#user-7 .row-actions .view a' ).attributes( 'href' ) ).toBe( '#' );
	expect( window.__ran ).toBeUndefined();
} );
