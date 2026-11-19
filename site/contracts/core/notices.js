/**
 * Contract of the notices area. `notices` is the notices service's list of
 * `{ id, type, message, dismissible, action?, markup?, html?, assets? }`; `markup` is the
 * message as HTML with links or code, which an implementation must not insert as HTML (the
 * kit's InlineMarkup shows it safely). `html` (1.1.0) is what a classic `admin_notices`
 * callback of the page printed, with the `assets` (`{ scripts, styles, ajaxurl }`) it queued:
 * trusted, capability-gated plugin output, shown as it is with the kit's LegacyHtml; its
 * `message` is empty. `dismiss` carries a notice id.
 */
export default {
	id: 'core/notices',
	version: '1.1.0',
	props: {
		notices: { type: 'Array', required: true },
	},
	slots: {
		before: { props: { notices: { type: 'Array', required: true } } },
		after: { props: { notices: { type: 'Array', required: true } } },
	},
	emits: [ 'dismiss' ],
};
