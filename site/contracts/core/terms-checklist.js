/**
 * Contract of a terms checklist: the classic `ul.cat-checklist.{taxonomy}-checklist` that
 * wp_terms_checklist() prints (Walker_Category_Checklist) for a hierarchical taxonomy, as Quick
 * Edit and Bulk Edit show it. Which terms are listed, in which order and nesting, and whether the
 * user may assign them, is data WordPress computed (wp-admin/v1, `inlineEdit.fields.taxonomies[]`);
 * this part decides none of it.
 *
 * - `taxonomy`: the taxonomy's name (the list's class and the ids). `tree`: `[ { id, name,
 *   children } ]` (`name` is text). `name`: the checkboxes' field name (`post_category[]`,
 *   `tax_input[{taxonomy}][]`). `disabled`: every box is disabled (no `assign_terms`).
 *   `idPrefix`: put before every id, so that a second list on the screen has its own ids
 *   (inline-edit-post.js prefixes Bulk Edit's copy with `bulk-edit-`).
 * - `modelValue`: the checked term IDs (v-model). `indeterminate`: the IDs that only some of the
 *   selected posts have (Bulk Edit, v-model:indeterminate); each such box is indeterminate, says
 *   so in its label and posts `indeterminate_{name}` (`indeterminate_post_category[]`) as
 *   inline-edit-post.js does. Changing such a box takes it out of `indeterminate`. Only the
 *   categories list (`name` `post_category[]`) has this state, as in classic; it is ignored for
 *   other names. A plugin's checklist (`html`) gets the same fields on its boxes.
 * - `html`: when a string, the checklist a plugin filtered (`wp_terms_checklist_args`), shown
 *   through kit/LegacyHtml inside the list instead of the tree; its checked boxes named `name`
 *   are read back into `modelValue` when they change.
 *
 * Emits `update:modelValue( ids )` and `update:indeterminate( ids )`.
 */
export default {
	id: 'core/terms-checklist',
	version: '1.0.0',
	props: {
		taxonomy: { type: 'String', required: true },
		tree: { type: 'Array', required: false },
		name: { type: 'String', required: true },
		modelValue: { type: 'Array', required: false },
		indeterminate: { type: 'Array', required: false },
		html: { type: 'String', required: false },
		disabled: { type: 'Boolean', required: false },
		idPrefix: { type: 'String', required: false },
	},
	slots: {},
	emits: [ 'update:modelValue', 'update:indeterminate' ],
};
