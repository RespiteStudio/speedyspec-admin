/**
 * Contract of the notices area. `notices` is the notices service's list of
 * `{ id, type, message, dismissible }`; `dismiss` carries a notice id.
 */
export default {
	id: 'core/notices',
	version: '1.0.0',
	props: {
		notices: { type: 'Array', required: true },
	},
	slots: {
		before: { props: { notices: { type: 'Array', required: true } } },
		after: { props: { notices: { type: 'Array', required: true } } },
	},
	emits: [ 'dismiss' ],
};
