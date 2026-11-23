/**
 * Contract of the administration email verification after sign-in: what wp-login.php's
 * `confirm_admin_email` screen shows a user who may manage options once `admin_email_lifespan`
 * has passed. The shell shows it alone, in place of any page, while the router holds the sign-in
 * on it (status `verify`).
 *
 * `data` is WordPress's verification (wp_admin_admin_email_verification(), the session's
 * `next.verifyAdminEmail`): the document `title`; the `email` (text); `helpUrl` ("Why is this
 * important?", opened in a new tab); `changePath`, the admin path of Update (General Settings,
 * `options-general.php?highlight=confirm_admin_email`); `remindLater`, whether Remind me later
 * is offered; the `texts` (`heading`, `details`, `why`, `newTab`, `current`, `different`,
 * `update`, `correct`, `remind`; `details` and `current` inline markup, the email escaped, the
 * others text); the `hooks`, what plugins print on {@see 'admin_email_confirm'} (`confirm`,
 * before the form) and {@see 'admin_email_confirm_form'} (`form`, inside it), each markup or
 * null; and `redirectTo`, where the answers lead.
 *
 * `answer( action )` answers it (`confirm`: The email is correct; `remind`: Remind me later):
 * a promise, settled once WordPress stored the answer and the router followed where it leads
 * (the router's answerAdminEmail()); it rejects with the API's error, the step still shown.
 * WordPress decides whether the step shows, what it says and where each answer leads; the
 * implementation shows it and calls `answer`. Update is a link into the admin, which skips the
 * step as the classic screen's link does.
 *
 * The step is shared: the shell shows it before any page, so it is never in a session's
 * `components` list of one page.
 */
export default {
	id: 'core/admin-email-confirm',
	version: '1.0.0',
	props: {
		data: { type: 'Object', required: true },
		answer: { type: 'Function', required: true },
	},
	slots: {},
	emits: [],
};
