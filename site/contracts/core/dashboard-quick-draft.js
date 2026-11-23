/**
 * Contract of the Dashboard's Quick Draft widget (`dashboard_quick_press`), one of core/dashboard's widgets, which
 * renders it inside the widget's box (core/meta-box), so that a plugin can replace this widget
 * alone (register_admin_component_replacement( 'core/dashboard-quick-draft', … )).
 *
 * - `data`: `_wp_admin_dashboard_quick_draft()`'s data: `canEdit` and, when it is true, `postId`, `titleLabel` and `drafts`, as `wp-admin/v1/dashboard` sends it in `widgets`. WordPress decides what
 *   the widget shows; the implementation shows it.
 * - `box`: the widget's box (`{ id, title, basename, classes, closed, hidden, pinned, warning }`).
 * - `context`: the admin area, `site`, `network` or `user`.
 * - `assets`: the Dashboard's captured assets (`{ scripts, styles, ajaxurl }`), for the HTML that
 *   plugins add through the widget's hooks (kit/LegacyHtml).
 *
 * Slots `before-content` and `after-content` (also slots for modules) get `{ data, context }`.
 *
 * `saved` carries what a save returned (`{ notice, drafts, postId }`) after a draft is saved.
 */
const widgetSlot = {
	props: {
		data: { type: 'Object', required: true },
		context: { type: 'String', required: true },
	},
};

export default {
	id: 'core/dashboard-quick-draft',
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
	emits: [ 'saved' ],
};
