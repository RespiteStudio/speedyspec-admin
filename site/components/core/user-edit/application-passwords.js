import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { failureText } from '../list-table-parts/page-chrome.js';
import PluginNote from './plugin-note.js';

/** The wp/v2 route of a user's application passwords, as application-passwords.js asks it. */
export const passwordsRoute = ( id, uuid = '' ) => 'wp/v2/users/' + id + '/application-passwords' + ( uuid === '' ? '' : '/' + encodeURIComponent( uuid ) ) + '?_locale=user';
/** The wp-admin/v1 read of the rows, as WordPress formats them. */
export const rowsRoute = ( id ) => 'wp-admin/v1/users/' + id + '/application-passwords';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const markup = ( value ) => ( typeof value === 'string' && value !== '' ? value : null );
// How long "Copied!" shows after a copy, as user-profile.js's clipboard handler.
const COPIED_MS = 3000;

/** The rows of a read (`{ items }`), each with its uuid. Pure. */
export const rowsOf = ( value ) => list( value ).filter( ( item ) => typeof item?.uuid === 'string' && item.uuid !== '' );

/**
 * The Application Passwords section of Profile and Edit User, as user-edit.php prints it
 * (`#application-passwords-section`) and application-passwords.js drives it:
 *
 * - with application passwords available: the sites notice WordPress gives (multisite), the
 *   create form (New Application Password Name, what plugins print on
 *   {@see 'wp_create_application_password_form'} with the note, Add Application Password) or,
 *   behind Basic Authentication, its error text; then the table of WP_Application_Passwords_List_Table
 *   with Revoke on each row and Revoke all, hidden while there is no row;
 * - without them and without their support, the HTTPS text and WordPress's environment help.
 *
 * Add posts the name to `wp/v2/users/{id}/application-passwords` (an empty name sends nothing and
 * focuses the field, Enter in the field adds) and shows the new password once, in the classic
 * notice with Copy (navigator.clipboard) and Dismiss. Revoke and Revoke all confirm with the
 * classic text (window.confirm()), then delete through wp/v2. After each write the rows are read
 * again from `wp-admin/v1/users/{id}/application-passwords`, which replaces the table. As
 * application-passwords.js, each request first clears the section's notices; a success or an
 * error (WordPress's message) shows after the form, focused. Names and dates are text.
 */
export default {
	name: 'UserEditApplicationPasswords',
	components: { InlineMarkup, LegacyHtml, PluginNote },
	props: {
		section: { type: Object, required: true },
		userId: { type: Number, required: true },
	},
	setup( props ) {
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const items = ref( rowsOf( props.section.items ) );
		const name = ref( '' );
		const adding = ref( false );
		const notices = ref( [] );
		const created = ref( null );
		const copied = ref( false );
		const nameField = ref( null );
		const area = ref( null );
		let copiedTimer = null;

		watch( () => props.section, ( section ) => {
			items.value = rowsOf( section?.items );
			notices.value = [];
			created.value = null;
		} );
		onBeforeUnmount( () => clearTimeout( copiedTimer ) );

		/** Focuses the newest notice after the form, as application-passwords.js does. */
		async function focusNotice( selector ) {
			await nextTick();
			area.value?.querySelector?.( selector )?.focus?.();
		}

		function clearNotices() {
			notices.value = [];
			created.value = null;
		}

		function addNotice( message, type ) {
			notices.value = [ { message: text( message ), type }, ...notices.value ];
			return focusNotice( '.notice[data-notice="0"]' );
		}

		async function readRows() {
			try {
				const answer = await api.get( rowsRoute( props.userId ) );
				items.value = rowsOf( answer?.items );
			} catch ( reason ) {
				console.warn( 'Could not read the application passwords:', reason );
				await addNotice( failureText( reason ), 'error' );
			}
		}

		async function add() {
			if ( adding.value ) {
				return;
			}
			if ( name.value.length === 0 ) {
				nameField.value?.focus?.();
				return;
			}
			clearNotices();
			adding.value = true;
			let answer;
			try {
				answer = await api.post( passwordsRoute( props.userId ), { name: name.value } );
			} catch ( reason ) {
				console.warn( 'Could not add the application password:', reason );
				await addNotice( failureText( reason ), 'error' );
				return;
			} finally {
				adding.value = false;
			}
			name.value = '';
			created.value = { name: text( answer?.name ), password: text( answer?.password ) };
			copied.value = false;
			focusNotice( '.new-application-password-notice' );
			await readRows();
		}

		async function remove( route, confirmText, doneText ) {
			if ( ! globalThis.window?.confirm?.( confirmText ) ) {
				return;
			}
			clearNotices();
			let answer;
			try {
				answer = await api.del( route );
			} catch ( reason ) {
				console.warn( 'Could not revoke the application password:', reason );
				await addNotice( failureText( reason ), 'error' );
				return;
			}
			if ( answer?.deleted ) {
				await addNotice( doneText, 'success' );
			}
			await readRows();
		}

		async function copy() {
			const password = created.value?.password ?? '';
			try {
				await globalThis.navigator?.clipboard?.writeText?.( password );
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

		return {
			items, name, adding, notices, created, copied, nameField, area,
			add, copy,
			sitesNotice: computed( () => markup( props.section.sitesNotice ) ),
			createHtml: computed( () => markup( props.section.createHtml ) ),
			environmentHelp: computed( () => markup( props.section.environmentHelp ) ),
			revoke: ( item ) => remove( passwordsRoute( props.userId, item.uuid ), __( 'Are you sure you want to revoke this password? This action cannot be undone.', 'default' ), __( 'Application password revoked.', 'default' ) ),
			revokeAll: () => remove( passwordsRoute( props.userId ), __( 'Are you sure you want to revoke all passwords? This action cannot be undone.', 'default' ), __( 'All application passwords revoked.', 'default' ) ),
			dismissCreated: async () => {
				created.value = null;
				await nextTick();
				nameField.value?.focus?.();
			},
			dismissNotice: async ( index ) => {
				notices.value = notices.value.filter( ( entry, at ) => at !== index );
				await nextTick();
				nameField.value?.focus?.();
			},
			revokeLabel: ( item ) => __( 'Revoke "%s"', 'default' ).replace( '%s', text( item.name ) ),
			createdLabel: computed( () => __( 'Your new password for %s is:', 'default' ).split( '%s' ) ),
		};
	},
	template: `
		<div ref="area" class="application-passwords hide-if-no-js" id="application-passwords-section">
			<h2>{{ $__( 'Application Passwords', 'default' ) }}</h2>
			<p>{{ $__( 'Application passwords allow authentication via non-interactive systems, such as XML-RPC or the REST API, without providing your actual password. Application passwords can be easily revoked. They cannot be used for traditional logins to your website.', 'default' ) }}</p>
			<template v-if="section.available === true">
				<p v-if="sitesNotice"><InlineMarkup :html="sitesNotice" /></p>
				<div v-if="section.basicAuth !== true" class="create-application-password form-wrap">
					<div class="form-field">
						<label for="new_application_password_name">{{ $__( 'New Application Password Name', 'default' ) }}</label>
						<input ref="nameField" type="text" size="30" id="new_application_password_name" name="new_application_password_name" class="input ltr" aria-required="true" aria-describedby="new_application_password_name_desc" spellcheck="false" :value="name" @input="name = $event.target.value" @keydown.enter.prevent="add" />
						<p class="description" id="new_application_password_name_desc">{{ $__( 'Required to create an Application Password, but not to update the user.', 'default' ) }}</p>
					</div>
					<template v-if="createHtml"><LegacyHtml :html="createHtml" /><PluginNote /></template>
					<button type="button" name="do_new_application_password" id="do_new_application_password" class="button button-secondary" :class="{ disabled: adding }" :aria-disabled="adding ? 'true' : null" @click="add">{{ $__( 'Add Application Password', 'default' ) }}</button>
				</div>
				<div v-else class="notice notice-error inline"><p>{{ $__( 'Your website appears to use Basic Authentication, which is not currently compatible with Application Passwords.', 'default' ) }}</p></div>

				<template v-if="notices.length > 0 || created">
					<div v-for="( notice, index ) in notices" :key="index + notice.message" :data-notice="index" role="alert" tabindex="-1" :class="[ 'is-dismissible', 'notice', 'notice-' + notice.type ]"><p>{{ notice.message }}</p><button type="button" class="notice-dismiss" @click="dismissNotice( index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>
					<div v-if="created" class="notice notice-success is-dismissible new-application-password-notice" role="alert" tabindex="-1">
						<p class="application-password-display">
							<label for="new-application-password-value">{{ createdLabel[ 0 ] }}<strong>{{ created.name }}</strong>{{ createdLabel[ 1 ] ?? '' }}</label>
							<input id="new-application-password-value" type="text" class="code" readonly="readonly" :value="created.password" />
							<button type="button" class="button copy-button" @click="copy">{{ $__( 'Copy', 'default' ) }}</button>
							<span class="success" :class="{ hidden: ! copied }" aria-hidden="true">{{ $__( 'Copied!', 'default' ) }}</span>
						</p>
						<p>{{ $__( 'Be sure to save this in a safe location. You will not be able to retrieve it.', 'default' ) }}</p>
						<button type="button" class="notice-dismiss" @click="dismissCreated"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
					</div>
				</template>

				<div v-show="items.length > 0" class="application-passwords-list-table-wrapper">
					<div class="tablenav top"><div class="alignleft actions bulkactions"></div><br class="clear" /></div>
					<table class="wp-list-table widefat fixed striped table-view-list application-passwords-user">
						<thead>
							<tr>
								<th scope="col" id="name" class="manage-column column-name column-primary">{{ $__( 'Name', 'default' ) }}</th>
								<th scope="col" id="created" class="manage-column column-created">{{ $__( 'Created', 'default' ) }}</th>
								<th scope="col" id="last_used" class="manage-column column-last_used">{{ $__( 'Last Used', 'default' ) }}</th>
								<th scope="col" id="last_ip" class="manage-column column-last_ip">{{ $__( 'Last IP', 'default' ) }}</th>
								<th scope="col" id="revoke" class="manage-column column-revoke">{{ $__( 'Revoke', 'default' ) }}</th>
							</tr>
						</thead>
						<tbody id="the-list">
							<tr v-for="item in items" :key="item.uuid" :data-uuid="item.uuid">
								<th scope="row" class="name column-name has-row-actions column-primary" :data-colname="$__( 'Name', 'default' )">{{ item.name }}<button type="button" class="toggle-row"><span class="screen-reader-text">{{ $__( 'Show more details', 'default' ) }}</span></button></th>
								<td class="created column-created" :data-colname="$__( 'Created', 'default' )">{{ item.created }}</td>
								<td class="last_used column-last_used" :data-colname="$__( 'Last Used', 'default' )">{{ item.lastUsed }}</td>
								<td class="last_ip column-last_ip" :data-colname="$__( 'Last IP', 'default' )">{{ item.lastIp }}</td>
								<td class="revoke column-revoke" :data-colname="$__( 'Revoke', 'default' )"><button type="button" :name="'revoke-application-password-' + item.uuid" :id="'revoke-application-password-' + item.uuid" class="button delete" :aria-label="revokeLabel( item )" @click="revoke( item )">{{ $__( 'Revoke', 'default' ) }}</button></td>
							</tr>
						</tbody>
						<tfoot>
							<tr>
								<th scope="col" class="manage-column column-name column-primary">{{ $__( 'Name', 'default' ) }}</th>
								<th scope="col" class="manage-column column-created">{{ $__( 'Created', 'default' ) }}</th>
								<th scope="col" class="manage-column column-last_used">{{ $__( 'Last Used', 'default' ) }}</th>
								<th scope="col" class="manage-column column-last_ip">{{ $__( 'Last IP', 'default' ) }}</th>
								<th scope="col" class="manage-column column-revoke">{{ $__( 'Revoke', 'default' ) }}</th>
							</tr>
						</tfoot>
					</table>
					<div class="tablenav bottom">
						<div class="alignright"><button type="button" name="revoke-all-application-passwords" id="revoke-all-application-passwords" class="button delete" @click="revokeAll">{{ $__( 'Revoke all application passwords', 'default' ) }}</button></div>
						<div class="alignleft actions bulkactions"></div>
						<br class="clear" />
					</div>
				</div>
			</template>
			<template v-else-if="section.supported !== true">
				<p>{{ $__( 'The application password feature requires HTTPS, which is not enabled on this site.', 'default' ) }}</p>
				<p v-if="environmentHelp"><InlineMarkup :html="environmentHelp" /></p>
			</template>
		</div>
	`,
};
