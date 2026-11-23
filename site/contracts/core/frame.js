/**
 * Contract of the admin frame: admin bar, menu, notices and the page.
 *
 * An implementation provides these to the page (Vue provide/inject), as the default does:
 * - `speak( message )`: announces a message to screen reader users without showing it (a
 *   polite live region), as wp.a11y.speak() does on a classic screen.
 * - `screenOptions`: `{ set( { sections, reordering, columns, onChange } ) }`, the page's
 *   Screen Options (see core/screen-options), shown until the returned function is called or the
 *   path changes; `onChange( id, value )` receives the panel's changes. 1.1.0: also a list
 *   table's `tableColumns`, `pagination`, `viewMode` and `settingsHtml`, with `onApply( { perPage,
 *   mode } )` for its Apply button. 1.2.0: also `tableColumnsLegend`, the Columns legend.
 * - `pageHelp`, `pageNotices`, `framePage` and `frameLayout` (see components/core/frame.js).
 * - `frameChannel` (1.1.0): what a page's answers tell the frame.
 *   - `setMenuCounts( counts )`: `{ <menu path>: number }`, as a moderation answer's `menuCounts`
 *     gives it; the menu items with those paths (top-level items and submenu items) show that
 *     count instead of the manifest's, until the next manifest.
 *   - `setTitle( title )`: the page's title as WordPress now gives it (`title` of an answer); the
 *     page host uses it for the document title in place of `page.title` until the page path
 *     changes. `null` gives `page.title` back. The page's heading keeps `page.title` (or
 *     its data's `heading.title`, below).
 *
 * `current` is the menu path of the page shown, as the shell gives it: the page's `menuCurrent`
 * when the router sends one (a screen such as Edit Comment, whose menu item is another path), else
 * its path.
 *
 * The page's top-level heading is `page.title`; 1.3.0: when the page's data gives the classic
 * screen's own heading as text (`page.data.heading.title`, a non-empty string, as Edit User's
 * "Edit User <name>"), that instead. A page's `heading` object without `title` changes nothing.
 *
 * 1.1.0 added `frameChannel`.
 * 1.2.0: `screenOptions.set()` also takes `tableColumnsLegend`.
 * 1.3.0: the heading is the data's `heading.title` when it gives one.
 */
export default {
	id: 'core/frame',
	version: '1.3.0',
	props: {
		manifest: { type: 'Object', required: true },
		// The page host renders the page title (or its data's `heading.title`) as the top-level heading: page implementations must not render their own.
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
