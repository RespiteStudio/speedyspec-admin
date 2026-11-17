import { computed } from 'vue';
import { __ } from '../runtime/text.js';

const UNREACHABLE = [ 'admin_upstream_unreachable', 'admin_upstream_timeout' ];

export default {
	name: 'ErrorScreen',
	props: {
		router: { type: Object, required: true },
		kind: { type: String, default: 'error' },
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
		const retry = () => props.router.refresh();
		return { message, retry };
	},
	template: `
		<main class="wp-admin-error" :data-kind="kind">
			<h1 class="wp-admin-error__title" role="alert">{{ message }}</h1>
			<p v-if="kind === 'error'">
				<button type="button" class="wp-admin-button" @click="retry">{{ $__( 'Retry', 'wp-admin-site' ) }}</button>
			</p>
			<p v-else>
				<a class="wp-admin-button" href="/wp-admin/">{{ $__( 'Go to the Dashboard', 'wp-admin-site' ) }}</a>
			</p>
		</main>
	`,
};
