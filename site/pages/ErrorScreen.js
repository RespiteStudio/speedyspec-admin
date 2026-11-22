import { computed } from 'vue';
import { __ } from '../runtime/text.js';
import { sitePrefix } from '../runtime/router.js';

const UNREACHABLE = [ 'admin_upstream_unreachable', 'admin_upstream_timeout' ];

/** An http(s) URL, absolute or root-relative, without surrounding spaces or control characters; else null. */
function safeRedirect( value ) {
	if ( typeof value !== 'string' || value === '' || value !== value.trim() || /[\u0000-\u001f\u007f]/.test( value ) ) {
		return null;
	}
	try {
		const url = new URL( value, globalThis.location?.origin ?? 'http://invalid.invalid' );
		return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
	} catch {
		return null;
	}
}

export default {
	name: 'ErrorScreen',
	props: {
		router: { type: Object, required: true },
		kind: { type: String, default: 'error' },
		// The access-denied message WordPress sent (inline markup), shown for `forbidden` in place of the generic text.
		markup: { type: String, default: null },
		// The component that shows `markup` (the kit's inline-markup renderer, which the protected entry gives:
		// this screen is public and the kit is not). Without it the generic text shows.
		markupComponent: { type: Object, default: null },
	},
	setup( props ) {
		const message = computed( () => {
			if ( props.kind === 'forbidden' ) {
				return __( 'You do not have permission to access this page.', 'wp-admin-site' );
			}
			if ( props.kind === 'notfound' ) {
				return __( 'This page could not be found.', 'wp-admin-site' );
			}
			if ( UNREACHABLE.includes( props.router.state.error?.code ) ) {
				return __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' );
			}
			return __( 'Something went wrong while loading this page.', 'wp-admin-site' );
		} );
		// Only a forbidden screen shows the access-denied message.
		const shownMarkup = computed( () => ( props.kind === 'forbidden' && props.markupComponent && typeof props.markup === 'string' ? props.markup : '' ) );
		const retry = () => props.router.refresh();
		// The Dashboard of the site shown, not always the main site's.
		const dashboardUrl = computed( () => sitePrefix( props.router.currentUrl?.() ?? '' ) + '/wp-admin/' );
		// Where a plugin sent the user instead of the admin (a redirect during admin_init).
		const redirectUrl = computed( () => {
			const error = props.router.state.error;
			return props.kind === 'forbidden' && error?.code === 'admin_init_redirect' ? safeRedirect( error.data?.location ) : null;
		} );
		return { message, shownMarkup, retry, dashboardUrl, redirectUrl };
	},
	template: `
		<main class="wp-admin-error" :data-kind="kind">
			<!-- The alert wraps the heading: role="alert" on the h1 would replace its heading role. -->
			<div class="wp-admin-error__alert" role="alert">
				<h1 v-if="shownMarkup" class="wp-admin-error__title"><component :is="markupComponent" :html="shownMarkup" /></h1>
				<h1 v-else class="wp-admin-error__title">{{ message }}</h1>
			</div>
			<p v-if="kind === 'error'">
				<button type="button" class="wp-admin-button" @click="retry">{{ $__( 'Retry', 'wp-admin-site' ) }}</button>
			</p>
			<p v-if="redirectUrl" class="wp-admin-error__redirect">
				{{ $__( 'WordPress sent this request to another address:', 'wp-admin-site' ) }}
				<a :href="redirectUrl">{{ redirectUrl }}</a>
			</p>
			<p v-if="kind !== 'error'">
				<a class="wp-admin-button" :href="dashboardUrl">{{ $__( 'Go to the Dashboard', 'wp-admin-site' ) }}</a>
			</p>
		</main>
	`,
};
