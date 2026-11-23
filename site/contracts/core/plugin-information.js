/**
 * Contract of the plugin information dialog: what install_plugin_information() prints in the
 * classic Thickbox frame (`plugin-install.php?tab=plugin-information&plugin=…`) for one plugin,
 * opened from Add Plugins, the Plugins list and (later) Updates.
 *
 * - `slug`: the plugin. A new slug loads that plugin.
 * - `section`: the tab shown first (default `description`); a section the plugin does not have
 *   shows the first one.
 * - `load( slug, section )`: a promise of WordPress's information (`GET plugins/information`,
 *   wp_admin_get_plugin_information()); it rejects with the API's error. Called once per slug;
 *   the tabs switch without loading again. The information:
 *   - `name`: text. `banners`: `{ low, high }` addresses, shown only when http(s).
 *   - `sections`: `[ { name, title, html } ]`, in order, already filtered by WordPress (no
 *     Reviews tab without ratings); `html` is WordPress.org content, shown through InertHtml, its
 *     links opening in a new tab (WordPress gives the classic frame's links `target="_blank"`) and
 *     the Reviews' dashicon star classes kept (1.2.0).
 *   - `facts`: the sidebar texts WordPress formatted, each optional: `version`, `author` (inline
 *     markup), `lastUpdated`, `requires`, `tested`, `requiresPhp`, `activeInstalls`; and (1.1.0)
 *     the links `wporgUrl` (the WordPress.org page, null for a plugin from elsewhere), `homepage`
 *     and `donate`, each an http(s) address or null. The donation link is in the list when the
 *     plugin has no contributors, else after them, as classic.
 *   - `rating`: null, or `{ full, half, empty, label, based }`: the stars wp_star_rating() draws
 *     and its texts; and (1.1.0) `value`, `count` and `breakdown` (`[ { stars, count, countText,
 *     text, label, url, width } ]`, the Reviews bars: `width` in pixels of 92, `url` the
 *     WordPress.org reviews with that many stars; empty without ratings).
 *   - `contributors` (1.1.0): `[ { name, url, avatar } ]`, the name text, the addresses http(s) or
 *     null.
 *   - `notices`: `[ { type, message } ]`, the compatibility notices (inline markup). WordPress
 *     gives `error` and `warning`; an implementation also shows `info` and `success` (1.2.0: the
 *     types the default implementation has always accepted, now documented) and skips any other.
 *   - `button`: null, or `{ action, label, disabled }`: the footer button. `action` is `install`,
 *     `update` or `activate` (the button acts), or `active`, `installed` or `incompatible` (it
 *     never acts). Also (1.1.0) `ariaLabel`, `file` and `request` (`{ method, path, body }`, what
 *     pressing it sends, or null).
 *   - `slug` and `section` (1.1.0): the plugin, and the section classic would show first.
 * - `act( action, button )`: what the footer button does: the page runs install, update or
 *   activate through its package queue. `button` (1.1.0) is the information's `button`, with its
 *   `request`. A promise; the button is busy until it settles.
 *
 * Emits `close` (the close button, Escape). The page removes the dialog; the focus returns to the
 * element that had it when the dialog opened.
 *
 * A failed load shows WordPress's message from the error (the classic "An unexpected error
 * occurred…" text of plugins_api()).
 *
 * The dialog is shared: two pages and Updates open it, so it is never in a session's
 * `components` list of one page.
 */
export default {
	id: 'core/plugin-information',
	// 1.1.0: the sidebar's links, the reviews by stars and the contributors; act() is given the button.
	// 1.2.0: section links in a new tab and the Reviews' star classes; the notice types documented.
	version: '1.2.0',
	props: {
		slug: { type: 'String', required: true },
		section: { type: 'String', required: false },
		load: { type: 'Function', required: true },
		act: { type: 'Function', required: true },
	},
	slots: {},
	emits: [ 'close' ],
};
