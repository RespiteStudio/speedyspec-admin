import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { __ } from '../../runtime/text.js';
import { strength, unknownLabel } from '../../runtime/password-strength.js';

// user-profile.js polls every 50 ms until zxcvbn is loaded.
const POLL = 50;

/**
 * The words that lower a password's entropy, as wp.passwordStrength.userInputDisallowedList()
 * builds them: each entry split on non-word characters, words under four letters dropped (they
 * cause false positives), each word once. Pure.
 *
 * @param {Array} values The page's user fields.
 * @return {string[]}
 */
export function disallowedWords( values ) {
	const words = ( Array.isArray( values ) ? values : [] )
		.filter( ( value ) => typeof value === 'string' && value !== '' )
		.flatMap( ( value ) => value.replace( /\W/g, ' ' ).split( ' ' ) )
		.filter( ( word ) => word.length >= 4 );
	return words.filter( ( word, index ) => words.indexOf( word ) === index );
}

/**
 * Default implementation of core/user-password: the password rows of user-profile.js.
 *
 * - `new`: the field is open and filled with `initialPassword`, shown as text (the Hide toggle
 *   masks it, the Show toggle reveals it); with `generate`, the Generate password button asks it
 *   for another password.
 * - `change`: "Set New Password" opens the field with the next password (the one `generate`
 *   answered after the last opening, else `initialPassword`), shown as text, and asks `generate`
 *   for the one after; Cancel closes it and empties the password.
 * - The strength comes from core's meter (runtime/password-strength.js) for each password. A
 *   short, bad or not yet known strength shows the `pw-weak` row; `canSubmit` is then false until
 *   its checkbox is checked, and always false for an empty open field. While the meter is not
 *   loaded the check is asked again every `pollMs`. Only the newest check's answer counts.
 * - Passwords and labels are text, never markup.
 * - The `pw-weak` row is shown inline (`display: table-row`), as user-profile.js's
 *   `$weakRow.show()` shows it over core's `.pw-weak { display: none }`.
 */
export default {
	name: 'UserPassword',
	inheritAttrs: false,
	props: {
		mode: { type: String, required: true },
		initialPassword: { type: String, default: '' },
		disallowed: { type: Array, default: () => [] },
		labels: { type: Object, default: () => ( {} ) },
		generate: { type: Function, default: null },
		pollMs: { type: Number, default: POLL },
	},
	emits: [ 'update:password', 'update:weakConfirmed', 'update:canSubmit' ],
	setup( props, { emit } ) {
		const isNew = computed( () => props.mode === 'new' );
		const open = ref( isNew.value );
		const password = ref( isNew.value ? props.initialPassword : '' );
		const revealed = ref( isNew.value );
		const weakConfirmed = ref( false );
		const result = ref( { score: -1, label: '', className: '' } );
		let nextPassword = null;
		let checks = 0;
		let timer = null;
		let gone = false;

		const empty = computed( () => password.value.trim() === '' );
		const unknown = computed( () => result.value.score === -1 );
		const weak = computed( () => open.value && ! empty.value && ( unknown.value || [ 'short', 'bad' ].includes( result.value.className ) ) );
		const canSubmit = computed( () => {
			if ( ! open.value ) {
				return true;
			}
			if ( empty.value ) {
				return false;
			}
			return weak.value ? weakConfirmed.value : true;
		} );
		const meterClass = computed( () => ( empty.value ? 'empty' : ( unknown.value ? 'bad' : result.value.className ) ) );
		const meterText = computed( () => {
			if ( empty.value ) {
				return ' ';
			}
			return unknown.value ? unknownLabel() : result.value.label;
		} );

		const label = ( key, fallback ) => {
			const text = props.labels?.[ key ];
			return typeof text === 'string' && text !== '' ? text : fallback();
		};
		const rowLabel = computed( () => label( 'password', () => ( isNew.value ? __( 'Password', 'default' ) : __( 'New Password', 'default' ) ) ) );
		const generateLabel = computed( () => label( 'generate', () => ( isNew.value ? __( 'Generate password', 'default' ) : __( 'Set New Password', 'default' ) ) ) );
		const toggleLabel = computed( () => ( revealed.value ? label( 'hide', () => __( 'Hide', 'default' ) ) : label( 'show', () => __( 'Show', 'default' ) ) ) );
		const toggleAria = computed( () => ( revealed.value ? label( 'hidePassword', () => __( 'Hide password', 'default' ) ) : label( 'showPassword', () => __( 'Show password', 'default' ) ) ) );
		const cancelText = computed( () => label( 'cancel', () => __( 'Cancel', 'default' ) ) );
		const cancelAria = computed( () => label( 'cancelPassword', () => __( 'Cancel password change', 'default' ) ) );
		const weakRowLabel = computed( () => label( 'weakRow', () => __( 'Confirm Password', 'default' ) ) );
		const weakConfirmLabel = computed( () => label( 'weakConfirm', () => __( 'Confirm use of weak password', 'default' ) ) );
		const showGenerate = computed( () => ! isNew.value || typeof props.generate === 'function' );
		const expanded = computed( () => ( isNew.value ? null : String( open.value ) ) );

		function stopPolling() {
			if ( timer !== null ) {
				clearTimeout( timer );
				timer = null;
			}
		}

		/** Asks the meter about the password now; only the newest answer is kept. */
		async function check() {
			stopPolling();
			if ( ! open.value || empty.value ) {
				return;
			}
			const mine = ++checks;
			const answer = await strength( password.value, disallowedWords( props.disallowed ), password.value );
			if ( gone || mine !== checks ) {
				return;
			}
			result.value = answer;
			if ( answer.score === -1 ) {
				timer = setTimeout( check, props.pollMs );
			}
		}

		watch( password, ( value ) => {
			if ( value.trim() === '' ) {
				weakConfirmed.value = false;
			}
			check();
		}, { flush: 'post' } );
		watch( () => props.disallowed, check, { deep: true } );
		watch( password, ( value ) => emit( 'update:password', value ), { immediate: true } );
		watch( weakConfirmed, ( value ) => emit( 'update:weakConfirmed', value ), { immediate: true } );
		watch( canSubmit, ( value ) => emit( 'update:canSubmit', value ), { immediate: true } );
		check();
		onBeforeUnmount( () => {
			gone = true;
			stopPolling();
		} );

		/** Asks `generate` for a password; the answer is kept only when it is a non-empty string. */
		async function generated() {
			try {
				const answer = await props.generate?.();
				return typeof answer === 'string' && answer !== '' ? answer : null;
			} catch {
				return null;
			}
		}

		async function onGenerate() {
			if ( isNew.value ) {
				const answer = await generated();
				if ( answer !== null && ! gone ) {
					password.value = answer;
					revealed.value = true;
				}
				return;
			}
			open.value = true;
			revealed.value = true;
			password.value = nextPassword ?? props.initialPassword;
			nextPassword = null;
			check();
			if ( typeof props.generate === 'function' ) {
				const answer = await generated();
				if ( answer !== null ) {
					nextPassword = answer;
				}
			}
		}

		function onCancel() {
			open.value = false;
			password.value = '';
			weakConfirmed.value = false;
			revealed.value = false;
			stopPolling();
			checks++;
			result.value = { score: -1, label: '', className: '' };
		}

		const onInput = ( event ) => {
			password.value = event.target.value;
		};
		const onWeak = ( event ) => {
			weakConfirmed.value = event.target.checked;
		};
		const toggle = () => {
			revealed.value = ! revealed.value;
		};

		return { isNew, open, password, revealed, weakConfirmed, weak, meterClass, meterText, result, rowLabel, generateLabel, toggleLabel, toggleAria, cancelText, cancelAria, weakRowLabel, weakConfirmLabel, showGenerate, expanded, onGenerate, onCancel, onInput, onWeak, toggle };
	},
	template: `
		<tr class="form-field user-pass1-wrap" :class="{ 'form-required': isNew }">
			<th scope="row"><label for="pass1">{{ rowLabel }}</label></th>
			<td>
				<button v-if="showGenerate" type="button" class="button wp-generate-pw" :aria-expanded="expanded" @click="onGenerate">{{ generateLabel }}</button>
				<div v-if="open" class="wp-pwd is-open">
					<div class="password-input-wrapper">
						<input
							id="pass1"
							name="pass1"
							class="regular-text ltr"
							:class="meterClass"
							:type="revealed ? 'text' : 'password'"
							autocomplete="new-password"
							spellcheck="false"
							aria-describedby="pass-strength-result"
							:value="password"
							@input="onInput"
						>
						<div id="pass-strength-result" :class="meterClass" aria-live="polite">{{ meterText }}</div>
					</div>
					<button type="button" class="button wp-hide-pw user-new-password-toggle" :aria-label="toggleAria" @click="toggle">
						<span class="dashicons" :class="revealed ? 'dashicons-hidden' : 'dashicons-visibility'" aria-hidden="true"></span>
						<span class="text">{{ toggleLabel }}</span>
					</button>
					<button v-if="! isNew" type="button" class="button wp-cancel-pw" :aria-label="cancelAria" @click="onCancel">
						<span class="dashicons dashicons-no" aria-hidden="true"></span>
						<span class="text">{{ cancelText }}</span>
					</button>
				</div>
			</td>
		</tr>
		<tr v-if="weak" class="pw-weak" style="display: table-row">
			<th>{{ weakRowLabel }}</th>
			<td>
				<label>
					<input type="checkbox" name="pw_weak" class="pw-checkbox" :checked="weakConfirmed" @change="onWeak">
					{{ weakConfirmLabel }}
				</label>
			</td>
		</tr>
	`,
};
