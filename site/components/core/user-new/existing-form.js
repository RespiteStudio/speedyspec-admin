import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import LegacyHtml from '../../../kit/LegacyHtml.js';

export const EXISTING_ROUTE = 'wp-admin/v1/users/existing';
export const SUGGEST_ROUTE = 'wp-admin/v1/users/suggest';
// user-suggest.js's jQuery UI autocomplete: `delay: 500`, `minLength: 2`.
const DELAY = 500;
const MIN_LENGTH = 2;

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The suggestions of an answer: each `{ label, value }`, text; anything else dropped. Pure. */
export const suggestionsOf = ( answer ) => list( answer ).filter( ( item ) => typeof item?.label === 'string' && typeof item?.value === 'string' );

/**
 * The multisite Add Existing User form of user-new.php (`form#adduser`): the paragraph WordPress
 * gives, the field (`#adduser-email`, of the type WordPress gives) with user-suggest.js's
 * suggestions when WordPress turns them on, the Role (`#adduser-role`), Skip Confirmation Email
 * (`#adduser-noconfirmation`) for network administrators, what plugins print on
 * {@see 'user_new_form'} (`add-existing-user`) with the note that this screen does not save their
 * fields, and Add Existing User (`#addusersub`).
 *
 * - Add Existing User checks the required field as common.js does (an empty one marks its row
 *   `form-invalid` and nothing is sent), then posts `users/existing` and emits `answer` with the
 *   answer, or `failed` with the error. The values stay after a failure.
 * - Suggestions (user-suggest.js): typing two characters or more asks `users/suggest` after
 *   `userSuggestDelay` ms (500, injectable: tests) for users who are not members; only the newest
 *   answer shows, as a `ul.ui-autocomplete` list of the labels, as text. A click, or Up/Down and
 *   Enter, puts the suggestion's value in the field; Escape or leaving the field closes the list.
 */
export default {
	name: 'UserNewExistingForm',
	components: { LegacyHtml },
	props: {
		existing: { type: Object, required: true },
		// Both forms show: each gets its heading.
		both: { type: Boolean, default: false },
		blocked: { type: Boolean, default: false },
	},
	emits: [ 'answer', 'failed' ],
	setup( props, { emit } ) {
		const delay = inject( 'userSuggestDelay', DELAY );
		const email = ref( '' );
		const role = ref( text( props.existing.defaultRole ) );
		const noconfirmation = ref( false );
		const invalid = ref( false );
		const sending = ref( false );
		const suggestions = ref( [] );
		const active = ref( -1 );
		let asked = 0;
		let timer = null;
		let gone = false;

		const roles = computed( () => list( props.existing.roles ).filter( ( option ) => typeof option?.value === 'string' ) );
		const open = computed( () => suggestions.value.length > 0 );
		const optionId = ( index ) => 'adduser-email-suggestion-' + index;

		function close() {
			asked++;
			if ( timer !== null ) {
				clearTimeout( timer );
				timer = null;
			}
			suggestions.value = [];
			active.value = -1;
		}

		function ask( term ) {
			const mine = ++asked;
			api.get( SUGGEST_ROUTE, { term, autocomplete_type: 'add', autocomplete_field: 'user_login' } ).then( ( answer ) => {
				if ( ! gone && mine === asked ) {
					suggestions.value = suggestionsOf( answer );
					active.value = -1;
				}
			}, ( error ) => {
				console.warn( 'Could not suggest users:', error );
			} );
		}

		function onInput( event ) {
			email.value = text( event?.target?.value );
			if ( props.existing.suggest !== true ) {
				return;
			}
			close();
			if ( email.value.length < MIN_LENGTH ) {
				return;
			}
			const term = email.value;
			timer = setTimeout( () => {
				timer = null;
				ask( term );
			}, delay );
		}

		function choose( index ) {
			const item = suggestions.value[ index ];
			if ( item ) {
				email.value = item.value;
				invalid.value = false;
			}
			close();
		}

		function onKeydown( event ) {
			if ( ! open.value ) {
				return;
			}
			const count = suggestions.value.length;
			if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
				event.preventDefault();
				// Positions 0 … count, where count is "none chosen", as jQuery UI's menu cycles.
				const step = event.key === 'ArrowDown' ? 1 : -1;
				const position = ( ( active.value < 0 ? count : active.value ) + step + count + 1 ) % ( count + 1 );
				active.value = position === count ? -1 : position;
			} else if ( event.key === 'Enter' && active.value >= 0 ) {
				event.preventDefault();
				choose( active.value );
			} else if ( event.key === 'Escape' ) {
				close();
			}
		}

		async function submit() {
			if ( sending.value || props.blocked ) {
				return;
			}
			// ajax-response.js's validateForm(): the required row with an empty field.
			if ( email.value === '' ) {
				invalid.value = true;
				return;
			}
			close();
			sending.value = true;
			try {
				emit( 'answer', await api.post( EXISTING_ROUTE, { email: email.value, role: role.value, noconfirmation: noconfirmation.value } ) );
			} catch ( error ) {
				emit( 'failed', error, 'Could not add the existing user:' );
			} finally {
				sending.value = false;
			}
		}

		watch( () => props.existing, ( existing ) => {
			close();
			email.value = '';
			role.value = text( existing?.defaultRole );
			noconfirmation.value = false;
			invalid.value = false;
		} );
		onBeforeUnmount( () => {
			gone = true;
			close();
		} );

		return {
			email, role, noconfirmation, invalid, sending, suggestions, active, roles, open, optionId,
			onInput, onKeydown, choose, close, submit,
			activeId: computed( () => ( active.value >= 0 ? optionId( active.value ) : null ) ),
			hooksHtml: computed( () => ( typeof props.existing.hooksHtml === 'string' && props.existing.hooksHtml !== '' ? props.existing.hooksHtml : null ) ),
		};
	},
	template: `
		<div class="wp-admin-user-new-existing">
			<h2 v-if="both" id="add-existing-user">{{ $__( 'Add Existing User', 'default' ) }}</h2>
			<p>{{ existing.help ?? '' }}</p>
			<form method="post" name="adduser" id="adduser" class="validate" novalidate="novalidate" @submit.prevent="submit">
				<input name="action" type="hidden" value="adduser" />
				<table class="form-table" role="presentation">
					<tr class="form-field form-required" :class="{ 'form-invalid': invalid }">
						<th scope="row"><label for="adduser-email">{{ existing.label ?? '' }}</label></th>
						<td>
							<input
								name="email"
								:type="existing.type === 'email' ? 'email' : 'text'"
								id="adduser-email"
								class="wp-suggest-user"
								:class="{ open }"
								:value="email"
								autocomplete="off"
								:role="existing.suggest === true ? 'combobox' : null"
								:aria-expanded="existing.suggest === true ? String( open ) : null"
								:aria-controls="open ? 'adduser-email-suggestions' : null"
								:aria-activedescendant="activeId"
								@input="onInput"
								@change="invalid = false"
								@keydown="onKeydown"
								@blur="close"
							/>
							<ul v-if="open" id="adduser-email-suggestions" class="ui-autocomplete ui-front ui-menu ui-widget ui-widget-content" role="listbox">
								<li
									v-for="( item, index ) in suggestions"
									:key="index"
									:id="optionId( index )"
									class="ui-menu-item"
									role="option"
									:aria-selected="String( index === active )"
									@mousedown.prevent
									@click="choose( index )"
								><div class="ui-menu-item-wrapper" :class="{ 'ui-state-active': index === active }">{{ item.label }}</div></li>
							</ul>
						</td>
					</tr>
					<tr class="form-field">
						<th scope="row"><label for="adduser-role">{{ $__( 'Role', 'default' ) }}</label></th>
						<td>
							<select name="role" id="adduser-role" :value="role" @change="role = $event.target.value">
								<option v-for="option in roles" :key="option.value" :value="option.value">{{ option.label }}</option>
							</select>
						</td>
					</tr>
					<tr v-if="existing.noconfirmation === true">
						<th scope="row">{{ $__( 'Skip Confirmation Email', 'default' ) }}</th>
						<td>
							<input type="checkbox" name="noconfirmation" id="adduser-noconfirmation" value="1" :checked="noconfirmation" @change="noconfirmation = $event.target.checked" />
							<label for="adduser-noconfirmation">{{ $__( 'Add the user without sending an email that requires their confirmation', 'default' ) }}</label>
						</td>
					</tr>
				</table>
				<template v-if="hooksHtml">
					<LegacyHtml :html="hooksHtml" />
					<p class="description wp-admin-user-new-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>
				</template>
				<p class="submit"><input type="submit" name="adduser" id="addusersub" class="button button-primary" :value="$__( 'Add Existing User', 'default' )" :disabled="sending" /></p>
			</form>
		</div>
	`,
};
