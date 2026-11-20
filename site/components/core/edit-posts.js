import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { contracts } from '../../runtime/contracts-instance.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { ANSWER_TIMEOUT } from './list-table-parts/ordered-answers.js';
import { bulkCheck, formQuery } from './list-table-parts/list-form.js';
import { ListMessages, showNoticeShim, useClassicGlobals, useListPage } from './list-table-parts/list-page.js';
import { coreActions, filteredAction } from './list-table-parts/row-actions.js';
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
	components: { Contracted, SlotOutlet, ListMessages, LegacyHtml, Format, RowCell, QuickEdit, BulkEdit, Filters },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const pageFailed = computed( () => props.data?.failed === true );
		const dieError = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' ? props.data.query : {} ) );
		const postType = computed( () => String( props.data?.postType?.name ?? query.value.post_type ?? 'post' ) );

		const { speak, answers, errorText, failed, follow, sendAndFollow, navigate, bulkError, columns, messages } = useListPage( props, {
			screenId: () => 'edit-' + postType.value,
			pathname: '/wp-admin/edit.php',
			bodyClasses: () => [ 'edit-php', 'post-type-' + postType.value ],
			blocked: () => pageFailed.value || Boolean( dieError.value ),
			onAnswer: ( answer ) => emit( 'saved', answer ),
		} );
		const ordered = answers.ordered;

		const frameChannel = inject( 'frameChannel', null );
		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );
		const lockTimers = inject( 'lockTimers', globalThis );
		const documentShown = inject( 'documentShown', () => globalThis.document?.visibilityState !== 'hidden' );

		const headings = computed( () => props.data?.headings ?? {} );
		const state = shallowRef( listState( props.data ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		// `generation` counts the openings: a form opened again is a new form (its key), built from
		// the row or the selection of that moment, and an answer of an earlier opening's save
		// does not close it.
		const quick = reactive( { id: null, route: null, saving: false, error: '', generation: 0 } );
		const bulk = reactive( { open: false, ids: [], saving: false, error: '', trigger: null, generation: 0 } );
		const formEl = ref( null );
		const buttons = {};

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

		// Quick Edit -----------------------------------------------------------------------------

		/**
		 * The Quick Edit button of a row: the native one, else the `.editinline` in the row
		 * actions plugins filtered (`actionsHtml`), as inline-edit-post.js finds it in the row.
		 */
		const quickButton = ( id ) => buttons[ id ] ?? formEl.value?.querySelector?.( '#post-' + id )?.querySelector?.( '.editinline' ) ?? null;
		// The native button binds aria-expanded; the plugin-filtered one is set, as edit() and revert() set it.
		const expandFiltered = ( id, expanded ) => {
			if ( ! buttons[ id ] ) {
				quickButton( id )?.setAttribute?.( 'aria-expanded', expanded ? 'true' : 'false' );
			}
		};

		function closeQuick( focus = true ) {
			const id = quick.id;
			Object.assign( quick, { id: null, route: null, saving: false, error: '' } );
			if ( id !== null ) {
				expandFiltered( id, false );
			}
			if ( focus && id !== null ) {
				nextTick( () => quickButton( id )?.focus?.() );
			}
		}

		function openQuick( item, action ) {
			// As edit(): the open form is reverted, also while its save is on its way (that save lands).
			if ( ! item.inline || ! inlineEdit.value?.quick ) {
				return;
			}
			closeBulk( false );
			closeQuick( false );
			Object.assign( quick, { id: item.id, route: action.request.route, saving: false, error: '', generation: quick.generation + 1 } );
			expandFiltered( item.id, true );
		}

		function saveQuick( fields ) {
			if ( quick.saving || quick.id === null || ! quick.route ) {
				return Promise.resolve();
			}
			const id = quick.id;
			const generation = quick.generation;
			const mine = () => quick.id === id && quick.generation === generation;
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
						quickButton( shownId )?.focus?.();
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
			// A new form each time, as setBulk() reverts the open one first: its categories are
			// those of the current selection, and it takes the focus (edit-posts/bulk-edit.js).
			Object.assign( bulk, { open: true, ids, saving: false, error: '', trigger, generation: bulk.generation + 1 } );
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
			const generation = bulk.generation;
			const mine = () => bulk.open && bulk.generation === generation;
			const payload = bulkEditPayload( { postType: postType.value, ids: bulk.ids, fields, query: query.value } );
			return ordered( api.post( BULK_ROUTE, payload ), ( answer ) => {
				emit( 'saved', answer );
				// Bulk Edit opened again meanwhile: that form stays, and leads where its own save does.
				if ( ! mine() ) {
					return;
				}
				closeBulk( false );
				follow( answer );
			}, ( error ) => {
				if ( ! mine() ) {
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

		/**
		 * The core actions in the row actions plugins filtered work as the others. Only a span
		 * whose class is exactly a core action's, and that WordPress says the filter left as core
		 * gave it (`coreActions`), runs it: a plugin's own link in `span.trash` does not. A click
		 * whose own handler prevented it (a declined inline `return confirm( … )` or
		 * `return showNotice.warn();`) does nothing more.
		 */
		function onActionsHtml( item, event ) {
			const found = filteredAction( event, coreActions( item, shownActions( item.actions ) ) );
			if ( found && isRequest( found.action.request ) ) {
				event.preventDefault?.();
				act( item, found.action );
			}
		}

		// common.js's showNotice, which plugin row actions call (`return showNotice.warn();`), while
		// the page is shown: classic Posts loads common.js.
		useClassicGlobals( { showNotice: showNoticeShim( ask ) } );

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

		// Lifecycle ------------------------------------------------------------------------------

		watch( () => props.data, ( data ) => {
			locks.stop();
			state.value = listState( data );
			selected.value = [];
			bulkValue.value = '-1';
			closeQuick( false );
			closeBulk( false );
			frameChannel?.setTitle?.( typeof data?.title === 'string' && data.title !== '' ? data.title : null );
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
			frameChannel?.setTitle?.( typeof props.data?.title === 'string' && props.data.title !== '' ? props.data.title : null );
			locks.start();
		} );
		onBeforeUnmount( () => {
			locks.stop();
		} );

		const slotContext = computed( () => ( { query: query.value, postType: props.data?.postType ?? null } ) );
		return {
			pageFailed, dieError, query, postType, headings, state, selected, bulkValue, columns, colspan, quick, bulk, bulkRows, formEl,
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
			messages,
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

			<ListMessages :messages="messages" id="message" classes="updated notice is-dismissible" @undo="undoMessage" />

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
					<template #before-rows><template v-if="bulk.open ? Boolean( inlineEdit ) : false"><tr class="hidden"></tr><BulkEdit :key="'bulk-' + bulk.generation" :rows="bulkRows" :inline-edit="inlineEdit" :colspan="colspan" :saving="bulk.saving" :error="bulk.error" :search-tags="searchTags" @save="saveBulk" @cancel="closeBulk()" @remove="removeFromBulk" /></template></template>
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" :lock="state.locks[ item.id ] ?? null" :expanded="quick.id === item.id" :button-ref="buttonRef" @act="act" @actions-html="onActionsHtml" />
					</template>
					<template #after-row="{ item }"><template v-if="quick.id === item.id ? Boolean( inlineEdit ) : false"><tr class="hidden"></tr><QuickEdit :key="'quick-' + item.id + '-' + quick.generation" :row="item" :inline-edit="inlineEdit" :colspan="colspan" :saving="quick.saving" :error="quick.error" @save="saveQuick" @cancel="closeQuick()" /></template></template>
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
