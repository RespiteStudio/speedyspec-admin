/**
 * Contract of one row of a settings table (`<tr>` with a `<th scope="row">` label and
 * the control in the `<td>`). The control comes in the default slot.
 *
 * - `id` is the id of the control the label is for. An error is shown in an element
 *   with the id `{id}-error`, which the control references with `aria-describedby`.
 * - `label` and `description` are plain text (character references are decoded).
 *   A description with markup is rendered by the page in the default slot instead.
 * - `locked`: the value is fixed (for instance by a constant); the control is disabled.
 * - `error`: message of a validation error of the field, empty for none.
 * - `group`: the control is a group with its own legend (a fieldset of radios or a
 *   checkbox); the label is then shown as text, not as a `<label>`.
 * - `icon`: a Dashicons class shown, hidden from assistive technology, after the label.
 *
 * Slot `after-control` (also a slot for modules, which get `{ id }`) follows the control.
 */
export default {
	id: 'core/settings-field',
	version: '1.0.0',
	props: {
		id: { type: 'String', required: true },
		label: { type: 'String', required: true },
		description: { type: 'String', required: false },
		locked: { type: 'Boolean', required: false },
		error: { type: 'String', required: false },
		group: { type: 'Boolean', required: false },
		icon: { type: 'String', required: false },
	},
	slots: {
		default: { props: {} },
		'after-control': { props: { id: { type: 'String', required: true } } },
	},
	emits: [],
};
