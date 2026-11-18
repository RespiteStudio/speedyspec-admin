/**
 * Contract of the Media Settings page (`options-media.php`).
 *
 * `data` is what `wp-admin/v1/settings/media` returns (the page's router data): the
 * field values (only the fields the site has; the upload paths only while they can be
 * edited), `unshown` (checkboxes whose stored value they cannot show, which a save sends as
 * shown), `flags` (whether the Uploading Files table and the upload paths are shown), `locked` (the upload paths while
 * they are locked), `multisite` and
 * `legacySections`. `page` is the router's page. The page host renders the page title as
 * the top-level heading; an implementation renders none of its own.
 *
 * Slots `before-fields` and `after-fields` (before the first settings table and after the
 * last one) and `after-submit` get `values` (the form's current values),
 * `setValue( name, value )` and `errors` (field name => message). `saved` carries the settings returned by a
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
	id: 'core/options-media',
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
