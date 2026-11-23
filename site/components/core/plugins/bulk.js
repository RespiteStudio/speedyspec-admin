/*
 * The bulk actions of the Plugins list as updates.js splits them: Update and Delete run one package
 * job per checked plugin (its bulk handler queues `update-plugin` and `delete-plugin` jobs); every
 * other action is one write WordPress runs (`plugins/bulk`). Pure functions.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The update row's request of a row, when WordPress lets the update run here. Pure. */
export const updateRequest = ( item ) => ( item?.update?.request && typeof item.update.request.path === 'string' ? item.update.request : null );

/** The row's core action `key` with a request (Delete, Activate…), or null. Pure. */
export const requestAction = ( item, key ) => list( item?.actions ).find( ( action ) => action?.action === key && ! action.disabled && action.request && typeof action.request.path === 'string' ) ?? null;

/**
 * What a bulk action does with the checked rows:
 *
 * - `update-selected`: an update job for each checked row whose update WordPress lets run
 *   (updates.js skips rows without the `update` class);
 * - `delete-selected`: a delete job for each checked row WordPress gives Delete (an active plugin,
 *   or one other plugins require, has none);
 * - anything else: one `plugins/bulk` write with every checked file.
 *
 * @param {string}   action The bulk action.
 * @param {object[]} items  The rows.
 * @param {string[]} files  The checked plugin files.
 * @return {{kind: 'update'|'delete'|'bulk', files: string[]}} The plan.
 */
export function planBulk( action, items, files ) {
	const checked = list( files );
	const rows = list( items ).filter( ( item ) => checked.includes( item?.file ) );
	if ( action === 'update-selected' ) {
		return { kind: 'update', files: rows.filter( ( item ) => updateRequest( item ) ).map( ( item ) => item.file ) };
	}
	if ( action === 'delete-selected' ) {
		return { kind: 'delete', files: rows.filter( ( item ) => requestAction( item, 'delete' ) ).map( ( item ) => item.file ) };
	}
	return { kind: 'bulk', files: checked };
}
