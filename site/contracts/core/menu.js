/**
 * Contract of the admin menu. `items` is the router's menu tree, `current` the
 * current page path in menu form, `base` the admin URL prefix of the site.
 * Slot modules render list items (`<li>`).
 */
export default {
	id: 'core/menu',
	version: '1.0.0',
	props: {
		items: { type: 'Array', required: true },
		current: { type: 'String', required: true },
		base: { type: 'String', required: true },
	},
	slots: {
		'before-items': { props: { items: { type: 'Array', required: true } } },
		'after-items': { props: { items: { type: 'Array', required: true } } },
	},
	emits: [],
};
