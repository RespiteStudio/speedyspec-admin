/**
 * Contract of a list table's search box, the classic `p.search-box` (WP_List_Table::search_box()).
 *
 * - `search`: `{ shown, value, label, inputId, keep }` as wp_admin_list_table_search() gives it:
 *   nothing is shown unless `shown`; `value` is the term searched for, `label` the button's text
 *   (the input's hidden label adds a colon, as classic), `inputId` the input's id, and `keep` the
 *   hidden fields `[ { name, value } ]` the search carries (`orderby`, `order` …), printed before
 *   the box.
 *
 * `search` is emitted with the term typed when the button is used or Enter is pressed in the field.
 */
export default {
	id: 'core/list-table-search',
	version: '1.0.0',
	props: {
		search: { type: 'Object', required: true },
	},
	slots: {},
	emits: [ 'search' ],
};
