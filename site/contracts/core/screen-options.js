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
 * - `columns`: `{ value, choices: [ { value, label } ] }`, the classic "Layout" choice: each
 *   column count with its label as WordPress formats it ("2 columns", number_format_i18n()),
 *   `value` the chosen count; or null when the screen offers none.
 *
 * - 1.1.0, a list table's options, as wp_admin_list_table_screen_options() sends them
 *   (`screenOptions` of a list answer):
 *   - `tableColumns`: `[ { key, label, hidden } ]`, the classic "Columns" fieldset (a
 *     `hide-column-tog` checkbox `{key}-hide` per column that can be hidden; `label` plain text).
 *   - `pagination`: `{ option, value, label, min, max }` or null, the classic "Pagination"
 *     fieldset (the number input `{option}`, its label as text; without a label only the hidden
 *     option field, as classic prints it).
 *   - `viewMode`: `{ value, choices: [ { value, label } ] }` or null, the "View mode" radios.
 *   - `settingsHtml`: what `screen_settings` callbacks add (HTML, shown with kit/LegacyHtml), or null.
 *   With `pagination` or `viewMode` the panel has the classic Apply button (`screen-options-apply`).
 *   `columns` keeps meaning the meta box layout.
 *
 * `change` carries `( id, value )`: an item's id and whether it is now checked; for the
 * reordering checkbox the id `meta-box-reordering` and a boolean; for the layout the id
 * `screen_columns` and the number of columns; for a table column, at once, the id `hide-column`
 * and `{ key, hidden }`. `apply` carries `{ perPage, mode }` when Apply is used: the items per
 * page typed (an integer, or null without pagination or when it is not a number) and the view
 * mode chosen (null without one). `toggle` carries whether the panel is now open.
 * Slots `before` and `after` (before and after the fieldsets) get `sections`.
 *
 * 1.1.0 added `tableColumns`, `pagination`, `viewMode`, `settingsHtml` and `apply`.
 */
const sectionsSlot = {
	props: {
		sections: { type: 'Array', required: true },
	},
};

export default {
	id: 'core/screen-options',
	version: '1.1.0',
	props: {
		sections: { type: 'Array', required: true },
		reordering: { type: 'Boolean', required: false },
		columns: { type: 'Object', required: false },
		tableColumns: { type: 'Array', required: false },
		pagination: { type: 'Object', required: false },
		viewMode: { type: 'Object', required: false },
		settingsHtml: { type: 'String', required: false },
	},
	slots: {
		before: sectionsSlot,
		after: sectionsSlot,
	},
	emits: [ 'change', 'toggle', 'apply' ],
};
