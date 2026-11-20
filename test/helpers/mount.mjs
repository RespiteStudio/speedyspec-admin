/**
 * Mounts a component for a Jest component test (jsdom) with @vue/test-utils, the way the admin
 * app runs it: the template translation helpers (`$__`, `$_x`, …) installed and the given
 * `provide` values available to `inject`. Every wrapper is unmounted after each test.
 *
 * mountPart( component, { props, provide, slots, attachTo, global } ): VueWrapper
 *
 * `global` takes @vue/test-utils' other mounting options (`stubs`, `mocks`, `components`,
 * `directives`, `config`, …). Its `plugins` are installed after the translation helpers, and its
 * `provide` is merged with `provide`. `stubs` is passed on but does nothing: test-utils stubs
 * through a vnode hook that only Vue's development build runs, and the tests share the site's
 * production build. Swap a child with a test double through `components` (a globally registered
 * name) or through the contract table (contracts-table.mjs) instead.
 */
import { afterEach } from '@jest/globals';
import { mount, flushPromises } from '@vue/test-utils';
import { installTemplateI18n } from '../../site/runtime/template-i18n.js';

const mounted = [];

afterEach( () => {
	while ( mounted.length ) {
		mounted.pop().unmount();
	}
} );

export function mountPart( component, { props = {}, provide = {}, slots = {}, attachTo = document.body, global = {} } = {} ) {
	const { plugins = [], provide: globalProvide = {}, ...rest } = global;
	const wrapper = mount( component, {
		props,
		slots,
		attachTo,
		global: { ...rest, plugins: [ { install: installTemplateI18n }, ...plugins ], provide: { ...globalProvide, ...provide } },
	} );
	mounted.push( wrapper );
	return wrapper;
}

export { flushPromises };
