/**
 * Contract of the Plugins list page (`plugins.php`).
 *
 * `data` is the page's router data (wp_admin_get_plugins_list()): `context` (`site`), the list's
 * `query` (sent back as `list` with an activation, a deactivation, a bulk action or Clear List, and
 * as `query` with an update or a delete), the document `title`, the hidden `headings` (`views`,
 * `pagination`, `list`), the `heading` (Add Plugin and the search), the `messages` plugins.php
 * prints in its header (`{ markup, type, dismissible, scrape }`: `scrape.path` is the classic error
 * output of a fatal activation, an admin path shown in a frame that runs no script), the table
 * (`columns`, `caption`, `classes`, `items`, `noItems`), the `views` (and `viewsHtml` when plugins
 * filtered them), `bulkActions`, `search`, `pagination`, `recent` (Clear List, or null),
 * `tablenavNote` (the Must-Use and Drop-ins note, inline markup, or null), `preHtml` (what
 * `pre_current_active_plugins` printed, or null), the Screen Options (`screenOptions`) and the
 * `bodyClasses`; or `{ context, query, refusal, title }` when the classic screen dies (`refusal`:
 * `{ status, heading, message }`, text).
 *
 * Each item is a row as wp_admin_plugins_list_row() builds it: `id` (the row's `data-slug`),
 * `file` (`data-plugin`), `slug`, `classes`, the checkbox (`selectable`, `checkboxDisabled`,
 * `checkboxLabel`), `rowHeaderLabel`, `name`, `description` (inline markup), `version`, `author`,
 * the core `actions` (`{ action, text, ariaLabel, htmlId, request, disabled, reason, confirm }`),
 * `actionsHtml` (the row actions after `plugin_action_links`, or null), the `meta` line and
 * `metaHtml` (after `plugin_row_meta`, or null), `afterMetaHtml` (`after_plugin_row_meta`, or null),
 * `dependencies` (`requires`, `requiredBy`, `error`), `autoUpdate` (the auto-updates cell, or null),
 * `update` (the update row: `message` inline markup whose "update now" link is `#`, `detailsSlug`,
 * `version`, `request`, `compatible`, `extraHtml`; or null), `incompatible` (inline markup, or null),
 * `paused` (`{ text, error }`, or null), `afterHtml` (`after_plugin_row` beyond core's update row,
 * table rows, or null) and `cells` (the plugin columns' `{ html, error }`).
 *
 * WordPress decides which plugins, columns, views, actions and messages apply, what each action may
 * do, where it leads, and what the update and auto-update texts say; the implementation shows them,
 * reproduces common.js and updates.js, and sends the routes it is given:
 *
 * - Activate, Deactivate and Resume post their request with `list`, then follow the answer (or the
 *   `data.redirect` of `plugin_activation_fatal`).
 * - Delete asks the action's `confirm`; Delete and "update now" run one package job per plugin
 *   (`POST plugins/delete`, `POST plugins/update`, with `screen: 'plugins'` and `query`) through
 *   the shared package queue, and announce updates.js's events; the answer's fresh `row`, `views`
 *   and `menuCounts` are shown. A job that answers `fs_credentials_required` opens
 *   core/filesystem-credentials with the answer's `form`.
 * - The bulk actions `update-selected` and `delete-selected` run a job per checked row; the others
 *   post `plugins/bulk` with the checked files and follow the answer.
 * - The auto-updates toggle posts its request and shows the answer (`enabled`, `text`,
 *   `nextUpdate`); Clear List deletes `plugins/recent` and follows the answer.
 * - "View details" and "View version details" open core/plugin-information.
 * - Typing in the search navigates after a pause, with the view kept.
 *
 * `page` is the router's page. The page host renders the page title as the top-level heading; an
 * implementation renders none of its own. Plugin hook output (`preHtml`, `actionsHtml`,
 * `metaHtml`, `afterMetaHtml`, `afterHtml`, `update.extraHtml`, `autoUpdate.html`, plugin cells)
 * is shown as classic prints it (kit/LegacyHtml); every other markup through kit/InlineMarkup.
 *
 * `saved` carries each answer of a write route.
 */
export default {
	id: 'core/plugins',
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
