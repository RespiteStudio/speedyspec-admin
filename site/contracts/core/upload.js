/**
 * Contract of the Media Library's list mode (`upload.php`, `upload.php?mode=list`). The grid
 * (`upload.php?mode=grid`) is the classic screen, shown in the frame: WordPress sends a bare
 * `upload.php` there when the grid is the stored mode, and the view switch's grid link leads
 * there through the router.
 *
 * `data` is the page's router data (wp_admin_get_media_list()): the list's `query` (sent back as
 * `list` with every write), the document `title`, the hidden `headings`, the `heading` (the Add
 * Media File link, the search), the `messages` of the classic redirect arguments (with Undo after
 * a Trash), the `filterBar` (the view switch, the type, month and plugin filters, Empty Trash, the
 * search, the plugins' filter links), the table (`columns`, `caption`, `classes`, `items`,
 * `noItems`), `bulkActions`, `pagination`, `screenOptions` and `confirmDelete` (whether a row's
 * Delete Permanently asks first); or `{ query, error }` when the classic screen dies (`error`:
 * `{ kind, status, heading, message }`, text), or `{ failed: true }` when WordPress could not
 * prepare the list. WordPress decides which rows, columns, filters, actions and buttons apply,
 * the messages and where each action leads; the implementation shows them, reproduces media.js
 * and common.js (the Find Posts dialog, Copy URL, the delete confirmations), and sends the routes
 * it is given. `page` is the router's page. The page host renders the page title as the
 * top-level heading; an implementation renders none of its own.
 *
 * The table is shown by core/list-table, with core/list-table-nav above and below it.
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query }`.
 *
 * `saved` carries each answer of a write route (a row action, a bulk action, Attach, Detach,
 * Empty Trash, Undo).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/upload',
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
