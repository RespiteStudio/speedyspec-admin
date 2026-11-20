/**
 * Jest runs the unit and component tests on the untranspiled native ES modules (no Babel:
 * `transform: {}`), with `--experimental-vm-modules` (see package.json).
 *
 * `moduleNameMapper` repeats the browser import map for node: `vue` is the vendored build the
 * site serves (so @vue/test-utils and the components share one Vue), and the browser-only
 * specifiers resolve to the test doubles in test/helpers/.
 */
export default {
	testMatch: [ '<rootDir>/test/**/*.test.mjs' ],
	moduleFileExtensions: [ 'js', 'mjs', 'json' ],
	transform: {},
	testEnvironment: 'node',
	workerIdleMemoryLimit: '512MB',
	moduleNameMapper: {
		'^vue$': '<rootDir>/site/vendor/vue.esm-browser.prod.js',
		'^@wp-admin/kit$': '<rootDir>/site/kit/index.js',
		'^@wp-admin/i18n$': '<rootDir>/test/helpers/i18n-stub.mjs',
		'^@wp-admin/api$': '<rootDir>/test/helpers/api-stub.mjs',
		'^\\./contracts-instance\\.js$': '<rootDir>/test/helpers/contracts-instance-stub.mjs',
		// The `node` and `browser` export conditions give CJS or IIFE builds, which cannot share
		// the vendored ESM Vue.
		'^@vue/test-utils$': '<rootDir>/node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs',
	},
};
