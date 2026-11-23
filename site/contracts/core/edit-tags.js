/**
 * Contract of the terms list page (`edit-tags.php?taxonomy={name}`, and the bare `edit-tags.php`,
 * which is Tags): one page for every taxonomy with a user interface, Link Categories and Pattern
 * Categories included.
 *
 * `data` is the page's router data (wp_admin_get_terms_list()): the list's `query` (sent back as
 * `list` with every write), `taxonomy`, the document `title`, the hidden `headings`, the
 * `heading` (the search), the `messages` of the classic redirect arguments, the `bodyClasses`,
 * the table (`columns`, `caption`, `classes`, `items`, `noItems`), the `views`, `bulkActions`,
 * `search`, `pagination` and the list form's hidden `formFields`, the add form (`addForm`, null
 * for a user who may not add terms), the `notes` below the table, the plugins' `afterTableHtml`,
 * the Quick Edit form (`inlineEdit`, null without it) and the Screen Options (`screenOptions`);
 * or `{ query, taxonomy: null, error }` when the classic screen dies (`error`: `{ kind, status,
 * heading, message }`, text). WordPress decides which rows, levels, pads, columns, actions,
 * checkboxes, fields, notes and messages apply, which terms are the defaults, and where each
 * action leads; the implementation shows them, reproduces tags.js, inline-edit-tax.js and
 * common.js, and sends the routes it is given. `page` is the router's page. The page host renders
 * the page title as the top-level heading; an implementation renders none of its own.
 *
 * The table is shown by core/list-table, with core/list-table-views, core/list-table-search and
 * core/list-table-nav around it; Quick Edit by core/inline-edit (`layout: 'single'`).
 *
 * Slots `before-table` and `after-table` (inside the list form, before the navigation above the
 * table and after the one below it; also slots for modules) get `{ query, taxonomy }`.
 *
 * `saved` carries each answer of a write route (add, Quick Edit, delete, a bulk action).
 */
const tableSlot = {
	props: {
		query: { type: 'Object', required: true },
		taxonomy: { type: 'Object', required: false },
	},
};

export default {
	id: 'core/edit-tags',
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
