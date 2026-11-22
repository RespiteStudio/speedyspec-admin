/**
 * Contract of the Users list page (`users.php`).
 *
 * `data` is the page's router data (wp_admin_get_users_list()): the list's `query` (sent back as
 * `list` with a bulk action or a role change), the document `title`, the `heading` (the Add User
 * action and the search), the `messages` of the classic `update=` argument (`{ markup, type }`),
 * the table (`columns`, `caption`, `classes`, `items`, `noItems`), the `views` (and `viewsHtml`
 * when plugins filtered them), `bulkActions`, `search`, `pagination`, the role change
 * (`roleChange`: `{ label, button, options }`, or null), the plugins' table navigation
 * (`extraNav`: `restrict` and `after`, each `{ top, bottom }` of `{ html, error }`, or null), the
 * Screen Options (`screenOptions`) and the `bodyClasses`; or `{ query, refusal, title }` when the
 * classic screen dies (`refusal`: `{ status, heading, message }`, text). WordPress decides which
 * users, columns, views, roles, actions and messages apply and where each action leads; the
 * implementation shows them, reproduces common.js, and sends the routes it is given
 * (`POST wp-admin/v1/users/bulk`), then follows the answer. `page` is the router's page. The page
 * host renders the page title as the top-level heading; an implementation renders none of its own.
 *
 * The table is shown by core/list-table, with core/list-table-views, core/list-table-search and
 * core/list-table-nav around it.
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query }`.
 *
 * `saved` carries each answer of a write route (a bulk action, a role change, a row's password
 * reset).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/users',
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
