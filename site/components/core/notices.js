import { liveRole } from '../../runtime/notices.js';
import { SlotOutlet } from '../../runtime/slots.js';
import NoticeItem from './notice-item.js';
import CapturedNotice from './captured-notice.js';

/**
 * Default implementation of core/notices: classic notice markup inside two live
 * regions that exist from the start, so that a notice added later is announced:
 * one `status` (polite) for success and info, one `alert` for errors and warnings.
 *
 * Notices with `html` (what the page's classic `admin_notices` callbacks printed) come
 * first, as a classic screen prints them above its content, each as it is through
 * CapturedNotice; they are not in the live regions, as a classic screen's notices are not
 * announced. Nothing is rendered for them when there are none.
 */
export default {
	name: 'Notices',
	components: { SlotOutlet, NoticeItem, CapturedNotice },
	props: {
		notices: { type: Array, required: true },
	},
	emits: [ 'dismiss' ],
	setup( props ) {
		const inRegion = ( role ) => props.notices.filter( ( notice ) => ! notice.html && liveRole( notice.type ) === role );
		const captured = () => props.notices.filter( ( notice ) => typeof notice.html === 'string' && notice.html !== '' );
		return { inRegion, captured };
	},
	template: `
		<div class="wp-admin-notices">
			<SlotOutlet name="before" :context="{ notices }" />
			<div v-if="captured().length > 0" class="wp-admin-notices__captured">
				<CapturedNotice v-for="notice in captured()" :key="notice.id" :notice="notice" @dismiss="$emit( 'dismiss', $event )" />
			</div>
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
