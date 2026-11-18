import { SlotOutlet } from '../../runtime/slots.js';

/**
 * Default implementation of core/form-table: the classic settings table, which core's
 * admin styles (forms.css) lay out.
 */
export default {
	name: 'FormTable',
	components: { SlotOutlet },
	template: `
		<table class="form-table" role="presentation">
			<tbody>
				<SlotOutlet name="before-rows" />
				<slot />
				<SlotOutlet name="after-rows" />
			</tbody>
		</table>
	`,
};
