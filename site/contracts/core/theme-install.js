/**
 * Contract of Add Themes (`theme-install.php`, its browse `theme-install.php?browse=…`, its search
 * `theme-install.php?search=…`, its preview `theme-install.php?theme=…` and its upload
 * `theme-install.php?upload`).
 *
 * `data` is the page's router data (wp_admin_get_theme_install()): `context` (`site`), the page's
 * `query` (sent back as `query` with each write), `refusal` (null, or `{ status, heading, message }`,
 * text, when the classic screen refuses), the document `title`, the `bodyClasses`, `upload`
 * (`{ label, help, browseLabel, fileLabel, submitLabel, open }`, or null without `upload_themes`),
 * the browse `tabs` (`{ key, label }`) and the `browse` shown, `search` (`{ term, label,
 * typeLabel }`: the address's search, the field's label and the live search description),
 * `features` (`{ group, features: [ { value, label } ] }`, the feature filter), `favorites`
 * (`{ user, help, label, button }`), `labels` (the classic `_wpThemeSettings.l10n` texts and the
 * screen's: `error` is inline markup), `open` (the theme whose preview opens, or null) and
 * `tabHtml` (what `install_themes_{$tab}` printed, or null); or, on a network whose admin is on
 * another host, `location`, the absolute address to load; or `failed` true when the page could not
 * be prepared.
 *
 * The cards come from `GET themes/directory` (wp_admin_query_theme_directory()), which answers
 * `{ info: { page, pages, results }, themes }`. Each card is wp_admin_theme_directory_card()'s:
 * `slug`, `name`, `author` and `version` (text), `screenshot` (http(s), or null), `description`
 * (WordPress.org's markup, kses'd), `rating` (`{ value, label, count, text, rated, reviewsUrl }`),
 * `previewUrl` (http(s) on another host, or null), `compatibility` (`{ wordpress, php, message }`,
 * the message inline markup or null), `installed`, `active`, `blockTheme`, `button` (`{ action:
 * install|activate|active|incompatible|cannot-activate, label, ariaLabel, disabled, request }`, or
 * null), `customize` (`{ path, label, disabled }`, or null) and `preview` (`{ label, disabled }`,
 * or null). A `request` is `{ method, route, body }`, a `wp-admin/v1` route.
 *
 * WordPress decides the tabs, the features, the cards, each button and its request, the addresses
 * and every text; the implementation shows them, reproduces theme.js and updates.js, and sends the
 * requests it is given:
 *
 * - Each browse tab, the search (after theme.js's pause; `tag:` and `author:` as theme.js reads
 *   them), the feature filter (Apply Filters) and Favorites read `GET themes/directory`; an answer
 *   whose `info.page` is below `info.pages` loads the next page when its last card is in view.
 *   The address follows classic: `?browse=` (pushed), `?search=` (replaced), `?theme=` (pushed),
 *   and the feature filter leaves `theme-install.php`. A failed read shows `labels.error` with Try
 *   Again, which reads again.
 * - Install runs one package job per theme through the shared package queue (`POST
 *   themes/install`, with `screen: 'theme-install'` and `query`), with updates.js's texts and
 *   events; the answer's `card` (the local decisions: `installed`, `active`, `blockTheme`,
 *   `button`, `customize`, `preview`) is merged into the card shown, which keeps a Cannot Install
 *   it already shows. A job that answers `fs_credentials_required` opens
 *   core/filesystem-credentials with the answer's `form`. Activate posts its request and follows
 *   the answer; Live Preview and Customize open their `path` through the router.
 * - A card (or its Details & Preview or Preview) opens the preview at `?theme=<slug>`: the
 *   sidebar with the theme's details and Install or Activate, Collapse, previous, next, Close and
 *   Escape (Alt plus the arrow keys move). The frame loads `previewUrl` only when its origin is not
 *   the admin's, sandboxed without `allow-same-origin`; otherwise it shows the screenshot.
 * - The upload posts `themes/upload` (multipart `themezip`); its result replaces the form: Activate
 *   posts its request and follows the answer; the overwrite comparison's Replace installed with
 *   uploaded posts `themes/upload/{package}` with its `action`, and Cancel and go back deletes it.
 * - Get Favorites posts `themes/favorites-user`, then reads the directory with `browse:
 *   'favorites'` and the username.
 * - While a package job runs or waits, leaving the page asks updates.js's "Updates may not
 *   complete if you navigate away from this page.".
 *
 * `page` is the router's page. The page host renders the page title as the top-level heading; an
 * implementation renders none of its own. `tabHtml` and what plugins filter in the upload result
 * are plugin output (kit/LegacyHtml); WordPress.org content (names, authors, descriptions, the
 * compatibility messages) and every other markup run nothing (kit/InlineMarkup, kit/InertHtml).
 *
 * `saved` carries each answer of a write route.
 */
export default {
	id: 'core/theme-install',
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
