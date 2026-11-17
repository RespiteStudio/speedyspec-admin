import { fieldProps, useField } from './field.js';

/**
 * <TextField v-model="title" :label="$__( 'Site Title', 'my-plugin' )" />
 *
 * Other attributes (name, required, autocomplete, …) go to the input.
 */
export default {
	name: 'WpAdminTextField',
	inheritAttrs: false,
	props: {
		...fieldProps,
		modelValue: { type: [ String, Number ], default: '' },
		type: { type: String, default: 'text' },
	},
	emits: [ 'update:modelValue' ],
	setup: ( props ) => useField( props ),
	template: `
		<tr v-if="inTable">
			<th scope="row"><label :for="controlId">{{ label }}</label></th>
			<td>
				<input v-bind="$attrs" :id="controlId" :type="type" class="regular-text" :value="modelValue" :disabled="disabled" :aria-describedby="describedBy" @input="$emit( 'update:modelValue', $event.target.value )">
				<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
			</td>
		</tr>
		<div v-else class="wp-admin-field">
			<label :for="controlId">{{ label }}</label>
			<input v-bind="$attrs" :id="controlId" :type="type" class="regular-text" :value="modelValue" :disabled="disabled" :aria-describedby="describedBy" @input="$emit( 'update:modelValue', $event.target.value )">
			<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
		</div>
	`,
};
