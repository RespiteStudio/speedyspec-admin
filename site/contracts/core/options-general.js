/**
 * Contract of the General Settings page (`options-general.php`).
 *
 * `data` is what `wp-admin/v1/settings/general` returns (the page's router data): the
 * field values (only the fields the site has), `choices`, `preview`, `locked`,
 * `multisite` and `legacySections`. `page` is the router's page. The page host renders
 * the page title as the top-level heading; an implementation renders none of its own.
 *
 * Slots `before-fields` and `after-fields` (before and after the settings table) and
 * `after-submit` get `values` (the form's current values), `setValue( name, value )`
 * and `errors` (field name => message). `saved` carries the settings returned by a
 * successful save.
 */
const fieldSlot = {
	props: {
		values: { type: 'Object', required: true },
		setValue: { type: 'Function', required: true },
		errors: { type: 'Object', required: true },
	},
};

export default {
	id: 'core/options-general',
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
