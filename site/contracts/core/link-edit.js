/**
 * Contract of the link form: Add Link (`link-add.php`) and Edit Link (`link.php?action=edit`),
 * shown while the Link Manager is on.
 *
 * `data` is the page's router data (wp_admin_get_link_edit()): the `mode` (`add` or `edit`), the
 * document `title`, the link's values (`link`: `id`, `name`, `url`, `description`, `target` (null:
 * none checked), `visible`, `rel`, `image`, `rss`, `notes` and `rating` (null: none selected),
 * text, as the classic fields hold them), the `notice` of the classic redirect argument, the Save
 * box (`save`: its label, the Visit Link address, whether the link is private, the Delete request
 * with its confirmation, null without it, and what plugins print in it, `submitHtml`), the
 * Categories box (`categories`: `all` and `popular`, each `{ id, name (escaped HTML), checked }`
 * and the popular ones `disabled`, the `tab` it opens on and `canAdd`), the XFN box (`xfn`: `rel`,
 * `me` and the `groups` with their choices), the Advanced box (`advanced.ratings`), the plugins'
 * boxes (`metaBoxes`, their captured HTML), the boxes' `layout`, the Screen Options
 * (`screenOptions`) and the `bodyClasses`; or `{ query, error }` when the classic screen dies
 * (`error`: `{ kind, status, heading, message }`, text). WordPress decides which boxes, values,
 * checks, categories, relationships and links apply; the implementation shows them, reproduces
 * link.js, xfn.js and postbox.js, and sends the save (`POST wp-admin/v1/links` with the page's
 * path as the `referer`, or `POST wp-admin/v1/links/{id}`), the Categories box's tab
 * (`POST wp-admin/v1/screen-preferences/link`), a new category (`POST wp-admin/v1/links/categories`)
 * and the Delete request it is given, then follows the answer. `page` is the router's page. The
 * page host renders the page title as the top-level heading; an implementation renders none of
 * its own.
 *
 * The boxes are shown by core/meta-box-holder.
 *
 * `saved` carries the answer of the save.
 */
export default {
	id: 'core/link-edit',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
