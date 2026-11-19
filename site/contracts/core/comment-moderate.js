/**
 * Contract of the moderation confirmation page (`comment.php?action=approve|trash|spam|delete`,
 * and the aliases `mac` and `cdc`), which the comment notification emails link to.
 *
 * `data` is what the router sends for the page (wp_admin_get_comment_moderate()): the action
 * confirmed (`action`: `approve`, `trash`, `spam` or `delete`), the info notice of the comment's
 * current status (`statusNotice`, `{ markup }` or null), the warning's text (`caution`) and the
 * button's label (`button`), the comment's table (`comment`: `author`, `email` and `url`, null
 * when not shown, `contentHtml`, the comment's text as HTML that WordPress passed through kses,
 * and `date` `{ text, url }`), the post it responds to (`response`) and the parent (`parent`),
 * the Edit link (`editUrl`), where Cancel goes (`cancelUrl`) and the request that confirms
 * (`confirm`, `{ method, route, body }`); or, with the other keys null, the classic screen's
 * `error` (`{ kind: 'die', message }`). The classic screen's redirects (a missing comment, a user
 * who may not edit it, an action already done) are the router's: the page is never shown for
 * them. WordPress decides all of it; the implementation shows it, shows the comment's text
 * without running anything in it, sends `confirm` only when the user confirms (never on load),
 * and follows the answer (`redirect` or `location`). `page` is the router's page. The page host
 * renders the page title as the top-level heading; an implementation renders none of its own.
 *
 * `confirmed` carries the answer of the confirmation.
 */
export default {
	id: 'core/comment-moderate',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'confirmed' ],
};
