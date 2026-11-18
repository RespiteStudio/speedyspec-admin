import { ref, computed, onBeforeUnmount } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../../runtime/text.js';
import Interpolate from '../../../kit/Interpolate.js';
import Spinner from '../../../kit/Spinner.js';

// As the classic screen: the preview of a custom format is asked for 500 ms after the last keystroke.
export const PREVIEW_DELAY = 500;
const PREVIEW_ROUTE = 'wp-admin/v1/settings/general/preview';
// The value of the Custom radio, as the classic form posts it.
const CUSTOM = '\\c\\u\\s\\t\\o\\m';
const DOCUMENTATION = 'https://wordpress.org/documentation/article/customize-date-and-time-format/';

/**
 * The Date Format or Time Format choices of General Settings (part of the page's
 * implementation): the offered formats as radios with their example, the Custom radio
 * with its text field, and the "Preview:" line.
 *
 * As on the classic screen: choosing a format puts it in the custom field and shows its
 * example; clicking or typing in the custom field selects Custom; while typing, the
 * preview is asked for (debounced) from the preview endpoint, which replaces the
 * classic Ajax action, with a spinner while it is pending. `modelValue` is the format
 * that will be saved.
 */
export default {
	name: 'FormatChoices',
	components: { Interpolate, Spinner },
	props: {
		kind: { type: String, required: true, validator: ( value ) => value === 'date' || value === 'time' },
		modelValue: { type: String, default: '' },
		choices: { type: Array, default: () => [] },
		// The current value formatted, as the server previews it.
		preview: { type: String, default: '' },
		error: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		const custom = ref( ! props.choices.some( ( choice ) => choice.value === props.modelValue ) );
		const example = ref( props.preview );
		const pending = ref( false );
		let timer = null;
		let ticket = 0;

		const name = computed( () => props.kind + '_format' );
		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const documentation = computed( () => __( '<a href="https://wordpress.org/documentation/article/customize-date-and-time-format/">Documentation on date and time formatting</a>.', 'default' ) );

		function choose( choice ) {
			clearTimeout( timer );
			ticket++;
			pending.value = false;
			custom.value = false;
			example.value = choice.example;
			emit( 'update:modelValue', choice.value );
		}

		// Not written in the template: an `&` in an attribute value makes the compiler decode entities through the DOM.
		const isChosen = ( choice ) => ! custom.value && props.modelValue === choice.value;

		function selectCustom() {
			custom.value = true;
		}

		async function fetchPreview( format ) {
			const mine = ++ticket;
			pending.value = true;
			try {
				const answer = await api.get( PREVIEW_ROUTE, { [ name.value ]: format } );
				if ( mine === ticket ) {
					example.value = String( answer?.[ props.kind === 'date' ? 'dateFormat' : 'timeFormat' ] ?? '' );
				}
			} catch {
				// The example stays as it was; saving still works.
			} finally {
				if ( mine === ticket ) {
					pending.value = false;
				}
			}
		}

		function typed( event ) {
			const format = event.target.value;
			custom.value = true;
			emit( 'update:modelValue', format );
			clearTimeout( timer );
			timer = setTimeout( () => {
				if ( format ) {
					fetchPreview( format );
				}
			}, PREVIEW_DELAY );
		}

		onBeforeUnmount( () => {
			clearTimeout( timer );
			ticket++;
		} );

		return { custom, example, pending, name, documentation, isChosen, choose, selectCustom, typed, CUSTOM, DOCUMENTATION };
	},
	template: `
		<fieldset>
			<legend class="screen-reader-text"><span>{{ kind === 'date' ? $__( 'Date Format', 'default' ) : $__( 'Time Format', 'default' ) }}</span></legend>
			<template v-for="choice in choices" :key="choice.value">
				<label><input type="radio" :name="name" :value="choice.value" :checked="isChosen( choice )" @change="choose( choice )"> <span class="date-time-text format-i18n">{{ choice.example }}</span><code>{{ choice.value }}</code></label><br>
			</template>
			<label><input type="radio" :name="name" :id="name + '_custom_radio'" :value="CUSTOM" :checked="custom" @change="selectCustom"> <span class="date-time-text date-time-custom-text">{{ $__( 'Custom:', 'default' ) }}<span class="screen-reader-text"> {{ kind === 'date' ? $__( 'enter a custom date format in the following field', 'default' ) : $__( 'enter a custom time format in the following field', 'default' ) }}</span></span></label>
			<label :for="name + '_custom'" class="screen-reader-text">{{ kind === 'date' ? $__( 'Custom date format:', 'default' ) : $__( 'Custom time format:', 'default' ) }}</label>
			<input type="text" :name="name + '_custom'" :id="name + '_custom'" :value="modelValue" class="small-text" :aria-invalid="error ? 'true' : null" :aria-describedby="error ? name + '-error' : null" @click="selectCustom" @input="typed">
			<br>
			<p><strong>{{ $__( 'Preview:', 'default' ) }}</strong> <span class="example">{{ example }}</span><Spinner v-if="pending" /></p>
			<p v-if="kind === 'time'" class="date-time-doc"><Interpolate :text="documentation" :tags="{ a: { href: DOCUMENTATION } }" /></p>
		</fieldset>
	`,
};
