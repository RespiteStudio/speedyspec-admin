/**
 * The note beside what plugins print into a native form (Profile and Edit User, Add User, Delete
 * Users, Authorize Application): their fields are shown, and this screen does not save them
 * (owner ruling Q1 "Show only, no save"). One part, one class, wherever the note shows.
 *
 * `text` (optional) says what else a plugin changed that the native screen does not run, such as
 * a theme's auto-update setting template on Themes; without it, the form fields' note shows.
 */
export default {
	name: 'PluginNote',
	props: {
		text: { type: String, default: null },
	},
	template: `<p class="description wp-admin-plugin-note">{{ text ?? $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>`,
};
