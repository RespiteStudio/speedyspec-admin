import { computed, inject, useId } from 'vue';

/** Set by FormTable: form controls inside it render as table rows. */
export const IN_FORM_TABLE = Symbol( 'wp-admin-kit-form-table' );

/** Shared props of the kit's form controls. */
export const fieldProps = {
	label: { type: String, required: true },
	description: { type: String, default: '' },
	disabled: { type: Boolean, default: false },
	id: { type: String, default: '' },
};

/** Control id (generated when none is given), description id and table layout of a form control. */
export function useField( props ) {
	const generated = 'wp-admin-kit-' + useId().replace( /[^A-Za-z0-9_-]/g, '-' );
	const inTable = inject( IN_FORM_TABLE, false );
	const controlId = computed( () => props.id || generated );
	const descriptionId = computed( () => controlId.value + '-description' );
	const describedBy = computed( () => ( props.description ? descriptionId.value : null ) );
	return { controlId, descriptionId, describedBy, inTable };
}
