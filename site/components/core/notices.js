import { liveRole } from '../../runtime/notices.js';
import { SlotOutlet } from '../../runtime/slots.js';

/**
 * Default implementation of core/notices: classic notice markup, each notice
 * a live region (`alert` for errors and warnings, `status` otherwise).
 */
export default {
	name: 'Notices',
	components: { SlotOutlet },
	props: {
		notices: { type: Array, required: true },
	},
	emits: [ 'dismiss' ],
	setup: () => ( { liveRole } ),
	template: `
		<div class="wp-admin-notices">
			<SlotOutlet name="before" :context="{ notices }" />
			<div
				v-for="notice in notices"
				:key="notice.id"
				:class="[ 'notice', 'notice-' + notice.type, { 'is-dismissible': notice.dismissible } ]"
				:role="liveRole( notice.type )"
			>
				<p>{{ notice.message }}</p>
				<button v-if="notice.dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss', notice.id )">
					<span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'wp-admin-site' ) }}</span>
				</button>
			</div>
			<SlotOutlet name="after" :context="{ notices }" />
		</div>
	`,
};
