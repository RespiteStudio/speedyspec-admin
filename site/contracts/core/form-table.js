/**
 * Contract of a settings table: the classic `form-table`, whose rows come in the
 * default slot (core/settings-field rows). Slot modules in `before-rows` and
 * `after-rows` render table rows (`<tr>`).
 */
export default {
	id: 'core/form-table',
	version: '1.0.0',
	props: {},
	slots: {
		default: { props: {} },
		'before-rows': { props: {} },
		'after-rows': { props: {} },
	},
	emits: [],
};
