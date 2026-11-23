/**
 * Contract of the term edit page (`term.php?taxonomy={name}&tag_ID={id}`, and the bare
 * `term.php`): one page for every taxonomy with a user interface, Link Categories and Pattern
 * Categories included.
 *
 * `data` is the page's router data (wp_admin_get_term_edit()): the `taxonomy` (its name, whether
 * it is hierarchical and its labels), the document `title`, the screen's `postType`, the term's
 * values (`term`: `id`, `name`, `slug`, `description` and `parent`, text, as the classic fields
 * hold them), the parent dropdown (`fields.parent`, `{ options, html, selected }`, null for a flat
 * taxonomy), the field descriptions (`labels`, kses'd markup), the `referer`, the message of the
 * classic redirect arguments with its back link (`message`), the Delete link (`delete`, null for
 * a user who may not delete the term and for the default terms), what the plugins print in the
 * form (`hooks`: `pre`, `top`, `rows`, `after`), the `bodyClasses` and `focusName`; or
 * `{ query, taxonomy: null, error }` when the classic screen dies (`error`: `{ kind, status,
 * heading, message }`, text). WordPress decides which fields, parents, messages and links apply;
 * the implementation shows them, reproduces tags.js and ajax-response.js on the form, and sends
 * the save (`POST wp-admin/v1/terms/{id}`) and the delete (`DELETE wp-admin/v1/terms/{id}` with
 * `screen: 'term'`), each with the page's path as the `referer`, then follows the answer. `page`
 * is the router's page. The page host renders the page title as the top-level heading; an
 * implementation renders none of its own.
 *
 * `saved` carries the answer of the save.
 */
export default {
	id: 'core/term-edit',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	emits: [ 'saved' ],
};
