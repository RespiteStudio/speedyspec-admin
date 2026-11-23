import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { __ } from '../../../runtime/text.js';

// How long "Copied!" shows after a copy, as user-profile.js's clipboard handler.
export const COPIED_MS = 3000;

/**
 * The one-time notice of a new application password, as Authorize Application and the
 * Application Passwords section of Profile and Edit User show it (`tmpl-new-application-password`
 * and `authorize-application.php`): "Your new password for <name> is:", the password in a
 * read-only field, Copy (navigator.clipboard; "Copied!" shows for COPIED_MS and the copy is
 * spoken), and the save warning; with `dismissible`, a Dismiss button that emits `dismiss`.
 *
 * The notice is an alert that can take the focus: the page calls the exposed `focus()` once it
 * shows. The name and the password are text. The password lives only in the prop: the part
 * stores it nowhere else.
 *
 * Props: `name`, `password`, `classes` (added to `notice notice-success`), `dismissible`.
 */
export default {
	name: 'NewPasswordNotice',
	props: {
		name: { type: String, required: true },
		password: { type: String, required: true },
		classes: { type: String, default: '' },
		dismissible: { type: Boolean, default: false },
	},
	emits: [ 'dismiss' ],
	setup( props, { expose } ) {
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const root = ref( null );
		const copied = ref( false );
		let copiedTimer = null;

		watch( () => props.password, () => {
			clearTimeout( copiedTimer );
			copied.value = false;
		} );
		onBeforeUnmount( () => clearTimeout( copiedTimer ) );

		async function copy() {
			try {
				await globalThis.navigator?.clipboard?.writeText?.( props.password );
			} catch ( reason ) {
				console.warn( 'Could not copy the password:', reason );
				return;
			}
			clearTimeout( copiedTimer );
			copied.value = true;
			copiedTimer = setTimeout( () => {
				copied.value = false;
			}, COPIED_MS );
			speak( __( 'Application password has been copied to your clipboard.', 'default' ) );
		}

		expose( { focus: () => root.value?.focus?.() } );

		return {
			root, copied, copy,
			labelParts: computed( () => __( 'Your new password for %s is:', 'default' ).split( '%s' ) ),
		};
	},
	template: `
		<div ref="root" :class="[ 'notice', 'notice-success', classes, { 'is-dismissible': dismissible } ]" role="alert" tabindex="-1">
			<p class="application-password-display">
				<label for="new-application-password-value">{{ labelParts[ 0 ] }}<strong>{{ name }}</strong>{{ labelParts[ 1 ] ?? '' }}</label>
				{{ ' ' }}<input id="new-application-password-value" type="text" class="code" readonly="readonly" :value="password" />
				<button type="button" class="button copy-button" @click="copy">{{ $__( 'Copy', 'default' ) }}</button>
				<span class="success" :class="{ hidden: ! copied }" aria-hidden="true">{{ $__( 'Copied!', 'default' ) }}</span>
			</p>
			<p>{{ $__( 'Be sure to save this in a safe location. You will not be able to retrieve it.', 'default' ) }}</p>
			<button v-if="dismissible" type="button" class="notice-dismiss" @click="$emit( 'dismiss' )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
		</div>
	`,
};
