/**
 * Contract of a list table, the classic WP_List_Table `<table class="wp-list-table …">`, shared by
 * the list screens (Comments, and later Posts, Users, Terms). Everything shown is data WordPress
 * computed (wp-admin/v1, see list-table-data.php); the table decides none of it.
 *
 * - `columns`: `[ { key, label, primary, hidden, core, sortable, sorted } ]` as
 *   wp_admin_list_table_columns() gives them: `label` is HTML limited to links, code, strong and
 *   em (shown through the kit's InlineMarkup), empty for `cb`; `sortable` is null or `{ orderby,
 *   initialDesc, abbr, description, url }` (`url` an admin path, the header's link); `sorted` is
 *   `asc`, `desc` or null. `caption`: the table's caption text, or null.
 * - `classes`: the table's classes after `wp-list-table` (wp_admin_list_table_classes()).
 * - `items`: the rows, in order. `itemKey` (default `id`) names each item's key; `rowId( item )`
 *   and `rowClasses( item )` give the row's id and classes (from the item's data); `selectable(
 *   item )` whether the row has a checkbox (`cb-select-{key}`, named `checkboxName`, with the
 *   hidden label `checkboxLabel( item )`). `bodyId`: the id of `tbody` (`the-comment-list`).
 * - `selected`: the keys of the checked rows (v-model:selected; `update:selected` carries the new
 *   list). Selecting follows common.js: the select-all checkboxes of the header and footer
 *   (`cb-select-all-1`, `cb-select-all-2`) check or uncheck every row (with Shift, invert each),
 *   and a Shift-click on a row's checkbox sets the rows between it and the last one clicked.
 * - `noItems`: the text of the "no items" row when there are no items.
 *
 * Slots (Vue slots of the page): `cell` `{ item, column }`, the content of
 * a cell (default: the item's `cells[ key ].html`, through kit/LegacyHtml for a plugin column,
 * `core: false`, and through kit/InertHtml, which runs nothing, for a core column); the
 * primary cell is followed by the classic "Show more details" toggle. `after-row` `{ item }`: rows
 * after an item's row (inline forms, undo rows). `no-items`: the content of the no-items row.
 */
export default {
	id: 'core/list-table',
	version: '1.0.0',
	props: {
		columns: { type: 'Array', required: true },
		caption: { type: 'String', required: false },
		classes: { type: 'Array', required: false },
		items: { type: 'Array', required: true },
		itemKey: { type: 'String', required: false },
		bodyId: { type: 'String', required: false },
		rowId: { type: 'Function', required: false },
		rowClasses: { type: 'Function', required: false },
		selectable: { type: 'Function', required: false },
		checkboxLabel: { type: 'Function', required: false },
		checkboxName: { type: 'String', required: false },
		selected: { type: 'Array', required: false },
		noItems: { type: 'String', required: false },
	},
	slots: {
		cell: { props: { item: { type: 'Object', required: true }, column: { type: 'Object', required: true } } },
		'after-row': { props: { item: { type: 'Object', required: true } } },
		'no-items': { props: {} },
	},
	emits: [ 'update:selected' ],
};
