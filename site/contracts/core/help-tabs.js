/**
 * Contract of the Help panel the frame shows above a page that has help.
 *
 * `tabs` is the page's help, in order: `{ id, title, component?, content? }`, where
 * `title` is translated text, `component` a component that renders the tab's text (the help
 * a page module exports) and `content` HTML that a plugin registered with
 * register_admin_help_tab() and WordPress passed through wp_kses_post(). `sidebar` is a
 * component, an HTML string of the same kind, or null. The frame renders the panel only when
 * there is at least one tab.
 *
 * Slots `before-tabs` and `after-tabs` (before and after the list of tabs) get `tabs`.
 * `toggle` carries whether the panel is now open.
 */
const tabsSlot = {
	props: {
		tabs: { type: 'Array', required: true },
	},
};

export default {
	id: 'core/help-tabs',
	version: '1.0.0',
	props: {
		tabs: { type: 'Array', required: true },
		sidebar: { type: 'Object|String', required: false },
	},
	slots: {
		'before-tabs': tabsSlot,
		'after-tabs': tabsSlot,
	},
	emits: [ 'toggle' ],
};
