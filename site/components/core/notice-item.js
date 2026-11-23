import { noticeElementId } from '../../runtime/notices.js';
import InlineMarkup from '../../kit/InlineMarkup.js';

/**
 * One notice in the classic markup, with a named dismiss button and, when the notice
 * carries an `action` ({ label, run }), a button that runs it and then dismisses the notice.
 * A notice with `markup` shows it through the kit's InlineMarkup (links and code only, never
 * inserted as HTML); any other shows its `message` as text.
 * Its element has the id noticeElementId() gives and can take focus, so that a page can
 * move focus to a notice it raised.
 * Presentational part of core/notices.
 */
export default {
	name: 'NoticeItem',
	components: { InlineMarkup },
	props: {
		notice: { type: Object, required: true },
	},
	emits: [ 'dismiss' ],
	computed: {
		elementId() {
			return noticeElementId( this.notice.id );
		},
	},
	methods: {
		runAction() {
			this.notice.action.run();
			this.$emit( 'dismiss', this.notice.id );
		},
	},
	template: `
		<div :id="elementId" tabindex="-1" :class="[ 'notice', 'notice-' + notice.type, { 'is-dismissible': notice.dismissible } ]">
			<p v-if="notice.markup"><InlineMarkup :html="notice.markup" /></p>
			<p v-else>{{ notice.message }}</p>
			<p v-if="notice.action"><button type="button" class="button" @click="runAction">{{ notice.action.label }}</button></p>
			<button v-if="notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss', notice.id )">
				<span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'wp-admin-site' ) }}</span>
			</button>
		</div>
	`,
};
