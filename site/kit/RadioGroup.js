import { fieldProps, useField } from './field.js';

/**
 * <RadioGroup v-model="mode" :label="…" :options="[ { value: 'a', label: … } ]" />
 *
 * A fieldset whose legend is the label; `id` names the group and prefixes the ids of the radios.
 */
export default {
	name: 'WpAdminRadioGroup',
	props: {
		...fieldProps,
		modelValue: { type: [ String, Number, Boolean ], default: null },
		options: { type: Array, default: () => [] },
	},
	emits: [ 'update:modelValue' ],
	setup: ( props ) => useField( props ),
	template: `
		<tr v-if="inTable">
			<th scope="row">{{ label }}</th>
			<td>
				<fieldset :id="controlId" :aria-describedby="describedBy">
					<legend class="screen-reader-text">{{ label }}</legend>
					<template v-for="( option, index ) in options" :key="String( option.value )">
						<label :for="controlId + '-' + index"><input :id="controlId + '-' + index" type="radio" :name="controlId" :value="String( option.value )" :checked="option.value === modelValue" :disabled="disabled || option.disabled" @change="$emit( 'update:modelValue', option.value )"> {{ option.label }}</label><br>
					</template>
					<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
				</fieldset>
			</td>
		</tr>
		<fieldset v-else :id="controlId" class="wp-admin-field wp-admin-field--radio" :aria-describedby="describedBy">
			<legend>{{ label }}</legend>
			<template v-for="( option, index ) in options" :key="String( option.value )">
				<label :for="controlId + '-' + index"><input :id="controlId + '-' + index" type="radio" :name="controlId" :value="String( option.value )" :checked="option.value === modelValue" :disabled="disabled || option.disabled" @change="$emit( 'update:modelValue', option.value )"> {{ option.label }}</label><br>
			</template>
			<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
		</fieldset>
	`,
};
