import Interpolate from '../../kit/Interpolate.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { SlotOutlet } from '../../runtime/slots.js';

/**
 * Default implementation of core/settings-field: one row of the classic settings table.
 * The label is a `<label for>` of the control, or text for a group (which has its own
 * legend); the error follows the control, with the id `{id}-error`, shown through the kit's
 * InlineMarkup when it comes with `errorMarkup`.
 */
export default {
	name: 'SettingsField',
	components: { Interpolate, InlineMarkup, SlotOutlet },
	props: {
		id: { type: String, required: true },
		label: { type: String, required: true },
		description: { type: String, default: '' },
		locked: { type: Boolean, default: false },
		error: { type: String, default: '' },
		errorMarkup: { type: String, default: '' },
		group: { type: Boolean, default: false },
		icon: { type: String, default: '' },
	},
	template: `
		<tr :class="{ 'is-locked': locked, 'has-error': error }" :data-field="id">
			<th scope="row">
				<template v-if="group">{{ label }}</template>
				<label v-else :for="id">{{ label }}<span v-if="icon" :class="[ 'dashicons', icon ]" aria-hidden="true"></span></label>
			</th>
			<td>
				<slot />
				<p v-if="error" :id="id + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="errorMarkup" :html="errorMarkup" /><template v-else>{{ error }}</template></p>
				<p v-if="description" :id="id + '-description'" class="description"><Interpolate :text="description" /></p>
				<slot name="after-control" />
				<SlotOutlet name="after-control" :context="{ id }" />
			</td>
		</tr>
	`,
};
