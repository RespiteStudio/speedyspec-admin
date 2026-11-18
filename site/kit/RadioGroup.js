import { fieldProps, useField } from './field.js';

/**
 * <RadioGroup v-model="mode" :label="…" :options="[ { value: 'a', label: … } ]" />
 *
 * A fieldset whose legend is the label; `id` prefixes the ids of the radios and `name`
 * (default: the id) names them. Other attributes go to the fieldset.
 */
export default {
	name: 'WpAdminRadioGroup',
	inheritAttrs: false,
	props: {
		...fieldProps,
		modelValue: { type: [ String, Number, Boolean ], default: null },
		options: { type: Array, default: () => [] },
		name: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	setup( props ) {
		const field = useField( props );
		return { ...field, groupName: () => props.name || field.controlId.value };
	},
	template: `
		<tr v-if="inTable">
			<th scope="row">{{ label }}</th>
			<td>
				<fieldset v-bind="$attrs" :id="controlId" :aria-describedby="describedBy">
					<legend class="screen-reader-text">{{ label }}</legend>
					<template v-for="( option, index ) in options" :key="index">
						<label :for="controlId + '-' + index"><input :id="controlId + '-' + index" type="radio" :name="groupName()" :value="String( option.value )" :checked="option.value === modelValue" :disabled="disabled || option.disabled" @change="$emit( 'update:modelValue', option.value )"> {{ option.label }}</label><br>
					</template>
					<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
				</fieldset>
			</td>
		</tr>
		<fieldset v-else v-bind="$attrs" :id="controlId" class="wp-admin-field wp-admin-field--radio" :aria-describedby="describedBy">
			<legend>{{ label }}</legend>
			<template v-for="( option, index ) in options" :key="index">
				<label :for="controlId + '-' + index"><input :id="controlId + '-' + index" type="radio" :name="groupName()" :value="String( option.value )" :checked="option.value === modelValue" :disabled="disabled || option.disabled" @change="$emit( 'update:modelValue', option.value )"> {{ option.label }}</label><br>
			</template>
			<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
		</fieldset>
	`,
};
