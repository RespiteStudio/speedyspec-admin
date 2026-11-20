/**
 * Mounts a component for a Jest component test (jsdom) with @vue/test-utils, the way the admin
 * app runs it: the template translation helpers (`$__`, `$_x`, …) installed and the given
 * `provide` values available to `inject`. Every wrapper is unmounted after each test.
 *
 * mountPart( component, { props, provide, slots, attachTo } ): VueWrapper
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

export function mountPart( component, { props = {}, provide = {}, slots = {}, attachTo = document.body } = {} ) {
	const wrapper = mount( component, {
		props,
		slots,
		attachTo,
		global: { plugins: [ { install: installTemplateI18n } ], provide },
	} );
	mounted.push( wrapper );
	return wrapper;
}

export { flushPromises };
