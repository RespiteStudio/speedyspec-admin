import LegacyHtml from '../../../kit/LegacyHtml.js';

/**
 * A widget a plugin added (wp_add_dashboard_widget(), add_meta_box() for the Dashboard, or a core
 * widget whose callback a plugin replaced): the HTML its callback printed, captured by WordPress,
 * with the Dashboard's assets (kit/LegacyHtml). A widget whose callback failed shows a message.
 */
export default {
	name: 'DashboardPluginWidget',
	components: { LegacyHtml },
	props: {
		widget: { type: Object, required: true },
		assets: { type: Object, default: () => ( {} ) },
	},
	template: `
		<p v-if="widget.error" class="wp-admin-legacy-failure" role="alert">{{ $__( 'This widget could not be displayed.', 'wp-admin-site' ) }}</p>
		<LegacyHtml v-else :html="widget.html ?? ''" :assets="assets" />
	`,
};
