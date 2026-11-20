/**
 * Contract of a tags field with suggestions: the textarea a flat taxonomy has in Quick Edit and
 * Bulk Edit (`textarea[data-wp-taxonomy]`), with the suggestions tags-suggest.js offers while a
 * name is typed. The suggestions are what WordPress answers (`GET wp-admin/v1/terms/search`,
 * as the classic `ajax-tag-search` handler); which taxonomies have the field, and how many
 * characters a search needs, is data WordPress computed (`inlineEdit.fields.flatTaxonomies[]`).
 *
 * - `taxonomy`: the taxonomy searched (`data-wp-taxonomy`, the class `tax_input_{taxonomy}`).
 *   `name`: the field's name (`tax_input[{taxonomy}]`).
 * - `modelValue`: the names, separated by the tag delimiter (v-model).
 * - `minChars`: the length of the last name a search needs, as WordPress decided it
 *   (`term_search_min_chars`, in strlen() bytes, never below 0). `searchEnabled`: whether
 *   WordPress searches at all (false when the minimum is 0). The site only applies them; the
 *   search route decides again for each search.
 * - `label`: when not empty, the field is in the classic `label.inline-edit-tags` with this
 *   title; otherwise the textarea is shown alone (the page labels it).
 *
 * Keys: Enter on a highlighted name must call `preventDefault()` and `stopPropagation()` on the
 * keydown, so that core/inline-edit does not save; Escape closes the list and goes on, as
 * jQuery UI's, so Quick Edit closes too, as classic.
 *
 * Attributes (`aria-describedby` …) go to the textarea. Emits `update:modelValue( names )`.
 */
export default {
	id: 'core/tags-suggest',
	version: '1.0.0',
	props: {
		taxonomy: { type: 'String', required: true },
		name: { type: 'String', required: true },
		modelValue: { type: 'String', required: false },
		minChars: { type: 'Number', required: false },
		searchEnabled: { type: 'Boolean', required: false },
		label: { type: 'String', required: false },
	},
	slots: {},
	emits: [ 'update:modelValue' ],
};
