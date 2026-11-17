const TYPES = [ 'success', 'error', 'warning', 'info' ];

/**
 * <Notice type="warning" dismissible @dismiss="…">…</Notice>
 *
 * An inline notice in a page, in the classic markup. For messages that must be
 * announced, use the `notices` service instead.
 */
export default {
	name: 'WpAdminNotice',
	props: {
		type: { type: String, default: 'info' },
		dismissible: { type: Boolean, default: false },
	},
	emits: [ 'dismiss' ],
	setup: ( props ) => ( { kind: () => ( TYPES.includes( props.type ) ? props.type : 'info' ) } ),
	template: `
		<div :class="[ 'notice', 'notice-' + kind(), 'inline', { 'is-dismissible': dismissible } ]">
			<slot />
			<button v-if="dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss' )">
				<span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'wp-admin-site' ) }}</span>
			</button>
		</div>
	`,
};
