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
				return __( 'You do not have permission to access this page.' );
			}
			if ( props.kind === 'notfound' ) {
				return __( 'This page could not be found.' );
			}
			if ( UNREACHABLE.includes( props.router.state.error?.code ) ) {
				return __( 'WordPress cannot be reached right now. Please try again in a moment.' );
			}
			return __( 'Something went wrong while loading this page.' );
		} );
		const retry = () => props.router.refresh();
		return { translate: __, message, retry };
	},
	template: `
		<main class="wp-admin-error" :data-kind="kind">
			<h1 class="wp-admin-error__title" role="alert">{{ message }}</h1>
			<p v-if="kind === 'error'">
				<button type="button" class="wp-admin-button" @click="retry">{{ translate( 'Retry' ) }}</button>
			</p>
			<p v-else>
				<a class="wp-admin-button" href="/wp-admin/">{{ translate( 'Go to the Dashboard' ) }}</a>
			</p>
		</main>
	`,
};
