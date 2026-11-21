import { computed, inject, ref, watch } from 'vue';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { classicFormFields } from './list-table-parts/form-fields.js';

const CONTROLS = 'input, select, textarea';
const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const isCancel = ( target ) => Boolean( target?.classList?.contains?.( 'cancel' ) );

/**
 * Default implementation of core/inline-edit: the classic Quick Edit / Bulk Edit row
 * (WP_Posts_List_Table::inline_edit()), with inline-edit-post.js's keys:
 *
 * - Escape (keyup on the row) cancels, in both forms.
 * - Enter (keydown in the cell) saves Quick Edit, unless it is on Cancel, as
 *   inline-edit-post.js; a control that handles Enter itself (the tags suggestion list) calls
 *   `preventDefault()` and is left alone. Bulk Edit has no Enter key, as classic.
 * - Update saves; Bulk Edit's Update is the classic `input#bulk_edit[type=submit]`, which never
 *   submits the page's form.
 *
 * `layout="single"` (1.1.0) is the Terms form: one fieldset with the legend and the `left` slot,
 * then the boxes and the buttons. `saveLabel` is the save button's text.
 *
 * A plugin box whose callback failed (`error: true`) shows "This box could not be displayed." in
 * `p.wp-admin-legacy-failure[role=alert]`, as the site's other captured boxes do.
 *
 * While `saving`, the spinner is active (Bulk Edit, which classic submits as a page load, shows
 * one only then) and the buttons are disabled. An `error` shows in the form's notice and is spoken
 * (the frame's speak(), else wp.a11y.speak()).
 *
 * `save` carries the fields of every control in the row, read from the DOM as
 * inline-edit-post.js serializes them (`inject( 'inlineEditControls' )` replaces the reading:
 * tests). The page sends the fields the route takes.
 */
export default {
	name: 'InlineEdit',
	components: { LegacyHtml },
	props: {
		kind: { type: String, required: true },
		legend: { type: String, default: null },
		classes: { type: Array, default: () => [] },
		colspan: { type: Number, default: 1 },
		saving: { type: Boolean, default: false },
		error: { type: String, default: '' },
		customBoxes: { type: Array, default: () => [] },
		rowId: { type: String, default: null },
		layout: { type: String, default: 'columns' },
		saveLabel: { type: String, default: null },
	},
	emits: [ 'save', 'cancel' ],
	setup( props, { emit, slots } ) {
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const readControls = inject( 'inlineEditControls', ( row ) => ( row?.querySelectorAll ? [ ...row.querySelectorAll( CONTROLS ) ] : [] ) );
		const row = ref( null );
		const single = computed( () => props.layout === 'single' );
		const columns = computed( () => ! single.value );
		// A function, not a computed: slots are not reactive.
		const centered = () => columns.value && Boolean( slots.center );
		const bulk = computed( () => props.kind === 'bulk' );
		const rowClasses = computed( () => [ ...list( props.classes ), 'inline-editor' ] );
		const legendId = computed( () => ( bulk.value ? 'bulk' : 'quick' ) + '-edit-legend' );
		// A box whose callback failed shows the site's failure message, as the other captured boxes do.
		const boxes = computed( () => list( props.customBoxes ).filter( ( box ) => box?.error === true || ( typeof box?.html === 'string' && box.html !== '' ) ) );

		watch( () => props.error, ( message ) => {
			if ( typeof message === 'string' && message !== '' ) {
				speak( message );
			}
		}, { immediate: true } );

		function save( event ) {
			event?.preventDefault?.();
			if ( props.saving ) {
				return;
			}
			emit( 'save', classicFormFields( readControls( row.value ) ) );
		}
		function cancel() {
			emit( 'cancel' );
		}
		function onKeyup( event ) {
			if ( event?.key === 'Escape' && ! event.isComposing ) {
				cancel();
			}
		}
		function onKeydown( event ) {
			if ( bulk.value || event?.key !== 'Enter' || event.isComposing || event.defaultPrevented || isCancel( event.target ) ) {
				return;
			}
			save( event );
		}

		return { row, bulk, single, columns, centered, rowClasses, legendId, boxes, save, cancel, onKeyup, onKeydown };
	},
	template: `
		<tr ref="row" :id="rowId" :class="rowClasses" @keyup="onKeyup">
			<td :colspan="String( colspan )" class="colspanchange" @keydown="onKeydown">
				<div class="inline-edit-wrapper" role="region" :aria-labelledby="legendId">
					<fieldset v-if="single">
						<legend class="inline-edit-legend" :id="legendId">{{ legend || $__( 'Quick Edit', 'default' ) }}</legend>
						<div class="inline-edit-col"><slot name="left" /></div>
					</fieldset>
					<fieldset v-else class="inline-edit-col-left">
						<legend class="inline-edit-legend" :id="legendId">{{ legend || ( bulk ? $__( 'Bulk Edit', 'default' ) : $__( 'Quick Edit', 'default' ) ) }}</legend>
						<div class="inline-edit-col"><slot name="left" /></div>
					</fieldset>
					<fieldset v-if="centered()" class="inline-edit-col-center inline-edit-categories">
						<div class="inline-edit-col"><slot name="center" /></div>
					</fieldset>
					<fieldset v-if="columns" class="inline-edit-col-right">
						<div class="inline-edit-col"><slot name="right" /></div>
					</fieldset>
					<template v-for="box in boxes" :key="box.column">
						<p v-if="box.error === true" class="wp-admin-legacy-failure" role="alert">{{ $__( 'This box could not be displayed.', 'wp-admin-site' ) }}</p>
						<LegacyHtml v-else :html="box.html" />
					</template>
					<div class="submit inline-edit-save">
						<input v-if="bulk" type="submit" name="bulk_edit" id="bulk_edit" class="button button-primary" :value="$__( 'Update', 'default' )" :disabled="saving" @click="save" />
						<button v-else type="button" class="button button-primary save" :disabled="saving" @click="save">{{ saveLabel || $__( 'Update', 'default' ) }}</button>
						<button type="button" class="button cancel" :disabled="saving" @click="cancel">{{ $__( 'Cancel', 'default' ) }}</button>
						<span v-if="! bulk || saving" :class="[ 'spinner', { 'is-active': saving } ]"></span>
						<div :class="[ 'notice', 'notice-error', 'notice-alt', 'inline', { hidden: ! error } ]"><p class="error">{{ error }}</p></div>
					</div>
				</div>
			</td>
		</tr>
	`,
};
