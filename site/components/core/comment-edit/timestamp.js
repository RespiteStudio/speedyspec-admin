import { nextTick, ref, watch } from 'vue';
import { __ } from '../../../runtime/text.js';
import Format from '../dashboard-parts/format.js';

/*
 * The date of the Edit Comment form's Save box: "Submitted on:" with the comment's date, its Edit
 * link and touch_time()'s fields (`#timestampdiv`), with what comment.js does with them
 * (comment.js:30-96).
 */

const PARTS = [ 'aa', 'mm', 'jj', 'hh', 'mn' ];

/**
 * Whether the parts make a real date, as comment.js checks them on OK: a JS Date of the year,
 * month, day, hour and minute must give back the same year, month, day and minute. Pure.
 *
 * @param {{aa: string, mm: string, jj: string, hh: string, mn: string}} parts The fields.
 * @return {boolean} Whether the date is valid.
 */
export function validDate( { aa, mm, jj, hh, mn } ) {
	const date = new Date( aa, mm - 1, jj, hh, mn );
	// comment.js compares with `!=`: the field's text read as a number.
	return date.getFullYear() === Number( aa ) && 1 + date.getMonth() === Number( mm ) && date.getDate() === Number( jj ) && date.getMinutes() === Number( mn );
}

/**
 * The date as comment.js shows it after OK: "%1$s %2$s, %3$s at %4$s:%5$s" with the month's
 * `data-text`, the day as a number, the year, and the hour and minute in two digits. Pure.
 *
 * @param {object}   parts  The fields.
 * @param {object[]} months The month choices (`value`, `text`).
 * @param {string}   [format] The translated format.
 * @return {string} The text.
 */
export function dateDisplay( parts, months, format = __( '%1$s %2$s, %3$s at %4$s:%5$s', 'default' ) ) {
	const month = ( Array.isArray( months ) ? months : [] ).find( ( choice ) => choice?.value === String( parts.mm ) );
	// As comment.js: String.prototype.replace() of each placeholder, once.
	const values = [ month?.text, Number.parseInt( parts.jj, 10 ), parts.aa, ( '00' + parts.hh ).slice( -2 ), ( '00' + parts.mn ).slice( -2 ) ];
	return values.reduce( ( text, value, index ) => text.replace( '%' + ( index + 1 ) + '$s', () => String( value ) ), String( format ) );
}

/**
 * The timestamp part of the Save box. `date` is the data's `date`; `modelValue` the fields'
 * values (`aa`, `mm`, `jj`, `hh`, `mn`, `ss`), which the page sends with the save; it emits
 * `update:modelValue` with the new values as they change.
 *
 * Edit opens the fields (focus on the first); OK checks the date (validDate()), marks the fields
 * `form-invalid` when it is not one and stays open, or shows the date (dateDisplay()) and closes;
 * Cancel puts back the date as loaded (`date.hidden`, the classic `hidden_` fields) and its
 * display, and closes. Focus goes back to Edit when it closes.
 */
export default {
	name: 'CommentEditTimestamp',
	components: { Format },
	props: {
		date: { type: Object, required: true },
		modelValue: { type: Object, required: true },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		const open = ref( false );
		const invalid = ref( false );
		const stamp = ref( null ); // Null: the display as loaded.
		const editLink = ref( null );
		const month = ref( null );

		// The newest values: a change is applied on those emitted before it, even before they come back as props.
		let latest = { ...props.modelValue };
		watch( () => props.modelValue, ( value ) => {
			latest = { ...value };
		} );
		const update = ( value ) => {
			latest = value;
			emit( 'update:modelValue', value );
		};
		const set = ( key, value ) => update( { ...latest, [ key ]: String( value ?? '' ) } );
		const close = () => {
			open.value = false;
			nextTick( () => editLink.value?.focus?.() );
		};
		return {
			open, invalid, stamp, editLink, month,
			months: () => ( Array.isArray( props.date.months ) ? props.date.months : [] ),
			hidden: ( key ) => String( props.date.hidden?.[ key ] ?? '' ),
			onField: ( key ) => ( event ) => set( key, event?.target?.value ),
			edit() {
				if ( ! open.value ) {
					open.value = true;
					nextTick( () => month.value?.focus?.() );
				}
			},
			ok() {
				if ( ! validDate( latest ) ) {
					invalid.value = true;
					return;
				}
				invalid.value = false;
				stamp.value = dateDisplay( latest, props.date.months );
				close();
			},
			cancel() {
				const restored = { ...latest };
				for ( const key of PARTS ) {
					restored[ key ] = String( props.date.hidden?.[ key ] ?? latest[ key ] ?? '' );
				}
				update( restored );
				stamp.value = null;
				close();
			},
		};
	},
	template: `
		<div class="misc-pub-section curtime misc-pub-curtime">
			<span id="timestamp"><Format v-if="stamp === null" :text="$__( 'Submitted on: %s', 'default' )"><template #arg1><b>{{ date.submitted }}</b></template></Format><template v-else>{{ $__( 'Submitted on:', 'default' ) }} <b>{{ stamp }}</b> </template></span>
			{{ ' ' }}<a ref="editLink" href="#edit_timestamp" class="edit-timestamp hide-if-no-js" :style="{ display: open ? 'none' : '' }" @click.prevent="edit"><span aria-hidden="true">{{ $__( 'Edit', 'default' ) }}</span> <span class="screen-reader-text">{{ $__( 'Edit date and time', 'default' ) }}</span></a>
			<fieldset id="timestampdiv" class="hide-if-js" :style="{ display: open ? 'block' : 'none' }">
				<legend class="screen-reader-text">{{ $__( 'Date and time', 'default' ) }}</legend>
				<div :class="[ 'timestamp-wrap', { 'form-invalid': invalid } ]"><Format :text="$__( '%1$s %2$s, %3$s at %4$s:%5$s', 'default' )">
					<template #arg1><label><span class="screen-reader-text">{{ $__( 'Month', 'default' ) }}</span><select ref="month" class="form-required" id="mm" name="mm" :value="modelValue.mm" @change="onField( 'mm' )( $event )"><option v-for="choice in months()" :key="choice.value" :value="choice.value" :data-text="choice.text" :selected="choice.value === modelValue.mm">{{ choice.label }}</option></select></label></template>
					<template #arg2><label><span class="screen-reader-text">{{ $__( 'Day', 'default' ) }}</span><input type="text" id="jj" name="jj" :value="modelValue.jj" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="onField( 'jj' )( $event )" /></label></template>
					<template #arg3><label><span class="screen-reader-text">{{ $__( 'Year', 'default' ) }}</span><input type="text" id="aa" name="aa" :value="modelValue.aa" size="4" maxlength="4" autocomplete="off" class="form-required" inputmode="numeric" @input="onField( 'aa' )( $event )" /></label></template>
					<template #arg4><label><span class="screen-reader-text">{{ $__( 'Hour', 'default' ) }}</span><input type="text" id="hh" name="hh" :value="modelValue.hh" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="onField( 'hh' )( $event )" /></label></template>
					<template #arg5><label><span class="screen-reader-text">{{ $__( 'Minute', 'default' ) }}</span><input type="text" id="mn" name="mn" :value="modelValue.mn" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="onField( 'mn' )( $event )" /></label></template>
				</Format></div><input type="hidden" id="ss" name="ss" :value="modelValue.ss" />
				<input v-for="key in [ 'mm', 'jj', 'aa', 'hh', 'mn' ]" :key="key" type="hidden" :id="'hidden_' + key" :name="'hidden_' + key" :value="hidden( key )" />
				<p>
					<a href="#edit_timestamp" class="save-timestamp hide-if-no-js button" @click.prevent="ok">{{ $__( 'OK', 'default' ) }}</a>
					{{ ' ' }}<a href="#edit_timestamp" class="cancel-timestamp hide-if-no-js button-cancel" @click.prevent="cancel">{{ $__( 'Cancel', 'default' ) }}</a>
				</p>
			</fieldset>
		</div>
	`,
};
