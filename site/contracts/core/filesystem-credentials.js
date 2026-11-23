/**
 * Contract of the Connection Information dialog: the filesystem credentials form that
 * request_filesystem_credentials() prints and updates.js shows in
 * `#request-filesystem-credentials-dialog` when WordPress cannot write files directly.
 *
 * - `form`: WordPress's description of the form (wp_admin_filesystem_credentials_form(), the
 *   `data.form` of an `fs_credentials_required` error, or `GET filesystem-credentials`). It never
 *   holds a password or a private key's content.
 *   - `heading` and `description`: text. `headingLevel`: 1 for an `h1` (the Plugins screens),
 *     anything else an `h2`.
 *   - `error`: inline markup or null (a failed connection, WordPress's message).
 *   - `types`: the connection types offered, in order, `[ { value, label } ]` (`ftp`, `ftps`,
 *     `ssh`, or a type a plugin adds on `fs_ftp_connection_types`); `connectionType`: the one
 *     checked.
 *   - `hostname`, `username`, `publicKey`, `privateKey`: the values shown (text; the key values are
 *     paths on the server).
 *   - `labels.username`, `labels.password`: the field titles WordPress chose for the types.
 *   - `hostnameLocked`, `usernameLocked`, `passwordLocked`, `connectionTypeLocked`,
 *     `publicKeyLocked`, `privateKeyLocked`: a field set by a `wp-config.php` constant, shown
 *     read-only and never sent. A locked password shows the classic `*****`.
 * - `open`: whether the dialog is shown (modal). While open, the first field that can be typed in
 *   has the focus; closing returns the focus to the element that had it before.
 *
 * Emits:
 * - `submit( credentials )`: Proceed, with the fields under their posted names (`hostname`,
 *   `username`, `password`, `connection_type`, `public_key`, `private_key`), each only when it is
 *   not locked, the key fields only when `ssh` is offered. The typed password leaves the field.
 * - `cancel`: Cancel or Escape.
 *
 * The implementation shows the form and returns what was typed. Whether credentials are needed,
 * which types are offered, what is locked and every text come from WordPress. The dialog is
 * shared: the Plugins pages, and later Themes and Updates, show it, so it is never in a session's
 * `components` list of one page.
 */
export default {
	id: 'core/filesystem-credentials',
	version: '1.0.0',
	props: {
		form: { type: 'Object', required: true },
		open: { type: 'Boolean', required: false },
	},
	slots: {},
	emits: [ 'submit', 'cancel' ],
};
