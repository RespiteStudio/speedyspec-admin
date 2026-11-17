/**
 * Contract of the admin frame: admin bar, menu, notices and the page.
 */
export default {
	id: 'core/frame',
	version: '1.0.0',
	props: {
		manifest: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
		current: { type: 'String', required: true },
		base: { type: 'String', required: true },
		siteName: { type: 'String', required: false },
		busy: { type: 'Boolean', required: false },
	},
	slots: {
		'before-content': { props: { page: { type: 'Object', required: true } } },
		'after-content': { props: { page: { type: 'Object', required: true } } },
	},
	emits: [ 'sign-out' ],
};
