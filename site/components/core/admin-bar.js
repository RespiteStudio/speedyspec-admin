import { computed } from 'vue';
import { httpUrl } from '../../runtime/menu.js';
import { SlotOutlet } from '../../runtime/slots.js';

/**
 * Default implementation of core/admin-bar: a link to the site's front end named after the
 * site (as the classic toolbar's site name is in the admin: home_url( '/' )), the current user
 * and a Log Out button. When the home address is not known the link goes to the admin home.
 */
export default {
	name: 'AdminBar',
	components: { SlotOutlet },
	props: {
		user: { type: Object, required: true },
		base: { type: String, required: true },
		siteName: { type: String, default: '' },
		homeUrl: { type: String, default: '' },
	},
	emits: [ 'sign-out' ],
	setup( props ) {
		const avatar = computed( () => httpUrl( props.user?.avatar ) );
		// The address WordPress sends (home_url( '/' )), as it is; the admin home when it sends none or an unsafe one.
		const siteLink = computed( () => httpUrl( props.homeUrl ) ?? props.base );
		return { avatar, siteLink };
	},
	template: `
		<div id="wp-admin-bar" class="wp-admin-bar">
			<nav class="wp-admin-bar__nav" :aria-label="$__( 'Toolbar', 'wp-admin-site' )">
				<SlotOutlet name="start" :context="{ user }" />
				<a class="wp-admin-bar__site" :href="siteLink">
					<span class="dashicons-before dashicons-admin-home" aria-hidden="true"></span>
					<span>{{ siteName || $__( 'Dashboard', 'wp-admin-site' ) }}</span>
				</a>
				<div class="wp-admin-bar__account">
					<img v-if="avatar" class="wp-admin-bar__avatar" :src="avatar" alt="" width="26" height="26">
					<!-- translators: %s: Display name of the current user. -->
					<span class="wp-admin-bar__user">{{ $sprintf( $__( 'Howdy, %s', 'wp-admin-site' ), user.name ) }}</span>
					<button type="button" class="wp-admin-bar__logout" @click="$emit( 'sign-out' )">{{ $__( 'Log Out', 'wp-admin-site' ) }}</button>
				</div>
				<SlotOutlet name="end" :context="{ user }" />
			</nav>
		</div>
	`,
};
