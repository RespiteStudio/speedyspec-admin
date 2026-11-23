/**
 * Contract of the Dashboard's Welcome panel content (wp_welcome_panel()), which core/dashboard
 * renders inside `#welcome-panel`, after its Dismiss link, so that a plugin can replace it alone.
 *
 * - `data`: the panel's data as `wp-admin/v1/dashboard` sends it in `welcome`: `displayVersion`,
 *   `isBlockTheme`, `canCustomize` and `customizeUrl` (and `visible`, which core/dashboard
 *   applies).
 * - `context`: the admin area, `site` or `user`.
 *
 * Slots `before-content` and `after-content` (also slots for modules) get `{ data, context }`.
 */
const panelSlot = {
	props: {
		data: { type: 'Object', required: true },
		context: { type: 'String', required: true },
	},
};

export default {
	id: 'core/dashboard-welcome',
	version: '1.0.0',
	// A part of core/dashboard's page: its files are served with the page's (register_admin_page() `parts`).
	page: true,
	props: {
		data: { type: 'Object', required: true },
		context: { type: 'String', required: false },
	},
	slots: {
		'before-content': panelSlot,
		'after-content': panelSlot,
	},
	emits: [],
};
