# speedyspec-admin

## Translations

Everything the admin site shows is translatable, including the skeleton itself (the sign-in screen, the frame, the notices, the error screens). Two text domains are used:

- `wp-admin-site` is for strings this site owns. They are extracted into `languages/wp-admin-site.pot`.
- `default` is WordPress core's own domain. A screen converted from core (General Settings so far) uses core's source strings **byte for byte** under this domain, so the language packs WordPress already has apply to it without any translator work. The `default` strings are not in the POT; a test checks that each of them exists verbatim in core's PHP sources (same text, context and plural form). Set `WP_SRC` to the `src` directory of a WordPress checkout for that test (default `../wordpress-develop-original/src`; the test is skipped, with a message, when the directory is absent). The converted core pages are listed in one place, `tools/i18n/domains.mjs`.

### Writing strings

Import the functions from `@wp-admin/i18n` (or use the reactive wrappers of `site/runtime/text.js`) and always pass the text domain as a string literal, last:

```js
__( 'Save Changes', 'wp-admin-site' );
_x( 'Post', 'noun', 'wp-admin-site' );
_n( '%d item', '%d items', count, 'wp-admin-site' );
_nx( '%d item', '%d items', count, 'menu', 'wp-admin-site' );
sprintf( __( 'Howdy, %s', 'wp-admin-site' ), name );
```

Vue templates cannot resolve names that start with `_`, so templates use the globally registered `$__`, `$_x`, `$_n`, `$_nx` and `$sprintf` with the same arguments:

```html
<button>{{ $__( 'Log Out', 'wp-admin-site' ) }}</button>
<nav :aria-label="$__( 'Main menu', 'wp-admin-site' )"></nav>
```

The text, plural, context and domain must be plain string literals: no variables, no concatenation, no template literal with `${}`. Put values in with `sprintf`.

A string with placeholders (`%s`, `%d`, `%1$s`) needs a translators comment, which is carried into the POT. In scripts, a `/* translators: … */` (or `// translators: …`) comment on the line directly above the call; in templates, an HTML comment `<!-- translators: … -->` directly before the element that contains the call:

```js
/* translators: %s: Admin screen title. */
sprintf( __( 'The screen “%s” is no longer available.', 'wp-admin-site' ), title );
```

```html
<!-- translators: %s: Display name of the current user. -->
<span>{{ $sprintf( $__( 'Howdy, %s', 'wp-admin-site' ), user.name ) }}</span>
```

`test/strings.test.mjs` fails on text in a template that is not an interpolation (including `placeholder`, `title`, `aria-label`, `alt` and `label` attributes with a literal value, and untranslated strings hidden in a ternary, `&&`, `||` or concatenation), on user-visible literals in scripts (`message`, `label`, `title`, `text`, `error`, … properties, `document.title`, `h()` children, `notify()`, `new Error()` in screens), and on a stale POT.

The script check is mechanical and cannot see everything. It does **not** detect: text held in a variable or constant and shown later; text in an object under a key that is not one of the keys above (`{ save: 'Save changes' }`); text returned from a function or placed in an array that is rendered elsewhere; strings in `site/runtime/` errors that are later shown (assumed internal). Review those by hand.

### The POT file

```sh
npm run i18n:pot     # regenerate languages/wp-admin-site.pot
npm run i18n:check   # fail when the POT is stale or a string is written wrongly
```

`tools/extract-strings.mjs` scans `site/**/*.js` (not `site/vendor/`) and writes the POT deterministically (no timestamp), so regenerating it gives no diff when nothing changed. The POT is the file for the translators of the skeleton.

### How translations reach the browser, and what is open

The design: WordPress distributes the language files of the `wp-admin-site` domain and serves them through `GET wp-json/wp-admin/v1/translations?domain=wp-admin-site&locale=<locale>`, which the site calls when it starts and when the language changes. The endpoint (`WP_REST_Admin_Translations_Controller`) answers that domain without a login (the sign-in screen needs it) and builds the response from `<directory>/wp-admin-site-<locale>.l10n.php` or `.mo`, where `<directory>` is the language directory that WordPress's text domain registry holds for `wp-admin-site`. When no directory is registered for the domain or no file exists, the response holds no translations and the site shows the English source strings.

**Open item:** nothing on the WordPress side installs the `.po`/`.mo`/`.l10n.php` files of `wp-admin-site` or registers a language directory for that domain yet, so the translated skeleton does not work end to end. Until that is built, only the `default` domain is translated (by core's language packs).
