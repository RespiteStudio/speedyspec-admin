# speedyspec-admin

The separately hosted (detached) WordPress admin: a static site (`site/`) and a small Node proxy (`server/`) that serves it and forwards WordPress's own paths to WordPress.

## The proxy

Start it with `npm start` (Node 24 or later, no dependencies). It refuses to start when its configuration is incomplete.

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `WP_UPSTREAM` | yes | WordPress's internal address, an `http:` URL (for example `http://wordpress-develop`). The proxy talks plain HTTP to WordPress; terminate TLS in front of the proxy, not between it and WordPress. An `https:` URL is refused at start-up. |
| `WP_ADMIN_PROXY_SECRET` | yes | The secret the proxy shares with WordPress. It must equal the `WP_ADMIN_PROXY_SECRET` constant in WordPress's `wp-config.php`. See below. |
| `ADMIN_PUBLIC_URL` | yes, unless `NODE_ENV=development` | The public URL of this admin site (for example `https://admin.example.com`). Redirects from WordPress are rewritten onto it, and WordPress gets it as `X-Forwarded-Host`/`-Proto`. Without it (development only) the request's `Host` header is used, which a client chooses. |
| `WP_PUBLIC_URL` | no | WordPress's public URL, when it differs from `WP_UPSTREAM`. Redirects to it are rewritten onto the admin site, and its host is sent as `Host` to WordPress. |
| `WP_UPSTREAM_HOST` | no | The `Host` header sent to WordPress, when neither of the above gives the right one. |
| `PORT` | no | Port to listen on. Default `8890`. |
| `TRUST_PROXY` | no | `1` when a trusted proxy sits in front of this one: its `X-Forwarded-For`, `X-Forwarded-Proto`, `Forwarded` and `X-Real-IP` are passed on. Otherwise they are replaced or removed. |
| `UPSTREAM_TIMEOUT_MS` | no | Idle timeout for requests to WordPress. Default `60000`. |
| `AUTH_TIMEOUT_MS` | no | Total timeout of the session check that guards protected files. Default `5000`. |
| `SITE_DIR` | no | The static site directory. Default `site/`. |

### The shared secret

WordPress changes its URLs for a request only when that request is the proxy's. It moves admin, REST, script and style URLs to the admin origin. The proxy marks its requests with `X-WP-Detached-Admin: 1`, but anyone can send that header. So WordPress honours it only together with `X-WP-Detached-Admin-Secret`. That header carries `WP_ADMIN_PROXY_SECRET`, compared in constant time with the constant of the same name. With no secret configured in WordPress, the header is ignored entirely. The proxy sends the secret with every request it makes to WordPress (forwarded requests, the session check, the sites lookup) and strips any copy a client sends.

Use a long random value, for example `openssl rand -hex 32`, and set it in two places: in WordPress's `wp-config.php` (`define( 'WP_ADMIN_PROXY_SECRET', '…' );`) and in the proxy's environment. WordPress's local environment does both with a development-only value when `LOCAL_ADMIN=true` (`LOCAL_ADMIN_PROXY_SECRET` in its `.env`).

Responses whose URLs WordPress moved because of the header carry `Vary: X-WP-Detached-Admin`, so a cache in front of WordPress keeps them apart from the public ones.

### Who may load which file: three tiers

Every static file is unauthorized by default. The decision is taken on the normalised path alone, before the file system is looked at:

1. **Public:** the shell document (`/`, `/index.html` and every `/wp-admin/…` navigation) and the files listed in `site/public-files.json`. These are what the sign-in and error screens need, and anyone may load them.
2. **Shared:** the files listed in `site/shared-files.json` (the runtime, the kit, the frame, the components every page uses). Any caller whose login cookie WordPress accepts may load them. The proxy asks WordPress's session route and caches a positive answer for 30 seconds.
3. **Page files:** everything under `/contracts/<namespace>/<name>…` and `/components/<namespace>/<name>…`. Only a signed-in caller whose session lists that page's component (`<namespace>/<name>`) may load them.

Anything on no list is never served. An anonymous caller gets the same 401 for every protected path, existing or not, and a signed-in caller the same 403. A listed name is served only as the very file it names (no symbolic links). Responses carry `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`, and the shell carries `Content-Security-Policy: frame-ancestors 'none'`.

### Editing the two list files

Both files are JSON of the form `{ "files": [ "/runtime/app.js", … ] }`, with root-relative paths of single files. Globs, directories, dot segments and encodings are not allowed. An invalid or missing list makes its tier fail closed and is logged once. The proxy reads a list again when it changes, without a restart.

- Add a module to `public-files.json` only when the sign-in or error screens import it before sign-in. `test/public-files.test.mjs` checks that the list is exactly what the shell document reaches statically, and that the only dynamic import in public code is the protected entry.
- Add a module to `shared-files.json` when the protected entry, or a module it imports, needs it for every signed-in user. `test/shared-files.test.mjs` keeps the list in step with the code.
- Page files need no list: name them after their page's component.

## Tests

`npm test` runs Jest (Node 24 or later; run `npm install` once for the test dependencies). Jest runs the native ES modules untranspiled, with `--experimental-vm-modules`, and `jest.config.mjs` maps the browser import map (`vue`, `@wp-admin/kit`, `@wp-admin/i18n`, `@wp-admin/api`) to the vendored Vue and to test doubles in `test/helpers/`. The test dependencies are dev dependencies only: the site and the proxy still need no `node_modules` and no build, and the Docker image does not include them.

- One file: `npm test -- test/options-general.test.mjs`; one test by name: `npm test -- test/options-general.test.mjs -t 'descriptions are wired'`.
- `test/*.test.mjs` are the unit tests. They were written for node:test and import its API from `test/helpers/node-test-shim.mjs`, which provides it on Jest.
- `test/components/<page>/<part>.test.mjs` are component tests: they start with `/** @jest-environment jsdom */`, import from `@jest/globals`, mount the part with `mountPart()` from `test/helpers/mount.mjs` (`@vue/test-utils` with the template translation helpers and `provide`), fill the contract table with `fillContracts()` from `test/helpers/contracts-table.mjs`, drive it through DOM events and assert the API stub's `calls` and the DOM.

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

WordPress's text domain registry also finds language files that are simply placed in `WP_LANG_DIR/plugins/` (for example `wp-content/languages/plugins/wp-admin-site-de_DE.mo` or `.l10n.php`), without anything registering the domain: dropping the compiled files of a translation there is enough for the endpoint to serve them.

**Open item:** nothing installs the `wp-admin-site` language files yet (no language pack, no installer step), so out of the box the translated skeleton does not work end to end; only the `default` domain is translated (by core's language packs). Installing them is a tracked follow-up for the owner to decide.

Before sign-in the browser's languages are used: `de-DE-formal` is asked for as `de_DE_formal`. A bare language such as `de` is asked for as it is and usually finds no file, because the translations endpoint cannot say which `de_*` locale is installed; the browser's next, more specific language (if any) is not tried automatically.
