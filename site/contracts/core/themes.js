/**
 * Contract of Themes (`themes.php`, its search `themes.php?search=…` and its details
 * `themes.php?theme=…`).
 *
 * `data` is the page's router data (wp_admin_get_themes()): `context` (`site`), `refusal` (null,
 * or `{ status, heading, message }`, text, when the classic screen refuses), the document `title`,
 * the `count` of themes, the `bodyClasses`, the `heading` (`addNew`: `{ label, path }` or null,
 * and `searchLabel`), the `messages` of the query (`{ markup, type, dismissible }`, inline markup),
 * the `currentActions` of the active theme (`{ label, path, current }`), the `themes` (the cards,
 * the active theme first), `broken` (`{ heading, intro, columns, rows }`, or null), `open` (the
 * theme whose details open, or null), `search` (the address's search, or null) and `labels`
 * (`confirmDelete`, `themesFound`, `noThemesFound`, `themeViewed`, `autoUpdates`); or `failed`
 * true when the page could not be prepared.
 *
 * Each card is wp_admin_theme_card()'s: `id`, `name`, `author`, `authorAndUri`, `description`,
 * `tags` and `parent` (inline markup), `screenshot` (http(s) or root-relative, or null),
 * `version`, `active`, `blockTheme`, `compatibility` (`{ ok, message }`), `update` (`{ message,
 * version, compatible, request }`, or null), `autoUpdate` (`{ supported, enabled, forced, text,
 * request, nextUpdate, nextUpdateShown, templateFiltered }`, or null), `actions` (`activate`:
 * `{ request, href, label, disabled }`; `customize`: `{ path, label, disabled }`; `delete`:
 * `{ request, href, confirm }`; each or null) and `ariaLabels` (`details`, `activate`,
 * `customize`, `delete`). Each broken row is `{ stylesheet, name, description, resume, delete,
 * installParent, installParentChecked }`. A `request` is `{ method, route, body }`, a
 * `wp-admin/v1` route.
 *
 * WordPress decides which themes show, each card, its actions, their requests and addresses, the
 * notices, texts and messages; the implementation shows them, reproduces theme.js and updates.js,
 * and sends the requests it is given:
 *
 * - Activate posts its request and follows the answer; an Activate a plugin rewrote (`href`) is a
 *   link the router opens. Customize and Live Preview open their `path` through the router (the
 *   hosted Customizer or site editor).
 * - Update now runs one package job per theme through the shared package queue (`POST
 *   themes/update`, with `screen: 'themes'` and `query`), with updates.js's texts and events; the
 *   answer's `card` replaces the card, its `count`, `menuCounts` and `broken` replace theirs.
 * - Theme Details (or a click on the card) opens the details at `?theme=<id>` in place: previous
 *   and next, Alt (Option) plus the arrow keys, Escape and Close (the focus back on the card's
 *   details button). Delete asks `confirmDelete` (`window.confirm()`), then runs a package job
 *   (`POST themes/delete`), removes the card and closes the details. The auto-update toggle posts
 *   its request and shows the answer (`enabled`, `text`, `nextUpdate`, `nextUpdateShown`).
 * - Typing in the search filters the themes after theme.js's pause, in the page (theme.js's own
 *   search: name, id, description, author and tags), updates the count, speaks `themesFound` or
 *   `noThemesFound`, and keeps `?search=` in the address with an in-place navigation that replaces
 *   the history entry.
 * - The broken themes: Resume posts and follows; Delete asks and runs a package job; Install
 *   Parent Theme runs a package job (`POST themes/install` with its slug) and shows the result in
 *   the row.
 * - A job that answers `fs_credentials_required` opens core/filesystem-credentials with the
 *   answer's `form`: submitted, the queue resumes with them; cancelled, it is emptied and each
 *   job announced once (`credential-modal-cancel`). While a job runs or waits, leaving the page
 *   asks updates.js's "Updates may not complete if you navigate away from this page.".
 *
 * `page` is the router's page. The page host renders the page title as the top-level heading; the
 * classic `.wrap` heading (with its count) is part of the page, as themes.php prints it. Theme
 * header texts and WordPress's messages are shown through kit/InlineMarkup: they run nothing.
 *
 * `saved` carries each answer of a write route.
 */
export default {
	id: 'core/themes',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {},
	emits: [ 'saved' ],
};
