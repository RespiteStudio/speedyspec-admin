/**
 * Builds list-table data for component tests, as the list pages' endpoints send it.
 *
 * column( key, label, extra ): a column of `columns`, a core column that is not sorted, primary,
 * hidden or numeric unless `extra` says so.
 */
export const column = ( key, label, extra = {} ) => ( { key, label, labelHtml: null, primary: false, hidden: false, num: false, core: true, sortable: null, sorted: null, ...extra } );
