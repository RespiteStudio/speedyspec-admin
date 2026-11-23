import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { safeUrl } from '../../kit/url.js';
import { usePageActions, usePageChrome } from './list-table-parts/page-chrome.js';
import PluginNote from './list-table-parts/plugin-note.js';
import NewPasswordNotice from './list-table-parts/new-password-notice.js';

// The route of Approve and Reject.
export const AUTHORIZE_ROUTE = 'wp-admin/v1/application-passwords/authorize';
// Schemes the page never loads, whatever WordPress allowed (auth-app.js would).
const REFUSED_SCHEMES = [ 'javascript:', 'data:', 'vbscript:' ];

const text = ( value ) => ( typeof value === 'string' ? value : '' );
const markup = ( value ) => ( typeof value === 'string' && value !== '' ? value : null );

/**
 * The URL an answer's `location` loads, parsed as the browser parses it, or null when it cannot
 * be parsed or its scheme is `javascript:`, `data:` or `vbscript:`. Any other scheme (an
 * application's own, such as `acme-app:`) is kept, as WordPress allowed it. Pure.
 *
 * @param {string} location The location.
 * @return {string|null} The URL to load, or null.
 */
export function loadableLocation( location ) {
	let url;
	try {
		url = new URL( String( location ) );
	} catch {
		return null;
	}
	return REFUSED_SCHEMES.includes( url.protocol.toLowerCase() ) ? null : url.href;
}

/**
 * What Approve and Reject post: the request as WordPress gave it, the name field's value. Pure.
 *
 * @param {object}  request The data's request (`appId`, `successUrl`, `rejectUrl`).
 * @param {string}  name    The name field's value.
 * @param {boolean} approve Whether it approves.
 * @return {object} The body.
 */
export function authorizeBody( request, name, approve ) {
	return {
		app_name: text( name ),
		app_id: text( request?.appId ),
		success_url: text( request?.successUrl ),
		reject_url: text( request?.rejectUrl ),
		approve: approve === true,
	};
}

/**
 * Default implementation of core/authorize-application: Authorize Application
 * (wp-admin/authorize-application.php) in its classic markup: the card with its heading, the
 * intro, the multisite sites notice, and the form: New Application Password Name (`#app_name`,
 * required, its value the name sent), what plugins print on
 * {@see 'wp_authorize_application_password_form'} with the note that this screen does not save
 * their fields, Approve and Reject with WordPress's descriptions. A refused request shows the
 * classic message and its Go Back link instead.
 *
 * WordPress decides whether the request is allowed, the texts, where each button leads and the
 * password. Before posting, a success URL (Approve) or reject URL (Reject) the page would not
 * load (`javascript:`, `data:`, `vbscript:`, unparsable) is refused and said, and nothing is
 * posted. As auth-app.js, the page posts the route and follows the answer: a `location` is
 * loaded in the browser (not `javascript:`, `data:` or `vbscript:`, which are refused and said),
 * a `redirect` goes through the router, and an approval without either replaces the form with
 * the new password (`chunked`), shown once with Copy and the save warning
 * (list-table-parts/new-password-notice.js). An error is WordPress's message in a page notice,
 * which takes the focus; after an empty name's error the name field takes it instead, as
 * auth-app.js focuses it for an empty name. Names are text; the texts go through
 * kit/InlineMarkup.
 */
export default {
	name: 'AuthorizeApplication',
	components: { LegacyHtml, InlineMarkup, PluginNote, NewPasswordNotice },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed, dieError } = usePageChrome( props );
		// An error: a focused page notice, spoken (page-chrome.js).
		const { say, failed, follow: followTarget } = usePageActions( { pathname: '/wp-admin/authorize-application.php' } );
		const assignLocation = inject( 'assignLocation', null ) ?? ( ( url ) => globalThis.location?.assign?.( url ) );

		const request = computed( () => ( props.data?.request && typeof props.data.request === 'object' ? props.data.request : {} ) );
		const texts = computed( () => ( props.data?.texts && typeof props.data.texts === 'object' ? props.data.texts : {} ) );
		const name = ref( text( request.value.appName ) );
		const sending = ref( false );
		const created = ref( null );
		const nameField = ref( null );
		const createdNotice = ref( null );
		let generation = 0;

		/** Follows the route's answer; an approval without a target shows the password. */
		async function follow( answer, approve ) {
			if ( typeof answer?.redirect === 'string' ) {
				await followTarget( { redirect: answer.redirect } );
				return;
			}
			if ( typeof answer?.location === 'string' && answer.location !== '' ) {
				const url = loadableLocation( answer.location );
				if ( url === null ) {
					sending.value = false;
					await say( __( 'Invalid URL format.', 'default' ) );
					return;
				}
				assignLocation( url );
				return;
			}
			sending.value = false;
			if ( approve && typeof answer?.chunked === 'string' && answer.chunked !== '' ) {
				created.value = { name: name.value, chunked: answer.chunked };
				await nextTick();
				createdNotice.value?.focus?.();
			}
		}

		async function send( approve ) {
			if ( sending.value ) {
				return;
			}
			// A target the page would refuse to load is refused before anything is posted, so no
			// password is created for a URL that would never receive it.
			const target = text( approve ? request.value.successUrl : request.value.rejectUrl );
			if ( target !== '' && loadableLocation( target ) === null ) {
				await say( __( 'Invalid URL format.', 'default' ) );
				return;
			}
			const sent = generation;
			sending.value = true;
			let answer;
			try {
				answer = await api.post( AUTHORIZE_ROUTE, authorizeBody( request.value, name.value, approve ) );
			} catch ( error ) {
				if ( sent === generation ) {
					sending.value = false;
					// An empty name's error sends the focus to the field, as auth-app.js; any other to the notice.
					const emptyName = name.value === '';
					await failed( error, approve ? 'Could not approve the application:' : 'Could not reject the application:', { focus: ! emptyName } );
					if ( emptyName ) {
						await nextTick();
						nameField.value?.focus?.();
					}
				}
				return;
			}
			if ( sent !== generation ) {
				return;
			}
			emit( 'saved', answer );
			await follow( answer, approve );
		}

		watch( () => props.data, () => {
			generation++;
			name.value = text( request.value.appName );
			sending.value = false;
			created.value = null;
		} );
		onBeforeUnmount( () => {
			generation++;
		} );

		return {
			pageFailed, dieError, request, texts, name, sending, created, nameField, createdNotice,
			approve: () => send( true ),
			reject: () => send( false ),
			sitesNotice: computed( () => markup( props.data?.sitesNotice ) ),
			formHtml: computed( () => markup( props.data?.formHtml ) ),
			backLink: computed( () => {
				const link = dieError.value?.link;
				const url = safeUrl( link?.url ?? '', { protocols: [ 'http:', 'https:' ] } );
				return url === null ? null : { url, text: text( link.text ) };
			} ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-authorize-application-failed">{{ $__( 'The Authorize Application request could not be loaded.', 'wp-admin-site' ) }}</p>
		<div v-else-if="dieError" class="wp-admin-authorize-application-error">
			<p>{{ dieError.message }}</p>
			<p v-if="backLink"><a :href="backLink.url">{{ backLink.text }}</a></p>
		</div>
		<div v-else class="card auth-app-card">
			<h2 class="title">{{ $__( 'An application would like to connect to your account.', 'default' ) }}</h2>
			<p><InlineMarkup :html="texts.intro ?? ''" /></p>
			<p v-if="sitesNotice"><InlineMarkup :html="sitesNotice" /></p>

			<NewPasswordNotice v-if="created" ref="createdNotice" :name="created.name" :password="created.chunked" classes="notice-alt below-h2" />
			<form v-else method="post" class="form-wrap" novalidate @submit.prevent="approve">
				<div class="form-field">
					<label for="app_name">{{ $__( 'New Application Password Name', 'default' ) }}</label>
					<input ref="nameField" type="text" id="app_name" name="app_name" :value="name" required @input="name = $event.target.value" />
				</div>

				<template v-if="formHtml">
					<LegacyHtml :html="formHtml" />
					<PluginNote />
				</template>

				<input type="submit" name="approve" id="approve" class="button button-primary" :class="{ disabled: sending }" :aria-disabled="sending ? 'true' : null" aria-describedby="description-approve" :value="$__( 'Yes, I approve of this connection', 'default' )" @click.prevent="approve" />
				<p class="description" id="description-approve"><InlineMarkup :html="texts.approveDescription ?? ''" /></p>

				<input type="submit" name="reject" id="reject" class="button button-secondary" aria-describedby="description-reject" :value="$__( 'No, I do not approve of this connection', 'default' )" @click.prevent="reject" />
				<p class="description" id="description-reject"><InlineMarkup :html="texts.rejectDescription ?? ''" /></p>
			</form>
		</div>
	`,
};
