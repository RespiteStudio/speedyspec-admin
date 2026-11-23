import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { DieError, usePageActions, usePageChrome } from './list-table-parts/page-chrome.js';
import PluginNote from './list-table-parts/plugin-note.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The confirmation's mode from the page's path: `remove` for `action=remove`, else `delete`. Pure. */
export function deletionMode( path ) {
	const search = String( path ?? '' ).split( '?' )[ 1 ] ?? '';
	return new URLSearchParams( search.split( '#' )[ 0 ] ).get( 'action' ) === 'remove' ? 'remove' : 'delete';
}

/**
 * What the Delete Users form posts (users.php `dodelete`), as `users/delete` takes it: the users
 * listed but the current one, each one's content option (`delete` for a user without content, as
 * its hidden field; the radio chosen for a user with content, none when unset) and, for those
 * whose content is attributed, the user who gets it. Pure.
 *
 * @param {Array}       users    The users listed (`id`, `current`, `hasContent`).
 * @param {object}      choices  Each user's radio, ID => `delete`|`reassign`.
 * @param {object}      reassign Each user's select, ID => user ID as a string ('' for none).
 * @param {string|null} referer  The list to go back to.
 * @return {object} The body.
 */
export function deletionBody( users, choices, reassign, referer ) {
	const body = { ids: [], options: {}, reassign: {} };
	for ( const user of list( users ) ) {
		if ( ! Number.isInteger( user?.id ) || user.current === true ) {
			continue;
		}
		body.ids.push( user.id );
		const option = user.hasContent === true ? choices[ user.id ] : 'delete';
		if ( option === 'delete' || option === 'reassign' ) {
			body.options[ user.id ] = option;
		}
		if ( option === 'reassign' && /^[1-9][0-9]*$/.test( String( reassign[ user.id ] ?? '' ) ) ) {
			body.reassign[ user.id ] = Number( reassign[ user.id ] );
		}
	}
	if ( typeof referer === 'string' && referer !== '' ) {
		body.referer = referer;
	}
	return body;
}

/**
 * What the Remove Users from Site form posts (users.php `doremove`), as `users/remove` takes it: the
 * users the viewer may remove. Pure.
 */
export function removalBody( users, referer ) {
	const body = { ids: list( users ).filter( ( user ) => Number.isInteger( user?.id ) && user.canRemove === true ).map( ( user ) => user.id ) };
	if ( typeof referer === 'string' && referer !== '' ) {
		body.referer = referer;
	}
	return body;
}

/**
 * Default implementation of core/users-delete: the Delete Users and Remove Users from Site
 * confirmations (wp-admin/users.php `delete` and `remove`) in their classic markup:
 * `form#updateusers` with the error ("Please select an option.", with classic's "Error:"), the
 * intro, the list of users (each one's line; for a user with content, a fieldset with the radios
 * `delete_option_{id}` and `reassign_option_{id}`, both required, and `select#reassign_user_{id}`),
 * what plugins print on {@see 'delete_user_form'} with the note that this screen does not save
 * their fields, and the button, or the text with nobody to act on.
 *
 * WordPress decides who is listed, who has content, who may be acted on, the users content may go
 * to and where the confirmation leads. The page reproduces common.js (choosing a user to attribute
 * the content to checks its radio), posts `users/delete` or `users/remove` and follows the answer.
 * Logins and names are text; each line is WordPress's markup through kit/InlineMarkup.
 */
export default {
	name: 'UsersDelete',
	components: { LegacyHtml, InlineMarkup, DieError, PluginNote },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		// A failed write: a focused page notice, spoken (page-chrome.js).
		const { failed, follow } = usePageActions( { pathname: '/wp-admin/users.php' } );

		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const mode = computed( () => deletionMode( props.page?.path ) );
		const users = computed( () => list( props.data?.users ).filter( ( user ) => user && Number.isInteger( user.id ) && typeof user.markup === 'string' ) );
		const reassignOptions = computed( () => list( props.data?.reassignOptions ).filter( ( option ) => option && typeof option.value === 'string' ) );
		const labels = computed( () => props.data?.optionLabels ?? {} );
		const choices = ref( {} );
		const reassign = ref( {} );
		const sending = ref( false );
		let generation = 0;

		/** A user chosen to attribute the content to checks Attribute, as common.js does. */
		function chooseUser( id, value ) {
			reassign.value = { ...reassign.value, [ id ]: value };
			if ( value === '' || value === '-1' ) {
				if ( choices.value[ id ] === 'reassign' ) {
					const next = { ...choices.value };
					delete next[ id ];
					choices.value = next;
				}
				return;
			}
			choices.value = { ...choices.value, [ id ]: 'reassign' };
		}

		async function confirm() {
			if ( sending.value ) {
				return;
			}
			const remove = mode.value === 'remove';
			const route = remove ? 'wp-admin/v1/users/remove' : 'wp-admin/v1/users/delete';
			const body = remove ? removalBody( users.value, props.data?.referer ?? null ) : deletionBody( users.value, choices.value, reassign.value, props.data?.referer ?? null );
			const sent = generation;
			sending.value = true;
			let answer;
			try {
				answer = await api.post( route, body );
			} catch ( error ) {
				if ( sent === generation ) {
					sending.value = false;
					await failed( error, remove ? 'Could not remove the users:' : 'Could not delete the users:' );
				}
				return;
			}
			if ( sent !== generation ) {
				return;
			}
			sending.value = false;
			emit( 'saved', answer );
			await follow( answer );
		}

		watch( () => props.data, () => {
			generation++;
			choices.value = {};
			reassign.value = {};
			sending.value = false;
		} );
		onBeforeUnmount( () => {
			generation++;
		} );

		return {
			pageFailed, refusal, mode, users, reassignOptions, labels, choices, reassign, sending, chooseUser, confirm,
			setChoice: ( id, value ) => {
				choices.value = { ...choices.value, [ id ]: value };
			},
			formHtml: computed( () => ( typeof props.data?.formHtml === 'string' && props.data.formHtml !== '' ? props.data.formHtml : null ) ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-users-delete-failed">{{ $__( 'The users could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-users-delete-error" />
		<div v-else class="wp-admin-users-delete">
			<div v-if="typeof data.error === 'string' && data.error !== ''" class="notice error"><p><strong>{{ $__( 'Error:', 'default' ) }}</strong>{{ ' ' + data.error }}</p></div>
			<form method="post" name="updateusers" id="updateusers" :class="mode === 'delete' ? 'delete-and-reassign-users-form' : null" @submit.prevent="confirm">
				<p>{{ data.intro ?? '' }}</p>
				<ul>
					<li v-for="user in users" :key="user.id">
						<InlineMarkup v-if="mode === 'remove' || user.current === true" :html="user.markup" />
						<p v-else-if="user.hasContent !== true"><InlineMarkup :html="user.markup" /></p>
						<fieldset v-else>
							<legend><InlineMarkup :html="user.markup" /></legend>
							<ul>
								<li>
									<input type="radio" :id="'delete_option_' + user.id" :name="'delete_option[' + user.id + ']'" value="delete" required :checked="choices[ user.id ] === 'delete'" @change="setChoice( user.id, 'delete' )" />
									<label :for="'delete_option_' + user.id">{{ labels.delete ?? '' }}</label>
								</li>
								<li>
									<input type="radio" :id="'reassign_option_' + user.id" :name="'delete_option[' + user.id + ']'" value="reassign" required :checked="choices[ user.id ] === 'reassign'" @change="setChoice( user.id, 'reassign' )" />
									<label :for="'reassign_option_' + user.id">{{ labels.reassign ?? '' }}</label>
									{{ ' ' }}<label :for="'reassign_user_' + user.id" class="screen-reader-text">{{ labels.reassignUser ?? '' }}</label>
									<select :name="'reassign_user[' + user.id + ']'" :id="'reassign_user_' + user.id" :value="reassign[ user.id ] ?? ''" @change="chooseUser( user.id, $event.target.value )">
										<option v-for="option in reassignOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
									</select>
								</li>
							</ul>
						</fieldset>
					</li>
				</ul>

				<template v-if="data.canSubmit === true">
					<template v-if="formHtml">
						<LegacyHtml :html="formHtml" />
						<PluginNote />
					</template>
					<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" :value="data.submitLabel ?? ''" :disabled="sending" /></p>
				</template>
				<p v-else>{{ data.none ?? '' }}</p>
			</form>
		</div>
	`,
};
