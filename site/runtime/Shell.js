import { computed, ref, watch, watchEffect } from 'vue';
import Login from '../pages/Login.js';
import ErrorScreen from '../pages/ErrorScreen.js';
import { toPagePath } from './router.js';
import { createSiteInfo } from './site-info.js';
import { __ } from './text.js';

const siteInfo = createSiteInfo( { fetch: ( ...args ) => globalThis.fetch( ...args ) } );
const ROOT_LOCATION = { pathname: '/wp-admin/', search: '' };

/**
 * Document title while no page is on screen. While one is (the frame is shown,
 * also while the next page loads), the page host owns the title.
 */
export function shellTitle( status ) {
	if ( status === 'login' ) {
		return __( 'Sign in', 'wp-admin-site' );
	}
	if ( status === 'loading' || status === 'ready' ) {
		return __( 'Loading…', 'wp-admin-site' );
	}
	return __( 'Error', 'wp-admin-site' );
}

/**
 * Application shell: picks what to show for the router status. Once signed
 * in, the frame (core/frame) stays on screen while the next page loads.
 *
 * The shell is public; the frame is not. `signedIn` is a ref to the protected
 * entry (runtime/protected.js), null until the session has been accepted, and
 * the frame is rendered through it.
 */
export default {
	name: 'Shell',
	components: { Login, ErrorScreen },
	props: {
		router: { type: Object, required: true },
		signedIn: { type: Object, default: null },
	},
	setup( props ) {
		const state = props.router.state;
		const admin = computed( () => props.signedIn?.value ?? null );
		const siteName = ref( '' );

		// Where the browser is; read again whenever a page is shown.
		const where = computed( () => {
			// eslint-disable-next-line no-unused-expressions
			state.page;
			return toPagePath( globalThis.location ?? ROOT_LOCATION );
		} );
		const base = computed( () => admin.value?.adminBase( where.value.siteId ) ?? '' );
		// The page's menu item: its `menuCurrent` (a screen whose menu item is another path), else its path.
		const current = computed( () => ( admin.value && state.page ? admin.value.currentMenuPath( { context: where.value.context, path: typeof state.page.menuCurrent === 'string' && state.page.menuCurrent !== '' ? state.page.menuCurrent : state.page.path } ) : '' ) );
		// A page the router refuses keeps the frame shown, if any: the page host shows the forbidden screen.
		const framed = computed( () => Boolean( admin.value && state.manifest && state.page ) && [ 'ready', 'loading', 'forbidden' ].includes( state.status ) );
		const forbiddenAlone = computed( () => state.status === 'forbidden' && ! framed.value );

		watchEffect( () => {
			if ( ! framed.value && globalThis.document ) {
				globalThis.document.title = shellTitle( state.status );
			}
		} );

		watch( () => where.value.siteId, async ( siteId ) => {
			const name = await siteInfo.siteName( siteId );
			if ( siteId === where.value.siteId ) {
				siteName.value = name;
			}
		}, { immediate: true } );

		async function signOut() {
			const notices = admin.value?.notices;
			try {
				await props.router.signOut();
				notices?.clear?.();
			} catch {
				notices?.add( { type: 'error', message: __( 'You could not be logged out. Please try again.', 'wp-admin-site' ), dismissible: true } );
			}
		}

		return { state, admin, base, current, framed, forbiddenAlone, siteName, signOut };
	},
	template: `
		<Login v-if="state.status === 'login'" :router="router" />
		<ErrorScreen v-else-if="state.status === 'error'" :router="router" kind="error" />
		<ErrorScreen v-else-if="forbiddenAlone" :router="router" kind="forbidden" :markup="state.forbiddenMarkup" :markup-component="admin?.MessageMarkup ?? null" />
		<ErrorScreen v-else-if="state.status === 'notfound'" :router="router" kind="notfound" />
		<component
			:is="admin.Contracted"
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
