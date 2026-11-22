import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { safeUrl } from '../../kit/url.js';
import { failureText, followAnswer, usePageChrome } from './list-table-parts/page-chrome.js';

// The route of Approve and Reject.
export const AUTHORIZE_ROUTE = 'wp-admin/v1/application-passwords/authorize';
// Schemes the page never loads, whatever WordPress allowed (auth-app.js would).
const REFUSED_SCHEMES = [ 'javascript:', 'data:', 'vbscript:' ];
// How long "Copied!" shows after a copy, as user-profile.js's clipboard handler.
const COPIED_MS = 3000;

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
 * the new password (`chunked`), shown once with Copy and the save warning. An error (the empty
 * name's included) is WordPress's message in a page notice; the name field is focused. Names are
 * text; the texts go through kit/InlineMarkup.
 */
export default {
	name: 'AuthorizeApplication',
	components: { LegacyHtml, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed, dieError } = usePageChrome( props );
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
		const givenLocation = inject( 'pageLocation', null );
		const assignLocation = inject( 'assignLocation', null ) ?? ( ( url ) => globalThis.location?.assign?.( url ) );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/authorize-application.php', search: '' };

		const request = computed( () => ( props.data?.request && typeof props.data.request === 'object' ? props.data.request : {} ) );
		const texts = computed( () => ( props.data?.texts && typeof props.data.texts === 'object' ? props.data.texts : {} ) );
		const name = ref( text( request.value.appName ) );
		const sending = ref( false );
		const created = ref( null );
		const copied = ref( false );
		const nameField = ref( null );
		const createdNotice = ref( null );
		let generation = 0;
		let copiedTimer = null;

		function sayError( message ) {
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
		}

		/** Follows the route's answer; an approval without a target shows the password. */
		async function follow( answer, approve ) {
			if ( typeof answer?.redirect === 'string' ) {
				await followAnswer( { router, where: where() }, { redirect: answer.redirect } );
				return;
			}
			if ( typeof answer?.location === 'string' && answer.location !== '' ) {
				const url = loadableLocation( answer.location );
				if ( url === null ) {
					sending.value = false;
					sayError( __( 'Invalid URL format.', 'default' ) );
					return;
				}
				assignLocation( url );
				return;
			}
			sending.value = false;
			if ( approve && typeof answer?.chunked === 'string' && answer.chunked !== '' ) {
				created.value = { name: name.value, chunked: answer.chunked };
				copied.value = false;
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
				sayError( __( 'Invalid URL format.', 'default' ) );
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
					console.warn( approve ? 'Could not approve the application:' : 'Could not reject the application:', error );
					sayError( failureText( error ) );
					await nextTick();
					nameField.value?.focus?.();
				}
				return;
			}
			if ( sent !== generation ) {
				return;
			}
			emit( 'saved', answer );
			await follow( answer, approve );
		}

		async function copy() {
			try {
				await globalThis.navigator?.clipboard?.writeText?.( created.value?.chunked ?? '' );
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

		watch( () => props.data, () => {
			generation++;
			name.value = text( request.value.appName );
			sending.value = false;
			created.value = null;
		} );
		onBeforeUnmount( () => {
			generation++;
			clearTimeout( copiedTimer );
		} );

		return {
			pageFailed, dieError, request, texts, name, sending, created, copied, nameField, createdNotice, copy,
			approve: () => send( true ),
			reject: () => send( false ),
			sitesNotice: computed( () => markup( props.data?.sitesNotice ) ),
			formHtml: computed( () => markup( props.data?.formHtml ) ),
			backLink: computed( () => {
				const link = dieError.value?.link;
				const url = safeUrl( link?.url ?? '', { protocols: [ 'http:', 'https:' ] } );
				return url === null ? null : { url, text: text( link.text ) };
			} ),
			createdLabel: computed( () => __( 'Your new password for %s is:', 'default' ).split( '%s' ) ),
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

			<div v-if="created" ref="createdNotice" class="notice notice-success notice-alt below-h2" role="alert" tabindex="-1">
				<p class="application-password-display">
					<label for="new-application-password-value">{{ createdLabel[ 0 ] }}<strong>{{ created.name }}</strong>{{ createdLabel[ 1 ] ?? '' }}</label>
					{{ ' ' }}<input id="new-application-password-value" type="text" class="code" readonly="readonly" :value="created.chunked" />
					<button type="button" class="button copy-button" @click="copy">{{ $__( 'Copy', 'default' ) }}</button>
					<span class="success" :class="{ hidden: ! copied }" aria-hidden="true">{{ $__( 'Copied!', 'default' ) }}</span>
				</p>
				<p>{{ $__( 'Be sure to save this in a safe location. You will not be able to retrieve it.', 'default' ) }}</p>
			</div>
			<form v-else method="post" class="form-wrap" novalidate @submit.prevent="approve">
				<div class="form-field">
					<label for="app_name">{{ $__( 'New Application Password Name', 'default' ) }}</label>
					<input ref="nameField" type="text" id="app_name" name="app_name" :value="name" required @input="name = $event.target.value" />
				</div>

				<template v-if="formHtml">
					<LegacyHtml :html="formHtml" />
					<p class="description wp-admin-authorize-application-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>
				</template>

				<input type="submit" name="approve" id="approve" class="button button-primary" :class="{ disabled: sending }" :aria-disabled="sending ? 'true' : null" aria-describedby="description-approve" :value="$__( 'Yes, I approve of this connection', 'default' )" @click.prevent="approve" />
				<p class="description" id="description-approve"><InlineMarkup :html="texts.approveDescription ?? ''" /></p>

				<input type="submit" name="reject" id="reject" class="button button-secondary" aria-describedby="description-reject" :value="$__( 'No, I do not approve of this connection', 'default' )" @click.prevent="reject" />
				<p class="description" id="description-reject"><InlineMarkup :html="texts.rejectDescription ?? ''" /></p>
			</form>
		</div>
	`,
};
