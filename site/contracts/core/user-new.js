/**
 * Contract of the Add User page (`user-new.php`).
 *
 * `data` is the page's router data (wp_admin_get_user_new()): the document `title`, the `messages`
 * of the classic `update=` argument (`{ markup, type }`) and its multisite `errors`
 * (`{ code, markup }`), the multisite Add Existing User form (`existing`: its `label`, `help`,
 * field `type`, `roles`, `defaultRole`, whether Skip Confirmation Email shows (`noconfirmation`)
 * and whether the field suggests users (`suggest`), and what plugins print on
 * {@see 'user_new_form'} for it, `hooksHtml`; or null), the Add User form (`create`: the `fields`
 * it shows (`names`, `website`, `language` with its options, `password`, `notify`, `role` with its
 * options), `noconfirmation`, the `initialPassword` WordPress generated, the password rows'
 * `passwordLabels` and `hooksHtml`; or null) and the `bodyClasses`; or `{ refusal, title }` when
 * the classic screen dies (`refusal`: `{ status, heading, message }`, text), or `{ failed: true }`.
 * WordPress decides which forms, fields, roles, defaults, passwords and messages apply and where a
 * write leads; the implementation shows them, reproduces user-profile.js (through
 * core/user-password), user-suggest.js and common.js's check of the required fields, and sends the
 * routes: `POST wp-admin/v1/users` (`{ fields }`, as the classic form posts them, `pass2` equal to
 * `pass1`), `POST wp-admin/v1/users/existing`, `GET wp-admin/v1/users/suggest` and
 * `GET wp-admin/v1/users/generate-password`, then follows the answer. An error of `users` carries
 * every error in `data.errors` (`{ code, message, field }`, `message` inline markup), shown in the
 * classic error list. `page` is the router's page. The page host renders the page title as the
 * top-level heading; an implementation renders none of its own.
 *
 * The password rows are shown by core/user-password (`mode: 'new'`).
 *
 * `saved` carries each answer of a write route.
 */
export default {
	id: 'core/user-new',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
