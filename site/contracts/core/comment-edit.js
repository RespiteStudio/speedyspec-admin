/**
 * Contract of the Edit Comment page (`comment.php?action=editcomment`).
 *
 * `data` is what the router sends for the page (wp_admin_get_comment_edit()): the comment's
 * fields (`comment`, text: the content raw, as the editor's textarea holds it), its `permalink`,
 * `status`, `date` (the timestamp editor's parts, the date as loaded in `hidden`, the months and
 * the display), the post it responds to (`response`), the parent shown (`parent`) and the choices
 * of the parent dropdown (`parentChoices`, null without threading), the plugins' misc actions
 * (`miscActionsHtml`), the delete link (`deleteAction`, its label and request), the normal meta
 * boxes (`layout`, `boxes` as a list in layout order with their captured HTML) and the Screen
 * Options (`screenOptions`, null when the screen shows none), the Quicktags settings
 * (`quicktags`), `isMobile`; or, with the other keys null, the classic screen's `error`
 * (`{ kind: 'die'|'footer', message, link? }`). WordPress decides which statuses, parents, boxes
 * and messages apply; the implementation shows them and sends the save
 * (`POST wp-admin/v1/comments/{id}` with `screen: 'comment'`) and the delete request it is
 * given, then follows the answer (`redirect` or `location`). `page` is the router's page. The page
 * host renders the page title as the top-level heading; an implementation renders none of its
 * own.
 *
 * The normal boxes are shown by core/meta-box-holder.
 *
 * Slots `side-after` (after the Save box, in its column) and `normal-after` (after the meta
 * boxes; also slots for modules) get `{ comment }`, the data's comment.
 *
 * `saved` carries the answer of the save.
 */
const commentSlot = {
	props: {
		comment: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/comment-edit',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {
		'side-after': commentSlot,
		'normal-after': commentSlot,
	},
	emits: [ 'saved' ],
};
