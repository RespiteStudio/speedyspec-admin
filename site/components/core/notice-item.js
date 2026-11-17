/**
 * One notice in the classic markup, with a named dismiss button.
 * Presentational part of core/notices.
 */
export default {
	name: 'NoticeItem',
	props: {
		notice: { type: Object, required: true },
	},
	emits: [ 'dismiss' ],
	template: `
		<div :class="[ 'notice', 'notice-' + notice.type, { 'is-dismissible': notice.dismissible } ]">
			<p>{{ notice.message }}</p>
			<button v-if="notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss', notice.id )">
				<span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'wp-admin-site' ) }}</span>
			</button>
		</div>
	`,
};
