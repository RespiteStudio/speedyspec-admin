import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';
import Notice from '../../../kit/Notice.js';

/**
 * The Administration Email Address field of General Settings (part of the page's
 * implementation): the address, its description, and the pending change with its
 * "Cancel request" button, which emits `cancel`.
 */
export default {
	name: 'AdminEmail',
	components: { Interpolate, Notice },
	props: {
		modelValue: { type: String, default: '' },
		pending: { type: String, default: '' },
		describedBy: { type: String, default: null },
		error: { type: String, default: '' },
		cancelling: { type: Boolean, default: false },
	},
	emits: [ 'update:modelValue', 'cancel' ],
	setup() {
		const description = computed( () => __( 'This address is used for admin purposes. If you change this, an email will be sent to your new address to confirm it. <strong>The new address will not become active until confirmed.</strong>', 'default' ) );
		return { description };
	},
	template: `
		<input name="new_admin_email" type="email" id="new_admin_email" :aria-describedby="describedBy" :aria-invalid="error ? 'true' : null" :value="modelValue" class="regular-text ltr" @input="$emit( 'update:modelValue', $event.target.value )">
		<p class="description" id="new-admin-email-description"><Interpolate :text="description" :tags="{ strong: {} }" /></p>
		<Notice v-if="pending" type="info" class="wp-admin-pending-email">
			<p><Interpolate :text="$__( 'There is a pending change of the administration email to %s.', 'default' )" :args="[ { tag: 'code', text: pending } ]" /> <button type="button" class="button-link" :disabled="cancelling" @click="$emit( 'cancel' )">{{ $_x( 'Cancel request', 'admin email change', 'default' ) }}</button></p>
		</Notice>
	`,
};
