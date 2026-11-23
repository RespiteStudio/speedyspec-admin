/**
 * Contract of the All Settings page (`options.php` opened without a form).
 *
 * `data` is what `wp-admin/v1/settings/all` returns (the page's router data): `rows`, every
 * option of the site ordered by name, each `{ name, value, editable, multiline, reason }`.
 * A row that cannot be changed has a `reason`: `serialized` (its value is "SERIALIZED DATA"),
 * `masked` (a connector API key, masked by the server) or `constant` (the site or WordPress
 * address fixed by `WP_HOME` or `WP_SITEURL`). `page` is the router's page. The page host
 * renders the page title as the top-level heading; an implementation renders none of its own.
 *
 * A save posts the changed rows only, `{ changed: { name: value } }`, to
 * `wp-admin/v1/settings/all`. `options.php?adminhash=…` and `options.php?dismiss=…` are not
 * this page: the router shows them as the classic screen, which handles them.
 *
 * Slots `before-fields` and `after-fields` (before and after the settings table) and
 * `after-submit` get `values` (the form's current values of the rows that can be changed,
 * keyed by option name), `setValue( name, value )` and `errors` (option name => message).
 * `saved` carries the settings returned by a successful save.
 */
const fieldSlot = {
	props: {
		values: { type: 'Object', required: true },
		setValue: { type: 'Function', required: true },
		errors: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/options-all',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {
		'before-fields': fieldSlot,
		'after-fields': fieldSlot,
		'after-submit': fieldSlot,
	},
	emits: [ 'saved' ],
};
