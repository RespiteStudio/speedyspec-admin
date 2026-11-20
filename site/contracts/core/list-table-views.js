/**
 * Contract of a list table's views, the classic `ul.subsubsub` (WP_List_Table::views()).
 *
 * - `views`: `[ { key, label, format, count, countText, countClass, url, current } ]` as the screen's
 *   builder lists them: `format` is the label as the list table prints it, HTML with `%s` for the
 *   count (`All <span class="count">(%s)</span>`), shown without inserting HTML (kit/Interpolate),
 *   the count in a `span` of class `countClass` (or `class`); without `format`, `label` is shown
 *   as text. `labelHtml` (1.1.0), when a string, is the label as get_views() builds it (the
 *   Posts views, `All <span class="count">(3)</span>`), shown through kit/InlineMarkup with spans
 *   (never inserted as HTML) in place of `format` and `label`. `url` is an admin path; `current` marks the current view (`class="current"`,
 *   `aria-current="page"`).
 * - `viewsHtml`: null, or the views as plugins filtered them (`views_{screen}`), each `key` and its
 *   markup: a map `{ key: html }` or a list `[ { key, html } ]`; each is shown with kit/LegacyHtml.
 *   When it is given, it is shown in place of `views` (an empty one shows nothing, as classic).
 * - `heading`: the hidden heading WordPress prints before them (`heading_views`), or none.
 *
 * Slots `before` and `after` (for modules) get `{ views }`.
 */
const viewsSlot = { props: { views: { type: 'Array', required: true } } };

export default {
	id: 'core/list-table-views',
	// 1.1.0: a view's `labelHtml` (the Posts views).
	version: '1.1.0',
	props: {
		views: { type: 'Array', required: true },
		viewsHtml: { type: 'Object', required: false },
		heading: { type: 'String', required: false },
	},
	slots: {
		before: viewsSlot,
		after: viewsSlot,
	},
	emits: [],
};
