import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import InlineMarkup from '../../../kit/InlineMarkup.js';

/*
 * The warning dialog of the file editors (`#file-editor-warning`), as the classic screens print it
 * until the user dismisses it and theme-plugin-editor.js showWarning() shows it: on load, the body
 * `modal-open`, the focus on Go back, Tab kept between Go back and I understand, the message
 * spoken. WordPress gives the heading, the paragraphs (inline markup), the labels and Go back's
 * address (`href`, resolved by the page); the page decides what Go back and I understand do
 * (`back`, `dismiss`).
 */

// theme-plugin-editor.js speaks the message after a short delay, which some screen readers need.
const SPEAK_DELAY = 1000;

export default {
	name: 'FileEditorWarning',
	components: { InlineMarkup },
	props: {
		warning: { type: Object, required: true },
		href: { type: String, default: '' },
		speak: { type: Function, default: null },
	},
	emits: [ 'back', 'dismiss' ],
	setup( props ) {
		const root = ref( null );
		const back = ref( null );
		const dismissButton = ref( null );
		let timer = null;

		function constrainTabbing( event ) {
			if ( event.key !== 'Tab' ) {
				return;
			}
			const first = back.value;
			const last = dismissButton.value;
			if ( event.target === last && ! event.shiftKey ) {
				first?.focus();
				event.preventDefault();
			} else if ( event.target === first && event.shiftKey ) {
				last?.focus();
				event.preventDefault();
			}
		}

		onMounted( async () => {
			globalThis.document?.body?.classList?.add( 'modal-open' );
			await nextTick();
			back.value?.focus();
			const message = ( root.value?.querySelector( '.file-editor-warning-message' )?.textContent ?? '' ).replace( /\s+/g, ' ' ).trim();
			if ( props.speak && message !== '' ) {
				timer = globalThis.setTimeout( () => props.speak( message, 'assertive' ), SPEAK_DELAY );
			}
		} );
		onBeforeUnmount( () => {
			globalThis.clearTimeout( timer );
			globalThis.document?.body?.classList?.remove( 'modal-open' );
		} );

		return { root, back, dismissButton, constrainTabbing };
	},
	template: `
		<div id="file-editor-warning" ref="root" class="notification-dialog-wrap file-editor-warning hide-if-no-js">
			<div class="notification-dialog-background"></div>
			<div class="notification-dialog" role="dialog" aria-modal="true" aria-labelledby="file-editor-warning-heading">
				<div class="file-editor-warning-content">
					<div class="file-editor-warning-message">
						<h1 id="file-editor-warning-heading">{{ warning.heading }}</h1>
						<p v-for="( paragraph, index ) in warning.paragraphs ?? []" :key="index"><InlineMarkup :html="paragraph" /></p>
					</div>
					<p>
						<a ref="back" class="button file-editor-warning-go-back" :href="href" @click.prevent="$emit( 'back' )" @keydown="constrainTabbing">{{ warning.goBack?.label }}</a>
						<button ref="dismissButton" type="button" class="file-editor-warning-dismiss button button-primary" @click="$emit( 'dismiss' )" @keydown="constrainTabbing">{{ warning.dismiss?.label }}</button>
					</p>
				</div>
			</div>
		</div>
	`,
};
