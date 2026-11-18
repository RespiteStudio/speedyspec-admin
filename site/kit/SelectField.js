import { fieldProps, useField } from './field.js';

/**
 * <SelectField v-model="day" :label="…" :options="[ { value: 0, label: … } ]" />
 *
 * Emits the option's own value (not its string form).
 */
export default {
	name: 'WpAdminSelectField',
	inheritAttrs: false,
	props: {
		...fieldProps,
		modelValue: { type: [ String, Number ], default: '' },
		options: { type: Array, default: () => [] },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		const change = ( event ) => {
			const chosen = props.options.find( ( option ) => String( option.value ) === event.target.value );
			emit( 'update:modelValue', chosen ? chosen.value : event.target.value );
		};
		return { ...useField( props ), change };
	},
	template: `
		<tr v-if="inTable">
			<th scope="row"><label :for="controlId">{{ label }}</label></th>
			<td>
				<select v-bind="$attrs" :id="controlId" :value="modelValue" :disabled="disabled" :aria-describedby="describedBy" @change="change">
					<option v-for="option in options" :key="String( option.value )" :value="String( option.value )" :disabled="option.disabled" :selected="String( option.value ) === String( modelValue )">{{ option.label }}</option>
				</select>
				<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
			</td>
		</tr>
		<div v-else class="wp-admin-field">
			<label :for="controlId">{{ label }}</label>
			<select v-bind="$attrs" :id="controlId" :value="modelValue" :disabled="disabled" :aria-describedby="describedBy" @change="change">
				<option v-for="option in options" :key="String( option.value )" :value="String( option.value )" :disabled="option.disabled" :selected="String( option.value ) === String( modelValue )">{{ option.label }}</option>
			</select>
			<p v-if="description" :id="descriptionId" class="description">{{ description }}</p>
		</div>
	`,
};
