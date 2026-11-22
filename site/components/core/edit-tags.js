import { computed, inject, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { contracts } from '../../runtime/contracts-instance.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { decodeEntities } from '../../kit/Interpolate.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { bulkCheck, formQuery } from './list-table-parts/list-form.js';
import { ListMessages, showNoticeShim, useClassicGlobals, useListPage, warnText } from './list-table-parts/list-page.js';
import { DieError, failureText, usePageChrome } from './list-table-parts/page-chrome.js';
import { coreActions, editinlineTrigger, filteredAction } from './list-table-parts/row-actions.js';
import RowCell, { isDelete, termActions } from './edit-tags/rows.js';
import AddForm from './edit-tags/add-form.js';
import QuickEdit from './edit-tags/quick-edit.js';
import { afterAdd, afterDelete, afterInline, listState, nextFocus } from './edit-tags/state.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

const ROUTE = 'wp-admin/v1/terms';
const BULK_ROUTE = ROUTE + '/bulk';
// The screen whose list the routes answer (wp_admin_term_answer_builders()).
const ANSWER_SCREEN = 'edit-tags';
// What tags.js colours a row it deletes.
const DELETING = '#faafaa';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const escapeAttribute = ( value ) => text( value ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' );
// A message's markup as spoken text.
const spoken = ( markup ) => decodeEntities( text( markup ).replace( /<[^>]*>/g, '' ) );

/**
 * The DELETE route of a term for this list: the route WordPress described, with the taxonomy,
 * the screen and the list's query in the query string (a DELETE has no body). Pure.
 *
 * @param {string} route    The route (`wp-admin/v1/terms/{id}`).
 * @param {string} taxonomy The taxonomy.
 * @param {object} query    The list's query.
 * @return {string} The route with its query.
 */
export function deleteRoute( route, taxonomy, query ) {
	const params = new URLSearchParams();
	params.append( 'taxonomy', taxonomy );
	params.append( 'screen', ANSWER_SCREEN );
	for ( const [ key, value ] of Object.entries( query ?? {} ) ) {
		if ( value !== null && value !== undefined && typeof value !== 'object' ) {
			params.append( 'list[' + key + ']', String( value ) );
		}
	}
	return route + ( route.includes( '?' ) ? '&' : '?' ) + params.toString();
}

/**
 * The converter note's sentence with its link opening inside the admin: WordPress gives the
 * sentence with `href` set to `path`, a path relative to the admin, which becomes the admin
 * site's address of that screen. Pure.
 */
export function converterMarkup( converter ) {
	const markup = text( converter?.text );
	const path = text( converter?.path );
	const href = adminHref( path );
	if ( path === '' || href === '' ) {
		return markup;
	}
	return markup.split( 'href="' + escapeAttribute( path ) + '"' ).join( 'href="' + escapeAttribute( href ) + '"' );
}

/** Marks a row as tags.js marks the row it deletes (red, no pointer, its controls disabled), or puts it back. Changes the DOM. */
function markDeleting( tr, on ) {
	if ( ! tr ) {
		return;
	}
	for ( const cell of tr.children ?? [] ) {
		cell.style.backgroundColor = on ? DELETING : '';
	}
	tr.style.pointerEvents = on ? 'none' : '';
	for ( const control of tr.querySelectorAll( 'input, select, textarea, button, a' ) ) {
		if ( on ) {
			control.disabled = true;
			control.setAttribute( 'disabled', '' );
			control.setAttribute( 'tabindex', '-1' );
		} else {
			control.disabled = false;
			control.removeAttribute( 'disabled' );
			control.removeAttribute( 'tabindex' );
		}
	}
}

/**
 * Default implementation of core/edit-tags: the terms list (wp-admin/edit-tags.php) in its classic
 * markup: the search subtitle, the messages (`#message`), `#ajax-response`, the search form, then
 * (for a user who may add terms) `#col-container` with the add form in `#col-left` and the list in
 * `#col-right`: the views, `form#posts-filter` (the navigation above and below the table
 * `#the-list`), the notes below it and the plugins' `after-{$taxonomy}-table` output. The body has
 * the classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data: the rows and their levels and pads, which actions
 * and checkboxes each has, the add form's fields and parent dropdown, the notes, the messages,
 * which terms are the defaults and where an action leads. The page reproduces tags.js,
 * inline-edit-tax.js and common.js:
 *
 * - Add (edit-tags/add-form.js) posts `terms` with the core fields; a second submit while one is
 *   on its way is ignored. The answer's row goes right after its parent's row when that row is
 *   shown, else its parents version first (edit-tags/state.js); the parent dropdown becomes the
 *   answer's, every visible field of the form is emptied, the count is the answer's, and its
 *   notice shows in `#ajax-response` and is spoken. An `empty_term_name` error marks the name as
 *   validateForm() does; every error shows in `#ajax-response`.
 * - Quick Edit (edit-tags/quick-edit.js) takes the row's place, one at a time, from its button or
 *   any `.editinline` of row actions plugins filtered; Escape, Cancel and a mousedown on the list
 *   form's submit buttons revert it; Enter and the save button post `terms/{id}/inline`; the
 *   answer's row replaces the term's, the focus comes back to its Quick Edit button and
 *   "Changes saved." is spoken. An error shows in the row.
 * - Delete asks common.js's showNotice.warn() question, marks the row and calls its route; the
 *   focus goes to the next row (else the previous one, else the name field), the row leaves and
 *   "The selected tag has been deleted." is spoken; with no term left, the list's empty text
 *   shows and the navigation and the search box hide. A refusal says tags.js's texts.
 * - Search navigates to `edit-tags.php` with the search form's fields. Apply checks as common.js
 *   does, then posts `terms/bulk` with the checked rows and follows the answer.
 * - Edit and the name link open the term edit screen through the router; View opens the front
 *   end in a new tab. Screen Options gives the frame the table's options.
 *
 * Answers are applied in the order their requests were sent, and dropped when the data changes
 * or the page unmounts (list-table-parts/ordered-answers.js). Names and descriptions show through
 * kit/InertHtml, which runs nothing.
 */
export default {
	name: 'EditTags',
	components: { Contracted, SlotOutlet, ListMessages, LegacyHtml, InlineMarkup, Format, RowCell, AddForm, QuickEdit, DieError },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed, dieError, blocked } = usePageChrome( props );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );
		const taxonomy = computed( () => text( props.data?.taxonomy?.name ?? query.value.taxonomy ?? 'post_tag' ) );

		const { speak, answers, errorText, failed, sendAndFollow, navigate, bulkError, columns, messages } = useListPage( props, {
			screenId: () => 'edit-' + taxonomy.value,
			pathname: '/wp-admin/edit-tags.php',
			blocked: () => blocked.value,
			onAnswer: ( answer ) => emit( 'saved', answer ),
			failureText,
		} );
		const ordered = answers.ordered;

		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );

		const headings = computed( () => props.data?.headings ?? {} );
		const addForm = computed( () => ( props.data?.addForm && typeof props.data.addForm === 'object' ? props.data.addForm : null ) );
		const inlineEdit = computed( () => ( props.data?.inlineEdit && typeof props.data.inlineEdit === 'object' ? props.data.inlineEdit : null ) );
		const state = shallowRef( listState( props.data ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		// `generation` counts the openings: a form opened again is a new form (its key).
		const quick = reactive( { id: null, saving: false, error: '', generation: 0 } );
		const add = reactive( { adding: false, nameInvalid: false, cleared: 0 } );
		// What `#ajax-response` shows: `{ type: 'success'|'error', markup }` or `{ type: 'error', text }`.
		const ajaxNotice = shallowRef( null );
		const formEl = ref( null );
		const searchEl = ref( null );
		const pageEl = ref( null );
		const addFormEl = ref( null );
		const buttons = {};

		const colspan = computed( () => columns.value.filter( ( column ) => ! column.hidden ).length );
		const rowOf = ( id ) => state.value.items.find( ( item ) => item.id === id ) ?? null;
		const rowElement = ( id ) => formEl.value?.querySelector?.( '#tag-' + id ) ?? null;

		// Add ------------------------------------------------------------------------------------

		function addTerm( fields ) {
			if ( add.adding ) {
				return Promise.resolve();
			}
			add.adding = true;
			ajaxNotice.value = null;
			const body = { taxonomy: taxonomy.value, name: fields.name, slug: fields.slug };
			if ( Object.hasOwn( fields, 'parent' ) ) {
				body.parent = fields.parent;
			}
			body.description = fields.description;
			body.screen = ANSWER_SCREEN;
			body.list = query.value;
			return ordered( api.post( ROUTE, body ), ( answer ) => {
				add.adding = false;
				add.nameInvalid = false;
				state.value = afterAdd( state.value, answer, fields.parent ?? -1 );
				add.cleared++;
				emit( 'saved', answer );
				const markup = typeof answer?.notice?.markup === 'string' ? answer.notice.markup : '';
				if ( markup !== '' ) {
					ajaxNotice.value = { type: 'success', markup };
					speak( spoken( markup ) );
				}
			}, ( error ) => {
				add.adding = false;
				if ( error?.code === 'empty_term_name' ) {
					add.nameInvalid = true;
				}
				const message = errorText( error );
				ajaxNotice.value = { type: 'error', text: message };
				speak( message );
			} );
		}

		// Quick Edit -----------------------------------------------------------------------------

		/**
		 * The Quick Edit button of a row: the native one, else the `.editinline` that opened it, else
		 * the one in the row, as inline-edit-tax.js finds it.
		 */
		let quickTrigger = null;
		const connectedTrigger = ( id ) => ( quickTrigger?.id === id && quickTrigger.element?.isConnected !== false ? quickTrigger.element : null );
		const quickButton = ( id ) => buttons[ id ] ?? connectedTrigger( id ) ?? rowElement( id )?.querySelector?.( '.editinline' ) ?? null;
		// The native button binds aria-expanded; a plugin's is set, as edit() and revert() set it.
		const expandFiltered = ( id, expanded ) => {
			if ( ! buttons[ id ] ) {
				quickButton( id )?.setAttribute?.( 'aria-expanded', expanded ? 'true' : 'false' );
			}
		};

		function closeQuick( focus = true ) {
			const id = quick.id;
			Object.assign( quick, { id: null, saving: false, error: '' } );
			if ( id !== null ) {
				expandFiltered( id, false );
				if ( focus ) {
					nextTick( () => quickButton( id )?.focus?.() );
				}
			}
		}

		function openQuick( item, trigger = null ) {
			// As edit(): the open form is reverted first, also while its save is on its way.
			if ( ! item?.inline || ! inlineEdit.value ) {
				return;
			}
			closeQuick( false );
			quickTrigger = trigger ? { id: item.id, element: trigger } : null;
			Object.assign( quick, { id: item.id, saving: false, error: '', generation: quick.generation + 1 } );
			expandFiltered( item.id, true );
		}

		function saveQuick( fields ) {
			if ( quick.saving || quick.id === null ) {
				return Promise.resolve();
			}
			const id = quick.id;
			const generation = quick.generation;
			const mine = () => quick.id === id && quick.generation === generation;
			quick.error = '';
			quick.saving = true;
			const body = { taxonomy: taxonomy.value, name: text( fields?.name ), slug: text( fields?.slug ), screen: ANSWER_SCREEN, list: query.value };
			return ordered( api.post( ROUTE + '/' + id + '/inline', body ), ( answer ) => {
				const shown = mine();
				if ( shown ) {
					closeQuick( false );
				}
				state.value = afterInline( state.value, answer );
				emit( 'saved', answer );
				if ( shown ) {
					const shownId = answer?.row?.id ?? id;
					nextTick( () => {
						quickButton( shownId )?.focus?.();
						speak( __( 'Changes saved.', 'default' ) );
					} );
				}
			}, ( error ) => {
				if ( ! mine() ) {
					failed( error, 'Could not save the term:' );
					return;
				}
				quick.saving = false;
				quick.error = errorText( error, __( 'Error while saving the changes.', 'default' ) );
			} );
		}

		/** inline-edit-tax.js: a mousedown on the list form's submit buttons reverts Quick Edit. */
		function onListMousedown( event ) {
			const target = event?.target;
			if ( quick.id !== null && String( target?.tagName ?? '' ).toLowerCase() === 'input' && String( target.type ?? '' ).toLowerCase() === 'submit' ) {
				closeQuick();
			}
		}

		// Delete ---------------------------------------------------------------------------------

		function deleteTerm( item, action ) {
			// common.js's showNotice.warn(), which tags.js asks.
			if ( ! ask( warnText() ) ) {
				return Promise.resolve();
			}
			const id = item.id;
			markDeleting( rowElement( id ), true );
			return ordered( api.del( deleteRoute( 'wp-admin/v1/' + action.request.path.replace( /^\/+/, '' ), taxonomy.value, query.value ) ), ( answer ) => {
				ajaxNotice.value = null;
				const focus = nextFocus( state.value.items, id );
				if ( quick.id === id ) {
					closeQuick( false );
				}
				state.value = afterDelete( state.value, id, answer );
				selected.value = selected.value.filter( ( key ) => key !== id );
				emit( 'saved', answer );
				nextTick( () => {
					const target = focus.id === null ? addFormEl.value?.nameField?.() : rowElement( focus.id )?.querySelector?.( 'a.row-title' );
					target?.focus?.();
					speak( __( 'The selected tag has been deleted.', 'default' ), 'assertive' );
				} );
			}, ( error ) => {
				// tags.js's refusal text; otherwise WordPress's own message (a plugin's wp_die()), or the generic one.
				const message = error?.status === 403 ? __( 'Sorry, you are not allowed to do that.', 'default' ) : errorText( error );
				ajaxNotice.value = { type: 'error', text: message, plain: true };
				markDeleting( rowElement( id ), false );
				speak( message, 'assertive' );
			} );
		}

		// Row actions ----------------------------------------------------------------------------

		function act( item, action ) {
			if ( action.action === 'inline' ) {
				openQuick( item );
			} else if ( isDelete( action.request ) ) {
				deleteTerm( item, action );
			}
		}

		/**
		 * The core actions in row actions plugins filtered work as the others (only a span whose
		 * class is exactly a core action's, and which WordPress names as left as core gave it);
		 * any `.editinline` there opens Quick Edit, as inline-edit-tax.js's delegated rule.
		 */
		function onActionsHtml( item, event ) {
			const found = filteredAction( event, coreActions( item, termActions( item.actions ) ) );
			if ( found && ( found.action.action === 'inline' || isDelete( found.action.request ) ) ) {
				event.preventDefault?.();
				if ( found.action.action === 'inline' ) {
					openQuick( item, found.control );
				} else {
					act( item, found.action );
				}
				return;
			}
			const control = editinlineTrigger( event );
			if ( control && inlineEdit.value && item.inline ) {
				event.preventDefault?.();
				openQuick( item, control );
			}
		}

		// common.js's showNotice, which plugin row actions call, while the page is shown.
		useClassicGlobals( { showNotice: showNoticeShim( ask ) } );

		// Search and bulk actions ------------------------------------------------------------------

		/** Search: the search form's GET submit, through the router. */
		function onSearch( term ) {
			const qs = formQuery( list( readForm( searchEl.value ) ), { s: term } );
			navigate( 'edit-tags.php' + ( qs ? '?' + qs : '' ) );
		}

		function applyBulk( value ) {
			closeQuick( false );
			const action = String( value ?? bulkValue.value );
			const ids = state.value.items.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			return sendAndFollow( BULK_ROUTE, { taxonomy: taxonomy.value, action, ids, list: query.value }, 'Could not run the bulk action:' );
		}

		// The empty state ----------------------------------------------------------------------------

		/** tags.js's updateTableNavCount(): with no term left, the navigation and the search box hide. Changes the DOM. */
		function showNavigation( shown ) {
			const root = pageEl.value;
			for ( const element of [ ...( root?.querySelectorAll?.( '.tablenav > *' ) ?? [] ), ...( root?.querySelectorAll?.( 'p.search-box' ) ?? [] ) ] ) {
				element.style.display = shown ? '' : 'none';
			}
		}
		watch( () => state.value.emptied, ( emptied, before ) => {
			if ( emptied !== before ) {
				nextTick( () => showNavigation( ! emptied ) );
			}
		} );

		// Lifecycle ------------------------------------------------------------------------------

		watch( () => props.data, ( data ) => {
			state.value = listState( data );
			selected.value = [];
			bulkValue.value = '-1';
			ajaxNotice.value = null;
			Object.assign( add, { adding: false, nameInvalid: false } );
			closeQuick( false );
		} );

		onMounted( () => {
			// The Quick Edit part is loaded with the list, so that Quick Edit opens at once.
			if ( inlineEdit.value ) {
				Promise.resolve().then( () => contracts.resolve?.( 'core/inline-edit' ) ).catch( () => {} );
			}
		} );

		const notes = computed( () => props.data?.notes ?? {} );
		const slotContext = computed( () => ( { query: query.value, taxonomy: props.data?.taxonomy ?? null } ) );
		return {
			pageFailed, dieError, query, taxonomy, headings, state, selected, bulkValue, columns, colspan, quick, add, ajaxNotice,
			formEl, searchEl, pageEl, addFormEl, addForm, inlineEdit, notes, slotContext, messages,
			addTerm, act, onActionsHtml, saveQuick, closeQuick, onListMousedown, onSearch, applyBulk, rowOf,
			converter: computed( () => ( notes.value.converter?.text ? converterMarkup( notes.value.converter ) : null ) ),
			messageClasses: computed( () => ( messages.value[ 0 ]?.type === 'error' ? 'error' : 'updated' ) + ' notice is-dismissible' ),
			formFields: computed( () => list( props.data?.formFields ).filter( ( item ) => typeof item?.name === 'string' && item.name !== '' ).map( ( item ) => ( { name: item.name, value: text( item.value ) } ) ) ),
			rowId: ( item ) => 'tag-' + item.id,
			rowClasses: ( item ) => [ ...list( item.classes ), ...( quick.id === item.id ? [ 'hidden' ] : [] ) ],
			selectable: ( item ) => item.selectable === true,
			checkboxLabel: ( item ) => text( item.checkboxLabel ),
			rowHeaderLabel: ( item ) => ( typeof item.rowHeaderLabel === 'string' ? item.rowHeaderLabel : null ),
			buttonRef: ( id, element ) => {
				buttons[ id ] = element;
			},
			onNameChanged: () => {
				add.nameInvalid = false;
			},
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-edit-tags-failed">{{ $__( 'The terms could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="dieError" :error="dieError" classes="wp-admin-edit-tags-error" />
		<div v-else ref="pageEl" class="wp-admin-edit-tags">
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<ListMessages :messages="messages" id="message" :classes="messageClasses" />

			<div id="ajax-response"><div v-if="ajaxNotice" :class="ajaxNotice.type === 'success' ? 'notice notice-success is-dismissible' : 'notice notice-error'" :role="ajaxNotice.plain ? null : 'alert'"><p><InlineMarkup v-if="ajaxNotice.markup" :html="ajaxNotice.markup" /><template v-else>{{ ajaxNotice.text }}</template></p></div></div>

			<form ref="searchEl" class="search-form wp-clearfix" method="get" @submit.prevent>
				<input v-for="hidden in formFields" :key="hidden.name" type="hidden" :name="hidden.name" :value="hidden.value" />
				<Contracted v-if="data.search" id="core/list-table-search" :search="data.search" @search="onSearch" />
			</form>

			<div :id="addForm ? 'col-container' : null" :class="addForm ? 'wp-clearfix' : null">
				<div v-if="addForm" id="col-left"><div class="col-wrap">
					<AddForm ref="addFormEl" :add-form="addForm" :parent="state.parent" :form-fields="formFields" :adding="add.adding" :name-invalid="add.nameInvalid" :cleared="add.cleared" @submit="addTerm" @name-changed="onNameChanged" />
				</div></div>

				<div :id="addForm ? 'col-right' : null"><div :class="addForm ? 'col-wrap' : null">
					<Contracted id="core/list-table-views" :views="data.views ?? []" :views-html="data.viewsHtml ?? null" />

					<form id="posts-filter" ref="formEl" method="post" @submit.prevent @mousedown="onListMousedown">
						<input v-for="hidden in formFields" :key="hidden.name" type="hidden" :name="hidden.name" :value="hidden.value" />

						<SlotOutlet name="before-table" :context="slotContext" />

						<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="state.pagination" :heading="headings.pagination ?? null" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk" />

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
							checkbox-name="delete_tags[]"
							:row-header-label="rowHeaderLabel"
							v-model:selected="selected"
							:no-items="state.noItems"
						>
							<template #cell="{ item, column }">
								<RowCell :item="item" :column="column" :expanded="quick.id === item.id" :button-ref="buttonRef" @act="act" @actions-html="onActionsHtml" />
							</template>
							<template #after-row="{ item }"><template v-if="quick.id === item.id ? Boolean( inlineEdit ) : false"><tr class="hidden"></tr><QuickEdit :key="'quick-' + item.id + '-' + quick.generation" :row="item" :inline-edit="inlineEdit" :colspan="colspan" :saving="quick.saving" :error="quick.error" @save="saveQuick" @cancel="closeQuick()" /></template></template>
						</Contracted>

						<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="state.pagination" :has-items="state.items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk" />

						<SlotOutlet name="after-table" :context="slotContext" />
					</form>

					<div v-if="notes.defaultCategory?.html || converter" class="form-wrap edit-term-notes">
						<p v-if="notes.defaultCategory?.html"><InlineMarkup :html="notes.defaultCategory.html" /></p>
						<p v-if="converter"><InlineMarkup :html="converter" /></p>
					</div>

					<LegacyHtml v-if="data.afterTableHtml" :html="data.afterTableHtml" />
				</div></div>
			</div>

			<form v-if="inlineEdit" method="get"><table style="display: none"><tbody id="inlineedit"><tr id="inline-edit" class="inline-edit-row" style="display: none"><td :colspan="String( colspan )" class="colspanchange"></td></tr></tbody></table></form>
		</div>
	`,
};
