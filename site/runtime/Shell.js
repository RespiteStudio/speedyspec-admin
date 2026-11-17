import { computed, inject, ref, watch } from 'vue';
import Login from '../pages/Login.js';
import ErrorScreen from '../pages/ErrorScreen.js';
import Contracted from './Contracted.js';
import { toPagePath } from './router.js';
import { adminBase, currentMenuPath } from './menu.js';
import { createSiteInfo } from './site-info.js';
import { __ } from './text.js';

const siteInfo = createSiteInfo( { fetch: ( ...args ) => globalThis.fetch( ...args ) } );
const ROOT_LOCATION = { pathname: '/wp-admin/', search: '' };

/**
 * Application shell: picks what to show for the router status. Once signed
 * in, the frame (core/frame) stays on screen while the next page loads.
 */
export default {
	name: 'Shell',
	components: { Login, ErrorScreen, Contracted },
	props: { router: { type: Object, required: true } },
	setup( props ) {
		const state = props.router.state;
		const notices = inject( 'notices', null );
		const siteName = ref( '' );

		// Where the browser is; read again whenever a page is shown.
		const where = computed( () => {
			// eslint-disable-next-line no-unused-expressions
			state.page;
			return toPagePath( globalThis.location ?? ROOT_LOCATION );
		} );
		const base = computed( () => adminBase( where.value.siteId ) );
		const current = computed( () => ( state.page ? currentMenuPath( { context: where.value.context, path: state.page.path } ) : '' ) );
		const framed = computed( () => Boolean( state.manifest && state.page ) && ( state.status === 'ready' || state.status === 'loading' ) );

		watch( () => where.value.siteId, async ( siteId ) => {
			const name = await siteInfo.siteName( siteId );
			if ( siteId === where.value.siteId ) {
				siteName.value = name;
			}
		}, { immediate: true } );

		async function signOut() {
			try {
				await props.router.signOut();
				notices?.clear?.();
			} catch {
				notices?.add( { type: 'error', message: __( 'You could not be logged out. Please try again.', 'wp-admin-site' ), dismissible: true } );
			}
		}

		return { state, base, current, framed, siteName, signOut };
	},
	template: `
		<Login v-if="state.status === 'login'" :router="router" />
		<ErrorScreen v-else-if="state.status === 'error'" :router="router" kind="error" />
		<ErrorScreen v-else-if="state.status === 'forbidden'" :router="router" kind="forbidden" />
		<ErrorScreen v-else-if="state.status === 'notfound'" :router="router" kind="notfound" />
		<Contracted
			v-else-if="framed"
			id="core/frame"
			:manifest="state.manifest"
			:page="state.page"
			:current="current"
			:base="base"
			:site-name="siteName"
			:busy="state.status === 'loading'"
			@sign-out="signOut"
		/>
		<div v-else class="wp-admin-loading" role="status" aria-live="polite">
			<span class="wp-admin-loading__spinner" aria-hidden="true"></span>
			<span class="screen-reader-text">{{ $__( 'Loading…', 'wp-admin-site' ) }}</span>
		</div>
	`,
};
