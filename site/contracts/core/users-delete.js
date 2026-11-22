/**
 * Contract of the Delete Users and Remove Users from Site confirmations (`users.php?action=delete`
 * and, on multisite, `users.php?action=remove`): one page for both, its mode the path's `action`.
 *
 * `data` is the page's router data (wp_admin_get_users_deletion()): the document `title`, the
 * `intro`, the `error` ("Please select an option.", text, or null), the `users` listed (`{ id,
 * login, current, hasContent }` to delete, `{ id, login, canRemove }` to remove, each with the
 * `markup` of its line), the `reassignOptions` (`{ value, label }`), the content options' labels
 * (`optionLabels`, null to remove), the plugins' `formHtml` (null without it), `canSubmit`, the
 * `submitLabel`, the text with nobody to act on (`none`), the list to go back to (`referer`) and
 * the `bodyClasses`; or `{ refusal, title }` when the classic screen dies (`refusal`: `{ status,
 * heading, message }`, text). WordPress decides who is listed, who has content, who may be acted
 * on and where the confirmation leads; the implementation shows them and sends the route of its
 * mode (`POST wp-admin/v1/users/delete` or `POST wp-admin/v1/users/remove`), then follows the
 * answer. `page` is the router's page (its `path` holds the mode). The page host renders the page
 * title as the top-level heading; an implementation renders none of its own.
 *
 * `saved` carries the answer of the confirmation's route.
 */
export default {
	id: 'core/users-delete',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
