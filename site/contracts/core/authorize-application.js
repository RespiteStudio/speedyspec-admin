/**
 * Contract of the Authorize Application page (`authorize-application.php`), where a user approves
 * or rejects an application that asks for an application password.
 *
 * `data` is the page's router data (wp_admin_get_authorize_application()): the document `title`,
 * the `request` (`{ appName, appId, successUrl, rejectUrl }`, the reject URL defaulted by
 * WordPress; `appName` text, the name field's first value), the `texts` (`{ intro,
 * approveDescription, rejectDescription }`, inline markup, names and URLs escaped), the multisite
 * `sitesNotice` (inline markup, or null), what plugins print on
 * {@see 'wp_authorize_application_password_form'} (`formHtml`, or null) and the `bodyClasses`;
 * or `{ error, title, bodyClasses }` when the classic screen dies (`error`: `{ status, title,
 * heading, message, link }`, text, `link` the Go Back `{ text, url }` or null), or
 * `{ failed: true }`. The data never holds an application password.
 *
 * WordPress decides whether the request is allowed, its texts, where Approve and Reject lead and
 * the new password; the implementation shows them, reproduces auth-app.js, and sends
 * `POST wp-admin/v1/application-passwords/authorize` (`{ app_name, app_id, success_url,
 * reject_url, approve }`, `app_name` the name field's value). The answer gives `location` (an
 * absolute URL of any scheme WordPress allows, which the implementation loads itself after
 * refusing `javascript:`, `data:` and `vbscript:`), or `redirect` (a target in the admin, followed
 * through the router), or, for an approval without a success URL, neither: then `chunked` is the
 * new password, shown once with Copy. `page` is the router's page. The page host renders the page
 * title as the top-level heading; an implementation renders none of its own.
 *
 * `saved` carries each answer of the route.
 */
export default {
	id: 'core/authorize-application',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
