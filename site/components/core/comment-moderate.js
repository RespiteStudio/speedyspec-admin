import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import { redirectTarget } from '../../runtime/router.js';
import InertHtml from '../../kit/InertHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';

// The classic screen's body class (admin-header.php, from the hook suffix `comment.php`).
const BODY_CLASS = 'comment-php';

/**
 * Default implementation of core/comment-moderate: the moderation confirmation of comment.php
 * (`action=approve|trash|spam|delete`) in its classic markup (comment.php:121-268): the info
 * notice of the comment's current status and the "Caution:" warning (`#message`), the comment
 * in `table.form-table.comment-ays` (Author, Email, URL, In response to with the parent,
 * Submitted on, and Comment with its Edit link), then `form.comment-ays-submit` with the
 * button and Cancel. The body has the classic `comment-php` class while it is shown.
 *
 * The comment's text is shown through kit/InertHtml: nothing in it runs. The author, email and
 * URL are text. The warning's text and the button's label are WordPress's (`caution`,
 * `button`); without one, it is not shown.
 *
 * Nothing is done on load. The button sends the request WordPress gives (`data.confirm`, the
 * `/status` route or a DELETE, whose fields go in the query) and follows the answer: a `redirect`
 * through the router, a `location` as a full-page load. A refused request shows WordPress's
 * message in a notice and says it.
 *
 * `data.error` (a post in the Trash) shows the message alone, as wp_die() does.
 */
export default {
	name: 'CommentModerate',
	components: { InertHtml, InlineMarkup, Format },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'confirmed' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		// The location shown (`pageLocation` may be provided: tests).
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '' };

		const error = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const comment = computed( () => props.data?.comment ?? {} );
		// WordPress's texts for the action (comment.php's switch); without them, nothing is shown.
		const caution = computed( () => ( typeof props.data?.caution === 'string' && props.data.caution !== '' ? props.data.caution : null ) );
		const button = computed( () => ( typeof props.data?.button === 'string' && props.data.button !== '' ? props.data.button : null ) );
		const sending = ref( false );

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		/** A refused request is said in a page notice and spoken. */
		function failed( reason ) {
			console.warn( 'Could not moderate the comment:', reason );
			const message = typeof reason?.message === 'string' && reason.message !== '' ? reason.message : broken();
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
		}

		/** Opens where an answer leads: a redirect through the router, a location as a full-page load. */
		async function follow( answer ) {
			if ( router?.follow ) {
				return router.follow( answer ?? {} );
			}
			const target = redirectTarget( answer ?? {}, where() );
			if ( target ) {
				globalThis.location?.assign?.( target.url );
			}
			return Boolean( target );
		}

		async function confirm() {
			const request = props.data?.confirm;
			if ( sending.value || error.value || ! request || typeof request.route !== 'string' ) {
				return;
			}
			const body = request.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {};
			sending.value = true;
			try {
				let answer;
				if ( request.method === 'DELETE' ) {
					// A DELETE has no body: its fields go in the query.
					const query = new URLSearchParams();
					for ( const [ key, value ] of Object.entries( body ) ) {
						if ( value !== null && value !== undefined && typeof value !== 'object' ) {
							query.append( key, String( value ) );
						}
					}
					const search = query.toString();
					answer = await api.del( search === '' ? request.route : request.route + ( request.route.includes( '?' ) ? '&' : '?' ) + search );
				} else {
					answer = await api.post( request.route, body );
				}
				emit( 'confirmed', answer );
				await follow( answer );
			} catch ( reason ) {
				failed( reason );
			} finally {
				sending.value = false;
			}
		}

		onMounted( () => {
			globalThis.document?.body?.classList?.add?.( BODY_CLASS );
		} );
		onBeforeUnmount( () => {
			globalThis.document?.body?.classList?.remove?.( BODY_CLASS );
		} );

		return {
			error, comment, caution, button, sending, confirm,
			href: ( path ) => adminHref( path, where() ),
		};
	},
	template: `
		<div v-if="error" class="wp-die-message">{{ error.message }}</div>
		<template v-else>
			<div v-if="data.statusNotice" id="message" class="notice notice-info"><p><InlineMarkup :html="String( data.statusNotice.markup ?? '' )" /></p></div>
			<div v-if="caution" id="message" class="notice notice-warning"><p><strong>{{ $__( 'Caution:', 'default' ) }}</strong> {{ caution }}</p></div>

			<table class="form-table comment-ays">
				<tbody>
					<tr>
						<th scope="row">{{ $__( 'Author', 'default' ) }}</th>
						<td>{{ comment.author }}</td>
					</tr>
					<tr v-if="comment.email">
						<th scope="row">{{ $__( 'Email', 'default' ) }}</th>
						<td>{{ comment.email }}</td>
					</tr>
					<tr v-if="comment.url">
						<th scope="row">{{ $__( 'URL', 'default' ) }}</th>
						<td><a :href="comment.url">{{ comment.url }}</a></td>
					</tr>
					<tr>
						<!-- translators: Column name or table row header. -->
						<th scope="row">{{ $__( 'In response to', 'default' ) }}</th>
						<td>
							<template v-if="data.response">
								<a v-if="data.response.editUrl" :href="href( data.response.editUrl )">{{ data.response.title }}</a>
								<template v-else>{{ data.response.title }}</template>
							</template>
							<template v-if="data.parent">{{ ' | ' }}<Format :text="$__( 'In reply to %s.', 'default' )"><template #arg1><a :href="data.parent.url ?? ''">{{ data.parent.name }}</a></template></Format></template>
						</td>
					</tr>
					<tr>
						<th scope="row">{{ $__( 'Submitted on', 'default' ) }}</th>
						<td>
							<a v-if="comment.date?.url" :href="comment.date.url">{{ comment.date.text }}</a>
							<template v-else>{{ comment.date?.text ?? '' }}</template>
						</td>
					</tr>
					<tr>
						<!-- translators: Field name in comment form. -->
						<th scope="row">{{ $_x( 'Comment', 'noun', 'default' ) }}</th>
						<td class="comment-content">
							<InertHtml :html="String( comment.contentHtml ?? '' )" />
							<p class="edit-comment">
								<a :href="href( data.editUrl )">{{ $__( 'Edit', 'default' ) }}</a>
							</p>
						</td>
					</tr>
				</tbody>
			</table>

			<form action="comment.php" method="get" class="comment-ays-submit" @submit.prevent="confirm">
				<p>
					<input v-if="button" type="submit" name="submit" id="submit" class="button button-primary" :value="button" :disabled="sending" />
					{{ ' ' }}<a :href="href( data.cancelUrl ?? 'edit-comments.php' )" class="button-cancel">{{ $__( 'Cancel', 'default' ) }}</a>
				</p>
			</form>
		</template>
	`,
};
