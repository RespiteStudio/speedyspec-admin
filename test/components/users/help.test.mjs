/** @jest-environment jsdom */
// The Help panel of the Users list. The tabs come from the router (WordPress registers them for
// the screen, wp-admin/users.php:37-94): Overview, Screen Content and Available Actions, with the
// Users and Roles documentation in the sidebar.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles, selected, flat } from '../../helpers/help-tabs.mjs';

const tab = ( id, title, content, priority = 10 ) => ( { id, title, content, priority } );
const HELP = {
	tabs: [
		tab( 'overview', 'Overview', '<p>This screen lists all the existing users for your site. Each user has one of five defined roles as set by the site admin: Site Administrator, Editor, Author, Contributor, or Subscriber. Users with roles other than Administrator will see fewer options in the dashboard navigation when they are logged in, based on their role.</p><p>To add a new user for your site, click the Add User button at the top of the screen or Add User in the Users menu section.</p>' ),
		tab( 'screen-content', 'Screen Content', '<p>You can customize the display of this screen in a number of ways:</p><ul><li>You can hide/display columns based on your needs and decide how many users to list per screen using the Screen Options tab.</li><li>You can filter the list of users by User Role using the text links above the users list to show All, Administrator, Editor, Author, Contributor, or Subscriber. The default view is to show all users. Unused User Roles are not listed.</li><li>You can view all posts made by a user by clicking on the number under the Posts column.</li></ul>' ),
		tab( 'action-links', 'Available Actions', '<p>Hovering over a row in the users list will display action links that allow you to manage users. You can perform the following actions:</p><ul><li><strong>Edit</strong> takes you to the editable profile screen for that user. You can also reach that screen by clicking on the username.</li><li><strong>Delete</strong> brings you to the Delete Users screen for confirmation, where you can permanently remove a user from your site and delete their content. You can also delete multiple users at once by using bulk actions.</li><li><strong>View</strong> takes you to a public author archive which lists all the posts published by the user.</li><li><strong>Send password reset</strong> sends the user an email with a link to set a new password.</li></ul>' ),
	],
	sidebar: '<p><strong>For more information:</strong></p><p><a href="https://wordpress.org/documentation/article/users-screen/">Documentation on Managing Users</a></p><p><a href="https://wordpress.org/documentation/article/roles-and-capabilities/">Descriptions of Roles and Capabilities</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
};

test( 'three tabs and the sidebar: Overview shown first, Available Actions on click, and the Users documentation', async () => {
	const wrapper = openHelp( null, HELP, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Screen Content', 'Available Actions' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.findAll( '#tab-panel-overview p' ) ).toHaveLength( 2 );
	await wrapper.findAll( '[role="tab"]' )[ 2 ].trigger( 'click' );
	await flushPromises();
	expect( selected( wrapper ) ).toEqual( [ 'Available Actions' ] );
	expect( wrapper.findAll( '#tab-panel-action-links li' ) ).toHaveLength( 4 );
	expect( flat( wrapper.find( '#tab-panel-action-links li strong' ) ) ).toBe( 'Edit' );
	expect( wrapper.findAll( '.contextual-help-sidebar a' ).map( ( a ) => a.attributes( 'href' ) ) ).toEqual( [
		'https://wordpress.org/documentation/article/users-screen/',
		'https://wordpress.org/documentation/article/roles-and-capabilities/',
		'https://wordpress.org/support/forums/',
	] );
} );
