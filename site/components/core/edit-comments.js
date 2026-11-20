import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, watchEffect } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { redirectTarget } from '../../runtime/router.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { preferencesRoute } from './meta-box-holder.js';
import RowCell, { inlineAction, isRequest, shownActions } from './edit-comments/rows.js';
import InlineForm from './edit-comments/inline-form.js';
import UndoRow from './edit-comments/undo-row.js';
import { ANSWER_TIMEOUT, orderedAnswers } from './comment-parts/ordered-answers.js';
import { hotkeyCommand, hotkeyPage, initialRow, rowActionForKey } from './edit-comments/hotkeys.js';
import {
	afterEdit, afterModeration, afterReply, afterScreenOptions, afterUndo, bulkCheck, dimRow, hiddenColumns,
	hideRow, isCurrentAddress, listQuery, listState, showRow,
} from './edit-comments/state.js';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './edit-comments/help.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables', 'editor-buttons' ];

// The classic screen's body class (admin-header.php, from the hook suffix `edit-comments.php`).
const BODY_CLASS = 'edit-comments-php';
const SCREEN = 'edit-comments';
const BULK_ROUTE = 'wp-admin/v1/comments/bulk';
// The backgrounds wp-lists gives a row whose action failed (dim, and delete).
const DIM_FAILED = '#FF3333';
const DELETE_FAILED = '#faa';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The values of the bulk actions WordPress offers (options, and those of optgroups). Pure. */
export function offeredBulkActions( actions ) {
	return list( actions ).flatMap( ( action ) => ( Array.isArray( action?.options ) ? action.options.map( ( option ) => option?.value ) : [ action?.value ] ) ).filter( ( value ) => typeof value === 'string' && value !== '' );
}

/**
 * The route of a DELETE request with the list it answers for: a DELETE has no body, so `screen`
 * and `list` go in its query, as PHP reads `list[comment_status]`. Pure.
 */
export function deleteRoute( route, query ) {
	const params = new URLSearchParams();
	params.append( 'screen', SCREEN );
	for ( const [ key, value ] of Object.entries( query ?? {} ) ) {
		if ( value !== null && value !== undefined && typeof value !== 'object' ) {
			params.append( 'list[' + key + ']', String( value ) );
		}
	}
	return route + ( route.includes( '?' ) ? '&' : '?' ) + params.toString();
}

/**
 * Default implementation of core/edit-comments: the Comments screen (wp-admin/edit-comments.php)
 * in its classic markup: the messages (`#moderated`), the views, then `form#comments-form` (a GET
 * form, holding the search, the classic hidden fields, the navigation above and below the table
 * with the comment type filter, the plugins' `restrict_manage_comments` and `manage_comments_nav`
 * output, Empty Spam or Empty Trash, and the table `#the-comment-list`), then `#com-reply` and the
 * undo holders. The body has the classic `edit-comments-php` class while it is shown.
 *
 * Everything WordPress decides comes as data: the rows, which actions each has and the route each
 * calls, which ones dim the row and which remove it (`dims`, `removes`), the counts, the title,
 * the messages and where a bulk action leads. The page reproduces edit-comments.js and common.js:
 *
 * - A row action with a `request` calls it with `screen: 'edit-comments'` and `list` (the list's
 *   `query`). One that dims toggles the row's `unapproved` class at once; one that removes hides
 *   the row at once. The answer (state.js) places the row, the undo row after Trash or Spam
 *   (its Undo calls the undo's request), the first extra row that comes in for a row that left, the
 *   views, the "%s items" total, the post's bubble and the document title
 *   (`frameChannel.setTitle()`), and the menu bubble (`frameChannel.setMenuCounts()`). Edit is a
 *   link the router opens. The row actions plugins filtered (`actionsHtml`) are their HTML, whose
 *   core actions work the same way.
 * - Quick Edit and Reply open the core inline form (edit-comments/inline-form.js) after the row;
 *   Quick Edit hides the row while it is open. Double-clicking the comment's text opens Quick
 *   Edit. Opening another form asks before discarding changes, with edit-comments.js's two
 *   messages. Quick Edit posts `POST comments/{id}`, Reply posts the reply route; an error shows in
 *   the form and is spoken.
 * - Filter and Search navigate to `edit-comments.php` with the form's fields (with the plugins'),
 *   less the bulk fields. Apply checks as common.js does ("Please select a bulk action to
 *   perform.", "Please select at least one item to perform this action on."), then posts
 *   `comments/bulk` with the checked rows and follows the answer (`redirect` through the router,
 *   reloading the list when it is the address shown; `location` as a full-page load). Empty Spam
 *   and Empty Trash post `delete_all`. The top and bottom bulk selects stay the same.
 * - The messages' Undo calls its request and follows the answer.
 * - Screen Options gives the frame the table's options: a column checkbox hides the column's
 *   cells at once and saves `columnsHidden`; Apply saves `perPage` and `mode`, then the list is
 *   read again.
 * - With keyboard shortcuts on (`hotkeys.enabled`), the shortcuts of edit-comments.js
 *   (edit-comments/hotkeys.js).
 *
 * The comment's text shows through kit/InertHtml, which runs nothing, in the list and as the
 * Quick Edit field's text (a textarea value).
 */
export default {
	name: 'EditComments',
	components: { Contracted, SlotOutlet, InlineMarkup, LegacyHtml, Format, RowCell, InlineForm, UndoRow },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'moderated' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const screenOptions = inject( 'screenOptions', null );
		const frameChannel = inject( 'frameChannel', null );
		const confirm = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) ?? true );
		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const keyTarget = inject( 'hotkeysTarget', globalThis.document ?? null );
		// The location shown (`pageLocation` may be provided: tests).
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/edit-comments.php', search: '' };

		const pageFailed = computed( () => props.data?.failed === true );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' ? props.data.query : {} ) );
		const state = shallowRef( listState( props.data ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const messagesShown = ref( true );
		const hiddenKeys = ref( list( props.data?.columns ).filter( ( column ) => column.hidden ).map( ( column ) => column.key ) );
		const current = ref( initialRow( list( props.data?.items ).map( ( item ) => item.id ), props.data?.hotkeys ) );
		const form = reactive( { id: null, postId: null, mode: null, request: null, content: '', original: '', author: '', email: '', url: '', approve: false, sending: false, error: '' } );
		const formEl = ref( null );
		const buttons = {};
		// The navigation above the table shows when the list had rows when it was read (display()).
		const hadItems = computed( () => list( props.data?.items ).length > 0 );
		// Per row: the wp-lists background of a failed action (dim, delete), until it is acted on again.
		const flashes = ref( {} );
		const flash = ( id, color ) => {
			flashes.value = { ...flashes.value, [ id ]: color };
		};
		const unflash = ( id ) => {
			if ( Object.hasOwn( flashes.value, id ) ) {
				const next = { ...flashes.value };
				delete next[ id ];
				flashes.value = next;
			}
		};

		/*
		 * Answers are applied in the order their requests were sent, whatever order they arrive in
		 * (comment-parts/ordered-answers.js): each answer's views, total, title, menu count and
		 * extra rows are a snapshot of the list when the server answered. A request sent before the
		 * data changed (a navigation, a refresh) or before the page unmounted is dropped: its
		 * answer is about a list no longer shown.
		 */
		const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT, timeoutError: () => new Error( broken() ) } );
		const ordered = answers.ordered;

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		const errorText = ( error ) => ( typeof error?.message === 'string' && error.message !== '' ? error.message : broken() );
		/** A failed request is said in a page notice and spoken, never only logged. */
		function failed( error, what ) {
			console.warn( what, error );
			const message = errorText( error );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
		}

		watch( () => props.data, ( data ) => {
			answers.reset();
			undoing.value = [];
			flashes.value = {};
			state.value = listState( data );
			selected.value = [];
			bulkValue.value = '-1';
			messagesShown.value = true;
			hiddenKeys.value = list( data?.columns ).filter( ( column ) => column.hidden ).map( ( column ) => column.key );
			current.value = initialRow( list( data?.items ).map( ( item ) => item.id ), data?.hotkeys );
			closeForm( false );
			frameChannel?.setTitle?.( state.value.title || null );
		} );

		const columns = computed( () => list( props.data?.columns ).map( ( column ) => ( { ...column, hidden: column.key !== 'cb' && hiddenKeys.value.includes( column.key ) } ) ) );
		const colspan = computed( () => columns.value.filter( ( column ) => ! column.hidden ).length );
		const rowOf = ( id ) => state.value.items.find( ( item ) => item.id === id ) ?? null;
		const isHidden = ( item ) => state.value.hidden.includes( item.id ) || ( form.mode === 'edit' && form.id === item.id );
		const visibleIds = computed( () => state.value.items.filter( ( item ) => ! isHidden( item ) ).map( ( item ) => item.id ) );

		// The reply button follows the row's class, as dimAfter() changes its text.
		watchEffect( () => {
			if ( form.mode === 'replyto' ) {
				form.approve = list( rowOf( form.id )?.classes ).includes( 'unapproved' );
			}
		} );

		/** Tells the frame and the page's listeners what an answer says. */
		function announce( answer ) {
			if ( answer && typeof answer === 'object' ) {
				if ( typeof answer.title === 'string' && answer.title !== '' ) {
					frameChannel?.setTitle?.( answer.title );
				}
				if ( answer.menuCounts && typeof answer.menuCounts === 'object' ) {
					frameChannel?.setMenuCounts?.( answer.menuCounts );
				}
			}
			emit( 'moderated', answer );
		}

		/** Sends a route WordPress described, for this list. */
		function send( request, extra = {} ) {
			if ( request.method === 'DELETE' ) {
				return api.del( deleteRoute( request.route, query.value ) );
			}
			const body = request.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {};
			return api.post( request.route, { ...body, ...extra, screen: SCREEN, list: query.value } );
		}

		const unselect = ( id ) => {
			selected.value = selected.value.filter( ( key ) => key !== id );
		};

		// Inline form ------------------------------------------------------------------------

		function closeForm( focus = true ) {
			const id = form.id;
			const mode = form.mode;
			Object.assign( form, { id: null, postId: null, mode: null, request: null, content: '', original: '', author: '', email: '', url: '', approve: false, sending: false, error: '' } );
			if ( focus && id !== null ) {
				nextTick( () => buttons[ id + ':' + ( mode === 'edit' ? 'quickedit' : 'reply' ) ]?.focus?.() );
			}
		}

		/** Whether changes in the form may be lost (commentReply.discardCommentChanges()). */
		function discardChanges() {
			if ( form.id === null || form.content === '' || form.content === form.original ) {
				return true;
			}
			return Boolean( confirm( __( 'Are you sure you want to do this?\nThe comment changes you made will be lost.', 'default' ) ) );
		}

		function openForm( item, action ) {
			const mode = inlineAction( action );
			// A form whose save is on its way stays until it is answered (commentReply waits too).
			if ( ! mode || form.sending || ! discardChanges() ) {
				return;
			}
			closeForm( false );
			const inline = item.inline ?? {};
			const content = mode === 'edit' ? String( inline.content ?? '' ) : '';
			Object.assign( form, {
				id: item.id,
				postId: item.postId,
				mode,
				request: action.request,
				content,
				original: content,
				author: mode === 'edit' ? String( inline.author ?? '' ) : '',
				email: mode === 'edit' ? String( inline.email ?? '' ) : '',
				url: mode === 'edit' ? String( inline.url ?? '' ) : '',
				approve: mode === 'replyto' && list( item.classes ).includes( 'unapproved' ),
			} );
		}

		/** Double-click on a comment's text: Quick Edit (commentReply.toggle()). */
		function toggle( item ) {
			if ( isHidden( item ) ) {
				return;
			}
			const quickEdit = shownActions( item.actions ).find( ( action ) => action.action === 'quickedit' && isRequest( action.request ) );
			if ( ! quickEdit ) {
				return;
			}
			if ( form.id !== null && ! confirm( __( 'Are you sure you want to edit this comment?\nThe changes you made will be lost.', 'default' ) ) ) {
				return;
			}
			openForm( item, quickEdit );
		}

		function saveForm() {
			if ( form.sending || form.id === null || ! isRequest( form.request ) ) {
				return Promise.resolve();
			}
			const id = form.id;
			const mode = form.mode;
			const mineForm = () => form.id === id && form.mode === mode;
			form.error = '';
			form.sending = true;
			const request = mode === 'edit'
				? send( form.request, { author: form.author, email: form.email, url: form.url, content: form.content } )
				: send( form.request, { content: form.content } );
			return ordered( request, ( answer ) => {
				if ( mineForm() ) {
					closeForm();
				}
				state.value = mode === 'edit'
					? afterEdit( state.value, { id, answer } )
					: afterReply( state.value, { parentId: id, answer, view: String( query.value.comment_status ?? '' ) } );
				announce( answer );
			}, ( error ) => {
				if ( ! mineForm() ) {
					failed( error, 'Could not save the comment:' );
					return;
				}
				form.sending = false;
				// WordPress's message, else wpAjax.broken, as commentReply.error() shows.
				form.error = errorText( error );
				speak( form.error );
			} );
		}

		// Row actions ------------------------------------------------------------------------

		function moderate( item, action ) {
			const id = item.id;
			const removes = action.removes === true;
			const dims = action.dims === true;
			unflash( id );
			if ( removes ) {
				// As wp-lists and edit-comments.js: the row leaves at once, unchecked, its form closed.
				if ( form.id === id && ! form.sending ) {
					closeForm( false );
				}
				unselect( id );
				state.value = hideRow( state.value, id );
			} else if ( dims ) {
				state.value = dimRow( state.value, id );
			}
			return ordered( send( action.request ), ( answer ) => {
				state.value = afterModeration( state.value, { row: item, action, answer } );
				announce( answer );
			}, ( error ) => {
				// As wp-lists: the row is shown again as it was, with the failure's background.
				if ( removes ) {
					state.value = showRow( state.value, id );
				} else if ( dims ) {
					state.value = dimRow( state.value, id );
				}
				flash( id, removes ? DELETE_FAILED : DIM_FAILED );
				failed( error, 'Could not moderate the comment:' );
			} );
		}

		function act( item, action ) {
			if ( inlineAction( action ) ) {
				if ( isRequest( action.request ) ) {
					openForm( item, action );
				}
				return;
			}
			if ( isRequest( action.request ) ) {
				moderate( item, action );
			}
		}

		/** The core actions in the row actions plugins filtered work as the others. */
		function onActionsHtml( item, event ) {
			const span = event?.target?.closest?.( 'span' );
			if ( ! span || ! event.target.closest( 'a, button' ) ) {
				return;
			}
			const action = shownActions( item.actions ).find( ( candidate ) => isRequest( candidate.request ) && span.classList?.contains?.( candidate.action ) );
			if ( action ) {
				event.preventDefault();
				act( item, action );
			}
		}

		// Undo rows whose request is on its way: the comment shows restored only once the server says so.
		const undoing = ref( [] );
		function undo( id ) {
			const notice = state.value.undos[ id ];
			if ( ! notice || ! isRequest( notice.request ) || undoing.value.includes( id ) ) {
				return Promise.resolve();
			}
			undoing.value = [ ...undoing.value, id ];
			const settle = () => {
				undoing.value = undoing.value.filter( ( item ) => item !== id );
			};
			return ordered( send( notice.request ), ( answer ) => {
				settle();
				state.value = afterUndo( state.value, { id, answer } );
				announce( answer );
			}, ( error ) => {
				// The comment is still where it was moved: its undo row stays.
				settle();
				failed( error, 'Could not restore the comment:' );
			} );
		}

		// List form, bulk actions, messages ----------------------------------------------------

		/** Opens where an answer of the bulk route leads; the list is read again when it is the address shown. */
		async function follow( answer ) {
			const target = redirectTarget( answer ?? {}, where() );
			if ( ! target ) {
				return;
			}
			if ( ! router?.follow ) {
				globalThis.location?.assign?.( target.url );
				return;
			}
			const same = target.kind === 'admin' && isCurrentAddress( target.url, where() );
			await router.follow( answer );
			if ( same ) {
				await router.refresh?.();
			}
		}

		function navigate( path ) {
			const url = adminHref( path );
			if ( router?.navigate ) {
				router.navigate( url );
			} else {
				globalThis.location?.assign?.( url );
			}
		}

		/** Filter and Search: the list form's GET submit, through the router. */
		function submitList( replace = {} ) {
			closeForm( false );
			const qs = listQuery( readForm( formEl.value ), replace );
			navigate( 'edit-comments.php' + ( qs ? '?' + qs : '' ) );
		}

		function bulkError( check ) {
			const message = check.kind === 'action' ? __( 'Please select a bulk action to perform.', 'default' ) : __( 'Please select at least one item to perform this action on.', 'default' );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			globalThis.scrollTo?.( 0, 0 );
			speak( message );
		}

		async function applyBulk( value ) {
			const action = String( value ?? bulkValue.value );
			const ids = selected.value.filter( ( id ) => ! state.value.hidden.includes( id ) );
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return;
			}
			closeForm( false );
			try {
				await follow( await api.post( BULK_ROUTE, { action, ids, list: query.value } ) );
			} catch ( error ) {
				failed( error, 'Could not run the bulk action:' );
			}
		}

		async function emptyList() {
			const empty = props.data?.filters?.empty;
			if ( ! empty ) {
				return;
			}
			closeForm( false );
			try {
				await follow( await api.post( BULK_ROUTE, { action: 'delete_all', emptyStatus: empty.status, pagegenTimestamp: empty.pagegenTimestamp, list: query.value } ) );
			} catch ( error ) {
				failed( error, 'Could not empty the list:' );
			}
		}

		async function undoMessage( message ) {
			const request = message?.undo;
			if ( ! isRequest( request ) ) {
				return;
			}
			try {
				await follow( await api.post( request.route, { ...( request.body ?? {} ), list: query.value } ) );
			} catch ( error ) {
				failed( error, 'Could not undo:' );
			}
		}

		// Empty Spam / Empty Trash go once their view is empty (edit-comments.js hides #delete_all).
		const emptyShown = computed( () => {
			const empty = props.data?.filters?.empty;
			if ( ! empty ) {
				return false;
			}
			const view = state.value.views.find( ( item ) => item.key === empty.status );
			return ! view || Number( view.count ) > 0;
		} );

		// Screen Options ----------------------------------------------------------------------

		let withdrawOptions = () => {};
		function offerScreenOptions() {
			withdrawOptions();
			const options = props.data?.screenOptions;
			if ( ! screenOptions?.set || ! options || pageFailed.value ) {
				withdrawOptions = () => {};
				return;
			}
			withdrawOptions = screenOptions.set( {
				tableColumns: list( options.tableColumns ).map( ( column ) => ( { ...column, hidden: hiddenKeys.value.includes( column.key ) } ) ),
				pagination: options.perPage ?? null,
				viewMode: options.viewMode ?? null,
				settingsHtml: typeof options.settingsHtml === 'string' ? options.settingsHtml : null,
				tableColumnsLegend: typeof options.legend === 'string' ? options.legend : null,
				onChange: onScreenOption,
				onApply: onScreenOptionsApply,
			} ) ?? ( () => {} );
		}
		async function onScreenOption( id, value ) {
			if ( id !== 'hide-column' || typeof value?.key !== 'string' ) {
				return;
			}
			hiddenKeys.value = hiddenColumns( hiddenKeys.value, value.key, value.hidden === true );
			offerScreenOptions();
			try {
				await api.post( preferencesRoute( SCREEN ), { columnsHidden: [ ...hiddenKeys.value ] } );
			} catch ( error ) {
				failed( error, 'Could not save the hidden columns:' );
			}
		}
		async function onScreenOptionsApply( { perPage = null, mode = null } = {} ) {
			const body = {};
			if ( Number.isInteger( perPage ) ) {
				body.perPage = perPage;
			}
			if ( typeof mode === 'string' && mode !== '' ) {
				body.mode = mode;
			}
			try {
				await api.post( preferencesRoute( SCREEN ), body );
			} catch ( error ) {
				// Not saved: the list is not read again with the old values.
				failed( error, 'Could not save the screen options:' );
				return;
			}
			const next = afterScreenOptions( where() );
			if ( router?.navigate && ! isCurrentAddress( next, where() ) ) {
				await router.navigate( next, { replace: true } );
			} else {
				await router?.refresh?.();
			}
		}

		// Keyboard shortcuts --------------------------------------------------------------------

		function onKeypress( event ) {
			const command = hotkeyCommand( event, {
				ids: visibleIds.value,
				current: current.value,
				actionOf: ( id, key ) => rowActionForKey( shownActions( rowOf( id )?.actions ).filter( ( action ) => isRequest( action.request ) ), key ),
			} );
			if ( ! command ) {
				return;
			}
			event.preventDefault?.();
			const item = command.id !== undefined ? rowOf( command.id ) : null;
			switch ( command.type ) {
				case 'current':
					current.value = command.id;
					nextTick( () => globalThis.document?.getElementById?.( 'comment-' + command.id )?.scrollIntoView?.( false ) );
					break;
				case 'page': {
					const path = hotkeyPage( state.value.pagination?.links, command.which );
					if ( path ) {
						navigate( path );
					}
					break;
				}
				case 'check':
					if ( item?.canEdit ) {
						selected.value = selected.value.includes( item.id ) ? selected.value.filter( ( id ) => id !== item.id ) : [ ...selected.value, item.id ];
					}
					break;
				case 'check-all': {
					const keys = state.value.items.filter( ( row ) => row.canEdit && ! state.value.hidden.includes( row.id ) ).map( ( row ) => row.id );
					selected.value = keys.filter( ( id ) => ! selected.value.includes( id ) );
					break;
				}
				case 'action': {
					const action = shownActions( item?.actions ).find( ( candidate ) => candidate.action === command.action );
					current.value = command.current;
					if ( item && action ) {
						act( item, action );
					}
					break;
				}
				case 'edit': {
					const edit = shownActions( item?.actions ).find( ( candidate ) => candidate.action === 'edit' );
					if ( edit?.url ) {
						navigate( edit.url );
					}
					break;
				}
				case 'bulk': {
					// As make_bulk(): only an action the list offers can be chosen; without the
					// option, Apply runs with the action already chosen (and common.js's check).
					// Without bulk actions there is no Apply to click.
					const offered = offeredBulkActions( props.data?.bulkActions );
					if ( offered.length === 0 ) {
						break;
					}
					if ( offered.includes( command.value ) ) {
						bulkValue.value = command.value;
					}
					applyBulk( bulkValue.value );
					break;
				}
			}
		}

		onMounted( () => {
			globalThis.document?.body?.classList?.add?.( BODY_CLASS );
			frameChannel?.setTitle?.( state.value.title || null );
			offerScreenOptions();
			if ( props.data?.hotkeys?.enabled ) {
				keyTarget?.addEventListener?.( 'keypress', onKeypress );
			}
		} );
		watch( () => props.data, offerScreenOptions );
		onBeforeUnmount( () => {
			answers.reset();
			globalThis.document?.body?.classList?.remove?.( BODY_CLASS );
			keyTarget?.removeEventListener?.( 'keypress', onKeypress );
			withdrawOptions();
		} );

		const slotContext = computed( () => ( { query: query.value } ) );
		return {
			pageFailed, query, state, selected, bulkValue, messagesShown, columns, colspan, form, formEl, hadItems, emptyShown, slotContext, current,
			act, toggle, onActionsHtml, undo, saveForm, closeForm, applyBulk, emptyList, undoMessage, submitList,
			onSearch: ( term ) => submitList( { s: term } ),
			onSubmit: () => submitList(),
			rowId: ( item ) => 'comment-' + item.id,
			rowClasses: ( item ) => [ ...list( item.classes ), ...( isHidden( item ) ? [ 'hidden' ] : [] ), ...( current.value === item.id ? [ 'vim-current' ] : [] ) ],
			rowStyle: ( item ) => ( Object.hasOwn( flashes.value, item.id ) ? { backgroundColor: flashes.value[ item.id ] } : null ),
			selectable: ( item ) => item.canEdit === true && ! state.value.hidden.includes( item.id ),
			checkboxLabel: () => __( 'Select comment', 'default' ),
			expanded: ( item ) => ( form.id === item.id ? form.mode : null ),
			buttonRef: ( id, action, element ) => {
				buttons[ id + ':' + action ] = element;
			},
			href: ( path ) => adminHref( path ),
			typeValue: computed( () => list( props.data?.filters?.commentTypes ).find( ( type ) => type.selected )?.value ?? '' ),
			messages: computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-edit-comments-failed">{{ $__( 'The comments could not be loaded.', 'wp-admin-site' ) }}</p>
		<div v-else class="wp-admin-edit-comments">
			<a v-if="data.heading?.post?.viewUrl" :href="data.heading.post.viewUrl" class="comments-view-item-link">{{ data.heading.post.viewLabel }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<div v-if="data.error" id="moderated" class="notice error"><p>{{ data.error }}</p></div>
			<div v-if="messagesShown ? messages.length > 0 : false" id="moderated" class="notice is-dismissible updated">
				<p><template v-for="( message, index ) in messages" :key="index"><InlineMarkup :html="message.markup" /><template v-if="message.undo">{{ ' ' }}<a href="#" role="button" @click.prevent="undoMessage( message )">{{ $__( 'Undo', 'default' ) }}</a></template><br v-if="index < messages.length - 1" /></template></p>
				<button type="button" class="notice-dismiss" @click="messagesShown = false"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
			</div>

			<Contracted id="core/list-table-views" :views="state.views" :views-html="state.viewsHtml" :heading="$__( 'Filter comments list', 'default' )" />

			<form id="comments-form" ref="formEl" method="get" @submit.prevent="onSubmit">
				<Contracted v-if="data.search" id="core/list-table-search" :search="data.search" @search="onSearch" />
				<input v-if="query.p" type="hidden" name="p" :value="String( query.p )" />
				<input type="hidden" name="comment_status" :value="String( query.comment_status ?? 'all' )" />
				<input v-if="data.filters?.empty" type="hidden" name="pagegen_timestamp" :value="data.filters.empty.pagegenTimestamp" />
				<input type="hidden" name="_total" :value="String( state.pagination?.total ?? 0 )" />
				<input type="hidden" name="_per_page" :value="String( state.pagination?.perPage ?? 0 )" />
				<input type="hidden" name="_page" :value="String( state.pagination?.page ?? 1 )" />
				<input v-if="query.paged" type="hidden" name="paged" :value="String( query.paged )" />

				<SlotOutlet name="before-table" :context="slotContext" />

				<Contracted v-if="hadItems" id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="state.pagination" :heading="$__( 'Comments list navigation', 'default' )" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra>
						<div class="alignleft actions">
							<template v-if="data.filters?.filterButton">
								<template v-if="Array.isArray( data.filters.commentTypes )">
									<!-- translators: Hidden accessibility text. -->
									<label class="screen-reader-text" for="filter-by-comment-type">{{ $__( 'Filter by comment type', 'default' ) }}</label>
									<select id="filter-by-comment-type" name="comment_type" :value="typeValue">
										<option value="">{{ $__( 'All comment types', 'default' ) }}</option>
										<option v-for="type in data.filters.commentTypes" :key="type.value" :value="type.value" :selected="type.selected">{{ type.label }}</option>
									</select>
								</template>
								<LegacyHtml v-if="data.filters.restrictHtml?.html" tag="span" :html="data.filters.restrictHtml.html" />
								{{ ' ' }}<input type="submit" name="filter_action" id="post-query-submit" class="button button-compact" :value="$__( 'Filter', 'default' )" @click.prevent="submitList()" />
							</template>
							<input v-if="emptyShown" type="submit" name="delete_all" id="delete_all" class="button apply" :value="data.filters.empty.label" @click.prevent="emptyList" />
							<LegacyHtml v-if="data.filters?.navHtml?.top?.html" tag="span" :html="data.filters.navHtml.top.html" />
						</div>
					</template>
				</Contracted>

				<!-- translators: Hidden accessibility text. -->
				<h2 class="screen-reader-text">{{ $__( 'Comments list', 'default' ) }}</h2>
				<Contracted
					id="core/list-table"
					:columns="columns"
					:caption="data.caption ?? null"
					:classes="data.classes ?? []"
					:items="state.items"
					body-id="the-comment-list"
					:row-id="rowId"
					:row-classes="rowClasses"
					:row-style="rowStyle"
					:selectable="selectable"
					:checkbox-label="checkboxLabel"
					checkbox-name="delete_comments[]"
					v-model:selected="selected"
					:no-items="data.noItems ?? null"
				>
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" :expanded="expanded( item )" :button-ref="buttonRef" @act="act" @actions-html="onActionsHtml" @toggle="toggle" />
					</template>
					<template #after-row="{ item }">
						<UndoRow v-if="state.undos[ item.id ]" :id="item.id" :undo="state.undos[ item.id ]" :colspan="colspan" @undo="undo( item.id )" />
						<InlineForm v-if="form.id === item.id" :key="item.id + ':' + form.mode" :form="form" :colspan="colspan" :quicktags="data.replyForm?.quicktags ?? null" @save="saveForm" @cancel="closeForm()" />
					</template>
				</Contracted>

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="state.pagination" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra>
						<div class="alignleft actions">
							<input v-if="emptyShown" type="submit" name="delete_all2" id="delete_all2" class="button apply" :value="data.filters.empty.label" @click.prevent="emptyList" />
							<LegacyHtml v-if="data.filters?.navHtml?.bottom?.html" tag="span" :html="data.filters.navHtml.bottom.html" />
						</div>
					</template>
				</Contracted>

				<SlotOutlet name="after-table" :context="slotContext" />
			</form>

			<div id="ajax-response"></div>
			<form method="get"><table style="display:none;"><tbody id="com-reply"><tr v-if="form.id === null" id="replyrow" class="inline-edit-row" style="display:none;"><td :colspan="String( colspan )" class="colspanchange"></td></tr></tbody></table></form>
			<div class="hidden" id="trash-undo-holder"><div class="trash-undo-inside"><Format :text="$__( 'Comment by %s moved to the Trash.', 'default' )"><template #arg1><strong></strong></template></Format>{{ ' ' }}<span class="undo untrash"><a href="#">{{ $__( 'Undo', 'default' ) }}</a></span></div></div>
			<div class="hidden" id="spam-undo-holder"><div class="spam-undo-inside"><Format :text="$__( 'Comment by %s marked as spam.', 'default' )"><template #arg1><strong></strong></template></Format>{{ ' ' }}<span class="undo unspam"><a href="#">{{ $__( 'Undo', 'default' ) }}</a></span></div></div>
		</div>
	`,
};
