const VARIANTS = { primary: 'button-primary', secondary: 'button-secondary', link: 'button-link' };

/**
 * <Button variant="primary" @click="save">{{ $__( 'Save Changes', 'my-plugin' ) }}</Button>
 *
 * Classic `button` markup; the text comes in the default slot.
 */
export default {
	name: 'WpAdminButton',
	props: {
		variant: { type: String, default: 'secondary' },
		type: { type: String, default: 'button' },
		disabled: { type: Boolean, default: false },
		busy: { type: Boolean, default: false },
	},
	setup: ( props ) => ( { variantClass: () => VARIANTS[ props.variant ] ?? VARIANTS.secondary } ),
	template: `
		<button :type="type" :class="[ 'button', variantClass(), { 'is-busy': busy } ]" :disabled="disabled" :aria-busy="busy ? 'true' : null"><slot /></button>
	`,
};
