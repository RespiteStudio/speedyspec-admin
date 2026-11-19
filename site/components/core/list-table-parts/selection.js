import { computed, ref, unref, watch } from 'vue';

/**
 * The checked rows of a list table, as common.js checks them (its `tbody > tr > .check-column
 * :checkbox` and `thead/tfoot .check-column :checkbox` handlers): a part of core/list-table that a
 * page may use for its own controls.
 *
 * - `toggle( key, event )`: the row's checkbox was clicked; `event.target.checked` is its new state
 *   (without an event it flips). With Shift, and a row clicked before, the rows in between take
 *   that state too, as common.js slices them: downwards from the row clicked last to this one,
 *   upwards from this one to the row before the one clicked last.
 * - `toggleAll( checked, event )`: a select-all checkbox was clicked: every row is checked or
 *   unchecked; with Shift (`wp-toggle`) each row is inverted.
 * - `clear()`: nothing checked.
 * - `allSelected`: whether there are rows and all are checked.
 * - `headerChecked`: the select-all checkboxes' state, as common.js sets it: after a select-all
 *   click, unchecked with Shift, else as the clicked one (checked also when no row has a
 *   checkbox); after a row's click, or when the selection is set from outside (`syncHeader()`),
 *   whether every row is checked.
 *
 * A key that leaves `keys` (a row that went) leaves the selection.
 *
 * @param {import('vue').Ref<Array>|Array} keys The keys of the rows that have a checkbox, in order.
 * @return {{selected: import('vue').Ref<Array>, allSelected: import('vue').ComputedRef<boolean>, headerChecked: import('vue').ComputedRef<boolean>, toggle: Function, toggleAll: Function, clear: Function, syncHeader: Function}} The selection.
 */
export function useSelection( keys ) {
	const selected = ref( [] );
	// The select-all state a select-all click set (common.js), until a row's click: null to follow the rows.
	const header = ref( null );
	let last = null;
	const list = () => {
		const value = unref( keys );
		return Array.isArray( value ) ? value : [];
	};
	const inOrder = ( chosen ) => list().filter( ( key ) => chosen.has( key ) );

	watch( () => list(), ( now ) => {
		if ( selected.value.some( ( key ) => ! now.includes( key ) ) ) {
			selected.value = selected.value.filter( ( key ) => now.includes( key ) );
		}
		if ( ! now.includes( last ) ) {
			last = null;
		}
	} );

	function toggle( key, event ) {
		const all = list();
		const chosen = new Set( selected.value );
		const checked = typeof event?.target?.checked === 'boolean' ? event.target.checked : ! chosen.has( key );
		const from = all.indexOf( last );
		const to = all.indexOf( key );
		let range = [ key ];
		if ( event?.shiftKey && from !== -1 && to !== -1 && from !== to ) {
			range = to > from ? all.slice( from, to + 1 ) : all.slice( to, from );
		}
		for ( const item of range ) {
			if ( checked ) {
				chosen.add( item );
			} else {
				chosen.delete( item );
			}
		}
		// The row clicked is the one clicked, whatever the range.
		if ( checked ) {
			chosen.add( key );
		} else {
			chosen.delete( key );
		}
		last = key;
		selected.value = inOrder( chosen );
		header.value = null;
	}

	function toggleAll( checked, event ) {
		const all = list();
		if ( event?.shiftKey ) {
			const chosen = new Set( selected.value );
			selected.value = all.filter( ( key ) => ! chosen.has( key ) );
			header.value = false;
			return;
		}
		selected.value = checked ? [ ...all ] : [];
		header.value = Boolean( checked );
	}

	function clear() {
		selected.value = [];
		header.value = null;
		last = null;
	}

	function syncHeader() {
		header.value = null;
	}

	const allSelected = computed( () => {
		const all = list();
		return all.length > 0 && all.every( ( key ) => selected.value.includes( key ) );
	} );

	const headerChecked = computed( () => ( header.value === null ? allSelected.value : header.value ) );

	return { selected, allSelected, headerChecked, toggle, toggleAll, clear, syncHeader };
}
