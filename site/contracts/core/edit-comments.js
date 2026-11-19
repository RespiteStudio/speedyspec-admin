/**
 * Contract of the Comments page (`edit-comments.php`).
 *
 * `data` is what `wp-admin/v1/comments` returns for the page's query (the page's router data,
 * wp_admin_get_comments_list()): the list's `query` (sent back as `list` with every write), the
 * document `title`, the `heading` (the post of `p`, the search), the `messages` and `error` of the
 * classic redirect arguments, the table (`columns`, `caption`, `classes`, `items`, `extra`,
 * `noItems`), the `views`, `bulkActions`, `filters`, `search` and `pagination`, the inline form's
 * settings (`replyForm`), the keyboard shortcuts (`hotkeys`), the Screen Options
 * (`screenOptions`) and the menu counts; or `{ failed: true }` when WordPress could not prepare the
 * list. WordPress decides what the page shows, which actions apply and what each one does; the
 * implementation shows it and sends the routes it is given. `page` is the router's page. The page
 * host renders the page title as the top-level heading; an implementation renders none of its
 * own.
 *
 * The table is shown by core/list-table, with core/list-table-views, core/list-table-search and
 * core/list-table-nav around it.
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query }`, the list's query.
 *
 * `moderated` carries each answer of a comment route (moderation, Quick Edit, reply, undo).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/edit-comments',
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
	emits: [ 'moderated' ],
};
