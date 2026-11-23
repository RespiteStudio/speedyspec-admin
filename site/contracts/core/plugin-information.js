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
 *     Reviews tab without ratings); `html` is WordPress.org content, shown through InertHtml.
 *   - `facts`: the sidebar texts WordPress formatted, each optional: `version`, `author` (inline
 *     markup), `lastUpdated`, `requires`, `requiresPhp`, `activeInstalls`.
 *   - `rating`: null, or `{ full, half, empty, label, based }`: the stars wp_star_rating() draws
 *     and its texts.
 *   - `notices`: `[ { type: 'error'|'warning', message } ]`, the compatibility notices (inline
 *     markup).
 *   - `button`: null, or `{ action, label, disabled }`: the footer button. `action` is `install`,
 *     `update` or `activate` (the button acts), or `active`, `installed` or `incompatible` (it
 *     never acts).
 * - `act( action )`: what the footer button does: the page runs install, update or activate
 *   through its package queue. A promise; the button is busy until it settles.
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
	version: '1.0.0',
	props: {
		slug: { type: 'String', required: true },
		section: { type: 'String', required: false },
		load: { type: 'Function', required: true },
		act: { type: 'Function', required: true },
	},
	slots: {},
	emits: [ 'close' ],
};
