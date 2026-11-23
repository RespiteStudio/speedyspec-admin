import { computed, inject, ref, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { bulkCheck, formQuery } from './list-table-parts/list-form.js';
import { ListMessages, useListPage } from './list-table-parts/list-page.js';
import { DieError, failureText, usePageChrome } from './list-table-parts/page-chrome.js';
import RowCell, { isDelete } from './link-manager/rows.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

const BULK_ROUTE = 'wp-admin/v1/links/bulk';
// What a filter or search never sends: the bulk actions and the checked rows.
const BULK_FIELDS = new Set( [ 'action', 'action2', 'linkcheck[]' ] );

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The class of a category option (`level-N`), none for All. Pure. */
export const optionClass = ( option ) => ( Number.isInteger( option?.level ) ? 'level-' + option.level : null );

/**
 * Default implementation of core/link-manager: the Links list (wp-admin/link-manager.php) in its
 * classic markup: the Add Link action, the search subtitle, the messages (`#message`), then
 * `form#posts-filter` (GET) with the search box (`#link-search-input`), the navigation above the
 * table with the category filter (`#cat_id` and Filter, `#post-query-submit`), the table
 * (`#the-list`, `tr#link-{id}`), the navigation below it and `#ajax-response`. The body has the
 * classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data: the links, columns and categories, which category
 * is the list's, the actions and their confirmations, the messages and where an action leads.
 * The page reproduces common.js:
 *
 * - Search and Filter navigate to `link-manager.php` with the list form's fields, through the
 *   router (a sortable header, a category link and Edit are links the router opens).
 * - Delete asks WordPress's question (`confirm`, as the classic link's `onclick`), calls its route
 *   and follows the answer, which leads back to the list.
 * - Apply checks as common.js does, then posts `links/bulk` with the checked rows and follows the
 *   answer.
 * - Screen Options give the frame the table's columns, saved for screen `link-manager`.
 *
 * Answers are applied in the order their requests were sent, and dropped when the data changes
 * or the page unmounts (list-table-parts/ordered-answers.js). Names, addresses and categories are
 * text; plugin cells are their HTML (kit/LegacyHtml).
 */
export default {
	name: 'LinkManager',
	components: { Contracted, SlotOutlet, ListMessages, LegacyHtml, Format, RowCell, DieError },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed, dieError, blocked } = usePageChrome( props );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );

		const { answers, failed, follow, sendAndFollow, navigate, bulkError, columns, messages } = useListPage( props, {
			screenId: () => 'link-manager',
			pathname: '/wp-admin/link-manager.php',
			blocked: () => blocked.value,
			onAnswer: ( answer ) => emit( 'saved', answer ),
			failureText,
		} );

		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );

		const headings = computed( () => props.data?.headings ?? {} );
		const items = computed( () => list( props.data?.items ).filter( ( item ) => item && Number.isInteger( item.id ) ) );
		const filter = computed( () => ( props.data?.filter && typeof props.data.filter === 'object' ? props.data.filter : null ) );
		const filterValue = ref( text( filter.value?.value ?? '0' ) );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const formEl = ref( null );

		/** The list form's GET submit (Search, Filter), through the router. */
		function submitList( replace = {} ) {
			const entries = list( readForm( formEl.value ) ).filter( ( [ name ] ) => ! BULK_FIELDS.has( name ) );
			const qs = formQuery( entries, replace );
			navigate( 'link-manager.php' + ( qs ? '?' + qs : '' ) );
		}

		function deleteLink( action ) {
			// The classic link's `onclick="return confirm( '…' );"`, with WordPress's text.
			if ( ! ask( text( action.confirm ) ) ) {
				return Promise.resolve();
			}
			return answers.ordered( api.del( 'wp-admin/v1/' + action.request.path.replace( /^\/+/, '' ) ), ( answer ) => {
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => failed( error, 'Could not delete the link:' ) );
		}

		function act( item, action ) {
			if ( isDelete( action?.request ) ) {
				deleteLink( action );
			}
		}

		function applyBulk( value ) {
			const action = String( value ?? bulkValue.value );
			const ids = items.value.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			return sendAndFollow( BULK_ROUTE, { action, ids, list: query.value }, 'Could not run the bulk action:' );
		}

		watch( () => props.data, ( data ) => {
			selected.value = [];
			bulkValue.value = '-1';
			filterValue.value = text( data?.filter?.value ?? '0' );
		} );

		return {
			pageFailed, dieError, query, headings, items, filter, filterValue, selected, bulkValue, columns, messages, formEl,
			act, applyBulk, optionClass,
			onSearch: ( term ) => submitList( { s: term } ),
			onFilter: () => submitList(),
			href: ( path ) => adminHref( path ),
			slotContext: computed( () => ( { query: query.value } ) ),
			filterOptions: computed( () => list( filter.value?.options ).filter( ( option ) => option && typeof option.value === 'string' ) ),
			rowId: ( item ) => 'link-' + item.id,
			selectable: ( item ) => item.selectable === true,
			checkboxLabel: ( item ) => text( item.checkboxLabel ),
			rowHeaderLabel: ( item ) => ( typeof item.rowHeaderLabel === 'string' ? item.rowHeaderLabel : null ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-link-manager-failed">{{ $__( 'The links could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="dieError" :error="dieError" classes="wp-admin-link-manager-error" />
		<div v-else class="wp-admin-link-manager nosubsub">
			<a v-if="data.heading?.addNew?.path" :href="href( data.heading.addNew.path )" class="page-title-action">{{ data.heading.addNew.label }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<ListMessages :messages="messages" id="message" classes="updated notice is-dismissible" />

			<form id="posts-filter" ref="formEl" method="get" @submit.prevent="onFilter">
				<Contracted v-if="data.search" id="core/list-table-search" :search="data.search" @search="onSearch" />

				<SlotOutlet name="before-table" :context="slotContext" />

				<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra>
						<div v-if="filter" class="alignleft actions">
							<label class="screen-reader-text" for="cat_id">{{ filter.label ?? '' }}</label>
							<LegacyHtml v-if="filter.html" tag="span" :html="filter.html" />
							<select v-else name="cat_id" id="cat_id" class="postform" v-model="filterValue">
								<option v-for="option in filterOptions" :key="option.value" :class="optionClass( option )" :value="option.value">{{ option.label }}</option>
							</select>
							{{ ' ' }}<input type="submit" name="filter_action" id="post-query-submit" class="button" :value="$__( 'Filter', 'default' )" @click.prevent="onFilter" />
						</div>
					</template>
				</Contracted>

				<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
				<Contracted
					id="core/list-table"
					:columns="columns"
					:caption="data.caption ?? null"
					:classes="data.classes ?? []"
					:items="items"
					body-id="the-list"
					:row-id="rowId"
					:selectable="selectable"
					:checkbox-label="checkboxLabel"
					checkbox-name="linkcheck[]"
					:row-header-label="rowHeaderLabel"
					v-model:selected="selected"
					:no-items="data.noItems ?? null"
				>
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" @act="act" />
					</template>
				</Contracted>

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk" />

				<SlotOutlet name="after-table" :context="slotContext" />

				<div id="ajax-response"></div>
			</form>
		</div>
	`,
};
