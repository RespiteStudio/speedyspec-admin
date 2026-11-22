/**
 * Contract of Profile and Edit User (`profile.php`, `user-edit.php`): one page, which shows
 * one's own profile or another user's from its data.
 *
 * `data` is the page's router data (wp_admin_get_user_edit()): the `context` (`site`; the
 * network and user admins register the same page later), `isProfilePage`, the document
 * `title`, the classic `h1` (`heading.title`, text, which the page host shows as the heading,
 * see core/frame 1.3.0), the heading's `addNew` button (`heading.addNew`: `label`, `path`; or
 * null), the
 * `messages` (`{ markup, type, back, cancel }`: the super admin notice, the `updated` and `error`
 * messages, the pending email change), the user's values as text (`user`: `id`, `login`,
 * `email`, `url`, `firstName`, `lastName`, `nickname`, `displayName`, `description`, `locale` and
 * `contact`), the sections, each row null when classic hides it (`personal`, `name`, `contact`,
 * `about`, `account`, `applicationPasswords`), what plugins print on {@see 'show_user_profile'}
 * and {@see 'edit_user_profile'} (`hooksHtml`), the Additional Capabilities list
 * (`capabilities`), the `submitLabel`, the `referer` and the `bodyClasses`; or
 * `{ error: { kind: 'die', status, message } }` when the classic screen refuses, or
 * `{ failed: true }`. WordPress decides every row, choice, text, password and where a write
 * leads; the implementation shows them and reproduces user-profile.js (the display-name choices
 * while typing, the password rows through core/user-password `change`, the session and reset
 * buttons, the color scheme saved at once on one's own profile) and application-passwords.js.
 *
 * Writes: `POST wp-admin/v1/users/{id}` (`{ fields, screen, referer }`, the fields as the classic
 * `form#your-profile` posts them, `pass2` equal to `pass1` and only after Set New Password), then
 * the answer is followed with the history entry replaced; `POST wp-admin/v1/users/me/color-scheme`;
 * `DELETE wp-admin/v1/users/{id}/sessions`; `POST wp-admin/v1/users/{id}/password-reset`;
 * `DELETE wp-admin/v1/users/me/email-change`; the application passwords through
 * `wp/v2/users/{id}/application-passwords` (create, revoke one, revoke all), each followed by
 * `GET wp-admin/v1/users/{id}/application-passwords`, whose rows replace the table. A refused save
 * carries every error in `data.errors` (`{ code, message, field }`, `message` inline markup).
 * Plugin hook output is shown through kit/LegacyHtml beside the note that this screen does not
 * save the fields plugins add; other markup through kit/InlineMarkup. `page` is the router's
 * page. The page host renders the page title as the top-level heading; an implementation renders
 * none of its own.
 *
 * `saved` carries the answer of each save.
 */
export default {
	id: 'core/user-edit',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
