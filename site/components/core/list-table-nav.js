import { computed, ref, watch } from 'vue';
import Pagination from './list-table-parts/pagination.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Default implementation of core/list-table-nav: WP_List_Table::display_tablenav()'s
 * `div.tablenav.{which}`: the bulk actions (bulk_actions(): the hidden label, the select with
 * "Bulk actions" first, `edit` marked `hide-if-no-js`, optgroups, and Apply), the page's `extra`
 * slot where extra_tablenav() prints, the hidden pagination heading above the table when there
 * is more than one page, and the pagination (list-table-parts/pagination.js).
 *
 * Apply submits nothing: it emits `bulk` with the value chosen. The select is a v-model
 * (`bulkValue`) so that the page can marry the top and bottom selects, as common.js does.
 */
export default {
	name: 'ListTableNav',
	components: { Pagination },
	props: {
		which: { type: String, required: true },
		bulkActions: { type: Array, default: () => [] },
		pagination: { type: Object, default: null },
		heading: { type: String, default: null },
		hasItems: { type: Boolean, default: null },
		bulkValue: { type: String, default: null },
	},
	emits: [ 'bulk', 'update:bulkValue' ],
	setup( props, { emit } ) {
		const bottom = computed( () => props.which === 'bottom' );
		const actions = computed( () => list( props.bulkActions ).filter( ( action ) => action && typeof action.label === 'string' && ( typeof action.value === 'string' || Array.isArray( action.options ) ) ) );
		const items = computed( () => ( typeof props.hasItems === 'boolean' ? props.hasItems : Number( props.pagination?.total ?? 0 ) > 0 ) );
		const chosen = ref( '-1' );
		watch( () => props.bulkValue, ( value ) => {
			chosen.value = typeof value === 'string' && value !== '' ? value : '-1';
		}, { immediate: true } );
		function choose( event ) {
			chosen.value = String( event?.target?.value ?? '-1' );
			emit( 'update:bulkValue', chosen.value );
		}
		function apply( event ) {
			event?.preventDefault?.();
			emit( 'bulk', chosen.value );
		}
		const headingShown = computed( () => ! bottom.value && Boolean( props.heading ) && Number( props.pagination?.total ?? 0 ) > 0 && Number( props.pagination?.pages ?? 0 ) > 1 );
		return { bottom, actions, items, chosen, choose, apply, headingShown };
	},
	template: `
		<div :class="[ 'tablenav', which ]">
			<div :class="[ 'alignleft', 'actions', 'bulkactions', { hidden: ! items } ]">
				<template v-if="actions.length > 0">
					<!-- translators: Hidden accessibility text. -->
					<label :for="'bulk-action-selector-' + which" class="screen-reader-text">{{ $__( 'Select bulk action', 'default' ) }}</label><select :name="bottom ? 'action2' : 'action'" :id="'bulk-action-selector-' + which" :value="chosen" @change="choose">
						<option value="-1">{{ $__( 'Bulk actions', 'default' ) }}</option>
						<template v-for="action in actions" :key="action.value ?? 'group:' + action.label">
							<optgroup v-if="action.options" :label="action.label">
								<option v-for="option in action.options" :key="option.value" :value="option.value" :class="option.value === 'edit' ? 'hide-if-no-js' : null">{{ option.label }}</option>
							</optgroup>
							<option v-else :value="action.value" :class="action.value === 'edit' ? 'hide-if-no-js' : null">{{ action.label }}</option>
						</template>
					</select>
					<input type="submit" name="bulk_action" :id="bottom ? 'doaction2' : 'doaction'" class="button action button-compact" :value="$__( 'Apply', 'default' )" @click="apply" />
				</template>
			</div>
			<slot name="extra" :which="which" />
			<h2 v-if="headingShown" class="screen-reader-text">{{ heading }}</h2>
			<Pagination v-if="pagination" :pagination="pagination" :which="which" />
			<br class="clear" />
		</div>
	`,
};
