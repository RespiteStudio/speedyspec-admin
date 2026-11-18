/**
 * Contract of the Privacy Settings page (`options-privacy.php`).
 *
 * `data` is what `wp-admin/v1/settings/privacy` returns (the page's router data): `page`
 * (the Privacy Policy page ID, 0 for none), `selected` (the value the page select shows),
 * `pageExists`, `pageStatus`, `editPath` (the page's editor, relative to the admin),
 * `viewUrl`, `hasPages`, `choices.pages` (the select's choices, `{ value, label }`) and
 * `notices` (about a selected page that is missing or in the Trash). `page` is the router's
 * page. The page host renders the page title as the top-level heading; an implementation
 * renders none of its own. The Policy Guide tab links to `options-privacy.php?tab=policyguide`,
 * which the router shows as the classic screen.
 *
 * The screen is not a settings form: "Use This Page" posts `{ page }` to
 * `wp-admin/v1/settings/privacy`, and "Create" posts to `wp-admin/v1/settings/privacy/page`,
 * whose answer has the `editPath` of the new draft, where the page then goes (the hosted
 * classic editor).
 *
 * Slots `before-fields` and `after-fields` (before and after the table of the two actions)
 * get `settings` (what the endpoint last said). `saved` carries the settings returned after
 * the page was set; `created` carries `{ page, editPath }` of a new page, before the page
 * goes to its editor.
 */
const settingsSlot = {
	props: {
		settings: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/options-privacy',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {
		'before-fields': settingsSlot,
		'after-fields': settingsSlot,
	},
	emits: [ 'saved', 'created' ],
};
