import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { contracts } from '../../runtime/contracts-instance.js';
import { redirectTarget } from '../../runtime/router.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { preferencesRoute } from './meta-box-holder.js';
import { ANSWER_TIMEOUT, orderedAnswers } from './list-table-parts/ordered-answers.js';
import { afterScreenOptions, bulkCheck, formQuery, hiddenColumns, isCurrentAddress } from './list-table-parts/list-form.js';
import RowCell, { isRequest, shownActions } from './edit-posts/rows.js';
import QuickEdit from './edit-posts/quick-edit.js';
import BulkEdit, { bulkEditPayload } from './edit-posts/bulk-edit.js';
import Filters from './edit-posts/filters.js';
import { LOCKS_ROUTE, lockPoller } from './edit-posts/locks.js';
import { afterInline, applyLocks, isBulkField, listState, lockedClasses } from './edit-posts/state.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

const BULK_ROUTE = 'wp-admin/v1/posts/bulk';
// The screen whose row the Quick Edit route answers (wp_admin_post_answer_builders()).
const ANSWER_SCREEN = 'edit-posts';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Default implementation of core/edit-posts: the posts list (wp-admin/edit.php) in its classic
 * markup: the Add New link, the messages (`#message`), the views, then `form#posts-filter` (a GET
 * form, with the search, the classic hidden fields, the navigation above and below the table with
 * the filters, the plugins' `restrict_manage_posts` and `manage_posts_extra_tablenav` output and
 * Empty Trash, and the table `#the-list`). The body has the classic `edit-php post-type-{type}`
 * classes while it is shown.
 *
 * Everything WordPress decides comes as data: the rows and their levels, which actions each has
 * and the route each calls, the fields of Quick Edit and Bulk Edit, the statuses, the views, the
 * filters, the messages and where an action leads. The page reproduces inline-edit-post.js and
 * common.js:
 *
 * - Edit, Preview and View are links (Preview and View open the front end in a new tab). Trash,
 *   Restore and Delete Permanently call their route with `referer` (the page's path) and follow
 *   the answer, as the classic links reload the list. The row actions plugins filtered
 *   (`actionsHtml`) are their HTML, whose core actions work the same way.
 * - Quick Edit (edit-posts/quick-edit.js) takes the row's place, one at a time; it posts
 *   `posts/{id}/inline` with `screen: 'edit-posts'` and `list`, and the answer's row replaces the
 *   post's; the focus comes back to its Quick Edit button and "Changes saved." is spoken. An error
 *   shows in the form and is spoken.
 * - Filter and Search navigate to `edit.php` with the form's fields (with the plugins'), less the
 *   bulk and inline form fields. Apply checks as common.js does, then Bulk edit opens Bulk Edit
 *   (edit-posts/bulk-edit.js) above the rows, focused; the other actions post `posts/bulk` with
 *   the checked rows and follow the answer (`redirect` through the router, reloading the list
 *   when it is the address shown; `location` as a full-page load). Empty Trash posts
 *   `delete_all`. The messages' Undo calls its request and follows the answer.
 * - While the page is shown, the locks of the rows are checked every 10 seconds
 *   (edit-posts/locks.js), as inline-edit-post.js asks the heartbeat.
 * - Screen Options gives the frame the table's options, as the Comments page does.
 *
 * Answers are applied in the order their requests were sent, and dropped when the data changes
 * or the page unmounts (list-table-parts/ordered-answers.js). Titles, states, excerpts and the
 * "Parent Page:" text show through kit/InertHtml, which runs nothing.
 */
export default {
	name: 'EditPosts',
	components: { Contracted, SlotOutlet, InlineMarkup, LegacyHtml, Format, RowCell, QuickEdit, BulkEdit, Filters },
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
		const lockTimers = inject( 'lockTimers', globalThis );
		const documentShown = inject( 'documentShown', () => globalThis.document?.visibilityState !== 'hidden' );
		// The location shown (`pageLocation` may be provided: tests).
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/edit.php', search: '' };

		const pageFailed = computed( () => props.data?.failed === true );
		const dieError = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' ? props.data.query : {} ) );
		const postType = computed( () => String( props.data?.postType?.name ?? query.value.post_type ?? 'post' ) );
		const screenId = computed( () => 'edit-' + postType.value );
		const headings = computed( () => props.data?.headings ?? {} );
		const state = shallowRef( listState( props.data ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const messagesShown = ref( true );
		const hiddenKeys = ref( list( props.data?.columns ).filter( ( column ) => column.hidden ).map( ( column ) => column.key ) );
		const quick = reactive( { id: null, route: null, saving: false, error: '' } );
		const bulk = reactive( { open: false, ids: [], saving: false, error: '', trigger: null } );
		const formEl = ref( null );
		const buttons = {};

		const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT, timeoutError: () => new Error( broken() ) } );
		const ordered = answers.ordered;

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		// The API's message is text: shown as it is, never decoded again.
		const errorText = ( error, fallback = broken() ) => ( typeof error?.message === 'string' && error.message !== '' ? error.message : fallback );
		/** A failed request is said in a page notice and spoken, never only logged. */
		function failed( error, what ) {
			console.warn( what, error );
			const message = errorText( error );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			speak( message );
		}

		const columns = computed( () => list( props.data?.columns ).map( ( column ) => ( { ...column, hidden: column.key !== 'cb' && hiddenKeys.value.includes( column.key ) } ) ) );
		const colspan = computed( () => columns.value.filter( ( column ) => ! column.hidden ).length );
		const rowOf = ( id ) => state.value.items.find( ( item ) => item.id === id ) ?? null;
		const inlineEdit = computed( () => ( props.data?.inlineEdit && typeof props.data.inlineEdit === 'object' ? props.data.inlineEdit : null ) );
		// inline-edit-post.js gives Bulk Edit tag suggestions only on a list of posts, not of pages.
		const searchTags = computed( () => ! list( props.data?.classes ).includes( 'pages' ) );
		const bulkRows = computed( () => bulk.ids.map( rowOf ).filter( Boolean ) );

		// Locks ----------------------------------------------------------------------------------

		const locks = lockPoller( {
			request: ( ids, type ) => api.get( LOCKS_ROUTE, { ids: ids.join( ',' ), postType: type }, { timeout: ANSWER_TIMEOUT } ),
			ids: () => state.value.items.map( ( item ) => item.id ),
			postType: () => postType.value,
			onAnswer: ( answer ) => {
				state.value = { ...state.value, locks: applyLocks( state.value.locks, answer ) };
			},
			visible: documentShown,
			timers: lockTimers,
		} );

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

		/** Posts a route whose answer leads somewhere (row actions, bulk actions, Empty Trash, Undo). */
		function sendAndFollow( route, body, what ) {
			return ordered( api.post( route, body ), ( answer ) => {
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => failed( error, what ) );
		}

		function navigate( path ) {
			const url = adminHref( path );
			if ( router?.navigate ) {
				router.navigate( url );
			} else {
				globalThis.location?.assign?.( url );
			}
		}

		// Quick Edit -----------------------------------------------------------------------------

		function closeQuick( focus = true ) {
			const id = quick.id;
			Object.assign( quick, { id: null, route: null, saving: false, error: '' } );
			if ( focus && id !== null ) {
				nextTick( () => buttons[ id ]?.focus?.() );
			}
		}

		function openQuick( item, action ) {
			// As edit(): the open form is reverted, also while its save is on its way (that save lands).
			if ( ! item.inline || ! inlineEdit.value?.quick ) {
				return;
			}
			closeBulk( false );
			closeQuick( false );
			Object.assign( quick, { id: item.id, route: action.request.route, saving: false, error: '' } );
		}

		function saveQuick( fields ) {
			if ( quick.saving || quick.id === null || ! quick.route ) {
				return Promise.resolve();
			}
			const id = quick.id;
			const mine = () => quick.id === id;
			quick.error = '';
			quick.saving = true;
			return ordered( api.post( quick.route, { fields, screen: ANSWER_SCREEN, list: query.value } ), ( answer ) => {
				const shown = mine();
				if ( shown ) {
					closeQuick( false );
				}
				state.value = afterInline( state.value, { id, answer } );
				emit( 'saved', answer );
				// The focus and the message are the form's: another form opened since keeps the focus.
				if ( shown ) {
					const shownId = answer?.row?.id ?? id;
					nextTick( () => {
						buttons[ shownId ]?.focus?.();
						speak( __( 'Changes saved.', 'default' ) );
					} );
				}
			}, ( error ) => {
				if ( ! mine() ) {
					failed( error, 'Could not save the post:' );
					return;
				}
				quick.saving = false;
				quick.error = errorText( error, __( 'Error while saving the changes.', 'default' ) );
			} );
		}

		// Bulk Edit ------------------------------------------------------------------------------

		function closeBulk( focus = true ) {
			const trigger = bulk.trigger;
			const wasOpen = bulk.open;
			Object.assign( bulk, { open: false, ids: [], saving: false, error: '', trigger: null } );
			if ( focus && wasOpen && trigger ) {
				// Back to the Apply button that opened it, as inlineEditPost.revert().
				nextTick( () => formEl.value?.querySelector?.( '#' + trigger )?.focus?.() );
			}
		}

		function openBulk( trigger ) {
			// As setBulk(): the open form is reverted, also while a Quick Edit save is on its way.
			if ( ! inlineEdit.value?.bulk ) {
				return;
			}
			closeQuick( false );
			const ids = state.value.items.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );
			Object.assign( bulk, { open: true, ids, saving: false, error: '', trigger } );
			// Bulk Edit focuses its region once it shows (edit-posts/bulk-edit.js).
		}

		function removeFromBulk( id ) {
			bulk.ids = bulk.ids.filter( ( key ) => key !== id );
			selected.value = selected.value.filter( ( key ) => key !== id );
		}

		function saveBulk( fields ) {
			if ( bulk.saving || ! bulk.open ) {
				return Promise.resolve();
			}
			bulk.error = '';
			bulk.saving = true;
			const payload = bulkEditPayload( { postType: postType.value, ids: bulk.ids, fields, query: query.value } );
			return ordered( api.post( BULK_ROUTE, payload ), ( answer ) => {
				closeBulk( false );
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => {
				if ( ! bulk.open ) {
					failed( error, 'Could not edit the posts:' );
					return;
				}
				bulk.saving = false;
				bulk.error = errorText( error );
			} );
		}

		// Row actions ----------------------------------------------------------------------------

		function act( item, action ) {
			if ( action.action === 'inline' ) {
				if ( isRequest( action.request ) ) {
					openQuick( item, action );
				}
				return;
			}
			if ( isRequest( action.request ) ) {
				const body = action.request.body && typeof action.request.body === 'object' && ! Array.isArray( action.request.body ) ? action.request.body : {};
				sendAndFollow( action.request.route, { ...body, referer: String( props.page?.path ?? '' ) }, 'Could not run the action:' );
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

		// List form, bulk actions, messages ------------------------------------------------------

		/** Filter and Search: the list form's GET submit, through the router. */
		async function submitList( replace = {} ) {
			closeQuick( false );
			closeBulk( false );
			await nextTick();
			const entries = list( readForm( formEl.value ) ).filter( ( [ name ] ) => ! isBulkField( name ) );
			const qs = formQuery( entries, replace );
			navigate( 'edit.php' + ( qs ? '?' + qs : '' ) );
		}

		function bulkError( check ) {
			const message = check.kind === 'action' ? __( 'Please select a bulk action to perform.', 'default' ) : __( 'Please select at least one item to perform this action on.', 'default' );
			notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
			globalThis.scrollTo?.( 0, 0 );
			speak( message );
		}

		function applyBulk( value, trigger = 'doaction' ) {
			const action = String( value ?? bulkValue.value );
			const ids = state.value.items.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			if ( action === 'edit' ) {
				openBulk( trigger );
				return Promise.resolve();
			}
			closeQuick( false );
			closeBulk( false );
			return sendAndFollow( BULK_ROUTE, { postType: postType.value, action, ids, list: query.value }, 'Could not run the bulk action:' );
		}

		function emptyTrash() {
			if ( ! props.data?.filters?.emptyTrash ) {
				return Promise.resolve();
			}
			closeQuick( false );
			closeBulk( false );
			return sendAndFollow( BULK_ROUTE, { postType: postType.value, action: 'delete_all', emptyStatus: String( query.value.post_status ?? 'trash' ), list: query.value }, 'Could not empty the Trash:' );
		}

		function undoMessage( message ) {
			const request = message?.undo;
			if ( ! isRequest( request ) ) {
				return Promise.resolve();
			}
			const body = request.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {};
			return sendAndFollow( request.route, { ...body, list: query.value }, 'Could not undo:' );
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
				await api.post( preferencesRoute( screenId.value ), { columnsHidden: [ ...hiddenKeys.value ] } );
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
				await api.post( preferencesRoute( screenId.value ), body );
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

		let bodyClasses = [];
		function setBodyClasses() {
			const classList = globalThis.document?.body?.classList;
			classList?.remove?.( ...bodyClasses );
			bodyClasses = [ 'edit-php', 'post-type-' + postType.value ];
			classList?.add?.( ...bodyClasses );
		}

		watch( () => props.data, ( data ) => {
			answers.reset();
			locks.stop();
			state.value = listState( data );
			selected.value = [];
			bulkValue.value = '-1';
			messagesShown.value = true;
			hiddenKeys.value = list( data?.columns ).filter( ( column ) => column.hidden ).map( ( column ) => column.key );
			closeQuick( false );
			closeBulk( false );
			setBodyClasses();
			frameChannel?.setTitle?.( typeof data?.title === 'string' && data.title !== '' ? data.title : null );
			offerScreenOptions();
			locks.start();
		} );

		// The parts of Quick Edit and Bulk Edit are loaded with the list, so that Quick Edit opens at
		// once, with the focus in its title, as classic (inline-edit-post.js clones a form already there).
		function preloadForms() {
			if ( inlineEdit.value ) {
				for ( const id of [ 'core/inline-edit', 'core/terms-checklist', 'core/tags-suggest' ] ) {
					Promise.resolve().then( () => contracts.resolve?.( id ) ).catch( () => {} );
				}
			}
		}

		onMounted( () => {
			preloadForms();
			setBodyClasses();
			frameChannel?.setTitle?.( typeof props.data?.title === 'string' && props.data.title !== '' ? props.data.title : null );
			offerScreenOptions();
			locks.start();
		} );
		onBeforeUnmount( () => {
			answers.reset();
			locks.stop();
			globalThis.document?.body?.classList?.remove?.( ...bodyClasses );
			withdrawOptions();
		} );

		const slotContext = computed( () => ( { query: query.value, postType: props.data?.postType ?? null } ) );
		return {
			pageFailed, dieError, query, postType, headings, state, selected, bulkValue, messagesShown, columns, colspan, quick, bulk, bulkRows, formEl,
			inlineEdit, searchTags, slotContext,
			act, onActionsHtml, saveQuick, closeQuick, saveBulk, closeBulk, removeFromBulk, applyBulk, emptyTrash, undoMessage, submitList,
			onSearch: ( term ) => submitList( { s: term } ),
			onSubmit: () => submitList(),
			rowId: ( item ) => 'post-' + item.id,
			rowClasses: ( item ) => [ ...lockedClasses( item.classes, state.value.locks[ item.id ] ), ...( quick.id === item.id ? [ 'hidden' ] : [] ) ],
			selectable: ( item ) => item.selectable === true,
			checkboxLabel: ( item ) => String( item.checkboxLabel ?? '' ),
			rowHeaderLabel: ( item ) => ( typeof item.rowHeaderLabel === 'string' ? item.rowHeaderLabel : null ),
			buttonRef: ( id, element ) => {
				buttons[ id ] = element;
			},
			href: ( path ) => adminHref( path ),
			// The list form's hidden fields, as edit.php prints them (never the author forced for Mine).
			formFields: computed( () => list( props.data?.formFields ).filter( ( item ) => typeof item?.name === 'string' && item.name !== '' ).map( ( item ) => ( { name: item.name, value: String( item.value ?? '' ) } ) ) ),
			hiddenClass: ( name ) => ( { post_status: 'post_status_page', post_type: 'post_type_page' }[ name ] ?? null ),
			messages: computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-edit-posts-failed">{{ $__( 'The posts could not be loaded.', 'wp-admin-site' ) }}</p>
		<div v-else-if="dieError" class="wp-admin-edit-posts-error">
			<h2 v-if="dieError.heading">{{ dieError.heading }}</h2>
			<p>{{ dieError.message }}</p>
		</div>
		<div v-else class="wp-admin-edit-posts">
			<a v-if="data.heading?.addNew?.path" :href="href( data.heading.addNew.path )" class="page-title-action">{{ data.heading.addNew.label }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<div v-if="messagesShown ? messages.length > 0 : false" id="message" class="updated notice is-dismissible">
				<p><template v-for="( message, index ) in messages" :key="index"><template v-if="index > 0">{{ ' ' }}</template><InlineMarkup :html="message.markup" /><template v-if="message.undo">{{ ' ' }}<a href="#" @click.prevent="undoMessage( message )">{{ $__( 'Undo', 'default' ) }}</a></template></template></p>
				<button type="button" class="notice-dismiss" @click="messagesShown = false"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
			</div>

			<Contracted id="core/list-table-views" :views="data.views ?? []" :views-html="data.viewsHtml ?? null" :heading="headings.views ?? null" />

			<form id="posts-filter" ref="formEl" method="get" @submit.prevent="onSubmit">
				<Contracted v-if="data.search" id="core/list-table-search" :search="data.search" @search="onSearch" />
				<input v-for="hidden in formFields" :key="hidden.name" type="hidden" :name="hidden.name" :class="hiddenClass( hidden.name )" :value="hidden.value" />

				<SlotOutlet name="before-table" :context="slotContext" />

				<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :heading="headings.pagination ?? null" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="( value ) => applyBulk( value, 'doaction' )">
					<template #extra>
						<div class="alignleft actions">
							<Filters v-if="data.filters" :filters="data.filters" @submit="submitList()" />
							<input v-if="data.filters?.emptyTrash" type="submit" name="delete_all" id="delete_all" class="button apply" :value="data.filters.emptyTrash.label" @click.prevent="emptyTrash" />
						</div>
						<LegacyHtml v-if="data.filters?.navHtml?.top?.html" tag="span" :html="data.filters.navHtml.top.html" />
					</template>
				</Contracted>

				<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
				<Contracted
					id="core/list-table"
					:columns="columns"
					:caption="data.caption ?? null"
					:classes="data.classes ?? []"
					:items="state.items"
					body-id="the-list"
					:row-id="rowId"
					:row-classes="rowClasses"
					:selectable="selectable"
					:checkbox-label="checkboxLabel"
					checkbox-name="post[]"
					:row-header-label="rowHeaderLabel"
					v-model:selected="selected"
					:no-items="data.noItems ?? null"
				>
					<template #cb-extra="{ item }"><div class="locked-indicator"><span class="locked-indicator-icon" aria-hidden="true"></span><span class="screen-reader-text">{{ item.lockedLabel }}</span></div></template>
					<template #before-rows><template v-if="bulk.open ? Boolean( inlineEdit ) : false"><tr class="hidden"></tr><BulkEdit :rows="bulkRows" :inline-edit="inlineEdit" :colspan="colspan" :saving="bulk.saving" :error="bulk.error" :search-tags="searchTags" @save="saveBulk" @cancel="closeBulk()" @remove="removeFromBulk" /></template></template>
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" :lock="state.locks[ item.id ] ?? null" :expanded="quick.id === item.id" :button-ref="buttonRef" @act="act" @actions-html="onActionsHtml" />
					</template>
					<template #after-row="{ item }"><template v-if="quick.id === item.id ? Boolean( inlineEdit ) : false"><tr class="hidden"></tr><QuickEdit :key="'quick-' + item.id" :row="item" :inline-edit="inlineEdit" :colspan="colspan" :saving="quick.saving" :error="quick.error" @save="saveQuick" @cancel="closeQuick()" /></template></template>
				</Contracted>

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="( value ) => applyBulk( value, 'doaction2' )">
					<template #extra>
						<div class="alignleft actions">
							<input v-if="data.filters?.emptyTrash" type="submit" name="delete_all" id="delete_all" class="button apply" :value="data.filters.emptyTrash.label" @click.prevent="emptyTrash" />
						</div>
						<LegacyHtml v-if="data.filters?.navHtml?.bottom?.html" tag="span" :html="data.filters.navHtml.bottom.html" />
					</template>
				</Contracted>

				<SlotOutlet name="after-table" :context="slotContext" />
			</form>

			<form v-if="inlineEdit" method="get"><table style="display: none"><tbody id="inlineedit"><tr id="inline-edit" class="inline-edit-row" style="display: none"><td :colspan="String( colspan )" class="colspanchange"></td></tr></tbody></table></form>
			<div id="ajax-response"></div>
			<div class="clear"></div>
		</div>
	`,
};
