import { computed, nextTick, reactive, watch } from 'vue';
import { __, _x, sprintf } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { safeUrl } from '../../../kit/url.js';
import Format from '../dashboard-parts/format.js';
import { adminHref } from '../dashboard-parts/links.js';
import { useSelection } from '../list-table-parts/selection.js';
import AutoUpdates from './auto-updates.js';
import UpdateRow from './update-row.js';

/*
 * The table of the Plugins list in the markup WP_Plugins_List_Table prints (display(),
 * single_row()): `table.wp-list-table.plugins` with `tbody#the-list`, each plugin a
 * `tr[data-slug][data-plugin]` with the classes WordPress gives it, its checkbox, its name and row
 * actions, its description with the meta line, the dependencies and the paused notice, its
 * auto-updates cell and the plugin columns; then the incompatible row, the plugins' rows after it
 * and the update row. A plugin deleted in place is the classic `.plugin-deleted-tr`.
 *
 * Names, versions, labels and texts are text; descriptions and messages are inline markup
 * (kit/InlineMarkup); the plugins' row actions, meta, after meta, rows and cells are their HTML
 * (kit/LegacyHtml), as classic prints them.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The class of an action's link, as single_row() prints it. Pure. */
export const actionLinkClass = ( action ) => ( { activate: 'edit', delete: 'delete', resume: 'resume-link' }[ action?.action ] ?? null );

/** Whether an action has a request the page sends. Pure. */
export const hasRequest = ( action ) => Boolean( action && ! action.disabled && action.request && typeof action.request.path === 'string' && action.request.path !== '' );

/**
 * The core action a click in row actions plugins filtered (`actionsHtml`) runs, or null: the action
 * whose classic id (`activate-{slug}`, `deactivate-{slug}`, `delete-{slug}`…) the clicked link has.
 * None for a click its own handler prevented, or on a plugin's link. Pure over the DOM.
 *
 * @param {Event}  event The click.
 * @param {object} item  The row (`actions`).
 * @return {object|null} The action.
 */
export function filteredPluginAction( event, item ) {
	if ( ! event || event.defaultPrevented ) {
		return null;
	}
	const id = event.target?.closest?.( 'a' )?.getAttribute?.( 'id' ) ?? '';
	return id === '' ? null : list( item?.actions ).find( ( action ) => hasRequest( action ) && action.htmlId === id ) ?? null;
}

/**
 * A translated sentence that starts with a strong label (`<strong>Requires:</strong> %s`), split
 * into the text before the label, the label, and what is between the label and the placeholder,
 * and after it. Pure.
 *
 * @param {string} format The translated sentence.
 * @return {{before: string, lead: string, middle: string, after: string}|null} The parts, or null.
 */
export function strongFormat( format ) {
	const match = /^([\s\S]*?)<strong>([\s\S]*?)<\/strong>([\s\S]*?)%(?:1\$)?s([\s\S]*)$/.exec( String( format ?? '' ) );
	return match ? { before: match[ 1 ], lead: match[ 2 ], middle: match[ 3 ], after: match[ 4 ] } : null;
}

/** The classes of a header cell, as print_column_headers() gives them for this table. Pure. */
export function headerClasses( column ) {
	const classes = [ 'manage-column', 'column-' + column.key ];
	if ( column.hidden ) {
		classes.push( 'hidden' );
	}
	if ( column.key === 'cb' ) {
		classes.push( 'check-column' );
	}
	if ( column.primary ) {
		classes.push( 'column-primary' );
	}
	return classes;
}

/** The number of columns shown (get_column_count()): the colspan of the rows after a row. Pure. */
export const columnCount = ( columns ) => list( columns ).filter( ( column ) => ! column.hidden ).length;

/** The id of a row's checkbox: classic's `checkbox_` and a name made of the file. Pure. */
export const checkboxId = ( file ) => 'checkbox_' + text( file ).replace( /[^A-Za-z0-9_-]/g, '_' );

/** A header row (thead with ids and select-all 1, tfoot without ids and select-all 2). */
const HeaderRow = {
	name: 'PluginsHeaderRow',
	components: { InlineMarkup },
	props: {
		columns: { type: Array, required: true },
		withId: { type: Boolean, default: false },
		counter: { type: Number, required: true },
		selectAll: { type: Boolean, default: true },
		allSelected: { type: Boolean, default: false },
	},
	emits: [ 'select-all' ],
	setup() {
		return { headerClasses };
	},
	template: `
		<tr>
			<template v-for="column in columns" :key="column.key">
				<td v-if="column.key === 'cb'" :id="withId ? 'cb' : null" :class="headerClasses( column )"><template v-if="selectAll"><input :id="'cb-select-all-' + counter" type="checkbox" :checked="allSelected" @click="$emit( 'select-all', $event )" /><label :for="'cb-select-all-' + counter"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Select All', 'default' ) }}</span></label></template></td>
				<th v-else scope="col" :id="withId ? column.key : null" :class="headerClasses( column )"><InlineMarkup :html="column.label ?? ''" /></th>
			</template>
		</tr>
	`,
};

/** The description cell's content: the description, the meta line, the dependencies, after meta, the paused notice. */
const Description = {
	name: 'PluginsDescription',
	components: { InlineMarkup, LegacyHtml, Format },
	props: {
		item: { type: Object, required: true },
	},
	emits: [ 'details' ],
	setup( props, { emit } ) {
		const deps = computed( () => props.item.dependencies ?? {} );
		const requires = computed( () => ( deps.value.requires && list( deps.value.requires.names ).length > 0 ? deps.value.requires : null ) );
		const requiredBy = computed( () => ( deps.value.requiredBy && list( deps.value.requiredBy.names ).length > 0 ? deps.value.requiredBy : null ) );
		/* translators: %s: List of dependency names. */
		const requiresFormat = computed( () => strongFormat( __( '<strong>Requires:</strong> %s', 'default' ) ) );
		/* translators: %s: List of dependencies. */
		const requiredByFormat = computed( () => strongFormat( __( '<strong>Required by:</strong> %s', 'default' ) ) );
		const separator = computed( () => __( ', ', 'default' ) );
		const meta = computed( () => list( props.item.meta ).filter( ( entry ) => entry && typeof entry.kind === 'string' ) );
		const isActive = computed( () => list( props.item.classes ).includes( 'active' ) );
		return {
			deps, requires, requiredBy, requiresFormat, requiredByFormat, separator, meta, isActive,
			adminHref,
			siteHref: ( url ) => safeUrl( text( url ), { protocols: [ 'http:', 'https:' ] } ),
			detailsPath: ( slug ) => 'plugin-install.php?tab=plugin-information&plugin=' + encodeURIComponent( slug ),
			/* translators: %s: Plugin name. */
			moreAbout: ( name ) => sprintf( __( 'More information about %s', 'default' ), name ),
			openDetails: ( slug, event ) => {
				event?.preventDefault?.();
				emit( 'details', slug, 'description' );
			},
		};
	},
	template: `
		<div class="plugin-description"><p><InlineMarkup :html="item.description ?? ''" /></p></div>
		<div :class="[ isActive ? 'active' : 'inactive', 'second', 'plugin-version-author-uri' ]"><LegacyHtml v-if="typeof item.metaHtml === 'string'" tag="span" :html="item.metaHtml" /><template v-else><template v-for="( entry, index ) in meta" :key="entry.kind"><template v-if="index > 0">{{ ' | ' }}</template><template v-if="entry.kind === 'author'"><Format :text="$__( 'By %s', 'default' )"><template #arg1><a v-if="siteHref( item.author?.url )" :href="siteHref( item.author.url )">{{ item.author?.name ?? '' }}</a><template v-else>{{ item.author?.name ?? '' }}</template></template></Format></template><a v-else-if="entry.kind === 'details' && entry.slug" :href="adminHref( entry.url ?? detailsPath( entry.slug ) )" class="thickbox open-plugin-details-modal" :aria-label="entry.ariaLabel || null" :data-title="item.rowHeaderLabel ?? item.name" @click="openDetails( entry.slug, $event )">{{ entry.text }}</a><a v-else-if="entry.kind === 'site' && siteHref( entry.url )" :href="siteHref( entry.url )" :aria-label="entry.ariaLabel || null">{{ entry.text }}</a><template v-else>{{ entry.text }}</template></template></template></div>
		<div v-if="requiredBy" class="required-by"><p><template v-if="requiredByFormat">{{ requiredByFormat.before }}<strong>{{ requiredByFormat.lead }}</strong>{{ requiredByFormat.middle }}{{ requiredBy.names.join( separator ) }}{{ requiredByFormat.after }}</template><template v-else>{{ requiredBy.text }}</template></p><div v-if="requiredBy.note" class="notice notice-warning inline"><p>{{ requiredBy.note }}</p></div></div>
		<div v-if="requires" class="requires"><p><template v-if="requiresFormat">{{ requiresFormat.before }}<strong>{{ requiresFormat.lead }}</strong>{{ requiresFormat.middle }}<template v-for="( name, index ) in requires.names" :key="index"><template v-if="index > 0">{{ separator }}</template><a v-if="requires.details?.[ index ]" :href="adminHref( detailsPath( requires.details[ index ] ) )" class="thickbox open-plugin-details-modal" :aria-label="moreAbout( name )" :data-title="name" @click="openDetails( requires.details[ index ], $event )">{{ name }}</a><template v-else>{{ name }}</template></template>{{ requiresFormat.after }}</template><template v-else>{{ requires.text }}</template></p><div v-if="deps.error" class="notice notice-error inline notice-alt"><p>{{ deps.error }}</p></div></div>
		<LegacyHtml v-if="typeof item.afterMetaHtml === 'string'" :html="item.afterMetaHtml" />
		<template v-if="item.paused"><p><span class="dashicons dashicons-warning"></span>{{ ' ' }}<strong>{{ item.paused.text }}</strong></p><div v-if="item.paused.error" class="error-display"><p><InlineMarkup :html="item.paused.error" /></p></div></template>
	`,
};

/**
 * Default export: the table. Props: `columns` (with `hidden` as Screen Options set it), `classes`,
 * `caption`, `items`, `selected` (v-model: the checked files), `selectAll` (whether the views have
 * bulk actions), `noItems`, and the page's state of each plugin, by file: `jobs` (`{ kind, phase }`
 * of a package job queued or running), `updates` (the update's step), `deleteErrors`, `deleted`
 * (`{ name }` of a plugin deleted in place) and `autoStates`.
 *
 * Emits `act( item, action )` (a core action), `actions-html( item, event )` (a click in filtered
 * row actions), `update( item )`, `details( slug, section )`, `toggle( item, action )` and
 * `filtered-toggle( item, action )`.
 */
export default {
	name: 'PluginsTable',
	components: { HeaderRow, Description, AutoUpdates, UpdateRow, InlineMarkup, LegacyHtml, Format },
	props: {
		columns: { type: Array, required: true },
		classes: { type: Array, default: () => [] },
		caption: { type: String, default: null },
		items: { type: Array, required: true },
		selected: { type: Array, default: () => [] },
		selectAll: { type: Boolean, default: true },
		noItems: { type: String, default: null },
		jobs: { type: Object, default: () => ( {} ) },
		updates: { type: Object, default: () => ( {} ) },
		deleteErrors: { type: Object, default: () => ( {} ) },
		deleted: { type: Object, default: () => ( {} ) },
		autoStates: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'update:selected', 'act', 'actions-html', 'update', 'details', 'toggle', 'filtered-toggle' ],
	setup( props, { emit } ) {
		const shownColumns = computed( () => list( props.columns ).filter( ( column ) => typeof column?.key === 'string' && column.key !== '' ) );
		const colspan = computed( () => columnCount( shownColumns.value ) );
		const canSelect = ( item ) => item.selectable === true && item.checkboxDisabled !== true && ! props.deleted[ item.file ];
		const keys = computed( () => list( props.items ).filter( canSelect ).map( ( item ) => item.file ) );
		const selection = useSelection( keys );
		const same = ( a, b ) => a.length === b.length && a.every( ( value, index ) => value === b[ index ] );

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

		const expanded = reactive( new Set() );
		const rowClasses = ( item ) => {
			const classes = list( item.classes ).filter( ( name ) => typeof name === 'string' );
			const job = props.jobs[ item.file ];
			const updated = props.updates[ item.file ]?.phase === 'updated';
			return [
				...( updated ? classes.filter( ( name ) => name !== 'update' ) : classes ),
				...( updated ? [ 'updated' ] : [] ),
				...( job ? [ 'is-enqueued' ] : [] ),
				...( expanded.has( item.file ) ? [ 'is-expanded' ] : [] ),
			];
		};
		const cellClass = ( column, base ) => [ ...base, ...( column.hidden ? [ 'hidden' ] : [] ) ];
		const actions = ( item ) => list( item.actions ).filter( ( action ) => action && typeof action.action === 'string' );
		const nameLines = ( item ) => text( item.name ).split( '\n' );
		const cellHtml = ( item, column ) => {
			const cell = item?.cells?.[ column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const hasUpdateRow = ( item ) => Boolean( item.update ) || Boolean( props.updates[ item.file ] ) || Boolean( props.deleteErrors[ item.file ] );
		const deleting = ( item ) => props.jobs[ item.file ]?.kind === 'delete' && props.jobs[ item.file ]?.phase === 'running';

		return {
			shownColumns, colspan, selection, canSelect, rowClasses, cellClass, actions, nameLines, cellHtml, hasUpdateRow, deleting,
			checkboxId, actionLinkClass, hasRequest,
			/* translators: %s: Plugin name. */
			deletedText: () => _x( '%s was successfully deleted.', 'plugin', 'default' ),
			isSelected: ( file ) => selection.selected.value.includes( file ),
			onRow: ( file, event ) => selection.toggle( file, event ),
			onAll: ( event ) => {
				selection.toggleAll( Boolean( event?.target?.checked ), event );
				nextTick( () => {
					if ( event?.target && typeof event.target === 'object' ) {
						event.target.checked = selection.headerChecked.value;
					}
				} );
			},
			toggleRow: ( file ) => ( expanded.has( file ) ? expanded.delete( file ) : expanded.add( file ) ),
			onAction: ( item, action, event ) => {
				event?.preventDefault?.();
				emit( 'act', item, action );
			},
			onActionsHtml: ( item, event ) => emit( 'actions-html', item, event ),
			onUpdate: ( item ) => emit( 'update', item ),
			onDetails: ( slug, section ) => emit( 'details', slug, section ),
			onToggle: ( item, action ) => emit( 'toggle', item, action ),
			onFiltered: ( item, action ) => emit( 'filtered-toggle', item, action ),
		};
	},
	template: `
		<table :class="[ 'wp-list-table', ...classes ]">
			<caption v-if="caption" class="screen-reader-text">{{ caption }}</caption>
			<thead>
				<HeaderRow :columns="shownColumns" :with-id="true" :counter="1" :select-all="selectAll" :all-selected="selection.headerChecked.value" @select-all="onAll" />
			</thead>
			<tbody id="the-list">
				<template v-if="items.length > 0">
					<template v-for="item in items" :key="item.file">
						<tr v-if="deleted[ item.file ]" class="plugin-deleted-tr inactive deleted" :id="item.id + '-deleted'" :data-slug="item.id" :data-plugin="item.file"><td :colspan="String( colspan )" class="plugin-update colspanchange"><Format :text="deletedText()"><template #arg1><strong>{{ deleted[ item.file ].name }}</strong></template></Format></td></tr>
						<template v-else>
							<tr :class="rowClasses( item )" :data-slug="item.id" :data-plugin="item.file">
								<template v-for="column in shownColumns" :key="column.key">
									<td v-if="column.key === 'cb'" class="check-column"><template v-if="item.selectable"><label class="label-covers-full-cell" :for="checkboxId( item.file )"><span class="screen-reader-text">{{ item.checkboxLabel ?? '' }}</span></label><input type="checkbox" name="checked[]" :value="item.file" :id="checkboxId( item.file )" :disabled="! canSelect( item )" :checked="isSelected( item.file )" @click="onRow( item.file, $event )" /></template></td>
									<th v-else-if="column.key === 'name'" scope="row" class="plugin-title column-primary" :aria-label="item.rowHeaderLabel ?? null"><strong><template v-for="( line, index ) in nameLines( item )" :key="index"><br v-if="index > 0" />{{ line }}</template></strong>
										<LegacyHtml v-if="typeof item.actionsHtml === 'string'" class="row-actions visible" :html="item.actionsHtml" @click="onActionsHtml( item, $event )" />
										<div v-else class="row-actions visible"><span v-for="( action, index ) in actions( item )" :key="action.action" :class="action.action"><a v-if="hasRequest( action )" href="#" :id="action.htmlId || null" :class="actionLinkClass( action )" :aria-label="action.ariaLabel || null" @click="onAction( item, action, $event )">{{ action.action === 'delete' && deleting( item ) ? $__( 'Deleting...', 'default' ) : action.text }}</a><template v-else-if="action.reason">{{ action.text }}<span class="screen-reader-text">{{ action.reason }}</span></template><span v-else-if="action.action === 'activate'">{{ action.text }}</span><template v-else>{{ action.text }}</template>{{ index < actions( item ).length - 1 ? ' | ' : '' }}</span></div>
										<!-- translators: Hidden accessibility text. -->
										<button type="button" class="toggle-row" @click="toggleRow( item.file )"><span class="screen-reader-text">{{ $__( 'Show more details', 'default' ) }}</span></button>
									</th>
									<td v-else-if="column.key === 'description'" :class="cellClass( column, [ 'column-description', 'desc' ] )"><Description :item="item" @details="onDetails" /></td>
									<td v-else-if="column.key === 'auto-updates' && item.autoUpdate" :class="cellClass( column, [ 'column-auto-updates' ] )"><AutoUpdates :item="item" :state="autoStates[ item.file ] ?? null" @toggle="onToggle" @filtered="onFiltered" /></td>
									<td v-else-if="column.key !== 'auto-updates'" :class="cellClass( column, [ column.key, 'column-' + column.key ] )"><LegacyHtml v-if="cellHtml( item, column )" :html="cellHtml( item, column )" /></td>
								</template>
							</tr>
							<tr v-if="item.incompatible" class="plugin-update-tr"><td :colspan="String( colspan )" class="plugin-update colspanchange"><div class="notice inline notice-error notice-alt update-message"><p><InlineMarkup :html="item.incompatible" /></p></div></td></tr>
							<tr v-if="typeof item.afterHtml === 'string'" class="wp-admin-plugin-after-rows"><td :colspan="String( colspan )" class="colspanchange"><table class="wp-admin-plugin-after-table"><LegacyHtml tag="tbody" :html="item.afterHtml" /></table></td></tr>
							<UpdateRow v-if="hasUpdateRow( item )" :item="item" :colspan="colspan" :state="updates[ item.file ] ?? null" :delete-error="deleteErrors[ item.file ] ?? null" @update="onUpdate" @details="onDetails" />
						</template>
					</template>
				</template>
				<tr v-else class="no-items"><td class="colspanchange" :colspan="String( colspan )"><InlineMarkup :html="noItems ?? ''" /></td></tr>
			</tbody>
			<tfoot>
				<HeaderRow :columns="shownColumns" :counter="2" :select-all="selectAll" :all-selected="selection.headerChecked.value" @select-all="onAll" />
			</tfoot>
		</table>
	`,
};
