import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { redirectTarget } from '../../runtime/router.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { preferencesRoute } from './meta-box-holder.js';
import { ANSWER_TIMEOUT, orderedAnswers } from './list-table-parts/ordered-answers.js';
import { afterScreenOptions, bulkCheck, formQuery, hiddenColumns, isCurrentAddress } from './list-table-parts/list-form.js';
import { isRequest, requestBody } from './list-table-parts/row-actions.js';
import RowCell, { mediaActions } from './upload/rows.js';
import FilterBar from './upload/filter-bar.js';
import FindPosts from './upload/find-posts.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables', 'media' ];

export const BULK_ROUTE = 'wp-admin/v1/media/bulk';
export const ATTACH_ROUTE = 'wp-admin/v1/media/attach';
// How long Copy URL's "Copied!" shows (media.js).
export const COPIED_FOR = 3000;

/**
 * The fields of the list form (`#posts-filter`) that a filter or search never sends: the bulk
 * actions, the checked rows, Empty Trash, the nonces and the Find Posts dialog's fields (it is
 * inside the form, as classic).
 */
export const SKIPPED_FIELDS = new Set( [
	'action', 'action2', 'media[]', 'delete_all', 'delete_all2', 'filter_action', '_wpnonce', '_wp_http_referer',
	'found_post_id', 'ps', 'affected', '_ajax_nonce', 'found_action', 'find-posts-submit',
] );

/** The text common.js's showNotice.warn() asks before a permanent delete. */
const warnText = () => __( 'You are about to permanently delete these items from your site.\nThis action cannot be undone.\n\'Cancel\' to stop, \'OK\' to delete.', 'default' );

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The attachments Select attaches: the checked rows, then the one whose Attach opened the dialog
 * (`#affected`), as the classic form sends them all as `media[]`. Pure.
 *
 * @param {number[]}    checked  The checked rows' ids, in the list's order.
 * @param {number|null} affected The row whose Attach opened the dialog, or null (Bulk Attach).
 * @return {number[]} The ids, each once.
 */
export function attachIds( checked, affected ) {
	const ids = list( checked ).filter( Number.isInteger );
	return Number.isInteger( affected ) && ! ids.includes( affected ) ? [ ...ids, affected ] : ids;
}

/**
 * Default implementation of core/upload: the Media Library's list mode (wp-admin/upload.php) in
 * its classic markup: the Add Media File link, the messages (`#message`), then `form#posts-filter`
 * (a GET form, with the filter bar, the navigation above and below the table, the table
 * `#the-list` and the Find Posts dialog). The body has the classic `upload-php` classes while it is
 * shown.
 *
 * Everything WordPress decides comes as data: the rows, which actions each has and the route each
 * calls, the filters and their choices, the view switch's addresses (the grid is the classic
 * screen, through the router), the bulk actions, the messages, whether a row's delete asks first
 * and where an action leads. The page reproduces media.js and common.js:
 *
 * - Edit is a link, View opens the front end in a new tab, Download file is a `download` link.
 *   Trash, Restore and Delete Permanently call their route with `referer` (the page's path) and
 *   follow the answer; Delete Permanently asks showNotice.warn()'s question first when the data's
 *   `confirmDelete` says so. Copy URL writes the file's URL to the clipboard
 *   (`navigator.clipboard`), shows "Copied!" for 3 seconds and says so. The row actions plugins
 *   filtered (`actionsHtml`) are their HTML, whose core actions work the same way.
 * - Attach (a row's, in Uploaded To or its row actions, or the Attach bulk action) opens the Find
 *   Posts dialog (upload/find-posts.js); Select posts `media/attach` with the checked post and the
 *   attachments and follows the answer; closing it gives the focus back to what opened it. Detach
 *   posts its request.
 * - Filter and Search Media navigate to `upload.php` with the form's fields (with the plugins'),
 *   less the bulk and dialog fields. Apply checks as common.js does (the bulk Delete permanently
 *   always asks first, as media.js), then posts `media/bulk` with the checked rows and follows
 *   the answer (`redirect` through the router, reloading the list when it is the address shown;
 *   `location` as a full-page load). Empty Trash posts `delete_all`. The messages' Undo calls its
 *   request and follows the answer.
 * - Screen Options gives the frame the table's options, as the other list pages do.
 *
 * Answers are applied in the order their requests were sent, and dropped when the data changes
 * or the page unmounts (list-table-parts/ordered-answers.js). Titles, the parents' titles, the
 * states and the thumbnails show through kit/InertHtml, which runs nothing.
 */
export default {
	name: 'Upload',
	components: { Contracted, SlotOutlet, InlineMarkup, Format, RowCell, FilterBar, FindPosts },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
		const screenOptions = inject( 'screenOptions', null );
		const frameChannel = inject( 'frameChannel', null );
		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );
		const clipboard = inject( 'clipboard', null ) ?? globalThis.navigator?.clipboard ?? null;
		const copyTimers = inject( 'copyTimers', globalThis );
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/upload.php', search: '' };

		const pageFailed = computed( () => props.data?.failed === true );
		const dieError = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );
		const headings = computed( () => props.data?.headings ?? {} );
		const items = computed( () => list( props.data?.items ).filter( ( item ) => item && Number.isInteger( item.id ) ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const messagesShown = ref( true );
		const hiddenKeys = ref( [] );
		const copiedId = ref( null );
		const find = reactive( { open: false, affected: null, saving: false } );
		// What opened Find Posts, which gets the focus back (an element: kept out of reactive state).
		let findOpener = null;
		const formEl = ref( null );
		let copyTimer = null;

		const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT, timeoutError: () => new Error( broken() ) } );
		const ordered = answers.ordered;

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		// The API's message is text: shown as it is, never decoded again.
		const errorText = ( error ) => ( typeof error?.message === 'string' && error.message !== '' ? error.message : broken() );
		/** A failed request is said in a page notice and spoken, never only logged. */
		function failed( error, what ) {
			console.warn( what, error );
			const message = errorText( error );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
		}

		const hiddenOf = ( data ) => list( data?.columns ).filter( ( column ) => column.hidden ).map( ( column ) => column.key );
		hiddenKeys.value = hiddenOf( props.data );
		const columns = computed( () => list( props.data?.columns ).map( ( column ) => ( { ...column, hidden: column.key !== 'cb' && hiddenKeys.value.includes( column.key ) } ) ) );
		const checkedIds = () => items.value.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );

		// Writes ---------------------------------------------------------------------------------

		/** Opens where an answer leads; the list is read again when it is the address shown. */
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

		/** Posts a route whose answer leads somewhere (row actions, bulk actions, Attach, Detach, Empty Trash, Undo). */
		function sendAndFollow( route, body, what, { fail = null } = {} ) {
			return ordered( api.post( route, body ), ( answer ) => {
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => {
				fail?.();
				failed( error, what );
			} );
		}

		function navigate( path ) {
			const url = adminHref( path );
			if ( router?.navigate ) {
				router.navigate( url );
			} else {
				globalThis.location?.assign?.( url );
			}
		}

		// Find Posts -----------------------------------------------------------------------------

		/** findPosts.open(): for one row (`affected`) or for the checked rows (null). */
		function openFind( affected, opener ) {
			findOpener = opener ?? null;
			Object.assign( find, { open: true, affected: Number.isInteger( affected ) ? affected : null, saving: false } );
		}

		function closeFind( focus = true ) {
			const opener = findOpener;
			const wasOpen = find.open;
			findOpener = null;
			Object.assign( find, { open: false, affected: null, saving: false } );
			if ( focus && wasOpen && opener ) {
				nextTick( () => opener.focus?.() );
			}
		}

		function selectParent( parentId ) {
			if ( ! find.open || find.saving ) {
				return Promise.resolve();
			}
			find.saving = true;
			const ids = attachIds( checkedIds(), find.affected );
			return sendAndFollow( ATTACH_ROUTE, { action: 'attach', parentId, ids, list: query.value }, 'Could not attach the media:', { fail: () => {
				find.saving = false;
			} } );
		}

		function detach( item ) {
			const request = item?.parent?.detach;
			if ( ! isRequest( request ) ) {
				return Promise.resolve();
			}
			return sendAndFollow( request.route, { ...requestBody( request ), list: query.value }, 'Could not detach the media:' );
		}

		// Row actions ----------------------------------------------------------------------------

		const opener = ( event ) => event?.currentTarget ?? event?.target ?? null;

		// The "Copied!" of a row whose actions plugins filtered (`actionsHtml`) is that HTML's own.
		let legacySuccess = null;
		const showLegacySuccess = ( element ) => {
			legacySuccess?.classList?.add?.( 'hidden' );
			legacySuccess = element ?? null;
			legacySuccess?.classList?.remove?.( 'hidden' );
		};

		function copy( item, event ) {
			const url = typeof item?.copyUrl === 'string' ? item.copyUrl : '';
			if ( url === '' || ! clipboard?.writeText ) {
				return Promise.resolve();
			}
			const trigger = opener( event );
			return Promise.resolve().then( () => clipboard.writeText( url ) ).then( () => {
				// As media.js on ClipboardJS's success: the focus stays on the button, the previous
				// "Copied!" hides, this one shows for 3 seconds since the last copy, and it is said.
				trigger?.focus?.();
				copyTimers.clearTimeout( copyTimer );
				const legacy = typeof item.actionsHtml === 'string';
				copiedId.value = legacy ? null : item.id;
				showLegacySuccess( legacy ? trigger?.closest?.( '.copy-to-clipboard-container' )?.querySelector?.( '.success' ) : null );
				copyTimer = copyTimers.setTimeout( () => {
					copiedId.value = null;
					showLegacySuccess( null );
					copyTimer = null;
				}, COPIED_FOR );
				speak( __( 'The file URL has been copied to your clipboard', 'default' ) );
			}, ( error ) => console.warn( 'Could not copy the URL:', error ) );
		}

		function act( item, action, event ) {
			if ( action.action === 'copy' ) {
				return copy( item, event );
			}
			if ( action.action === 'attach' ) {
				openFind( item.id, opener( event ) );
				return Promise.resolve();
			}
			if ( ! isRequest( action.request ) ) {
				return Promise.resolve();
			}
			// The row's Delete Permanently asks showNotice.warn()'s question where WordPress says so.
			if ( action.action === 'delete' && props.data?.confirmDelete === true && ! ask( warnText() ) ) {
				return Promise.resolve();
			}
			return sendAndFollow( action.request.route, { ...requestBody( action.request ), referer: String( props.page?.path ?? '' ) }, 'Could not run the action:' );
		}

		/** The core actions in the row actions plugins filtered work as the others. */
		function onActionsHtml( item, event ) {
			const control = event?.target?.closest?.( 'a, button' );
			if ( ! control ) {
				return;
			}
			// Each action's span has the action's class (Copy URL's button sits in a container inside it).
			const container = event.currentTarget ?? null;
			const inside = ( element ) => Boolean( element ) && ( ! container?.contains || container.contains( element ) );
			const action = mediaActions( item ).find( ( candidate ) => /^[a-z0-9_-]+$/i.test( candidate.action ) && inside( event.target.closest( '.' + candidate.action ) ) );
			if ( action && ( isRequest( action.request ) || action.action === 'copy' || action.action === 'attach' ) ) {
				event.preventDefault?.();
				act( item, action, { currentTarget: control } );
			}
		}

		// List form, bulk actions, messages ------------------------------------------------------

		/** Filter and Search Media: the list form's GET submit, through the router. */
		async function submitList( replace = {} ) {
			closeFind( false );
			await nextTick();
			const qs = formQuery( list( readForm( formEl.value ) ), replace, SKIPPED_FIELDS );
			navigate( 'upload.php' + ( qs ? '?' + qs : '' ) );
		}

		function bulkError( check ) {
			const message = check.kind === 'action' ? __( 'Please select a bulk action to perform.', 'default' ) : __( 'Please select at least one item to perform this action on.', 'default' );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			globalThis.scrollTo?.( 0, 0 );
			speak( message );
		}

		function applyBulk( value, trigger = 'doaction' ) {
			const action = String( value ?? bulkValue.value );
			// media.js: Attach opens the dialog for the checked rows; Delete permanently always asks.
			if ( action === 'attach' ) {
				openFind( null, formEl.value?.querySelector?.( '#' + trigger ) ?? null );
				return Promise.resolve();
			}
			if ( action === 'delete' && ! ask( warnText() ) ) {
				return Promise.resolve();
			}
			const ids = checkedIds();
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			closeFind( false );
			return sendAndFollow( BULK_ROUTE, { action, ids, list: query.value }, 'Could not run the bulk action:' );
		}

		function emptyTrash() {
			if ( ! props.data?.filterBar?.emptyTrash ) {
				return Promise.resolve();
			}
			closeFind( false );
			return sendAndFollow( BULK_ROUTE, { action: 'delete_all', ids: [], list: query.value }, 'Could not empty the Trash:' );
		}

		function undoMessage( message ) {
			const request = message?.undo;
			if ( ! isRequest( request ) ) {
				return Promise.resolve();
			}
			return sendAndFollow( request.route, { ...requestBody( request ), list: query.value }, 'Could not undo:' );
		}

		// Screen Options -------------------------------------------------------------------------

		let withdrawOptions = () => {};
		function offerScreenOptions() {
			withdrawOptions();
			const options = props.data?.screenOptions;
			if ( ! screenOptions?.set || ! options || pageFailed.value || dieError.value ) {
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
				await api.post( preferencesRoute( 'upload' ), { columnsHidden: [ ...hiddenKeys.value ] } );
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
				await api.post( preferencesRoute( 'upload' ), body );
			} catch ( error ) {
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

		// Lifecycle ------------------------------------------------------------------------------

		const BODY_CLASSES = [ 'upload-php', 'post-type-attachment' ];
		const setTitle = ( data ) => frameChannel?.setTitle?.( typeof data?.title === 'string' && data.title !== '' ? data.title : null );
		function stopCopied() {
			copyTimers.clearTimeout( copyTimer );
			copyTimer = null;
			copiedId.value = null;
			legacySuccess = null;
		}

		watch( () => props.data, ( data ) => {
			answers.reset();
			stopCopied();
			selected.value = [];
			bulkValue.value = '-1';
			messagesShown.value = true;
			hiddenKeys.value = hiddenOf( data );
			closeFind( false );
			setTitle( data );
			offerScreenOptions();
		} );

		onMounted( () => {
			globalThis.document?.body?.classList?.add?.( ...BODY_CLASSES );
			setTitle( props.data );
			offerScreenOptions();
		} );
		onBeforeUnmount( () => {
			answers.reset();
			stopCopied();
			globalThis.document?.body?.classList?.remove?.( ...BODY_CLASSES );
			withdrawOptions();
		} );

		const slotContext = computed( () => ( { query: query.value } ) );
		return {
			pageFailed, dieError, query, headings, items, selected, bulkValue, messagesShown, columns, copiedId, find, formEl, slotContext,
			act, onActionsHtml, detach, applyBulk, emptyTrash, undoMessage, selectParent, closeFind,
			onAttach: ( item, event ) => openFind( item.id, opener( event ) ),
			onSubmit: () => submitList(),
			rowId: ( item ) => 'post-' + item.id,
			rowClasses: ( item ) => list( item.classes ),
			selectable: ( item ) => item.selectable === true,
			checkboxLabel: ( item ) => String( item.checkboxLabel ?? '' ),
			rowHeaderLabel: ( item ) => ( typeof item.rowHeaderLabel === 'string' && item.rowHeaderLabel !== '' ? item.rowHeaderLabel : null ),
			href: ( path ) => adminHref( path ),
			messages: computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-upload-failed">{{ $__( 'The media files could not be loaded.', 'wp-admin-site' ) }}</p>
		<div v-else-if="dieError" class="wp-admin-upload-error">
			<h2 v-if="dieError.heading">{{ dieError.heading }}</h2>
			<p>{{ dieError.message }}</p>
		</div>
		<div v-else class="wp-admin-upload">
			<a v-if="data.heading?.addNew?.path" :href="href( data.heading.addNew.path )" class="page-title-action">{{ data.heading.addNew.label }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<div v-if="messagesShown ? messages.length > 0 : false" id="message" class="updated notice is-dismissible">
				<p><template v-for="( message, index ) in messages" :key="index"><template v-if="index > 0">{{ ' ' }}</template><InlineMarkup :html="message.markup" /><template v-if="message.undo">{{ ' ' }}<a href="#" @click.prevent="undoMessage( message )">{{ $__( 'Undo', 'default' ) }}</a></template></template></p>
				<button type="button" class="notice-dismiss" @click="messagesShown = false"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
			</div>

			<form id="posts-filter" ref="formEl" method="get" @submit.prevent="onSubmit">
				<h2 v-if="headings.views" class="screen-reader-text">{{ headings.views }}</h2>
				<FilterBar v-if="data.filterBar" :filter-bar="data.filterBar" @empty-trash="emptyTrash" />

				<SlotOutlet name="before-table" :context="slotContext" />

				<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :heading="headings.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="( value ) => applyBulk( value, 'doaction' )" />

				<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
				<Contracted
					id="core/list-table"
					:columns="columns"
					:caption="data.caption ?? null"
					:classes="data.classes ?? []"
					:items="items"
					body-id="the-list"
					:row-id="rowId"
					:row-classes="rowClasses"
					:selectable="selectable"
					:checkbox-label="checkboxLabel"
					checkbox-name="media[]"
					:row-header-label="rowHeaderLabel"
					v-model:selected="selected"
					:no-items="data.noItems ?? null"
				>
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" :copied="copiedId === item.id" @act="act" @actions-html="onActionsHtml" @detach="detach" @attach="onAttach" />
					</template>
				</Contracted>

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="( value ) => applyBulk( value, 'doaction2' )" />

				<SlotOutlet name="after-table" :context="slotContext" />

				<div id="ajax-response"></div>
				<FindPosts :open="find.open" :saving="find.saving" @select="selectParent" @close="closeFind()" />
			</form>
			<div class="clear"></div>
		</div>
	`,
};
