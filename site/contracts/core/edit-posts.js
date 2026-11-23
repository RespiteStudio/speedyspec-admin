/**
 * Contract of the posts list page (`edit.php`, `edit.php?post_type={type}`): one page for every
 * post type with a user interface but Media and Patterns.
 *
 * `data` is the page's router data (wp_admin_get_posts_list()): the list's `query` (sent back as
 * `list` with every write), `postType`, the document `title`, the hidden `headings`, the
 * `heading` (the Add New link, the search), the `messages` of the classic redirect arguments
 * (with Undo after a Trash), the table (`columns`, `caption`, `classes`, `items`, `noItems`), the
 * `views`, `bulkActions`, `filters`, `search` and `pagination`, the Quick Edit and Bulk Edit
 * form (`inlineEdit`) and the Screen Options (`screenOptions`); or `{ query, postType: null,
 * error }` when the classic screen dies (`error`: `{ kind, status, heading, message }`, text), or
 * `{ failed: true }` when WordPress could not prepare the list. WordPress decides which rows,
 * columns, fields, statuses, actions, views, filters and buttons apply, the levels of a tree,
 * the messages and where each action leads; the implementation shows them, reproduces
 * inline-edit-post.js and common.js, and sends the routes it is given. `page` is the router's
 * page. The page host renders the page title as the top-level heading; an implementation renders
 * none of its own.
 *
 * The table is shown by core/list-table, with core/list-table-views, core/list-table-search and
 * core/list-table-nav around it; Quick Edit and Bulk Edit by core/inline-edit, with
 * core/terms-checklist and core/tags-suggest.
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query, postType }`.
 *
 * `saved` carries each answer of a write route (Quick Edit, Bulk Edit, a row action, a bulk
 * action, Empty Trash, Undo).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
		postType: { type: 'Object', required: false },
	},
};

export default {
	id: 'core/edit-posts',
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
