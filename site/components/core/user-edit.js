import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { noticeElementId } from '../../runtime/notices.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { adminHref } from './dashboard-parts/links.js';
import { DieError, failureText, followAnswer, usePageChrome } from './list-table-parts/page-chrome.js';
import { valuesOf, classicPost } from './user-edit/form-state.js';
import Personal from './user-edit/personal.js';
import NameSection from './user-edit/name.js';
import Contact from './user-edit/contact.js';
import Account, { Capabilities } from './user-edit/account.js';
import ApplicationPasswords from './user-edit/application-passwords.js';
import PluginNote from './user-edit/plugin-note.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

export const saveRoute = ( id ) => 'wp-admin/v1/users/' + id;
// A cancel route the data names: a path under wp-admin/v1, never a URL.
const ROUTE_PATH = /^[a-z0-9][a-z0-9/_-]*$/i;

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const markup = ( value ) => ( typeof value === 'string' && value !== '' ? value : null );

/** The errors of a refused save (`data.errors`), each with its message as a string, or []. Pure. */
export const formErrorsOf = ( error ) => list( error?.data?.errors ).filter( ( item ) => typeof item?.message === 'string' && item.message !== '' );

/**
 * Default implementation of core/user-edit: Profile (wp-admin/profile.php) and Edit User
 * (wp-admin/user-edit.php) in their classic markup, one page from its data: the heading's Add User
 * button WordPress gives, the messages (the super admin notice, `#message` with Go to Users, the
 * errors and the pending email change with its Cancel request), the errors of a refused save, then
 * `form#your-profile` with Personal Options (user-edit/personal.js), Name (name.js), Contact Info
 * and About (contact.js), Account Management (account.js), Application Passwords
 * (application-passwords.js), what plugins print on {@see 'show_user_profile'} or
 * {@see 'edit_user_profile'} (kit/LegacyHtml, with the note that this screen does not save their
 * fields), Additional Capabilities and Update (`#submit`, `submitLabel`). The body has the classes
 * WordPress names while it is shown, and the frame the title it gives.
 *
 * Update posts `users/{id}` with the fields as the classic form posts them (form-state.js's
 * classicPost()), the screen and the referer, and follows the answer, replacing the history entry.
 * It is disabled while the password rows say the form may not be sent (an empty or unconfirmed
 * weak password). A refused save shows every error in the classic notice, keeps the typed values
 * and closes the password rows; any other failure says WordPress's message in a focused page
 * notice and keeps every value. A `#password` hash scrolls to the password row, as user-edit.php.
 * New data (the page read again) opens the form with its values.
 *
 * `data.error` shows the classic screen's refusal instead of the form.
 */
export default {
	name: 'UserEdit',
	components: { InlineMarkup, LegacyHtml, DieError, Personal, NameSection, Contact, Account, Capabilities, ApplicationPasswords, PluginNote },
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
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/profile.php', search: '' };

		const { pageFailed, dieError } = usePageChrome( props );
		const user = computed( () => props.data?.user ?? {} );
		const userId = computed( () => Number( user.value.id ) || 0 );
		const messages = computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) );
		const values = reactive( valuesOf( props.data ) );
		const canSubmit = ref( true );
		const sending = ref( false );
		const formErrors = ref( [] );
		const dismissed = ref( [] );
		const passwordRun = ref( 0 );
		const formEl = ref( null );
		let pendingHash = globalThis.location?.hash === '#password';

		/** A failure that is not the form's errors: a focused page notice, spoken. */
		async function failed( reason, what = 'The request failed:' ) {
			console.warn( what, reason );
			const message = failureText( reason );
			const id = notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
			if ( id ) {
				await nextTick();
				globalThis.document?.getElementById?.( noticeElementId( id ) )?.focus?.();
			}
		}

		async function submit() {
			if ( sending.value || pageFailed.value || dieError.value || ! canSubmit.value || userId.value === 0 ) {
				return;
			}
			sending.value = true;
			try {
				const answer = await api.post( saveRoute( userId.value ), {
					fields: classicPost( props.data, values ),
					screen: props.data?.isProfilePage === true ? 'profile' : 'user-edit',
					referer: text( props.data?.referer ),
				} );
				formErrors.value = [];
				emit( 'saved', answer );
				await followAnswer( { router, where: where() }, answer, { replace: true } );
			} catch ( reason ) {
				const errors = formErrorsOf( reason );
				if ( errors.length === 0 ) {
					await failed( reason, 'Could not update the user:' );
					return;
				}
				console.warn( 'Could not update the user:', reason );
				formErrors.value = errors;
				// As the classic form comes back: the password rows closed and empty.
				passwordRun.value++;
				speak( failureText( reason ) );
			} finally {
				sending.value = false;
			}
		}

		/** Sends a cancel route the data gives (the pending email change), then follows the answer. */
		async function cancelRoute( cancel ) {
			const path = text( cancel?.path );
			if ( cancel?.method !== 'DELETE' || ! ROUTE_PATH.test( path ) ) {
				return;
			}
			try {
				const answer = await api.del( 'wp-admin/v1/' + path );
				await followAnswer( { router, where: where() }, answer );
			} catch ( reason ) {
				await failed( reason, 'Could not cancel the email change:' );
			}
		}

		/** The password rows appeared or changed: the first time, a `#password` hash scrolls to them. */
		async function onCanSubmit( value ) {
			canSubmit.value = value === true;
			if ( pendingHash ) {
				pendingHash = false;
				await nextTick();
				formEl.value?.querySelector?.( 'tr.user-pass1-wrap' )?.scrollIntoView?.();
			}
		}

		watch( () => props.data, ( data ) => {
			Object.assign( values, valuesOf( data ) );
			formErrors.value = [];
			dismissed.value = [];
			passwordRun.value++;
		} );

		return {
			pageFailed, dieError, user, userId, messages, values, canSubmit, sending, formErrors, dismissed, passwordRun, formEl,
			submit, cancelRoute, onCanSubmit, failed,
			own: computed( () => props.data?.contact?.emailConfirms === true ),
			addNew: computed( () => ( typeof props.data?.heading?.addNew?.path === 'string' ? props.data.heading.addNew : null ) ),
			hooksHtml: computed( () => markup( props.data?.isProfilePage === true ? props.data?.hooksHtml?.show : props.data?.hooksHtml?.edit ) ),
			disallowed: computed( () => [ user.value.login, values.first_name, values.last_name, values.nickname, values.display_name, values.email, values.url, values.description ].map( text ) ),
			href: ( path ) => adminHref( path, where() ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-user-edit-failed">{{ $__( 'The profile could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="dieError" :error="dieError" classes="wp-admin-user-edit-error" />
		<div v-else id="profile-page" class="wp-admin-user-edit">
			<a v-if="addNew" :href="href( addNew.path )" class="page-title-action">{{ addNew.label }}</a>
			<hr class="wp-header-end">

			<div class="wp-admin-user-edit-messages">
				<template v-for="( message, index ) in messages" :key="index">
					<div v-if="message.type === 'updated' && ! dismissed.includes( index )" id="message" class="updated notice is-dismissible">
						<p><InlineMarkup :html="message.markup" /></p>
						<p v-if="message.back && href( message.back.path )"><a :href="href( message.back.path )">{{ message.back.label }}</a></p>
						<button type="button" class="notice-dismiss" @click="dismissed.push( index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
					</div>
					<div v-else-if="message.type !== 'updated'" :class="[ 'notice', message.type === 'error' ? 'notice-error' : 'notice-info' ]">
						<p><InlineMarkup :html="message.markup" /><template v-if="message.cancel">{{ ' ' }}<button type="button" class="button-link" @click="cancelRoute( message.cancel )">{{ message.cancel.label }}</button></template></p>
					</div>
				</template>
			</div>

			<div v-if="formErrors.length > 0" class="notice error wp-admin-user-edit-errors"><p v-for="( error, index ) in formErrors" :key="index"><InlineMarkup :html="error.message" /></p></div>

			<form ref="formEl" id="your-profile" method="post" novalidate="novalidate" @submit.prevent="submit">
				<Personal v-if="data.personal" :personal="data.personal" :values="values" :own="own" @failed="failed" />
				<NameSection v-if="data.name" :name="data.name" :login="user.login ?? ''" :values="values" :is-profile="data.isProfilePage === true" />
				<Contact :data="data" :values="values" @cancel="cancelRoute" />
				<Account v-if="data.account" :account="data.account" :user-id="userId" :values="values" :disallowed="disallowed" :password-run="passwordRun" @can-submit="onCanSubmit" />
				<ApplicationPasswords v-if="data.applicationPasswords" :section="data.applicationPasswords" :user-id="userId" />
				<div v-if="hooksHtml" class="wp-admin-user-edit-hooks"><LegacyHtml :html="hooksHtml" /><PluginNote /></div>
				<Capabilities v-if="typeof data.capabilities === 'string'" :capabilities="data.capabilities" />

				<input type="hidden" name="action" value="update" />
				<input type="hidden" name="user_id" id="user_id" :value="userId" />
				<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" :value="data.submitLabel ?? ''" :disabled="sending || ! canSubmit" /></p>
			</form>
		</div>
	`,
};
