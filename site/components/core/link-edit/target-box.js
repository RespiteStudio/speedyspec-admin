import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';

/**
 * The Target box of the link form (link_target_meta_box()): the three radios `link_target`, the
 * one WordPress checks (none on Add: `modelValue` null). v-model: the value checked, or null.
 */
export default {
	name: 'LinkTargetBox',
	components: { InlineMarkup },
	props: {
		modelValue: { type: String, default: null },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		return {
			labels: computed( () => ( {
				blank: __( '<code>_blank</code> &mdash; new window or tab.', 'default' ),
				top: __( '<code>_top</code> &mdash; current window or tab, with no frames.', 'default' ),
				none: __( '<code>_none</code> &mdash; same window or tab.', 'default' ),
			} ) ),
			choose: ( value ) => emit( 'update:modelValue', value ),
		};
	},
	template: `
		<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Target', 'default' ) }}</span></legend>
		<p><label for="link_target_blank" class="selectit">
		<input id="link_target_blank" type="radio" name="link_target" value="_blank" :checked="modelValue === '_blank'" @change="choose( '_blank' )" />
		{{ ' ' }}<InlineMarkup :html="labels.blank" /></label></p>
		<p><label for="link_target_top" class="selectit">
		<input id="link_target_top" type="radio" name="link_target" value="_top" :checked="modelValue === '_top'" @change="choose( '_top' )" />
		{{ ' ' }}<InlineMarkup :html="labels.top" /></label></p>
		<p><label for="link_target_none" class="selectit">
		<input id="link_target_none" type="radio" name="link_target" value="" :checked="modelValue === ''" @change="choose( '' )" />
		{{ ' ' }}<InlineMarkup :html="labels.none" /></label></p>
		</fieldset>
		<p>{{ $__( 'Choose the target frame for your link.', 'default' ) }}</p>
	`,
};
