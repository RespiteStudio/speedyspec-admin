/**
 * <Spinner /> — the classic spinner with an accessible, translated "Loading…"
 * (or the given label).
 */
export default {
	name: 'WpAdminSpinner',
	props: {
		label: { type: String, default: '' },
	},
	template: `
		<span class="spinner is-active wp-admin-spinner" role="status">
			<span class="screen-reader-text">{{ label || $__( 'Loading…', 'wp-admin-site' ) }}</span>
		</span>
	`,
};
