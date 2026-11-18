/**
 * Contract of the Discussion Settings page (`options-discussion.php`).
 *
 * `data` is what `wp-admin/v1/settings/discussion` returns (the page's router data): the
 * field values as the classic controls show them (the checkboxes as booleans), `unshown`
 * (fields whose stored value the controls cannot show, which a save sends as shown),
 * `choices` (the deepest level of threaded comments, and the default avatars with their
 * images), `avatarHtml` (the classic avatar list when a plugin filters it, else null),
 * `flags` (whether signup is disabled on a network), `locked` (none), `multisite` and
 * `legacySections` (with the classic avatar list's capture in `actions`). `page` is the
 * router's page. The page host renders the page title as the top-level heading; an
 * implementation renders none of its own.
 *
 * Slots `before-fields` and `after-fields` (before the first settings table, and after the
 * Avatars table, before the sections plugins add) and `after-submit` get `values` (the
 * form's current values), `setValue( name, value )` and `errors` (field name => message).
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
	id: 'core/options-discussion',
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
