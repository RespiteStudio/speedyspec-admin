/**
 * Contract of the Dashboard's Site Health Status widget (`dashboard_site_health`), one of core/dashboard's widgets, which
 * renders it inside the widget's box (core/meta-box), so that a plugin can replace this widget
 * alone (register_admin_component_replacement( 'core/dashboard-site-health', … )).
 *
 * - `data`: `_wp_admin_dashboard_site_health()`'s data: `message`, `issuesText`, `label`, `progress`, `url` and the counts, as `wp-admin/v1/dashboard` sends it in `widgets`. WordPress decides what
 *   the widget shows; the implementation shows it.
 * - `box`: the widget's box (`{ id, title, basename, classes, closed, hidden, pinned, warning }`).
 * - `context`: the admin area, `site`, `network` or `user`.
 * - `assets`: the Dashboard's captured assets (`{ scripts, styles, ajaxurl }`), for the HTML that
 *   plugins add through the widget's hooks (kit/LegacyHtml).
 *
 * Slots `before-content` and `after-content` (also slots for modules) get `{ data, context }`.
 */
const widgetSlot = {
	props: {
		data: { type: 'Object', required: true },
		context: { type: 'String', required: true },
	},
};

export default {
	id: 'core/dashboard-site-health',
	version: '1.0.0',
	// A part of core/dashboard's page: its files are served with the page's (register_admin_page() `parts`).
	page: true,
	props: {
		data: { type: 'Object', required: true },
		box: { type: 'Object', required: true },
		context: { type: 'String', required: false },
		assets: { type: 'Object', required: false },
	},
	slots: {
		'before-content': widgetSlot,
		'after-content': widgetSlot,
	},
	emits: [],
};
