import { liveRole } from '../../runtime/notices.js';
import { SlotOutlet } from '../../runtime/slots.js';
import NoticeItem from './notice-item.js';

/**
 * Default implementation of core/notices: classic notice markup inside two live
 * regions that exist from the start, so that a notice added later is announced:
 * one `status` (polite) for success and info, one `alert` for errors and warnings.
 */
export default {
	name: 'Notices',
	components: { SlotOutlet, NoticeItem },
	props: {
		notices: { type: Array, required: true },
	},
	emits: [ 'dismiss' ],
	setup( props ) {
		const inRegion = ( role ) => props.notices.filter( ( notice ) => liveRole( notice.type ) === role );
		return { inRegion };
	},
	template: `
		<div class="wp-admin-notices">
			<SlotOutlet name="before" :context="{ notices }" />
			<div class="wp-admin-notices__region wp-admin-notices__region--alert" role="alert">
				<NoticeItem v-for="notice in inRegion( 'alert' )" :key="notice.id" :notice="notice" @dismiss="$emit( 'dismiss', $event )" />
			</div>
			<div class="wp-admin-notices__region wp-admin-notices__region--status" role="status" aria-live="polite">
				<NoticeItem v-for="notice in inRegion( 'status' )" :key="notice.id" :notice="notice" @dismiss="$emit( 'dismiss', $event )" />
			</div>
			<SlotOutlet name="after" :context="{ notices }" />
		</div>
	`,
};
