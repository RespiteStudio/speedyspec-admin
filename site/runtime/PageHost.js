import { computed, inject, onBeforeUnmount, provide, ref, shallowRef, watch, watchEffect, nextTick } from 'vue';
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

// Classic screens shown in a frame (components/core/legacy.js).
const LEGACY = 'core/legacy';

/**
 * Renders the current page through its contract: a core contract's static
 * implementation, or for a plugin page the module's default export. Each path
 * gets a fresh instance. After a navigation, focus moves to the page heading
 * so that screen reader users start at the new content.
 *
 * Consecutive legacy pages share one instance (keyed `core/legacy`), so that a
 * classic screen that navigates by itself keeps its frame. Its `navigated` event
 * ({ path, title }) gives the document title of that page. After a navigation made
 * here, the legacy page moves focus to its frame (`pageFocus.legacy`); a navigation
 * the frame made by itself, which the legacy page marks `pageFocus.adopted` before
 * the router shows it, leaves focus where the user is, inside the frame.
 *
 * Provides `pageState` ({ setDirty( boolean ), isDirty() }) to the page: a page that
 * holds unsaved changes calls `setDirty( true )`, and `setDirty( false )` once they are
 * saved or discarded. While it is dirty, a live update (runtime/live.js) never swaps the
 * page for another one or leaves it; it warns instead. The state is cleared when the
 * page changes or goes. A hosted classic screen is not known to be dirty.
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
		const isLegacy = computed( () => props.page.component === LEGACY );
		const reported = shallowRef( null ); // { path, title } of the frame's last screen.
		const pageFocus = { legacy: false, adopted: false };
		provide( 'pageFocus', pageFocus );
		const router = inject( 'router', null );
		const pageState = {
			setDirty: ( value ) => router?.setDirty?.( value ),
			isDirty: () => router?.isDirty?.() ?? false,
		};
		provide( 'pageState', pageState );
		onBeforeUnmount( () => pageState.setDirty( false ) );

		function onNavigated( payload ) {
			reported.value = payload && typeof payload === 'object' ? { path: String( payload.path ?? '' ), title: typeof payload.title === 'string' ? payload.title : '' } : null;
		}

		// A core contract that does not exist yet (screens not converted) is not a failure.
		const unresolvedMessage = computed( () => ( String( props.page.component ).startsWith( 'core/' ) ? __( 'This screen is not available yet.', 'wp-admin-site' ) : undefined ) );

		watch( () => props.page.path, async () => {
			pageState.setDirty( false );
			const adopted = pageFocus.adopted;
			pageFocus.adopted = false;
			if ( isLegacy.value ) {
				pageFocus.legacy = ! adopted;
				return;
			}
			reported.value = null;
			pageFocus.legacy = false;
			await nextTick();
			heading.value?.focus();
		} );

		// After the app's own title effect (which runs before rendering).
		watchEffect( () => {
			const frame = isLegacy.value && reported.value?.path === props.page.path ? reported.value.title : '';
			const title = frame || documentTitle( props.page.title, props.siteName );
			if ( globalThis.document ) {
				globalThis.document.title = title;
			}
		}, { flush: 'post' } );

		return { heading, isLegacy, unresolvedMessage, onNavigated };
	},
	template: `
		<main id="wp-admin-page" :class="[ 'wrap', 'wp-admin-page', { 'wp-admin-page--legacy': isLegacy } ]" :data-path="page.path" :data-component="page.component" :aria-busy="busy ? 'true' : null">
			<h1 ref="heading" class="wp-heading-inline" tabindex="-1">{{ page.title }}</h1>
			<Contracted
				:key="isLegacy ? 'core/legacy' : page.path"
				:id="page.component"
				:module="page.module"
				:data="page.data"
				:page="page"
				:unresolved-message="unresolvedMessage"
				@navigated="onNavigated"
			/>
		</main>
	`,
};
