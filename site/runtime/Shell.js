import { __ } from './text.js';
import Login from '../pages/Login.js';
import ErrorScreen from '../pages/ErrorScreen.js';

/**
 * Placeholder application shell: picks what to show for the router status.
 * The frame, menu and page host replace the `ready` branch in a later task.
 */
export default {
	name: 'Shell',
	components: { Login, ErrorScreen },
	props: { router: { type: Object, required: true } },
	setup: ( props ) => ( { translate: __, state: props.router.state } ),
	template: `
		<Login v-if="state.status === 'login'" :router="router" />
		<ErrorScreen v-else-if="state.status === 'error'" :router="router" kind="error" />
		<ErrorScreen v-else-if="state.status === 'forbidden'" :router="router" kind="forbidden" />
		<ErrorScreen v-else-if="state.status === 'notfound'" :router="router" kind="notfound" />
		<main v-else-if="state.status === 'ready' && state.page" id="wp-admin-page" :data-path="state.page.path" :data-component="state.page.component">
			<h1>{{ state.page.title }}</h1>
		</main>
		<div v-else class="wp-admin-loading" role="status" aria-live="polite">
			<span class="wp-admin-loading__spinner" aria-hidden="true"></span>
			<span class="screen-reader-text">{{ translate( 'Loading…' ) }}</span>
		</div>
	`,
};
