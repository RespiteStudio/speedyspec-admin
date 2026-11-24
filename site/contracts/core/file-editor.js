/**
 * Contract of the file editors: the Theme File Editor (`theme-editor.php`) and the Plugin File
 * Editor (`plugin-editor.php`).
 *
 * `data` is the page's router data (wp_admin_get_theme_editor(), wp_admin_get_plugin_editor()):
 * the `kind` (`theme` or `plugin`), `context` (`site`), the `query`, `refusal` (null, or
 * `{ status, heading, message }`, text, when the classic screen refuses), the document `title`,
 * the `bodyClasses`, the `heading` (inline markup: "Editing <strong>Name</strong> (active)"), the
 * `fileLabel` (text), the `selector` (`{ label, name, submit, options: [ { value, label,
 * selected } ] }`), the `treeLabel`, the `treeNote` (null, or `{ text, parent: { label, path } }`,
 * the child theme's note with its `%s`), the `tree` (`[ { label, detail, path, current, children }
 * ]`: a folder has no `path`; paths are relative to `wp-admin/`), the `file` (`{ relative,
 * content, writable, extension, missing, label }`; `content` is the file's raw text, null when it
 * is not valid UTF-8), `codeEditor` (wp_get_code_editor_settings()' answer, or false), `docs`
 * (null, or `{ label, placeholder, lookup, options: [ { name, url } ] }`), the `notices` (`{ id,
 * markup, type, dismissible, place }`, inline markup; `place` `top` or `editor`; type `none` is a
 * plain paragraph), the `warning` (null, or `{ heading, paragraphs, goBack: { label, path },
 * dismiss: { label, request } }`), `save` (null, or `{ request, label }`) and the `labels`
 * (`phpError`, `fileNotWritable`, `lintErrors`, `dismiss`, `leave`); or `failed` true when the
 * page could not be prepared; or a `location` to load when the editor is on another host.
 *
 * WordPress decides which file opens and whether it may be saved, the list, the selector, the
 * notices, the documentation addresses, the warning and Go back's address, and the save's error
 * texts; the implementation shows them, reproduces theme-plugin-editor.js and code-editor.js, and
 * sends the requests it is given:
 *
 * - The file's content is the textarea's value, never markup. With `codeEditor` settings, core's
 *   wp.codeEditor runs on it once the screen's assets are ready.
 * - Update File posts `POST wp-admin/v1/file-editor/save` with `save.request` and the text
 *   (`newcontent`): read-only with the spinner while it runs; the answer's `message`, or the
 *   error's `data.notice` (`markup`, inline markup, and `message`, the PHP error's text, shown as
 *   text). Lint errors stop the save until "Update anyway" is checked. While the text has
 *   unsaved changes, leaving the page asks `labels.leave`.
 * - Select and a file of the list open their address through the router; Look Up opens the
 *   chosen option's `url` in a new tab, without an opener.
 * - The warning shows on load, the focus kept in it. Go back opens where WordPress says from the
 *   page the editor was opened from: the router's page for the editor's address with
 *   `_wp_http_referer` set to the previous page (relative to `wp-admin/`), else `goBack.path`.
 *   I understand posts `POST wp-admin/v1/file-editor/warning` with `dismiss.request` and closes it.
 *
 * `page` is the router's page. The page host renders the page title as the top-level heading.
 * WordPress's markup is shown through kit/InlineMarkup: it runs nothing.
 *
 * `saved` carries the answer of each save.
 */
export default {
	id: 'core/file-editor',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {},
	emits: [ 'saved' ],
};
