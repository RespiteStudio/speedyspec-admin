import { computed, ref, watch, watchEffect, nextTick } from 'vue';
import { __, sprintf } from './text.js';
import Contracted from './Contracted.js';

/** Document title of a page: "Page ‹ Site — WordPress" (translatable), or the page title alone without a site name. */
export function documentTitle( title, siteName ) {
	if ( ! siteName ) {
		return title;
	}
	/* translators: Admin screen title. 1: Admin screen name, 2: Site name. */
	return sprintf( __( '%1$s ‹ %2$s — WordPress', 'wp-admin-site' ), title, siteName );
}

/**
 * Renders the current page through its contract: a core contract's static
 * implementation, or for a plugin page the module's default export. Each path
 * gets a fresh instance. After a navigation, focus moves to the page heading
 * so that screen reader users start at the new content.
 */
export default {
	name: 'PageHost',
	components: { Contracted },
	props: {
		page: { type: Object, required: true },
		siteName: { type: String, default: '' },
		busy: { type: Boolean, default: false },
	},
	setup( props ) {
		const heading = ref( null );

		// A core contract that does not exist yet (screens not converted) is not a failure.
		const unresolvedMessage = computed( () => ( String( props.page.component ).startsWith( 'core/' ) ? __( 'This screen is not available yet.', 'wp-admin-site' ) : undefined ) );

		watch( () => props.page.path, async () => {
			await nextTick();
			heading.value?.focus();
		} );

		// After the app's own title effect (which runs before rendering).
		watchEffect( () => {
			const title = documentTitle( props.page.title, props.siteName );
			if ( globalThis.document ) {
				globalThis.document.title = title;
			}
		}, { flush: 'post' } );

		return { heading, unresolvedMessage };
	},
	template: `
		<main id="wp-admin-page" class="wrap wp-admin-page" :data-path="page.path" :data-component="page.component" :aria-busy="busy ? 'true' : null">
			<h1 ref="heading" class="wp-heading-inline" tabindex="-1">{{ page.title }}</h1>
			<Contracted
				:key="page.path"
				:id="page.component"
				:module="page.module"
				:data="page.data"
				:page="page"
				:unresolved-message="unresolvedMessage"
			/>
		</main>
	`,
};
