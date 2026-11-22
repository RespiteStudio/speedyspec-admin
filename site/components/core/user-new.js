import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { noticeElementId } from '../../runtime/notices.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { DieError, failureText, followAnswer, usePageChrome } from './list-table-parts/page-chrome.js';
import ExistingForm from './user-new/existing-form.js';

export const CREATE_ROUTE = 'wp-admin/v1/users';
export const GENERATE_ROUTE = 'wp-admin/v1/users/generate-password';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The Add User form's values when it opens, as the classic fields hold them. Pure. */
export function fieldsOf( create ) {
	const fields = create?.fields ?? {};
	return {
		user_login: '',
		email: '',
		first_name: '',
		last_name: '',
		url: '',
		locale: text( fields.language?.selected ?? 'site-default' ),
		role: text( fields.role?.selected ),
		send_user_notification: fields.notify?.checked === true,
		noconfirmation: false,
	};
}

/**
 * The fields the classic Add User form posts, by name, for the fields it shows: an unchecked
 * checkbox is not sent, and `pass2` is `pass1`, as user-profile.js copies it on submit. Pure.
 *
 * @param {object} fields   The form's values (fieldsOf()).
 * @param {object} create   The form's data (`fields`, `noconfirmation`).
 * @param {string} password The password of the password rows.
 * @return {object} The `fields` of `POST users`.
 */
export function postedFields( fields, create, password ) {
	const shown = create?.fields ?? {};
	const posted = { user_login: fields.user_login, email: fields.email };
	if ( shown.names === true ) {
		posted.first_name = fields.first_name;
		posted.last_name = fields.last_name;
	}
	if ( shown.website === true ) {
		posted.url = fields.url;
	}
	if ( shown.language ) {
		posted.locale = fields.locale;
	}
	if ( shown.password === true ) {
		posted.pass1 = password;
		posted.pass2 = password;
	}
	if ( shown.notify && fields.send_user_notification ) {
		posted.send_user_notification = '1';
	}
	if ( shown.role ) {
		posted.role = fields.role;
	}
	if ( create?.noconfirmation === true && fields.noconfirmation ) {
		posted.noconfirmation = '1';
	}
	return posted;
}

/**
 * The required fields left empty, as ajax-response.js's validateForm() finds them in the
 * `.form-required` rows: Username, Email and, when its row shows, the password. Pure.
 *
 * @param {object} fields   The form's values.
 * @param {object} shown    The form's `fields` (`password`).
 * @param {string} password The password.
 * @return {string[]} The names of the empty fields.
 */
export function requiredEmpty( fields, shown, password ) {
	const empty = [ 'user_login', 'email' ].filter( ( name ) => text( fields[ name ] ) === '' );
	if ( shown?.password === true && text( password ) === '' ) {
		empty.push( 'pass1' );
	}
	return empty;
}

/** The errors of a refused create (`data.errors`), each with its message as a string, or []. Pure. */
export const formErrorsOf = ( error ) => list( error?.data?.errors ).filter( ( item ) => typeof item?.message === 'string' && item.message !== '' );

/**
 * Default implementation of core/user-new: Add User (wp-admin/user-new.php) in its classic markup:
 * the error list of a refused create, the messages (each `#message`) and the multisite errors of
 * `update=`, `#ajax-response`, then on multisite the Add Existing User form (user-new/existing-form.js)
 * and, with `create_users`, the Add User form (`form#createuser`, class `validate`): Username
 * (`#user_login`), Email (`#email`), on a single site First Name, Last Name, Website, the Language
 * WordPress offers, the password rows (core/user-password, `new`) and Send User Notification
 * (`#send_user_notification`), the Role (`#role`) with `promote_users`, Skip Confirmation Email
 * (`#noconfirmation`) for network administrators, what plugins print on {@see 'user_new_form'}
 * (`add-new-user`) with the note that this screen does not save their fields, and Add User
 * (`#createusersub`). With both forms, each has its heading. The body has the classes WordPress
 * names while it is shown.
 *
 * Everything WordPress decides comes as data: the forms, fields, roles and defaults, the generated
 * password, the messages and where a write leads. The page reproduces common.js and
 * user-profile.js:
 *
 * - Add User checks the required fields (an empty one marks its row `form-invalid`, a change of the
 *   field clears it, and nothing is sent), then posts `users` with the fields as the classic form
 *   posts them (postedFields()) and follows the answer. It is disabled, as user-profile.js disables
 *   it, while the password rows say the form may not be submitted (an empty or unconfirmed weak
 *   password).
 * - A refused create shows every error in the classic error list (`div.error ul`), says the first,
 *   keeps the typed values and empties the password. Any other failure says WordPress's message in
 *   a focused page notice and keeps every value.
 * - Generate password asks `users/generate-password`.
 * - New data (the page read again after a write) opens the forms empty.
 *
 * `data.refusal` shows the classic screen's message instead of the forms. Typed values are values
 * of the fields; messages and errors are WordPress's markup through kit/InlineMarkup.
 */
export default {
	name: 'UserNew',
	components: { Contracted, InlineMarkup, LegacyHtml, DieError, ExistingForm },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/user-new.php', search: '' };

		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const blocked = computed( () => pageFailed.value || Boolean( refusal.value ) );
		const create = computed( () => ( props.data?.create && typeof props.data.create === 'object' ? props.data.create : null ) );
		const existing = computed( () => ( props.data?.existing && typeof props.data.existing === 'object' ? props.data.existing : null ) );
		const shown = computed( () => create.value?.fields ?? {} );
		const messages = computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) );
		const addErrors = computed( () => list( props.data?.errors ).filter( ( error ) => typeof error?.markup === 'string' ) );
		const roleOptions = computed( () => list( shown.value.role?.options ).filter( ( option ) => typeof option?.value === 'string' ) );
		const languageOptions = computed( () => list( shown.value.language?.options ).filter( ( option ) => typeof option?.value === 'string' ) );

		const fields = reactive( fieldsOf( create.value ) );
		const password = ref( '' );
		const canSubmit = ref( true );
		const invalid = ref( [] );
		const formErrors = ref( [] );
		const dismissed = ref( [] );
		const sending = ref( false );
		// The password rows start again (key) after a refused create, empty, as classic's form
		// comes back without the password.
		const passwordRun = ref( 0 );
		const passwordEmptied = ref( false );

		const initialPassword = computed( () => ( passwordEmptied.value ? '' : text( create.value?.initialPassword ) ) );
		const disallowed = computed( () => [ fields.user_login, fields.first_name, fields.last_name, fields.email, fields.url ] );
		const generate = () => api.get( GENERATE_ROUTE ).then( ( answer ) => answer?.password );

		/** A failure that is not the form's errors: a focused page notice, spoken. */
		async function failed( reason, what ) {
			console.warn( what, reason );
			const message = failureText( reason );
			const id = notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
			if ( id ) {
				await nextTick();
				globalThis.document?.getElementById?.( noticeElementId( id ) )?.focus?.();
			}
		}

		async function follow( answer ) {
			emit( 'saved', answer );
			await followAnswer( { router, where: where() }, answer );
		}

		async function submit() {
			if ( sending.value || blocked.value || ! create.value ) {
				return;
			}
			invalid.value = requiredEmpty( fields, shown.value, password.value );
			if ( invalid.value.length > 0 || ! canSubmit.value ) {
				return;
			}
			sending.value = true;
			try {
				const answer = await api.post( CREATE_ROUTE, { fields: postedFields( fields, create.value, password.value ) } );
				formErrors.value = [];
				await follow( answer );
			} catch ( reason ) {
				const errors = formErrorsOf( reason );
				if ( errors.length === 0 ) {
					await failed( reason, 'Could not add the user:' );
					return;
				}
				console.warn( 'Could not add the user:', reason );
				formErrors.value = errors;
				speak( failureText( reason ) );
				passwordEmptied.value = true;
				passwordRun.value++;
			} finally {
				sending.value = false;
			}
		}

		// The password row is the part's: its row is marked as common.js marks it, on the element.
		const formEl = ref( null );
		watch( [ () => invalid.value.includes( 'pass1' ), passwordRun ], ( [ marked ] ) => {
			formEl.value?.querySelector?.( 'tr.user-pass1-wrap' )?.classList.toggle( 'form-invalid', marked );
		}, { flush: 'post' } );

		watch( () => props.data, () => {
			Object.assign( fields, fieldsOf( create.value ) );
			invalid.value = [];
			formErrors.value = [];
			dismissed.value = [];
			passwordEmptied.value = false;
			passwordRun.value++;
		} );

		return {
			pageFailed, refusal, create, existing, shown, messages, addErrors, roleOptions, languageOptions,
			fields, invalid, formErrors, dismissed, sending, canSubmit, password, passwordRun, initialPassword, disallowed, generate,
			submit, failed, follow, formEl,
			both: computed( () => Boolean( existing.value && create.value ) ),
			blocked,
			hooksHtml: computed( () => ( typeof create.value?.hooksHtml === 'string' && create.value.hooksHtml !== '' ? create.value.hooksHtml : null ) ),
			isInvalid: ( name ) => invalid.value.includes( name ),
			clearInvalid: ( name ) => {
				invalid.value = invalid.value.filter( ( entry ) => entry !== name );
			},
			setField: ( name ) => ( event ) => {
				fields[ name ] = text( event?.target?.value );
			},
			setPassword: ( value ) => {
				password.value = text( value );
				if ( password.value !== '' ) {
					invalid.value = invalid.value.filter( ( entry ) => entry !== 'pass1' );
				}
			},
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-user-new-failed">{{ $__( 'The Add User form could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-user-new-error" />
		<div v-else class="wp-admin-user-new">
			<div v-if="formErrors.length > 0" class="notice error"><ul><li v-for="( error, index ) in formErrors" :key="index"><InlineMarkup :html="error.message" /></li></ul></div>

			<template v-for="( message, index ) in messages" :key="index">
				<div v-if="! dismissed.includes( index )" id="message" class="notice updated is-dismissible"><p><InlineMarkup :html="message.markup" /></p><button type="button" class="notice-dismiss" @click="dismissed.push( index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>
			</template>

			<div v-if="addErrors.length > 0" class="notice error wp-admin-user-new-add-errors"><p v-for="error in addErrors" :key="error.code"><InlineMarkup :html="error.markup" /></p></div>

			<div id="ajax-response"></div>

			<ExistingForm v-if="existing" :existing="existing" :both="both" :blocked="blocked" @answer="follow" @failed="failed" />

			<template v-if="create">
				<h2 v-if="both" id="create-new-user">{{ $__( 'Add User', 'default' ) }}</h2>
				<p>{{ $__( 'Create a brand new user and add them to this site.', 'default' ) }}</p>
				<form ref="formEl" method="post" name="createuser" id="createuser" class="validate" novalidate="novalidate" @submit.prevent="submit">
					<input name="action" type="hidden" value="createuser" />
					<table class="form-table" role="presentation">
						<tr class="form-field form-required" :class="{ 'form-invalid': isInvalid( 'user_login' ) }">
							<th scope="row"><label for="user_login">{{ $__( 'Username', 'default' ) }} <span class="description">{{ $__( '(required)', 'default' ) }}</span></label></th>
							<td><input name="user_login" type="text" id="user_login" class="ltr" :value="fields.user_login" aria-required="true" autocapitalize="none" autocorrect="off" autocomplete="off" maxlength="60" @input="setField( 'user_login' )( $event )" @change="clearInvalid( 'user_login' )" /></td>
						</tr>
						<tr class="form-field form-required" :class="{ 'form-invalid': isInvalid( 'email' ) }">
							<th scope="row"><label for="email">{{ $__( 'Email', 'default' ) }} <span class="description">{{ $__( '(required)', 'default' ) }}</span></label></th>
							<td><input name="email" type="email" id="email" :value="fields.email" @input="setField( 'email' )( $event )" @change="clearInvalid( 'email' )" /></td>
						</tr>
						<template v-if="shown.names === true">
							<tr class="form-field">
								<th scope="row"><label for="first_name">{{ $__( 'First Name', 'default' ) }}</label></th>
								<td><input name="first_name" type="text" id="first_name" :value="fields.first_name" @input="setField( 'first_name' )( $event )" /></td>
							</tr>
							<tr class="form-field">
								<th scope="row"><label for="last_name">{{ $__( 'Last Name', 'default' ) }}</label></th>
								<td><input name="last_name" type="text" id="last_name" :value="fields.last_name" @input="setField( 'last_name' )( $event )" /></td>
							</tr>
						</template>
						<tr v-if="shown.website === true" class="form-field">
							<th scope="row"><label for="url">{{ $__( 'Website', 'default' ) }}</label></th>
							<td><input name="url" type="url" id="url" class="code" :value="fields.url" @input="setField( 'url' )( $event )" /></td>
						</tr>
						<tr v-if="shown.language" class="form-field user-language-wrap">
							<th scope="row"><label for="locale">{{ $__( 'Language', 'default' ) }}<span class="dashicons dashicons-translation" aria-hidden="true"></span></label></th>
							<td>
								<select name="locale" id="locale" :value="fields.locale" @change="setField( 'locale' )( $event )">
									<option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
								</select>
							</td>
						</tr>
						<Contracted
							v-if="shown.password === true"
							:key="passwordRun"
							id="core/user-password"
							mode="new"
							:initial-password="initialPassword"
							:disallowed="disallowed"
							:labels="create.passwordLabels ?? {}"
							:generate="generate"
							@update:password="setPassword"
							@update:canSubmit="canSubmit = $event"
						/>
						<tr v-if="shown.notify">
							<th scope="row">{{ $__( 'Send User Notification', 'default' ) }}</th>
							<td>
								<input type="checkbox" name="send_user_notification" id="send_user_notification" value="1" :checked="fields.send_user_notification" @change="fields.send_user_notification = $event.target.checked" />
								<label for="send_user_notification">{{ $__( 'Send the new user an email about their account', 'default' ) }}</label>
							</td>
						</tr>
						<tr v-if="shown.role" class="form-field">
							<th scope="row"><label for="role">{{ $__( 'Role', 'default' ) }}</label></th>
							<td>
								<select name="role" id="role" :value="fields.role" @change="setField( 'role' )( $event )">
									<option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
								</select>
							</td>
						</tr>
						<tr v-if="create.noconfirmation === true">
							<th scope="row">{{ $__( 'Skip Confirmation Email', 'default' ) }}</th>
							<td>
								<input type="checkbox" name="noconfirmation" id="noconfirmation" value="1" :checked="fields.noconfirmation" @change="fields.noconfirmation = $event.target.checked" />
								<label for="noconfirmation">{{ $__( 'Add the user without sending an email that requires their confirmation', 'default' ) }}</label>
							</td>
						</tr>
					</table>
					<template v-if="hooksHtml">
						<LegacyHtml :html="hooksHtml" />
						<p class="description wp-admin-user-new-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>
					</template>
					<p class="submit"><input type="submit" name="createuser" id="createusersub" class="button button-primary" :value="$__( 'Add User', 'default' )" :disabled="sending || ! canSubmit" /></p>
				</form>
			</template>
		</div>
	`,
};
