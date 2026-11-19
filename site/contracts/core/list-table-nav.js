/**
 * Contract of a list table's navigation, the classic `div.tablenav.{top|bottom}`
 * (WP_List_Table::display_tablenav()).
 *
 * - `which`: `top` or `bottom`.
 * - `bulkActions`: `[ { value, label } | { label, options: [ { value, label } ] } ]` as
 *   wp_admin_list_table_bulk_actions() gives them (an optgroup has `options`): the bulk select
 *   (`bulk-action-selector-{which}`, named `action` above and `action2` below, with "Bulk actions"
 *   first) and its Apply button (`doaction`, `doaction2`). `bulk` is emitted with the value chosen
 *   (`-1` for none) when Apply is used. `bulkValue` (v-model:bulkValue, `update:bulkValue`) lets the
 *   page keep the two selects the same, as common.js marries them.
 * - `pagination`: `{ total, totalText, perPage, page, pages, pagesText, links: { first, prev, next,
 *   last } }` as wp_admin_list_table_pagination() gives it: the classic pagination, its links
 *   (admin paths; null where pagination() disables them) and, above the table, the current page
 *   input, which opens that page on Enter.
 * - `heading`: the hidden heading WordPress prints before the pagination above the table when there
 *   is more than one page (`heading_pagination`), or none.
 * - `hasItems`: whether the list has items (default: `pagination.total` is not 0); without items the
 *   bulk actions are hidden, as classic.
 *
 * Slot `extra` `{ which }` (a Vue slot of the page) sits where extra_tablenav() prints.
 */
export default {
	id: 'core/list-table-nav',
	version: '1.0.0',
	props: {
		which: { type: 'String', required: true },
		bulkActions: { type: 'Array', required: false },
		pagination: { type: 'Object', required: false },
		heading: { type: 'String', required: false },
		hasItems: { type: 'Boolean', required: false },
		bulkValue: { type: 'String', required: false },
	},
	slots: {
		extra: { props: { which: { type: 'String', required: true } } },
	},
	emits: [ 'bulk', 'update:bulkValue' ],
};
