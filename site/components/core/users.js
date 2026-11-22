import { computed, inject, ref, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { bulkCheck, formQuery } from './list-table-parts/list-form.js';
import { useListPage } from './list-table-parts/list-page.js';
import { DieError, failureText, usePageChrome } from './list-table-parts/page-chrome.js';
import { actionSpan } from './list-table-parts/row-actions.js';
import RowCell, { actionRequest, userActions } from './users/rows.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

const BULK_ROUTE = 'wp-admin/v1/users/bulk';
// What a filter or search never sends: the bulk actions, the checked rows and the role change.
const BULK_FIELDS = new Set( [ 'action', 'action2', 'bulk_action', 'users[]', 'new_role', 'new_role2', 'changeit', 'changeit2' ] );

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The role change's select and button of a table navigation (extra_tablenav()). Pure. */
export const roleControls = ( which ) => ( which === 'bottom' ? { select: 'new_role2', button: 'changeit2' } : { select: 'new_role', button: 'changeit' } );

/** What a plugin printed in the table navigation for `which`, or ''. Pure. */
export const navHtml = ( entry, which ) => {
	const html = entry?.[ which ]?.html;
	return typeof html === 'string' ? html : '';
};

/**
 * The core action a click in row actions plugins filtered (`actionsHtml`) runs, or null: the
 * action whose key is the class of the clicked control's span (row_actions() prints
 * `<span class='{key}'>`) and is in the row's `coreActions` (the actions the filter left as core
 * gave them). None for a click its own handler prevented, outside a link or button, or in a
 * plugin's span. `event.currentTarget` is the row actions element. Pure over the DOM.
 *
 * @param {Event}  event The click.
 * @param {object} item  The row (`actions`, `coreActions`).
 * @return {object|null} The action.
 */
export function filteredUserAction( event, item ) {
	if ( ! event || event.defaultPrevented || ! Array.isArray( item?.coreActions ) ) {
		return null;
	}
	const control = event.target?.closest?.( 'a, button' ) ?? null;
	const span = control ? actionSpan( control, event.currentTarget ?? null ) : null;
	const key = String( span?.getAttribute?.( 'class' ) ?? '' ).trim();
	if ( key === '' || ! item.coreActions.includes( key ) ) {
		return null;
	}
	return userActions( item.actions ).find( ( action ) => action.action === key ) ?? null;
}

/**
 * What WP_Users_List_Table::extra_tablenav() prints in a table navigation: the role change (its
 * hidden label, the select with its first option, the roles and No role, and Change), only with
 * `roleChange` and rows; what {@see 'restrict_manage_users'} printed, inside the same div; then
 * what {@see 'manage_users_extra_tablenav'} printed. Emits `change-role` for Change.
 */
const NavExtra = {
	name: 'UsersNavExtra',
	components: { LegacyHtml },
	props: {
		which: { type: String, required: true },
		roleChange: { type: Object, default: null },
		roleOptions: { type: Array, required: true },
		hasItems: { type: Boolean, required: true },
		extraNav: { type: Object, default: null },
		role: { type: String, required: true },
	},
	emits: [ 'update:role', 'change-role' ],
	setup( props ) {
		return {
			controls: computed( () => roleControls( props.which ) ),
			restrict: computed( () => navHtml( props.extraNav?.restrict, props.which ) ),
			after: computed( () => navHtml( props.extraNav?.after, props.which ) ),
		};
	},
	template: `
		<div class="alignleft actions">
			<template v-if="roleChange ? hasItems : false">
				<label class="screen-reader-text" :for="controls.select">{{ roleChange.label }}</label>
				<select :name="controls.select" :id="controls.select" :value="role" @change="$emit( 'update:role', $event.target.value )">
					<option value="">{{ roleChange.label }}</option>
					<option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
				</select>
				{{ ' ' }}<input type="submit" :name="controls.button" :id="controls.button" class="button" :value="roleChange.button" @click.prevent="$emit( 'change-role' )" />
			</template>
			<LegacyHtml v-if="restrict" tag="span" :html="restrict" />
		</div>
		<LegacyHtml v-if="after" tag="span" :html="after" />
	`,
};

/**
 * Default implementation of core/users: the Users list (wp-admin/users.php) in its classic markup:
 * the Add User action, the search subtitle, the messages (each `#message`), the views, then the
 * list's GET form with the search box (`#user-search-input`), the navigation above the table with
 * the role change (`#new_role` and `#changeit`) and the plugins' navigation, the table
 * (`#the-list`, `tr#user-{id}`), and the navigation below it (`#new_role2`, `#changeit2`). The body
 * has the classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data: the users, columns, views, roles and actions, the
 * messages and where an action leads. The page reproduces common.js:
 *
 * - Search submits the list form's fields (plugin fields included) to `users.php`, through the
 *   router; views, sortable headers, pages and Edit are links the router opens.
 * - Change posts `users/bulk` (`promote`) with the role of its own select, then follows the answer.
 * - Apply checks as common.js does, then posts `users/bulk` with the checked rows and follows the
 *   answer: the list with its message, or the Delete Users or Remove Users confirmation.
 * - Send password reset posts its request and follows the answer; Delete and Remove open their
 *   confirmation. In row actions plugins filtered, a core action does the same.
 * - Screen Options give the frame the table's columns and the per page, saved for screen `users`.
 *
 * Answers are applied in the order their requests were sent, and dropped when the data changes or
 * the page unmounts. Logins, names and emails are text; plugin cells and navigation are their HTML
 * (kit/LegacyHtml).
 */
export default {
	name: 'Users',
	components: { Contracted, SlotOutlet, InlineMarkup, Format, RowCell, DieError, NavExtra },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );

		const { answers, failed, follow, sendAndFollow, navigate, bulkError, columns } = useListPage( props, {
			screenId: () => 'users',
			pathname: '/wp-admin/users.php',
			blocked: () => pageFailed.value || Boolean( refusal.value ),
			onAnswer: ( answer ) => emit( 'saved', answer ),
			failureText,
		} );

		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );

		// The hidden headings users.php sets (set_screen_reader_content()), from the data.
		const headings = computed( () => ( props.data?.headings && typeof props.data.headings === 'object' ? props.data.headings : {} ) );
		const items = computed( () => list( props.data?.items ).filter( ( item ) => item && Number.isInteger( item.id ) ) );
		const roleChange = computed( () => ( props.data?.roleChange && typeof props.data.roleChange === 'object' ? props.data.roleChange : null ) );
		const roleOptions = computed( () => list( roleChange.value?.options ).filter( ( option ) => option && typeof option.value === 'string' ) );
		const roles = ref( { top: '', bottom: '' } );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const formEl = ref( null );
		const dismissed = ref( [] );
		const messages = computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) );

		const checkedIds = () => items.value.filter( ( item ) => selected.value.includes( item.id ) ).map( ( item ) => item.id );

		/** The list form's GET submit (Search), through the router. */
		function submitList( replace = {} ) {
			const entries = list( readForm( formEl.value ) ).filter( ( [ name ] ) => ! BULK_FIELDS.has( name ) );
			const qs = formQuery( entries, replace );
			navigate( 'users.php' + ( qs ? '?' + qs : '' ) );
		}

		/** Change: the role of the button's own select, for the checked rows. */
		function changeRole( which ) {
			return sendAndFollow( BULK_ROUTE, { action: 'promote', role: roles.value[ which ] ?? '', ids: checkedIds(), list: query.value }, 'Could not change the roles:' );
		}

		function applyBulk( value ) {
			const action = String( value ?? bulkValue.value );
			const ids = checkedIds();
			const check = bulkCheck( action, ids.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			return sendAndFollow( BULK_ROUTE, { action, ids, list: query.value }, 'Could not run the bulk action:' );
		}

		/** A row action: its route (Send password reset), or its address (Delete, Remove, Edit). */
		function act( item, action ) {
			const request = actionRequest( action?.request );
			if ( request ) {
				return answers.ordered( api.post( request.route, request.body ), ( answer ) => {
					emit( 'saved', answer );
					follow( answer );
				}, ( error ) => failed( error, 'Could not send the password reset:' ) );
			}
			if ( typeof action?.url === 'string' && action.url !== '' && ! /^[a-z][a-z0-9+.-]*:/i.test( action.url ) ) {
				navigate( action.url );
			}
			return Promise.resolve();
		}

		/**
		 * A click in row actions plugins filtered: a core action the filter left as core gave it
		 * (`coreActions`) runs natively, never through the classic nonce link; View, a front end
		 * address, and a plugin's own link go where they lead.
		 */
		function onActionsHtml( item, event ) {
			const action = filteredUserAction( event, item );
			if ( ! action || action.action === 'view' ) {
				return;
			}
			event.preventDefault?.();
			act( item, action );
		}

		watch( () => props.data, () => {
			selected.value = [];
			bulkValue.value = '-1';
			roles.value = { top: '', bottom: '' };
			dismissed.value = [];
		} );

		return {
			pageFailed, refusal, query, headings, items, selected, bulkValue, columns, messages, dismissed, formEl, roleChange, roleOptions, roles,
			act, onActionsHtml, applyBulk, changeRole,
			onSearch: ( term ) => submitList( { s: term } ),
			onSubmit: () => submitList(),
			href: ( path ) => adminHref( path ),
			roleHidden: computed( () => text( query.value.role ) ),
			slotContext: computed( () => ( { query: query.value } ) ),
			rowId: ( item ) => 'user-' + item.id,
			selectable: ( item ) => item.selectable === true,
			checkboxLabel: ( item ) => text( item.checkboxLabel ),
			rowHeaderLabel: ( item ) => ( typeof item.rowHeaderLabel === 'string' ? item.rowHeaderLabel : null ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-users-failed">{{ $__( 'The users could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-users-error" />
		<div v-else class="wp-admin-users">
			<a v-if="data.heading?.addNew?.path" :href="href( data.heading.addNew.path )" class="page-title-action">{{ data.heading.addNew.label }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<template v-for="( message, index ) in messages" :key="index">
				<div v-if="! dismissed.includes( index )" id="message" :class="[ message.type === 'error' ? 'error' : 'updated', 'notice', 'is-dismissible' ]"><p><InlineMarkup :html="message.markup" /></p><button type="button" class="notice-dismiss" @click="dismissed.push( index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>
			</template>

			<Contracted id="core/list-table-views" :views="data.views ?? []" :views-html="data.viewsHtml ?? null" :heading="headings.views ?? null" />

			<form ref="formEl" method="get" class="wp-admin-users-form" @submit.prevent="onSubmit">
				<Contracted v-if="data.search" id="core/list-table-search" :search="data.search" @search="onSearch" />
				<input v-if="roleHidden" type="hidden" name="role" :value="roleHidden" />

				<SlotOutlet name="before-table" :context="slotContext" />

				<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :heading="headings.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra><NavExtra which="top" :role-change="roleChange" :role-options="roleOptions" :has-items="items.length > 0" :extra-nav="data.extraNav ?? null" v-model:role="roles.top" @change-role="changeRole( 'top' )" /></template>
				</Contracted>

				<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
				<Contracted id="core/list-table" :columns="columns" :caption="data.caption ?? null" :classes="data.classes ?? []" :items="items" body-id="the-list" :row-id="rowId" :selectable="selectable" :checkbox-label="checkboxLabel" checkbox-name="users[]" :row-header-label="rowHeaderLabel" v-model:selected="selected" :no-items="data.noItems ?? null">
					<template #cell="{ item, column }">
						<RowCell :item="item" :column="column" @act="act" @actions-html="onActionsHtml" />
					</template>
				</Contracted>

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra><NavExtra which="bottom" :role-change="roleChange" :role-options="roleOptions" :has-items="items.length > 0" :extra-nav="data.extraNav ?? null" v-model:role="roles.bottom" @change-role="changeRole( 'bottom' )" /></template>
				</Contracted>

				<SlotOutlet name="after-table" :context="slotContext" />
			</form>

			<div class="clear"></div>
		</div>
	`,
};
