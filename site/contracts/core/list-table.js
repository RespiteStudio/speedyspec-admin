/**
 * Contract of a list table, the classic WP_List_Table `<table class="wp-list-table …">`, shared by
 * the list screens (Comments, and later Posts, Users, Terms). Everything shown is data WordPress
 * computed (wp-admin/v1, see list-table-data.php); the table decides none of it.
 *
 * - `columns`: `[ { key, label, labelHtml, primary, hidden, num, core, sortable, sorted } ]` as
 *   wp_admin_list_table_columns() gives them: `label` is HTML limited to links, code, strong and
 *   em (shown through the kit's InlineMarkup), empty for `cb`; `labelHtml` (1.2.0), when a string,
 *   is shown in its place, through InlineMarkup with `spans` (a core header's icon); `num`
 *   (1.2.0) gives the header the class `num`; `sortable` is null or `{ orderby,
 *   initialDesc, abbr, description, url }` (`url` an admin path, the header's link); `sorted` is
 *   `asc`, `desc` or null. `caption`: the table's caption text, or null.
 * - `classes`: the table's classes after `wp-list-table` (wp_admin_list_table_classes()).
 * - `items`: the rows, in order. `itemKey` (default `id`) names each item's key; `rowId( item )`
 *   and `rowClasses( item )` give the row's id and classes (from the item's data), `rowStyle( item )`
 *   its inline style or null (1.1.0); `selectable(
 *   item )` whether the row has a checkbox (`cb-select-{key}`, named `checkboxName`, with the
 *   hidden label `checkboxLabel( item )`), from the server's flag; without it every row has one, as in
 *   1.1.0. 1.2.0: `selectable` may be `false`, for a table whose rows never have a checkbox (the
 *   server says so): no row checkbox and no select-all checkboxes. `rowHeaderLabel( item )` (1.2.0): the primary cell's `aria-label`, as
 *   WordPress sends it for the row (get_primary_column_aria_label()), or null for none.
 *   `bodyId`: the id of `tbody` (`the-comment-list`).
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
 * `cb-extra` `{ item }` (1.3.0): content after a row's checkbox and its label, in the check
 * column, only where the row has a checkbox (column_cb() prints the Posts lock indicator,
 * `div.locked-indicator`, there). `before-rows` (1.4.0): rows at the top of `tbody`, before the
 * items' rows (inline-edit-post.js prepends Bulk Edit there).
 */
export default {
	id: 'core/list-table',
	// 1.1.0: `rowStyle( item )`, the row's inline style (wp-lists' background of a failed action).
	// 1.2.0: `selectable` may be `false`, `rowHeaderLabel( item )`, the columns' `num` and `labelHtml`.
	// 1.3.0: the `cb-extra` slot, after a row's checkbox (the Posts lock indicator).
	// 1.4.0: the `before-rows` slot, rows at the top of tbody (Bulk Edit).
	version: '1.4.0',
	props: {
		columns: { type: 'Array', required: true },
		caption: { type: 'String', required: false },
		classes: { type: 'Array', required: false },
		items: { type: 'Array', required: true },
		itemKey: { type: 'String', required: false },
		bodyId: { type: 'String', required: false },
		rowId: { type: 'Function', required: false },
		rowClasses: { type: 'Function', required: false },
		rowStyle: { type: 'Function', required: false },
		selectable: { type: 'Function|Boolean', required: false },
		checkboxLabel: { type: 'Function', required: false },
		checkboxName: { type: 'String', required: false },
		selected: { type: 'Array', required: false },
		noItems: { type: 'String', required: false },
		rowHeaderLabel: { type: 'Function', required: false },
	},
	slots: {
		cell: { props: { item: { type: 'Object', required: true }, column: { type: 'Object', required: true } } },
		'after-row': { props: { item: { type: 'Object', required: true } } },
		'no-items': { props: {} },
		'cb-extra': { props: { item: { type: 'Object', required: true } } },
		'before-rows': { props: {} },
	},
	emits: [ 'update:selected' ],
};
