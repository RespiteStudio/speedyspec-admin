/**
 * The note beside what plugins print into a native form (Profile and Edit User, Add User, Delete
 * Users, Authorize Application): their fields are shown, and this screen does not save them
 * (owner ruling Q1 "Show only, no save"). One part, one class, wherever the note shows.
 */
export default {
	name: 'PluginNote',
	template: `<p class="description wp-admin-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>`,
};
