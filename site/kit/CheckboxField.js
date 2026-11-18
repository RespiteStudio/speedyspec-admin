import { fieldProps, useField } from './field.js';

/** <CheckboxField v-model="open" :label="…" /> */
export default {
	name: 'WpAdminCheckboxField',
	inheritAttrs: false,
	props: {
		...fieldProps,
		modelValue: { type: Boolean, default: false },
	},
	emits: [ 'update:modelValue' ],
	setup: ( props ) => useField( props ),
	template: `
		<tr v-if="inTable">
			<th scope="row"><label :for="controlId">{{ label }}</label></th>
			<td>
				<input v-bind="$attrs" :id="controlId" type="checkbox" :checked="modelValue" :disabled="disabled" :aria-describedby="describedBy" @change="$emit( 'update:modelValue', $event.target.checked )">
				<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
			</td>
		</tr>
		<div v-else class="wp-admin-field wp-admin-field--checkbox">
			<input v-bind="$attrs" :id="controlId" type="checkbox" :checked="modelValue" :disabled="disabled" :aria-describedby="describedBy" @change="$emit( 'update:modelValue', $event.target.checked )">
			<label :for="controlId">{{ label }}</label>
			<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
		</div>
	`,
};
