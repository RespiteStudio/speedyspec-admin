import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { redirectTarget, toPagePath } from '../../runtime/router.js';
import { mountQuicktagsEditor } from '../../runtime/quicktags.js';
import LegacyHtml, { SCREEN_ASSETS } from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import Timestamp from './comment-edit/timestamp.js';
import CommentParent from './comment-edit/parent.js';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './comment-edit/help.js';

// The classic screen's body class (admin-header.php, from the hook suffix `comment.php`).
const BODY_CLASS = 'comment-php';
const SCREEN = 'comment';
const COMMENTS_ROUTE = 'wp-admin/v1/comments/';

/**
 * Where the page was opened from, as the classic form's `referredby` (wp_get_referer()): the
 * address of the page shown before it (router.previousUrl()) relative to `wp-admin/`, when it is
 * a page of the same site's admin; else empty. Pure.
 *
 * @param {string|null} previous The previous address (path and query), or null.
 * @param {{pathname: string}} where Location of the page shown.
 * @return {string} The path, or ''.
 */
export function referredBy( previous, where ) {
	if ( typeof previous !== 'string' || previous === '' ) {
		return '';
	}
	let url;
	try {
		url = new URL( previous, 'http://localhost' );
	} catch {
		return '';
	}
	const from = toPagePath( { pathname: url.pathname, search: url.search } );
	const here = toPagePath( { pathname: where?.pathname ?? '/wp-admin/', search: '' } );
	if ( ! /^(?:\/sites\/\d+)?\/wp-admin\//.test( url.pathname ) || from.context !== 'site' || from.siteId !== here.siteId ) {
		return '';
	}
	return from.path;
}

const fieldsOf = ( data ) => ( {
	author: String( data?.comment?.author ?? '' ),
	email: String( data?.comment?.email ?? '' ),
	url: String( data?.comment?.url ?? '' ),
	content: String( data?.comment?.content ?? '' ),
	status: String( data?.status ?? '' ),
	date: { ...( data?.date?.parts ?? {} ) },
	parent: String( data?.comment?.parentId ?? 0 ),
} );

/** A box of the form: its captured HTML, or a message when its callback failed. */
const BoxContent = {
	name: 'CommentEditBox',
	components: { LegacyHtml },
	props: {
		box: { type: Object, required: true },
	},
	template: `
		<p v-if="box.error" class="wp-admin-legacy-failure" role="alert">{{ $__( 'This box could not be displayed.', 'wp-admin-site' ) }}</p>
		<LegacyHtml v-else :html="box.html ?? ''" />
	`,
};

/**
 * Default implementation of core/comment-edit: the Edit Comment screen (comment.php?action=
 * editcomment) in the classic markup of edit-form-comment.php: `form#post` with the permalink,
 * the author's fields (`#namediv`), the content in the classic quicktags-only editor (`#postdiv`,
 * `#content`, runtime/quicktags.js, started with the settings WordPress sends once the page's
 * screen assets are ready), the Save box (`#submitdiv`: the status radios, the date with its
 * editor `#timestampdiv`, the post it responds to, the parent with its editor, the plugins' misc
 * actions, the delete link and Update) in `#postbox-container-1`, and the normal meta boxes in
 * `#postbox-container-2` (core/meta-box-holder, whose preferences are saved for screen
 * `comment`). The body has the classic `comment-php` class while it is shown; the Name field
 * gets focus unless WordPress says the device is mobile.
 *
 * WordPress decides the statuses, the parent choices, the boxes and the messages; the page
 * reproduces comment.js (comment-edit/timestamp.js, comment-edit/parent.js):
 *
 * - Update posts `POST wp-admin/v1/comments/{id}` with `screen: 'comment'`, the fields, the
 *   status, the date (with the date as loaded, `date.hidden`, as the classic `hidden_` fields),
 *   the parent (with threading) and `referredby` (referredBy()), then follows the answer: a
 *   `redirect` through the router, a `location` as a full-page load. A refused save shows
 *   WordPress's message in a notice and says it.
 * - The delete link (Move to Trash, or Delete Permanently) calls the request WordPress gives
 *   (`deleteAction.request`) with `screen: 'comment'` and `referredby` (in the query of a
 *   DELETE), then follows the answer.
 * - The plugins' meta boxes and misc actions are their HTML (kit/LegacyHtml); their fields are
 *   not sent with the save (owner decision Q1: Edit Comment always saves through REST).
 *
 * `data.error` shows the classic screen's message instead of the form: `die` as wp_die() does
 * (the message alone), `footer` as comment_footer_die() does (in a `.wrap`, with its Go back
 * link, which goes back in the history).
 */
export default {
	name: 'CommentEdit',
	components: { Contracted, SlotOutlet, LegacyHtml, Format, Timestamp, CommentParent, BoxContent },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const mountEditor = inject( 'quicktagsEditor', mountQuicktagsEditor );
		const screenAssets = inject( SCREEN_ASSETS, null );
		const historyBack = inject( 'historyBack', () => globalThis.history?.go?.( -1 ) );
		// The location shown (`pageLocation` may be provided: tests).
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '' };

		const error = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const fields = reactive( fieldsOf( props.data ) );
		const sending = ref( false );
		const editorHost = shallowRef( null );
		const nameField = shallowRef( null );
		let editor = null;

		watch( () => props.data, ( data ) => {
			Object.assign( fields, fieldsOf( data ) );
			editor?.setValue?.( fields.content );
		} );

		const boxList = computed( () => ( Array.isArray( props.data?.boxes ) ? props.data.boxes.filter( ( box ) => typeof box?.id === 'string' && box.id !== '' ) : [] ) );
		const boxes = computed( () => Object.fromEntries( boxList.value.map( ( box ) => [ box.id, box ] ) ) );
		const layout = computed( () => props.data?.layout ?? { contexts: { normal: boxList.value.map( ( box ) => box.id ) } } );
		const screenOptions = computed( () => ( props.data?.screenOptions && typeof props.data.screenOptions === 'object' ? props.data.screenOptions : null ) );

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		/** A refused request is said in a page notice and spoken. */
		function failed( reason, what ) {
			console.warn( what, reason );
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

		const referredby = () => referredBy( router?.previousUrl?.() ?? null, where() );

		async function save() {
			const comment = props.data?.comment;
			if ( sending.value || ! comment || error.value ) {
				return;
			}
			const body = {
				author: fields.author,
				email: fields.email,
				url: fields.url,
				content: fields.content,
				status: fields.status,
				date: { ...fields.date, hidden: { ...( props.data.date?.hidden ?? {} ) } },
				referredby: referredby(),
				screen: SCREEN,
			};
			if ( props.data.parentChoices ) {
				body.parent = Number.parseInt( fields.parent, 10 ) || 0;
			}
			sending.value = true;
			try {
				const answer = await api.post( COMMENTS_ROUTE + comment.id, body );
				emit( 'saved', answer );
				await follow( answer );
			} catch ( reason ) {
				failed( reason, 'Could not save the comment:' );
			} finally {
				sending.value = false;
			}
		}

		async function remove() {
			const request = props.data?.deleteAction?.request;
			if ( sending.value || ! request || typeof request.route !== 'string' ) {
				return;
			}
			const body = request.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {};
			sending.value = true;
			try {
				let answer;
				if ( request.method === 'DELETE' ) {
					// A DELETE has no body: its fields go in the query.
					const query = new URLSearchParams();
					for ( const [ key, value ] of Object.entries( { ...body, screen: SCREEN, referredby: referredby() } ) ) {
						if ( value !== null && value !== undefined && typeof value !== 'object' ) {
							query.append( key, String( value ) );
						}
					}
					answer = await api.del( request.route + ( request.route.includes( '?' ) ? '&' : '?' ) + query.toString() );
				} else {
					answer = await api.post( request.route, { ...body, screen: SCREEN, referredby: referredby() } );
				}
				await follow( answer );
			} catch ( reason ) {
				failed( reason, 'Could not delete the comment:' );
			} finally {
				sending.value = false;
			}
		}

		onMounted( () => {
			globalThis.document?.body?.classList?.add?.( BODY_CLASS );
			if ( error.value ) {
				return;
			}
			if ( editorHost.value ) {
				editor = mountEditor( editorHost.value, {
					id: 'content',
					name: 'content',
					value: fields.content,
					settings: props.data?.quicktags,
					onInput: ( value ) => {
						fields.content = value;
					},
					ready: screenAssets?.ready,
				} );
			}
			if ( ! props.data?.isMobile ) {
				nextTick( () => nameField.value?.focus?.() );
			}
		} );
		onBeforeUnmount( () => {
			globalThis.document?.body?.classList?.remove?.( BODY_CLASS );
			editor?.destroy?.();
			editor = null;
		} );

		const statusLabel = computed( () => ( { 1: __( 'Approved', 'default' ), 0: __( 'Pending', 'default' ), spam: __( 'Spam', 'default' ) }[ props.data?.status ] ?? '' ) );
		const slotContext = computed( () => ( { comment: props.data?.comment ?? {} } ) );
		return {
			error, fields, sending, editorHost, nameField, boxList, boxes, layout, screenOptions, statusLabel, slotContext,
			save, remove,
			goBack: () => historyBack(),
			href: ( path ) => adminHref( path, where() ),
			setField: ( name ) => ( event ) => {
				fields[ name ] = String( event?.target?.value ?? '' );
			},
			setStatus: ( value ) => {
				fields.status = value;
			},
		};
	},
	template: `
		<template v-if="error">
			<div v-if="error.kind === 'die'" class="wp-die-message">{{ error.message }}</div>
			<div v-else class="wrap"><p>{{ error.message }}<template v-if="error.link">{{ ' ' }}<a href="#" @click.prevent="goBack">{{ error.link.text }}</a>.</template></p></div>
		</template>
		<form v-else name="post" id="post" method="post" class="wp-admin-comment-edit" @submit.prevent="save">
			<div id="poststuff">
				<div id="post-body" class="metabox-holder columns-2">
					<div id="post-body-content" class="edit-form-section edit-comment-section">
						<div v-if="data.permalink" class="inside">
							<div id="comment-link-box">
								<strong>{{ $_x( 'Permalink:', 'comment', 'default' ) }}</strong>
								{{ ' ' }}<span id="sample-permalink"><a :href="data.permalink">{{ data.permalink }}</a></span>
							</div>
						</div>
						<div id="namediv" class="stuffbox">
							<div class="inside">
								<h2 class="edit-comment-author">{{ $__( 'Author', 'default' ) }}</h2>
								<fieldset>
									<!-- translators: Hidden accessibility text. -->
									<legend class="screen-reader-text">{{ $__( 'Comment Author', 'default' ) }}</legend>
									<table class="form-table editcomment" role="presentation">
										<tbody>
											<tr>
												<td class="first"><label for="name">{{ $__( 'Name', 'default' ) }}</label></td>
												<td><input ref="nameField" type="text" name="newcomment_author" size="30" :value="fields.author" id="name" @input="setField( 'author' )( $event )" /></td>
											</tr>
											<tr>
												<td class="first"><label for="email">{{ $__( 'Email', 'default' ) }}</label></td>
												<td><input type="text" name="newcomment_author_email" size="30" class="code" :value="fields.email" id="email" @input="setField( 'email' )( $event )" /></td>
											</tr>
											<tr>
												<td class="first"><label for="newcomment_author_url">{{ $__( 'URL', 'default' ) }}</label></td>
												<td><input type="text" id="newcomment_author_url" name="newcomment_author_url" size="30" class="code" :value="fields.url" @input="setField( 'url' )( $event )" /></td>
											</tr>
										</tbody>
									</table>
								</fieldset>
							</div>
						</div>
						<div id="postdiv" class="postarea">
							<!-- translators: Hidden accessibility text. -->
							<label for="content" class="screen-reader-text">{{ $__( 'Comment', 'default' ) }}</label>
							<div id="wp-content-wrap" class="wp-core-ui wp-editor-wrap html-active">
								<div id="wp-content-editor-container" ref="editorHost" class="wp-editor-container"></div>
							</div>
						</div>
					</div>

					<div id="postbox-container-1" class="postbox-container">
						<div id="submitdiv" class="stuffbox">
							<h2>{{ $__( 'Save', 'default' ) }}</h2>
							<div class="inside">
								<div class="submitbox" id="submitcomment">
									<div id="minor-publishing">
										<div id="misc-publishing-actions">
											<div class="misc-pub-section misc-pub-comment-status" id="comment-status">
												{{ $__( 'Status:', 'default' ) }} <span id="comment-status-display">{{ statusLabel }}</span>
												<fieldset id="comment-status-radio">
													<!-- translators: Hidden accessibility text. -->
													<legend class="screen-reader-text">{{ $__( 'Comment status', 'default' ) }}</legend>
													<label><input type="radio" :checked="fields.status === '1'" name="comment_status" value="1" @change="setStatus( '1' )" />{{ $_x( 'Approved', 'comment status', 'default' ) }}</label><br />
													<label><input type="radio" :checked="fields.status === '0'" name="comment_status" value="0" @change="setStatus( '0' )" />{{ $_x( 'Pending', 'comment status', 'default' ) }}</label><br />
													<label><input type="radio" :checked="fields.status === 'spam'" name="comment_status" value="spam" @change="setStatus( 'spam' )" />{{ $_x( 'Spam', 'comment status', 'default' ) }}</label>
												</fieldset>
											</div>
											<Timestamp v-if="data.date" :date="data.date" v-model="fields.date" />
											<div v-if="data.response" class="misc-pub-section misc-pub-response-to">
												<Format :text="$__( 'In response to: %s', 'default' )"><template #arg1><b><a v-if="data.response.editUrl" :href="href( data.response.editUrl )">{{ data.response.title }}</a><template v-else>{{ data.response.title }}</template></b></template></Format>
											</div>
											<CommentParent :parent="data.parent ?? null" :choices="data.parentChoices ?? null" :parent-id="Number( data.comment?.parentId ?? 0 )" v-model="fields.parent" />
											<LegacyHtml v-if="data.miscActionsHtml" :html="data.miscActionsHtml" />
										</div>
										<div class="clear"></div>
									</div>
									<div id="major-publishing-actions">
										<div id="delete-action">
											<a v-if="data.deleteAction" class="submitdelete deletion" href="#" @click.prevent="remove">{{ data.deleteAction.label }}</a>
										</div>
										<div id="publishing-action">
											<input type="submit" name="save" id="save" class="button button-primary button-large" :value="$__( 'Update', 'default' )" :disabled="sending" />
										</div>
										<div class="clear"></div>
									</div>
								</div>
							</div>
						</div>
						<SlotOutlet name="side-after" :context="slotContext" />
					</div>

					<Contracted
						contract="core/meta-box-holder"
						:screen="data.screen ?? 'comment'"
						:layout="layout"
						:boxes="boxes"
						:reordering="screenOptions ? screenOptions.reordering !== false : true"
						:columns="0"
						:sections="screenOptions?.sections ?? []"
						:column-choices="[]"
						:container-ids="{ normal: 'postbox-container-2' }"
						:offer-screen-options="screenOptions !== null"
					>
						<template v-for="box in boxList" #[box.id]>
							<BoxContent :box="box" />
						</template>
					</Contracted>
					<SlotOutlet name="normal-after" :context="slotContext" />

					<input type="hidden" name="comment_ID" :value="String( data.comment?.id ?? '' )" />
					<input type="hidden" name="comment_post_ID" :value="String( data.comment?.postId ?? '' )" />
					<input type="hidden" name="c" :value="String( data.comment?.id ?? '' )" />
					<input type="hidden" name="p" :value="String( data.comment?.postId ?? '' )" />
				</div>
			</div>
		</form>
	`,
};
