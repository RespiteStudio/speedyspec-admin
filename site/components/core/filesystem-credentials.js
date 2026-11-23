import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import InlineMarkup from '../../kit/InlineMarkup.js';

const text = ( value ) => ( typeof value === 'string' ? value : '' );
// What the classic form shows in a password field FTP_PASS sets: never the password itself.
const LOCKED_PASSWORD = '*****';
const FOCUSABLE = 'input:not([type="hidden"]):not([readonly]):not([disabled])';

/**
 * Default implementation of core/filesystem-credentials: the Connection Information dialog, a
 * native modal `<dialog>` around the classic request-filesystem-credentials-form markup
 * (`#hostname`, `#username`, `#password`, the `connection_type` radios, `#ssh-keys` with
 * `#public_key` and `#private_key`, Cancel and `#upgrade` Proceed).
 *
 * - Every value and title from WordPress's form is text; only `error` is inline markup, through
 *   kit/InlineMarkup, in the classic `notice-alt notice-error` box after the heading, as
 *   updates.js shows it.
 * - The SSH keys show only while `ssh` is checked, as updates.js toggles them.
 * - A locked field is read-only (a locked radio disabled) and is not sent; a locked password
 *   shows `*****`.
 * - The typed password is kept in the field only while the dialog is open: it is emptied once
 *   sent, when the dialog closes and when it unmounts.
 * - Escape (and the dialog's own `cancel`) and Cancel emit `cancel` once per showing; the
 *   browser does not close the dialog by itself, the page closes it through `open`.
 */
export default {
	name: 'FilesystemCredentials',
	components: { InlineMarkup },
	props: {
		form: { type: Object, required: true },
		open: { type: Boolean, default: false },
	},
	emits: [ 'submit', 'cancel' ],
	setup( props, { emit } ) {
		const dialog = ref( null );
		const values = reactive( { hostname: '', username: '', password: '', connection_type: '', public_key: '', private_key: '' } );
		let opener = null;
		let shown = false;
		let cancelled = false;

		const types = computed( () => ( Array.isArray( props.form?.types ) ? props.form.types : [] )
			.filter( ( type ) => typeof type?.value === 'string' && type.value !== '' && typeof type.label === 'string' ) );
		const locked = ( name ) => props.form?.[ name ] === true;
		const sshOffered = computed( () => types.value.some( ( type ) => type.value === 'ssh' ) );

		function fill() {
			values.hostname = text( props.form?.hostname );
			values.username = text( props.form?.username );
			values.password = '';
			values.connection_type = text( props.form?.connectionType );
			values.public_key = text( props.form?.publicKey );
			values.private_key = text( props.form?.privateKey );
			cancelled = false;
		}

		function show() {
			const element = dialog.value;
			if ( ! element || shown ) {
				return;
			}
			const active = globalThis.document?.activeElement;
			opener = active && active !== globalThis.document.body ? active : null;
			fill();
			shown = true;
			if ( typeof element.showModal === 'function' && ! element.open ) {
				try {
					element.showModal();
				} catch {
					element.setAttribute( 'open', '' );
				}
			} else {
				element.setAttribute( 'open', '' );
			}
			nextTick( () => element.querySelector( FOCUSABLE )?.focus?.() );
		}

		function hide() {
			values.password = '';
			if ( ! shown ) {
				return;
			}
			shown = false;
			const element = dialog.value;
			if ( element ) {
				if ( typeof element.close === 'function' && element.open ) {
					element.close();
				} else {
					element.removeAttribute( 'open' );
				}
			}
			const back = opener;
			opener = null;
			back?.focus?.();
		}

		function requestCancel( event ) {
			event?.preventDefault?.();
			if ( ! props.open || cancelled ) {
				return;
			}
			cancelled = true;
			emit( 'cancel' );
		}

		function submit() {
			const sent = {};
			for ( const [ name, lock ] of [ [ 'hostname', 'hostnameLocked' ], [ 'username', 'usernameLocked' ], [ 'password', 'passwordLocked' ] ] ) {
				if ( ! locked( lock ) ) {
					sent[ name ] = values[ name ];
				}
			}
			if ( ! locked( 'connectionTypeLocked' ) && types.value.some( ( type ) => type.value === values.connection_type ) ) {
				sent.connection_type = values.connection_type;
			}
			if ( sshOffered.value ) {
				for ( const [ name, lock ] of [ [ 'public_key', 'publicKeyLocked' ], [ 'private_key', 'privateKeyLocked' ] ] ) {
					if ( ! locked( lock ) ) {
						sent[ name ] = values[ name ];
					}
				}
			}
			values.password = '';
			emit( 'submit', sent );
		}

		watch( () => props.open, ( open ) => ( open ? show() : hide() ) );
		watch( () => props.form, () => {
			if ( shown ) {
				fill();
			}
		} );
		onMounted( () => {
			if ( props.open ) {
				show();
			}
		} );
		onBeforeUnmount( hide );

		return {
			dialog,
			values,
			types,
			sshOffered,
			locked,
			headingTag: computed( () => ( props.form?.headingLevel === 1 ? 'h1' : 'h2' ) ),
			heading: computed( () => text( props.form?.heading ) ),
			description: computed( () => text( props.form?.description ) ),
			error: computed( () => text( props.form?.error ) ),
			usernameLabel: computed( () => text( props.form?.labels?.username ) ),
			passwordLabel: computed( () => text( props.form?.labels?.password ) ),
			lockedPassword: LOCKED_PASSWORD,
			requestCancel,
			submit,
		};
	},
	template: `
		<dialog ref="dialog" id="request-filesystem-credentials-dialog" class="request-filesystem-credentials-dialog" aria-labelledby="request-filesystem-credentials-title" @cancel="requestCancel" @keydown.esc="requestCancel">
			<div class="request-filesystem-credentials-dialog-content">
				<form method="post" @submit.prevent="submit">
					<div id="request-filesystem-credentials-form" class="request-filesystem-credentials-form">
						<component :is="headingTag" id="request-filesystem-credentials-title">{{ heading }}</component>
						<div v-if="error" class="notice notice-alt notice-error" role="alert"><p><InlineMarkup :html="error" /></p></div>
						<p id="request-filesystem-credentials-desc">{{ description }}</p>
						<label for="hostname">
							<span class="field-title">{{ $__( 'Hostname', 'default' ) }}</span>
							<input name="hostname" type="text" id="hostname" aria-describedby="request-filesystem-credentials-desc" class="code" :placeholder="$__( 'example: www.wordpress.org', 'default' )" v-model="values.hostname" :readonly="locked( 'hostnameLocked' )" />
						</label>
						<div class="ftp-username">
							<label for="username">
								<span class="field-title">{{ usernameLabel }}</span>
								<input name="username" type="text" id="username" v-model="values.username" :readonly="locked( 'usernameLocked' )" />
							</label>
						</div>
						<div class="ftp-password">
							<label for="password">
								<span class="field-title">{{ passwordLabel }}</span>
								<input v-if="locked( 'passwordLocked' )" name="password" type="password" id="password" :value="lockedPassword" readonly spellcheck="false" />
								<input v-else name="password" type="password" id="password" v-model="values.password" spellcheck="false" autocomplete="off" />
								<template v-if="! locked( 'passwordLocked' )">{{ $__( 'This password will not be stored on the server.', 'default' ) }}</template>
							</label>
						</div>
						<fieldset>
							<legend>{{ $__( 'Connection Type', 'default' ) }}</legend>
							<label v-for="type in types" :key="type.value" :for="type.value">
								<input type="radio" name="connection_type" :id="type.value" :value="type.value" v-model="values.connection_type" :disabled="locked( 'connectionTypeLocked' )" />
								{{ type.label }}
							</label>
						</fieldset>
						<fieldset v-if="sshOffered" v-show="values.connection_type === 'ssh'" id="ssh-keys">
							<legend>{{ $__( 'Authentication Keys', 'default' ) }}</legend>
							<label for="public_key">
								<span class="field-title">{{ $__( 'Public Key:', 'default' ) }}</span>
								<input name="public_key" type="text" id="public_key" aria-describedby="auth-keys-desc" v-model="values.public_key" :readonly="locked( 'publicKeyLocked' )" />
							</label>
							<label for="private_key">
								<span class="field-title">{{ $__( 'Private Key:', 'default' ) }}</span>
								<input name="private_key" type="text" id="private_key" v-model="values.private_key" :readonly="locked( 'privateKeyLocked' )" />
							</label>
							<p id="auth-keys-desc">{{ $__( 'Enter the location on the server where the public and private keys are located. If a passphrase is needed, enter that in the password field above.', 'default' ) }}</p>
						</fieldset>
						<p class="request-filesystem-credentials-action-buttons">
							<button class="button cancel-button" type="button" @click="requestCancel">{{ $__( 'Cancel', 'default' ) }}</button>
							{{ ' ' }}<input type="submit" name="upgrade" id="upgrade" class="button button-primary" :value="$__( 'Proceed', 'default' )" />
						</p>
					</div>
				</form>
			</div>
		</dialog>
	`,
};
