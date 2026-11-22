/**
 * Contract of the Links list page (`link-manager.php`), shown while the Link Manager is on.
 *
 * `data` is the page's router data (wp_admin_get_links_list()): the list's `query` (sent back as
 * `list` with a bulk action), the document `title`, the `heading` (the Add Link action and the
 * search), the hidden `headings`, the `messages` of the classic redirect arguments, the category
 * `filter` (`{ label, options, value, html }`), the table (`columns`, `caption`, `classes`,
 * `items`, `noItems`), `bulkActions`, `search`, the Screen Options (`screenOptions`) and the
 * `bodyClasses`; or `{ query, error }` when the classic screen dies (`error`: `{ kind, status,
 * heading, message }`, text). WordPress decides which links, columns, categories, actions,
 * confirmations and messages apply and where each action leads; the implementation shows them,
 * reproduces common.js, and sends the routes it is given (`DELETE wp-admin/v1/links/{id}`,
 * `POST wp-admin/v1/links/bulk`), then follows the answer. `page` is the router's page. The page
 * host renders the page title as the top-level heading; an implementation renders none of its own.
 *
 * The table is shown by core/list-table, with core/list-table-search and core/list-table-nav
 * around it.
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query }`.
 *
 * `saved` carries each answer of a write route (a delete, a bulk action).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/link-manager',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {
		'before-table': tableSlot,
		'after-table': tableSlot,
	},
	emits: [ 'saved' ],
};
