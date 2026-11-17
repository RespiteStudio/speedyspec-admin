/**
 * The count bubble of a menu item (pending comments, updates), with a
 * translated accessible name. Presentational part of core/menu.
 */
export default {
	name: 'MenuCount',
	props: { count: { type: Number, default: null } },
	setup: ( props ) => ( { shown: () => Number.isInteger( props.count ) ? props.count > 0 : false } ),
	template: `
		<span v-if="shown()" :class="[ 'awaiting-mod', 'count-' + count ]">
			<span class="pending-count" aria-hidden="true">{{ count }}</span>
			<span class="screen-reader-text">{{ $sprintf( $_n( '%d item', '%d items', count, 'wp-admin-site' ), count ) }}</span>
		</span>
	`,
};
