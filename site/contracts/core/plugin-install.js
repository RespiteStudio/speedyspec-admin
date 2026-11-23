/**
 * Contract of Add Plugins (`plugin-install.php`, its tabs, its upload form and the plugin
 * information address `plugin-install.php?tab=plugin-information&plugin=…`).
 *
 * `data` is the page's router data (wp_admin_get_plugin_install()): `context` (`site`), the page's
 * `query` (`tab`, `s`, `type`, `paged`, `user`; sent back as `query` with each write), the document
 * `title`, the `tab` shown, `information` (`{ slug, section }` for the information address, else
 * null), the hidden `headings` (`views`, `pagination`, `list`), the `intro` above the tabs (inline
 * markup, null on the upload tab), `upload` (`{ label, browseLabel, help, fileLabel, submitLabel,
 * open, hooksHtml }`, or null without `upload_plugins`), the `tabs` (`{ key, label, path, current }`)
 * and `viewsHtml` (the tabs as plugins filtered them, by key, or null), `search` (`{ term, type,
 * types, label, typeLabel }`, or null on Favorites and the upload tab), `favorites` (`{ user,
 * label, help, submitLabel }` on Favorites, else null), the tab's `notice` (inline markup, or
 * null), `showTable`, the `cards`, `noItems` (inline markup) and `apiError`, the `pagination` (null
 * on Featured), `popularTags` (`{ name, path, count, fontSize, ariaLabel }` on Featured, else null)
 * or `popularTagsError`, `tabHtml` (what `install_plugins_{$tab}` printed beyond core's callbacks,
 * or null), the `dependencyNotices` (inline markup) and the `bodyClasses`; or `{ context, query,
 * refusal, title }` when the classic screen dies (`refusal`: `{ status, heading, message }`, text);
 * or, on a network whose admin is on another host, `location`, the absolute address to load.
 *
 * Each card is wp_admin_plugin_install_card()'s: `slug`, `name` (text), `icon` (http(s) or null),
 * `description` (text), `author` (inline markup), `rating` (`{ value, full, half, empty, label,
 * count, countText }`), `activeInstalls`, `lastUpdated`, `compatibility` (`{ wordpress, php,
 * tested, status, text, notice }`, inline markup), `button` (`{ action, label, ariaLabel, disabled,
 * file, request }`, or null when plugins removed it; `request` is `{ method, path, body }` or
 * null), `detailsAction`, `dependencies` (`{ text, names: [ { name, detailsSlug } ] }`, or null),
 * `detailsSlug`, `group` (text, or null) and `actionsHtml` (what `plugin_install_action_links`
 * added, or null).
 *
 * WordPress decides the tabs, the cards, each button's state and request, the texts and notices,
 * the tag sizes, the upload log, the comparison and the actions; the implementation shows them,
 * reproduces plugin-install.js and updates.js, and sends the routes it is given:
 *
 * - The Upload Plugin toggle shows the upload form in place; on the upload tab it leads back.
 * - Install Now and Update Now run one package job per plugin through the shared package queue
 *   (`POST plugins/install`, `POST plugins/update`, with `screen: 'plugin-install'` and `query`),
 *   with updates.js's texts and events; Activate posts `plugins/activate` with the same screen
 *   (its fatal error leads to the classic error page, `data.redirect`). The answer's `card`
 *   replaces the card. A job that answers `fs_credentials_required` opens
 *   core/filesystem-credentials with the answer's `form`.
 * - More Details, the card's name and a dependency's More Details open core/plugin-information;
 *   the information address opens it at once.
 * - The upload posts `plugins/upload` (multipart `pluginzip`); its result (`{ heading, log,
 *   result, overwrite, actions, actionsHtml, package }`) replaces the form: Activate Plugin posts
 *   its request and follows the answer; the overwrite comparison's Replace current with uploaded
 *   posts `plugins/upload/{package}` with its `action`, and Cancel and go back deletes it and
 *   follows the answer. `fs_credentials_required` (with `data.package`) asks the credentials and
 *   retries on the same package.
 * - Get Favorites posts `plugins/favorites-user`, then opens `plugin-install.php?tab=favorites&user=…`.
 * - Typing in the search, or changing its type, opens the search tab after a pause, in place
 *   (1.1.0: the router's `inPlace`; the page stays mounted with the field's text and focus, the
 *   queue and the cards' states, and takes the search's data).
 * - While a package job runs or waits, leaving the page asks updates.js's "Updates may not
 *   complete if you navigate away from this page." (1.1.0): on `beforeunload`, and through the
 *   page host's `pageState` (dirty, and the leave warning the router asks before it navigates).
 *
 * `page` is the router's page. The page host renders the page title as the top-level heading; an
 * implementation renders none of its own. Plugin hook output (`tabHtml`, `upload.hooksHtml`,
 * `viewsHtml`, each card's `actionsHtml`, the comparison's `tableHtml`/`actionsHtml` and the
 * result's `actionsHtml`) is shown as classic prints it (kit/LegacyHtml), with a relative admin link
 * in it opened through the router; every other markup through kit/InlineMarkup, and WordPress.org
 * content runs nothing.
 *
 * `saved` carries each answer of a write route.
 */
export default {
	id: 'core/plugin-install',
	// 1.1.0: the live search opens in place, and leaving with package jobs asks first.
	version: '1.1.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {},
	emits: [ 'saved' ],
};
