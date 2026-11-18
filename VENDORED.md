# Vendored libraries

The files in `site/vendor/`. This note lives outside `site/` because every file there is
classified for the proxy (public, shared or a page's; see `test/shared-files.test.mjs`).

## site/vendor/vue.esm-browser.prod.js

- Vue 3.5.45, the full ESM browser build (includes the template compiler).
- Obtained with `npm pack vue@3` in a temporary directory outside this repository,
  then copying `package/dist/vue.esm-browser.prod.js` unchanged.
- To update, repeat with the desired version and edit this file.
