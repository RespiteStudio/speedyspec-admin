/**
 * Contract of the admin bar: site link, current user and signing out.
 */
export default {
	id: 'core/admin-bar',
	version: '1.0.0',
	props: {
		user: { type: 'Object', required: true },
		base: { type: 'String', required: true },
		siteName: { type: 'String', required: false },
	},
	slots: {
		start: { props: { user: { type: 'Object', required: true } } },
		end: { props: { user: { type: 'Object', required: true } } },
	},
	emits: [ 'sign-out' ],
};
