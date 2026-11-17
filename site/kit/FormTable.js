import { provide } from 'vue';
import { IN_FORM_TABLE } from './field.js';

/**
 * <FormTable><TextField … /><CheckboxField … /></FormTable>
 *
 * The classic settings table; the kit's form controls inside it render as rows.
 */
export default {
	name: 'WpAdminFormTable',
	setup() {
		provide( IN_FORM_TABLE, true );
	},
	template: `
		<table class="form-table" role="presentation"><tbody><slot /></tbody></table>
	`,
};
