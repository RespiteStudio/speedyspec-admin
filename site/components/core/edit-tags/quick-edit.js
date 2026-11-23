import { computed, nextTick, reactive, ref, watch } from 'vue';
import Contracted from '../../../runtime/Contracted.js';

/*
 * Quick Edit of a terms list row (inline-edit-tax.js edit()): core/inline-edit in its single
 * layout, as WP_Terms_List_Table::inline_edit() prints it (one fieldset with Name and Slug, the
 * plugins' `quick_edit_custom_box` output, the save button named by the taxonomy's
 * `update_item`), filled from the row's Quick Edit values (`row.inline`, text) and with the name
 * focused when it opens. With a plugin box, the `left` slot ends with the note that this screen
 * does not save the fields plugins add, as the add and edit forms say it.
 */

const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/**
 * Props: `row` (the row's data), `inlineEdit` (the page data's: `saveLabel`, `customBoxes`),
 * `colspan`, `saving`, `error`. Emits `save( fields )` (every control of the row, as the classic
 * form serializes them) and `cancel`.
 */
export default {
	name: 'EditTagsQuickEdit',
	components: { Contracted },
	props: {
		row: { type: Object, required: true },
		inlineEdit: { type: Object, required: true },
		colspan: { type: Number, default: 1 },
		saving: { type: Boolean, default: false },
		error: { type: String, default: '' },
	},
	emits: [ 'save', 'cancel' ],
	setup( props, { emit } ) {
		const v = reactive( { name: text( props.row?.inline?.name ), slug: text( props.row?.inline?.slug ) } );
		const name = ref( null );
		// The form shows once its part is ready: the name takes the focus then, once, as edit() focuses `.ptitle`.
		const stop = watch( name, ( element ) => {
			if ( element ) {
				stop();
				nextTick( () => element.focus?.() );
			}
		}, { immediate: true, flush: 'post' } );
		// The plugins' boxes add fields that the save does not send (the recorded gap), which a note says.
		const pluginFields = computed( () => ( Array.isArray( props.inlineEdit?.customBoxes ) ? props.inlineEdit.customBoxes : [] ).some( ( box ) => typeof box?.html === 'string' && box.html !== '' ) );
		return {
			v, name, pluginFields,
			set: ( key ) => ( event ) => {
				v[ key ] = text( event?.target?.value );
			},
			onSave: ( fields ) => emit( 'save', fields ),
			onCancel: () => emit( 'cancel' ),
		};
	},
	template: `
		<Contracted id="core/inline-edit" kind="quick" layout="single" :row-id="'edit-' + row.id" :classes="[ 'inline-edit-row' ]" :colspan="colspan" :saving="saving" :error="error" :custom-boxes="inlineEdit.customBoxes ?? []" :save-label="inlineEdit.saveLabel ?? null" @save="onSave" @cancel="onCancel">
			<template #left>
				<label><span class="title">{{ $_x( 'Name', 'term name', 'default' ) }}</span><span class="input-text-wrap"><input ref="name" type="text" name="name" class="ptitle" :value="v.name" @input="set( 'name' )( $event )" /></span></label>
				<label><span class="title">{{ $__( 'Slug', 'default' ) }}</span><span class="input-text-wrap"><input type="text" name="slug" class="ptitle" :value="v.slug" @input="set( 'slug' )( $event )" /></span></label>
				<p v-if="pluginFields" class="description wp-admin-edit-tags-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>
			</template>
		</Contracted>
	`,
};
