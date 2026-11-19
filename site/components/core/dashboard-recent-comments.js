import { computed, inject, nextTick, reactive, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __, _x } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

// The backgrounds wp-lists gives a row whose moderation failed (dim, and delete).
const DIM_FAILED = '#FF3333';
const DELETE_FAILED = '#faa';

/**
 * The row actions as _wp_dashboard_recent_comments_row() labels them: the link text, the
 * accessible name and the link's classes, by action (`approve`, `unapprove`, `reply`, `edit`,
 * `spam`, `trash`, `delete`, `view`).
 */
function actionLabels() {
	return {
		approve: { text: __( 'Approve', 'default' ), label: __( 'Approve this comment', 'default' ), class: 'vim-a aria-button-if-js' },
		unapprove: { text: __( 'Unapprove', 'default' ), label: __( 'Unapprove this comment', 'default' ), class: 'vim-u aria-button-if-js' },
		/* translators: Comment reply button text. */
		reply: { text: _x( 'Reply', 'verb', 'default' ), label: __( 'Reply to this comment', 'default' ), class: 'vim-r button-link hide-if-no-js' },
		edit: { text: __( 'Edit', 'default' ), label: __( 'Edit this comment', 'default' ), class: null },
		/* translators: "Mark as spam" link. */
		spam: { text: _x( 'Spam', 'verb', 'default' ), label: __( 'Mark this comment as spam', 'default' ), class: 'vim-s vim-destructive aria-button-if-js' },
		trash: { text: _x( 'Trash', 'verb', 'default' ), label: __( 'Move this comment to the Trash', 'default' ), class: 'delete vim-d vim-destructive aria-button-if-js' },
		delete: { text: __( 'Delete Permanently', 'default' ), label: __( 'Delete this comment permanently', 'default' ), class: 'delete vim-d vim-destructive aria-button-if-js' },
		view: { text: __( 'View', 'default' ), label: __( 'View this comment', 'default' ), class: 'comment-link' },
	};
}

/**
 * The row actions to show, in order, each with the separator WordPress says precedes it
 * (`separator`, the classic row's rule): the links (with an address) and the actions that
 * call a moderation route (with a `request`, such as Reply, which has no address). Pure.
 *
 * @param {object[]|null} actions The row's `actions`.
 * @return {object[]} Each `{ action, url, request, hidden, separator }`.
 */
export function rowActions( actions ) {
	return list( actions )
		// Reply is always the native form (its request); an address on it is not read.
		.filter( ( action ) => ( action?.action === 'reply' ? isRequest( action.request ) : ( typeof action?.url === 'string' && action.url !== '' ) || isRequest( action?.request ) ) )
		.map( ( action ) => ( { ...action, request: isRequest( action.request ) ? action.request : null, separator: action.separator === true } ) );
}

/** Whether a value is the request of a moderation route WordPress described. Pure. */
function isRequest( request ) {
	return Boolean( request ) && typeof request.route === 'string' && request.route !== '' && ( request.method === 'POST' || request.method === 'DELETE' );
}

/**
 * Sends the request of a moderation route, with more fields in the body (the reply's content).
 *
 * @param {{method: string, route: string, body: object}} request The request WordPress described.
 * @param {object} [extra] Fields added to the body.
 * @return {Promise<object>} The answer.
 */
export function sendRequest( request, extra = {} ) {
	if ( request.method === 'DELETE' ) {
		return api.del( request.route );
	}
	const body = request.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {};
	return api.post( request.route, { ...body, ...extra } );
}

/**
 * The rows after an answer for one of them: the row WordPress sends replaces it; without one
 * (the comment is in the Trash, spam, deleted, or no longer listed for the user) it leaves,
 * unless it is kept hidden for its undo notice (`keep`). Pure.
 *
 * @param {object[]} rows   Rows shown.
 * @param {number}   id     Comment ID.
 * @param {object|null} row New row, or null.
 * @param {boolean}  keep   Whether to keep the old row when there is no new one.
 * @return {object[]} The rows.
 */
export function replaceRow( rows, id, row, keep = false ) {
	if ( row ) {
		return rows.map( ( item ) => ( item.id === id ? row : item ) );
	}
	return keep ? rows : rows.filter( ( item ) => item.id !== id );
}

/**
 * The rows with the classes of their position, as wp-lists `recolor` sets them: of the visible
 * rows, the first, third… are `odd` and `alt`, the second, fourth… `even`. The rows' other
 * classes stay. Pure.
 *
 * @param {object[]} rows     Rows shown.
 * @param {Function} isHidden Whether a row (by comment ID) is hidden.
 * @return {object[]} The rows.
 */
export function recolor( rows, isHidden = () => false ) {
	let position = 0;
	return rows.map( ( row ) => {
		if ( isHidden( row.id ) ) {
			return row;
		}
		const kept = list( row.classes ).filter( ( name ) => name !== 'even' && name !== 'odd' && name !== 'alt' );
		return { ...row, classes: position++ % 2 === 0 ? [ ...kept, 'odd', 'alt' ] : [ ...kept, 'even' ] };
	} );
}

/**
 * The rows with a reply's row after the comment replied to, as edit-comments.js places it
 * (after the reply form, which follows that comment). Pure.
 */
export function insertAfter( rows, id, row ) {
	if ( ! row || rows.some( ( item ) => item.id === row.id ) ) {
		return rows;
	}
	const index = rows.findIndex( ( item ) => item.id === id );
	const next = [ ...rows ];
	next.splice( index < 0 ? 0 : index + 1, 0, row );
	return next;
}

/**
 * Default implementation of core/dashboard-recent-comments: the Recent Comments widget, in the
 * markup wp_dashboard_recent_comments() prints (`#latest-comments`, `#the-comment-list` with a
 * row per comment, the comment views), or "No comments to show.".
 *
 * Which comments, their classes, author, avatar, excerpt, which row actions apply and their
 * addresses, and the views with their counts come as data; HTML that plugins filter (the author
 * link, the avatar, the row actions, the views) comes as HTML (kit/LegacyHtml).
 *
 * The moderation actions call the routes WordPress gives with each (`request`,
 * `wp-admin/v1/comments/…`) instead of following their classic `comment.php` address, as
 * edit-comments.js calls admin-ajax.php: the answer's row replaces the comment's, and its views
 * replace the views. Spam and Trash hide the row at once, as wp-lists does, and show the undo
 * notice the answer describes (wp_comment_trashnotice()); its Undo restores the comment and its
 * row. A failed action shows the row again with wp-lists' background. Reply opens the inline
 * reply form of wp_comment_reply() below the comment ("Approve and Reply" when WordPress says
 * replying approves it); its answer adds the reply's row after the comment and replaces the
 * comment's. Each answer is emitted as `moderated` (the page updates At a Glance with it).
 * When plugins filter the row actions, the core actions in their HTML work the same way. When a
 * plugin filters the reply form, Reply still opens the native one (the plugin's form is a gap).
 * After a row comes or goes, the visible rows' `even`, `odd` and `alt` classes follow their
 * position, as wp-lists recolors the list.
 * As on the classic Dashboard, no other comment comes in for one that leaves the list.
 */
export default {
	name: 'DashboardRecentComments',
	components: { SlotOutlet, Interpolate, LegacyHtml, Format },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'moderated' ],
	setup( props, { emit } ) {
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );

		const comments = shallowRef( list( props.data.comments ) );
		const views = shallowRef( list( props.data.views ) );
		const viewsHtml = shallowRef( Array.isArray( props.data.viewsHtml ) ? props.data.viewsHtml : null );
		// Per comment: `hidden` (taken out, waiting for the answer or undo), `flash` (background).
		const states = reactive( {} );
		// Per comment: the undo notice WordPress described, with the row's avatar.
		const undos = reactive( {} );
		const reply = reactive( { id: null, request: null, content: '', approve: false, sending: false, error: '' } );
		const replyField = shallowRef( null );
		const replyButtons = {};

		watch( () => props.data, ( data ) => {
			comments.value = list( data.comments );
			views.value = list( data.views );
			viewsHtml.value = Array.isArray( data.viewsHtml ) ? data.viewsHtml : null;
		} );

		const labels = computed( actionLabels );
		const text = {
			/* translators: 1: Comment author, 2: Post link, 3: Notification if the comment is pending. */
			fromOn: computed( () => __( 'From %1$s on %2$s %3$s', 'default' ) ),
			/* translators: 1: Comment author, 2: Notification if the comment is pending. */
			from: computed( () => __( 'From %1$s %2$s', 'default' ) ),
			/* translators: 1: Type of comment, 2: Post link, 3: Notification if the comment is pending. */
			typeOn: computed( () => _x( '%1$s on %2$s %3$s', 'dashboard', 'default' ) ),
			/* translators: 1: Type of comment, 2: Notification if the comment is pending. */
			type: computed( () => _x( '%1$s %2$s', 'dashboard', 'default' ) ),
		};
		const replyLabel = computed( () => ( reply.approve ? __( 'Approve and Reply', 'default' ) : _x( 'Reply', 'verb', 'default' ) ) );
		const countArgs = ( view ) => [ { tag: 'span', attributes: { class: view.countClass }, text: String( view.countText ?? view.count ?? '' ) } ];

		const state = ( id ) => {
			if ( ! states[ id ] ) {
				states[ id ] = { hidden: false, flash: null };
			}
			// The reactive object, not the one assigned.
			return states[ id ];
		};

		/** The visible rows take the classes of their position, as wp-lists recolor does. */
		const recolorRows = () => {
			comments.value = recolor( comments.value, ( id ) => states[ id ]?.hidden === true );
		};

		/** Applies what an answer says: the views, and who else needs it. */
		function applyCounts( answer ) {
			if ( Array.isArray( answer?.views ) ) {
				views.value = answer.views;
			}
			if ( answer && 'viewsHtml' in answer ) {
				viewsHtml.value = Array.isArray( answer.viewsHtml ) ? answer.viewsHtml : null;
			}
			emit( 'moderated', answer );
		}

		function closeReply( focus = true ) {
			const id = reply.id;
			reply.id = null;
			reply.content = '';
			reply.error = '';
			reply.sending = false;
			if ( focus && id !== null ) {
				nextTick( () => replyButtons[ id ]?.focus?.() );
			}
		}

		/** Runs a row action that calls a moderation route. */
		async function moderate( comment, action ) {
			const request = action.request;
			if ( ! isRequest( request ) ) {
				return;
			}
			if ( action.action === 'reply' ) {
				openReply( comment, action );
				return;
			}
			// WordPress says which actions take the row out at once (wp-lists `delete:` links).
			const removing = action.removes === true;
			const own = state( comment.id );
			own.flash = null;
			if ( removing ) {
				// As edit-comments.js: the reply form of the comment closes, and the row leaves at once.
				if ( reply.id === comment.id ) {
					closeReply( false );
				}
				own.hidden = true;
			}
			try {
				const answer = await sendRequest( request );
				if ( answer?.undo && isRequest( answer.undo.request ) ) {
					undos[ comment.id ] = { ...answer.undo, avatar: comment.avatar ?? null, avatarHtml: comment.avatarHtml ?? null };
				}
				comments.value = replaceRow( comments.value, comment.id, answer?.row ?? null, Boolean( undos[ comment.id ] ) );
				own.hidden = ! answer?.row && Boolean( undos[ comment.id ] );
				recolorRows();
				applyCounts( answer );
			} catch ( error ) {
				console.warn( 'Could not moderate the comment:', error );
				own.hidden = false;
				own.flash = removing ? DELETE_FAILED : DIM_FAILED;
			}
		}

		/** Restores a comment from its undo notice. */
		async function undo( id ) {
			const notice = undos[ id ];
			if ( ! notice ) {
				return;
			}
			// As edit-comments.js: the notice goes and the row comes back at once.
			delete undos[ id ];
			const own = state( id );
			own.hidden = false;
			own.flash = null;
			try {
				const answer = await sendRequest( notice.request );
				comments.value = replaceRow( comments.value, id, answer?.row ?? null );
				recolorRows();
				applyCounts( answer );
			} catch ( error ) {
				console.warn( 'Could not restore the comment:', error );
				own.flash = DELETE_FAILED;
			}
		}

		function discardChanges() {
			if ( reply.content === '' ) {
				return true;
			}
			return globalThis.confirm?.( __( 'Are you sure you want to do this?\nThe comment changes you made will be lost.', 'default' ) ) ?? true;
		}

		function openReply( comment, action ) {
			if ( ! discardChanges() ) {
				return;
			}
			closeReply( false );
			reply.id = comment.id;
			reply.approve = action.approveParent === true;
			reply.request = action.request;
			nextTick( () => replyField.value?.focus?.() );
		}

		async function sendReply() {
			if ( reply.sending || reply.id === null ) {
				return;
			}
			const id = reply.id;
			reply.error = '';
			reply.sending = true;
			try {
				const answer = await sendRequest( reply.request, { content: reply.content } );
				closeReply();
				let rows = comments.value;
				if ( answer?.parent?.row ) {
					rows = replaceRow( rows, id, answer.parent.row );
				}
				comments.value = insertAfter( rows, id, answer?.row ?? null );
				recolorRows();
				applyCounts( answer );
			} catch ( error ) {
				reply.sending = false;
				// WordPress's message, else wpAjax.broken, as commentReply.error() shows.
				reply.error = typeof error?.message === 'string' && error.message !== '' ? error.message : __( 'An error occurred while processing your request. Please try again later.', 'default' );
				speak( reply.error );
			}
		}

		function onReplyKey( event ) {
			// As edit-comments.js: Escape closes the form (unless an input method is composing).
			if ( event.key === 'Escape' && ! event.isComposing ) {
				closeReply();
			}
		}

		/** The core actions in the row actions' HTML (filtered by plugins) work as the others. */
		function onActionsHtml( comment, event ) {
			const span = event?.target?.closest?.( 'span' );
			if ( ! span || ! event.target.closest( 'a, button' ) ) {
				return;
			}
			const action = rowActions( comment.actions ).find( ( item ) => item.request && span.classList?.contains?.( item.action ) );
			if ( action ) {
				event.preventDefault();
				moderate( comment, action );
			}
		}

		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		// As the classic row: a comment (not a pingback or other type) with its avatar shown.
		const hasAvatar = ( comment ) => comment.type === 'comment' && Boolean( comment.avatar || comment.avatarHtml );
		// The notice's kind (`trash` or `spam`) as WordPress gives it: its classes follow it.
		const undoKind = ( notice ) => ( notice?.kind === 'spam' ? 'spam' : 'trash' );
		return {
			comments, views, viewsHtml, labels, text, countArgs, rowActions, hasAvatar, slotContext, states, undos, reply, replyLabel, undoKind,
			moderate, undo, sendReply, closeReply, onReplyKey, onActionsHtml,
			setReplyField: ( element ) => {
				replyField.value = element;
			},
			replyButton: ( id ) => ( element ) => {
				replyButtons[ id ] = element;
			},
			// Reply opens the form when WordPress gave its route; else it is a link (kept out of the template: no `&`).
			replyButtonShown: ( action ) => action.action === 'reply' && Boolean( action.request ),
			rowStyle: ( id ) => {
				const own = states[ id ];
				return own?.hidden ? { display: 'none' } : own?.flash ? { backgroundColor: own.flash } : null;
			},
			href: ( path ) => adminHref( path ),
		};
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<p v-if="! comments.length">{{ $__( 'No comments to show.', 'default' ) }}</p>
		<div v-else id="latest-comments" class="activity-block table-view-list">
			<ul id="the-comment-list">
				<template v-for="comment in comments" :key="comment.id">
					<div v-if="undos[ comment.id ]" :id="'undo-' + comment.id" :class="[ 'undo', 'un' + undoKind( undos[ comment.id ] ) ]">
						<div :class="undoKind( undos[ comment.id ] ) + '-undo-inside'">
							<LegacyHtml v-if="undos[ comment.id ].avatarHtml" tag="span" :html="undos[ comment.id ].avatarHtml" :assets="assets" />
							<img v-else-if="undos[ comment.id ].avatar" alt="" :src="undos[ comment.id ].avatar" class="avatar avatar-50 photo" height="50" width="50" loading="lazy" decoding="async">
							<Format :text="undos[ comment.id ].message"><template #arg1><strong>{{ undos[ comment.id ].author }}</strong></template></Format>
							{{ ' ' }}<span :class="[ 'undo', 'un' + undoKind( undos[ comment.id ] ) ]"><a href="#" role="button" class="vim-z vim-destructive aria-button-if-js" @click.prevent="undo( comment.id )">{{ $__( 'Undo', 'default' ) }}</a></span>
						</div>
					</div>
					<li :id="'comment-' + comment.id" :class="comment.classes" :style="rowStyle( comment.id )">
						<LegacyHtml v-if="comment.avatarHtml" tag="span" :html="comment.avatarHtml" :assets="assets" />
						<img v-else-if="comment.avatar" alt="" :src="comment.avatar" class="avatar avatar-50 photo" height="50" width="50" loading="lazy" decoding="async">
						<div :class="[ 'dashboard-comment-wrap', 'has-row-actions', { 'has-avatar': hasAvatar( comment ) } ]">
							<p class="comment-meta">
								<Format :text="comment.type === 'comment' ? ( comment.post ? text.fromOn.value : text.from.value ) : ( comment.post ? text.typeOn.value : text.type.value )">
									<template #arg1>
										<cite v-if="comment.type === 'comment'" class="comment-author">
											<LegacyHtml v-if="comment.author.html" tag="span" :html="comment.author.html" :assets="assets" />
											<a v-else-if="comment.author.url" :href="comment.author.url" class="url" :rel="comment.author.rel">{{ comment.author.name }}</a>
											<template v-else>{{ comment.author.name }}</template>
										</cite>
										<strong v-else>{{ comment.typeLabel }}</strong>
									</template>
									<template #arg2>
										<a v-if="comment.post" :href="comment.post.url">{{ comment.post.title }}</a>
										<span v-else class="approve">{{ $__( '[Pending]', 'default' ) }}</span>
									</template>
									<template #arg3><span class="approve">{{ $__( '[Pending]', 'default' ) }}</span></template>
								</Format>
							</p>
							<p v-if="comment.type !== 'comment'" class="comment-author">
								<LegacyHtml v-if="comment.author.html" tag="span" :html="comment.author.html" :assets="assets" />
								<a v-else-if="comment.author.url" :href="comment.author.url" class="url" :rel="comment.author.rel">{{ comment.author.name }}</a>
								<template v-else>{{ comment.author.name }}</template>
							</p>
							<blockquote><p>{{ comment.excerpt }}</p></blockquote>
							<p v-if="comment.actionsHtml" class="row-actions" @click="onActionsHtml( comment, $event )"><LegacyHtml tag="span" :html="comment.actionsHtml" :assets="assets" /></p>
							<p v-else-if="rowActions( comment.actions ).length" class="row-actions"><span v-for="action in rowActions( comment.actions )" :key="action.action" :class="[ action.action, { 'hide-if-no-js': action.action === 'reply', hidden: action.hidden } ]"><template v-if="action.separator"> | </template><button v-if="replyButtonShown( action )" :ref="replyButton( comment.id )" type="button" :class="labels.reply.class" :aria-label="labels.reply.label" :aria-expanded="reply.id === comment.id ? 'true' : 'false'" @click="moderate( comment, action )">{{ labels.reply.text }}</button><a v-else-if="action.request" :href="href( action.url )" role="button" :class="labels[ action.action ]?.class ?? null" :aria-label="labels[ action.action ]?.label ?? null" @click.prevent="moderate( comment, action )">{{ labels[ action.action ]?.text ?? action.action }}</a><a v-else :href="href( action.url )" :class="labels[ action.action ]?.class ?? null" :aria-label="labels[ action.action ]?.label ?? null">{{ labels[ action.action ]?.text ?? action.action }}</a></span></p>
						</div>
					</li>
					<div v-if="reply.id === comment.id" id="replyrow">
						<fieldset class="comment-reply">
							<legend><span id="replyhead">{{ $__( 'Reply to Comment', 'default' ) }}</span></legend>
							<div id="replycontainer">
								<!-- translators: Hidden accessibility text. -->
								<label for="replycontent" class="screen-reader-text">{{ $__( 'Comment', 'default' ) }}</label>
								<div id="wp-replycontent-wrap" class="wp-core-ui wp-editor-wrap html-active">
									<div id="wp-replycontent-editor-container" class="wp-editor-container">
										<textarea :ref="setReplyField" class="wp-editor-area" rows="20" cols="40" autocomplete="off" name="replycontent" id="replycontent" :value="reply.content" @input="reply.content = $event.target.value" @keyup="onReplyKey"></textarea>
									</div>
								</div>
							</div>
							<div id="replysubmit" class="submit">
								<p class="reply-submit-buttons">
									<button type="button" class="save button button-primary" :disabled="reply.sending" @click="sendReply"><span id="replybtn">{{ replyLabel }}</span></button>
									{{ ' ' }}<button type="button" class="cancel button" @click="closeReply()">{{ $__( 'Cancel', 'default' ) }}</button>
									{{ ' ' }}<span :class="[ 'waiting', 'spinner', { 'is-active': reply.sending } ]"></span>
								</p>
								<div :class="[ 'notice', 'notice-error', 'notice-alt', 'inline', { hidden: ! reply.error } ]"><p class="error">{{ reply.error }}</p></div>
							</div>
						</fieldset>
					</div>
				</template>
			</ul>
			<template v-if="viewsHtml || views.length">
				<!-- translators: Hidden accessibility text. -->
				<h3 class="screen-reader-text">{{ $__( 'View more comments', 'default' ) }}</h3>
				<ul class="subsubsub">
					<template v-if="viewsHtml">
						<template v-for="( view, index ) in viewsHtml" :key="view.key"><li :class="view.key"><LegacyHtml tag="span" :html="view.html" :assets="assets" /><template v-if="index < viewsHtml.length - 1">{{ ' |' }}</template></li>{{ ' ' }}</template>
					</template>
					<template v-else>
						<template v-for="( view, index ) in views" :key="view.key"><li :class="view.key"><a :href="href( view.url )" :class="{ current: view.current }" :aria-current="view.current ? 'page' : null"><Interpolate :text="view.format ?? view.label" :args="countArgs( view )" :tags="{ span: { class: 'count' } }" /></a><template v-if="index < views.length - 1">{{ ' |' }}</template></li>{{ ' ' }}</template>
					</template>
				</ul>
			</template>
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
