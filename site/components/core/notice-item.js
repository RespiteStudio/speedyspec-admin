/**
 * One notice in the classic markup, with a named dismiss button and, when the notice
 * carries an `action` ({ label, run }), a button that runs it and then dismisses the notice.
 * Presentational part of core/notices.
 */
export default {
	name: 'NoticeItem',
	props: {
		notice: { type: Object, required: true },
	},
	emits: [ 'dismiss' ],
	methods: {
		runAction() {
			this.notice.action.run();
			this.$emit( 'dismiss', this.notice.id );
		},
	},
	template: `
		<div :class="[ 'notice', 'notice-' + notice.type, { 'is-dismissible': notice.dismissible } ]">
			<p>{{ notice.message }}</p>
			<p v-if="notice.action"><button type="button" class="button" @click="runAction">{{ notice.action.label }}</button></p>
			<button v-if="notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss', notice.id )">
				<span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'wp-admin-site' ) }}</span>
			</button>
		</div>
	`,
};
