/**
 * Contract of the Screen Options panel the frame shows above a page that has screen options
 * (a page that shows meta boxes, through core/meta-box-holder, gives them to the frame).
 *
 * Everything shown is data WordPress computed for the screen; the panel decides nothing:
 *
 * - `sections`: `[ { id, legend, description, items: [ { id, label, checked } ] } ]`, each a
 *   fieldset of checkboxes (the classic "Screen elements": one item per meta box, `id` the box
 *   id, `label` its basename, plain text; `checked` when the box is shown). `legend` and
 *   `description` are translated plain text; `description` may be empty.
 * - `reordering`: whether screen elements may be rearranged, shown as the classic "Allow screen
 *   elements to be rearranged" checkbox; null for a screen without the option.
 * - `columns`: `{ max, value }`, the classic "Layout" choice of 1 to `max` columns with `value`
 *   chosen, or null when the screen offers none.
 *
 * `change` carries `( id, value )`: an item's id and whether it is now checked; for the
 * reordering checkbox the id `meta-box-reordering` and a boolean; for the layout the id
 * `screen_columns` and the number of columns. `toggle` carries whether the panel is now open.
 * Slots `before` and `after` (before and after the fieldsets) get `sections`.
 */
const sectionsSlot = {
	props: {
		sections: { type: 'Array', required: true },
	},
};

export default {
	id: 'core/screen-options',
	version: '1.0.0',
	props: {
		sections: { type: 'Array', required: true },
		reordering: { type: 'Boolean', required: false },
		columns: { type: 'Object', required: false },
	},
	slots: {
		before: sectionsSlot,
		after: sectionsSlot,
	},
	emits: [ 'change', 'toggle' ],
};
