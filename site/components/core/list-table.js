import { computed, nextTick, reactive, watch } from 'vue';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InertHtml from '../../kit/InertHtml.js';
import { decodeEntities } from '../../kit/Interpolate.js';
import { adminHref } from './dashboard-parts/links.js';
import { useSelection } from './list-table-parts/selection.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const same = ( a, b ) => a.length === b.length && a.every( ( value, index ) => value === b[ index ] );

/** The text of a header's label, as single_row_columns() strips it for `data-colname`. Pure. */
export const columnText = ( label ) => decodeEntities( String( label ?? '' ).replace( /<[^>]*>/g, '' ) );

/** The classes of a header cell, as print_column_headers() gives them. Pure. */
export function headerClasses( column ) {
	const classes = [ 'manage-column', 'column-' + column.key ];
	if ( column.hidden ) {
		classes.push( 'hidden' );
	}
	if ( column.key === 'cb' ) {
		classes.push( 'check-column' );
	} else if ( column.num === true ) {
		// WordPress says which columns print_column_headers() marks `num`.
		classes.push( 'num' );
	}
	if ( column.primary ) {
		classes.push( 'column-primary' );
	}
	if ( column.sortable ) {
		if ( column.sorted === 'asc' || column.sorted === 'desc' ) {
			classes.push( 'sorted', column.sorted );
		} else {
			// The order a click gives is the column's first order; the class is the other one.
			classes.push( 'sortable', column.sortable.initialDesc ? 'asc' : 'desc' );
		}
	}
	return classes;
}

/** The classes of a body cell, as single_row_columns() gives them. Pure. */
export function cellClasses( column ) {
	const classes = [ column.key, 'column-' + column.key ];
	if ( column.primary ) {
		classes.push( 'has-row-actions', 'column-primary' );
	}
	if ( column.hidden ) {
		classes.push( 'hidden' );
	}
	return classes;
}

/** One header row (thead with ids and select-all 1, tfoot without ids and select-all 2). */
const HeaderRow = {
	name: 'ListTableHeaderRow',
	components: { InlineMarkup },
	props: {
		columns: { type: Array, required: true },
		withId: { type: Boolean, default: false },
		counter: { type: Number, required: true },
		allSelected: { type: Boolean, default: false },
		selectAll: { type: Boolean, default: true },
	},
	emits: [ 'select-all' ],
	setup() {
		const ariaSort = ( column ) => ( column.sortable && column.sorted === 'asc' ? 'ascending' : column.sortable && column.sorted === 'desc' ? 'descending' : null );
		const sorted = ( column ) => column.sorted === 'asc' || column.sorted === 'desc';
		// A core header whose markup goes beyond the subset (the comment bubble icon) comes as `labelHtml`.
		const labelOf = ( column ) => ( typeof column.labelHtml === 'string' && column.labelHtml !== '' ? { html: column.labelHtml, spans: true } : { html: column.label ?? '', spans: false } );
		return { headerClasses, ariaSort, sorted, labelOf, href: ( path ) => adminHref( path ) };
	},
	template: `
		<tr>
			<template v-for="column in columns" :key="column.key">
				<td v-if="column.key === 'cb'" :id="withId ? 'cb' : null" :class="headerClasses( column )"><template v-if="selectAll"><input :id="'cb-select-all-' + counter" type="checkbox" :checked="allSelected" @click="$emit( 'select-all', $event )" /><label :for="'cb-select-all-' + counter"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Select All', 'default' ) }}</span></label></template></td>
				<th v-else scope="col" :id="withId ? column.key : null" :class="headerClasses( column )" :aria-sort="ariaSort( column )" :abbr="column.sortable?.abbr || null">
					<a v-if="column.sortable" :href="href( column.sortable.url )"><span><InlineMarkup v-bind="labelOf( column )" /></span><span class="sorting-indicators"><span class="sorting-indicator asc" aria-hidden="true"></span><span class="sorting-indicator desc" aria-hidden="true"></span></span><template v-if="! sorted( column )">{{ ' ' }}<!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ column.sortable.initialDesc ? $__( 'Sort descending.', 'default' ) : $__( 'Sort ascending.', 'default' ) }}</span></template></a>
					<InlineMarkup v-else v-bind="labelOf( column )" />
				</th>
			</template>
		</tr>
	`,
};

/**
 * Default implementation of core/list-table: WP_List_Table::display()'s table (`table.wp-list-table`,
 * the hidden caption, thead, tbody and tfoot) in the classic markup, so that WordPress's list styles
 * and responsive layout apply. The columns, their order, which is primary, hidden or sorted, and
 * the sort links come as data; the rows' cells come from the page's `cell` slot.
 *
 * As common.js: the select-all checkboxes check every row, or invert them with Shift (and are then
 * unchecked; see list-table-parts/selection.js `headerChecked`); a Shift-click
 * on a row's checkbox sets the rows in between (list-table-parts/selection.js); the primary cell's
 * "Show more details" button toggles the row's `is-expanded` class (small screens). Hiding a column
 * is a change of the data (`hidden`): the cells and the no-items row's `colspan` follow.
 *
 * Rows have a checkbox where `selectable( item )` says so (every row without the prop, as in 1.1.0);
 * with `selectable: false` (1.2.0) no row has one, and the select-all cells are empty. The
 * primary cell's `aria-label` is `rowHeaderLabel( item )`, as get_primary_column_aria_label() sets it.
 * A header is `num` when its column says so, and a header with `labelHtml` keeps its icon spans.
 * The `cb-extra` slot (1.3.0) follows a row's checkbox and label, as column_cb() prints the
 * Posts lock indicator after them; a row without a checkbox has neither.
 *
 * Without a `cell` slot, a cell shows the item's `cells[ key ].html`: a plugin column's
 * (`core: false`) through kit/LegacyHtml, which runs its scripts as classic prints them; a core
 * column's (comment text, author) through kit/InertHtml, which runs nothing.
 */
export default {
	name: 'ListTable',
	components: { HeaderRow, LegacyHtml, InertHtml },
	props: {
		columns: { type: Array, required: true },
		caption: { type: String, default: null },
		classes: { type: Array, default: () => [] },
		items: { type: Array, required: true },
		itemKey: { type: String, default: 'id' },
		bodyId: { type: String, default: null },
		rowId: { type: Function, default: null },
		rowClasses: { type: Function, default: null },
		rowStyle: { type: Function, default: null },
		// The server's flag per row; `false` (1.2.0) for a table whose rows never have one. Without
		// it every row has a checkbox, as in 1.1.0.
		selectable: { type: [ Function, Boolean ], default: true },
		checkboxLabel: { type: Function, default: null },
		checkboxName: { type: String, default: null },
		selected: { type: Array, default: () => [] },
		noItems: { type: String, default: null },
		rowHeaderLabel: { type: Function, default: null },
	},
	emits: [ 'update:selected' ],
	setup( props, { emit } ) {
		const shownColumns = computed( () => list( props.columns ).filter( ( column ) => typeof column?.key === 'string' && column.key !== '' ) );
		const keyOf = ( item ) => item?.[ props.itemKey ];
		const canSelect = ( item ) => ( typeof props.selectable === 'function' ? Boolean( props.selectable( item ) ) : props.selectable !== false );
		// With `selectable: false` no row can ever be selected: no select-all checkboxes either.
		const selectAll = computed( () => props.selectable !== false );
		// As get_primary_column_aria_label(): the label WordPress sends for the row, or none.
		const rowHeaderLabelOf = ( item ) => {
			const label = typeof props.rowHeaderLabel === 'function' ? props.rowHeaderLabel( item ) : null;
			return typeof label === 'string' && label !== '' ? label : null;
		};
		const keys = computed( () => list( props.items ).filter( canSelect ).map( keyOf ) );
		const selection = useSelection( keys );

		// The page's selection and the table's stay the same (v-model:selected).
		watch( () => props.selected, ( value ) => {
			const next = list( value ).filter( ( key ) => keys.value.includes( key ) );
			if ( ! same( next, selection.selected.value ) ) {
				selection.selected.value = next;
				selection.syncHeader();
			}
		}, { immediate: true } );
		watch( selection.selected, ( value ) => {
			if ( ! same( value, list( props.selected ) ) ) {
				emit( 'update:selected', [ ...value ] );
			}
		} );

		// Rows opened with "Show more details".
		const expanded = reactive( new Set() );
		const toggleRow = ( key ) => ( expanded.has( key ) ? expanded.delete( key ) : expanded.add( key ) );

		const visibleCount = computed( () => shownColumns.value.filter( ( column ) => ! column.hidden ).length );
		const tableClasses = computed( () => [ 'wp-list-table', ...list( props.classes ) ] );
		const rowClassesOf = ( item ) => [ ...list( props.rowClasses?.( item ) ), { 'is-expanded': expanded.has( keyOf( item ) ) } ];
		const cellHtml = ( item, column ) => {
			const cell = item?.cells?.[ column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};

		return {
			shownColumns, keyOf, canSelect, selectAll, rowHeaderLabelOf, selection, expanded, toggleRow, visibleCount, tableClasses, rowClassesOf, cellHtml, cellClasses,
			colname: ( column ) => columnText( column.label ),
			isSelected: ( key ) => selection.selected.value.includes( key ),
			onRow: ( key, event ) => selection.toggle( key, event ),
			onAll: ( event ) => {
				selection.toggleAll( Boolean( event?.target?.checked ), event );
				// The clicked checkbox shows the state too, also when the bound value did not change.
				nextTick( () => {
					if ( event?.target && typeof event.target === 'object' ) {
						event.target.checked = selection.headerChecked.value;
					}
				} );
			},
		};
	},
	template: `
		<table :class="tableClasses">
			<caption v-if="caption" class="screen-reader-text">{{ caption }}</caption>
			<thead>
				<HeaderRow :columns="shownColumns" :with-id="true" :counter="1" :select-all="selectAll" :all-selected="selection.headerChecked.value" @select-all="onAll" />
			</thead>
			<tbody :id="bodyId">
				<template v-if="items.length > 0">
					<template v-for="item in items" :key="keyOf( item )">
						<tr :id="rowId ? rowId( item ) : null" :class="rowClassesOf( item )" :style="rowStyle ? rowStyle( item ) : null">
							<template v-for="column in shownColumns" :key="column.key">
								<td v-if="column.key === 'cb'" class="check-column"><template v-if="canSelect( item )"><input :id="'cb-select-' + keyOf( item )" type="checkbox" :name="checkboxName" :value="String( keyOf( item ) )" :checked="isSelected( keyOf( item ) )" @click="onRow( keyOf( item ), $event )" /><label :for="'cb-select-' + keyOf( item )"><span class="screen-reader-text">{{ checkboxLabel ? checkboxLabel( item ) : $__( 'Select', 'default' ) }}</span></label><slot name="cb-extra" :item="item" /></template></td>
								<component v-else :is="column.primary ? 'th' : 'td'" :class="cellClasses( column )" :data-colname="colname( column )" :scope="column.primary ? 'row' : null" :aria-label="column.primary ? rowHeaderLabelOf( item ) : null">
									<slot name="cell" :item="item" :column="column"><template v-if="cellHtml( item, column )"><LegacyHtml v-if="column.core === false" :html="cellHtml( item, column )" /><InertHtml v-else :html="cellHtml( item, column )" /></template></slot>
									<!-- translators: Hidden accessibility text. -->
									<button v-if="column.primary" type="button" class="toggle-row" @click="toggleRow( keyOf( item ) )"><span class="screen-reader-text">{{ $__( 'Show more details', 'default' ) }}</span></button>
								</component>
							</template>
						</tr>
						<slot name="after-row" :item="item" />
					</template>
				</template>
				<tr v-else class="no-items"><td class="colspanchange" :colspan="String( visibleCount )"><slot name="no-items">{{ noItems ?? $__( 'No items found.', 'default' ) }}</slot></td></tr>
			</tbody>
			<tfoot>
				<HeaderRow :columns="shownColumns" :counter="2" :select-all="selectAll" :all-selected="selection.headerChecked.value" @select-all="onAll" />
			</tfoot>
		</table>
	`,
};
