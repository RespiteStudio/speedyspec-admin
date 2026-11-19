/**
 * Contract of the admin frame: admin bar, menu, notices and the page.
 *
 * An implementation provides these to the page (Vue provide/inject), as the default does:
 * - `speak( message )`: announces a message to screen reader users without showing it (a
 *   polite live region), as wp.a11y.speak() does on a classic screen.
 * - `screenOptions`: `{ set( { sections, reordering, columns, onChange } ) }`, the page's
 *   Screen Options (see core/screen-options), shown until the returned function is called or the
 *   path changes; `onChange( id, value )` receives the panel's changes.
 * - `pageHelp`, `pageNotices`, `framePage` and `frameLayout` (see components/core/frame.js).
 */
export default {
	id: 'core/frame',
	version: '1.0.0',
	props: {
		manifest: { type: 'Object', required: true },
		// The page host renders the page title as the top-level heading: page implementations must not render their own.
		page: { type: 'Object', required: true },
		current: { type: 'String', required: true },
		base: { type: 'String', required: true },
		siteName: { type: 'String', required: false },
		busy: { type: 'Boolean', required: false },
	},
	slots: {
		'before-content': { props: { page: { type: 'Object', required: true } } },
		'after-content': { props: { page: { type: 'Object', required: true } } },
	},
	emits: [ 'sign-out' ],
};
