/**
 * The note beside what plugins print on Profile and Edit User: their fields are shown, and this
 * screen does not save them (owner ruling Q1 "Show only, no save").
 */
export default {
	name: 'UserEditPluginNote',
	template: `<p class="description wp-admin-user-edit-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>`,
};
