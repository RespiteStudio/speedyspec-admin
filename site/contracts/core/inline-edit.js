/**
 * Contract of a list's inline form: the classic Quick Edit and Bulk Edit row that
 * WP_Posts_List_Table::inline_edit() prints (`tr#inline-edit` / `tr#bulk-edit`), as
 * inline-edit-post.js shows it. Shared by the list screens that edit rows in place (Posts, and
 * later Terms). Which fields the form has is data WordPress computed (wp-admin/v1 page data,
 * `inlineEdit`); the page puts those fields in the slots, and this part decides none of them.
 *
 * - `kind`: `quick` or `bulk`. `legend`: the legend's text; without it "Quick Edit" or
 *   "Bulk Edit" (core strings).
 * - `classes`: the row's classes as WordPress sends them (`inlineEdit.classes.quick|bulk`);
 *   `inline-editor` is added, as inline-edit-post.js adds it to the row it shows. `rowId`: the
 *   row's id (`edit-{id}` for Quick Edit, `bulk-edit` for Bulk Edit, as classic).
 * - `colspan`: the number of columns shown (the cell is `td.colspanchange`).
 * - `saving`: a save is in flight: the spinner is active, the buttons are disabled.
 * - `error`: the text of a failed save (plain text, as the API sends it), shown in the form's
 *   `.notice-error` and spoken; `''` for none.
 * - `customBoxes`: `[ { column, html, error } ]`, what plugins print on `quick_edit_custom_box`
 *   or `bulk_edit_custom_box`, shown through kit/LegacyHtml where inline_edit() prints them
 *   (after the right column, before the buttons).
 *
 * Slots: `left` (in `fieldset.inline-edit-col-left`, after the legend), `center` (when given,
 * `fieldset.inline-edit-col-center.inline-edit-categories`) and `right`
 * (`fieldset.inline-edit-col-right`), each inside `div.inline-edit-col`.
 *
 * Emits `save( fields )` (Update; Enter in Quick Edit) with the row's fields as the classic
 * form posts them (list-table-parts/form-fields.js classicFormFields()), and `cancel` (Cancel;
 * Escape).
 */
export default {
	id: 'core/inline-edit',
	version: '1.0.0',
	props: {
		kind: { type: 'String', required: true },
		legend: { type: 'String', required: false },
		classes: { type: 'Array', required: false },
		colspan: { type: 'Number', required: false },
		saving: { type: 'Boolean', required: false },
		error: { type: 'String', required: false },
		customBoxes: { type: 'Array', required: false },
		rowId: { type: 'String', required: false },
	},
	slots: {
		left: { props: {} },
		center: { props: {} },
		right: { props: {} },
	},
	emits: [ 'save', 'cancel' ],
};
