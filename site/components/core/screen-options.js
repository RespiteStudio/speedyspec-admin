import { computed, nextTick, ref, watch } from 'vue';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';

/** The layout's choices as WordPress sends them: `{ value, label }`, a positive count and its label. */
const columnChoices = ( columns ) => ( Array.isArray( columns?.choices ) ? columns.choices : [] )
	.filter( ( choice ) => Number.isInteger( choice?.value ) && choice.value > 0 && typeof choice.label === 'string' && choice.label !== '' );

/**
 * Default implementation of core/screen-options: the classic screen's Screen Options panel
 * (`#screen-options-wrap` with `#adv-settings`, a `fieldset.metabox-prefs` per section,
 * `fieldset.columns-prefs` for the layout and the "Additional settings" fieldset with the
 * reordering checkbox) and its "Screen Options" toggle (`#show-settings-link`), so that
 * WordPress's admin styles apply. The panel sits in `.wp-admin-screen-options__panel`, styled
 * as the classic `#screen-meta` (which the Help panel, core/help-tabs, owns).
 *
 * The toggle is a button with `aria-expanded` that opens the panel and moves focus to it, as the
 * classic screen does. Each checkbox has the classic id (`{id}-hide`, `meta-box-reordering`) and
 * reports its change at once, as the classic checkboxes do.
 *
 * A list table's options (1.1.0) follow: the "Columns" fieldset (`hide-column-tog` checkboxes,
 * reported at once as common.js's columns.checked() / unchecked() save them), "Pagination" (the
 * items per page) and "View mode", then what `screen_settings` callbacks add (kit/LegacyHtml), and
 * the Apply button when there is pagination or a view mode, as WP_Screen::render_screen_options()
 * prints them. Apply submits nothing: it emits `apply` with the items per page and the mode.
 * The Columns fieldset's legend is `tableColumnsLegend` (1.2.0), the columns' `_title` or
 * "Columns" as WordPress sends it.
 */
export default {
	name: 'ScreenOptions',
	components: { SlotOutlet, LegacyHtml },
	props: {
		sections: { type: Array, required: true },
		reordering: { type: Boolean, default: null },
		columns: { type: Object, default: null },
		tableColumns: { type: Array, default: () => [] },
		pagination: { type: Object, default: null },
		viewMode: { type: Object, default: null },
		settingsHtml: { type: String, default: null },
		// 1.2.0: the Columns fieldset's legend, as WordPress sends it.
		tableColumnsLegend: { type: String, default: null },
	},
	emits: [ 'change', 'toggle', 'apply' ],
	setup( props, { emit } ) {
		const open = ref( false );
		const wrap = ref( null );
		const choices = computed( () => columnChoices( props.columns ) );
		const shownSections = computed( () => props.sections.filter( ( section ) => section && typeof section === 'object' && Array.isArray( section.items ) ) );

		function toggle() {
			open.value = ! open.value;
			emit( 'toggle', open.value );
			if ( open.value ) {
				nextTick( () => wrap.value?.focus?.() );
			}
		}

		const onItem = ( item, event ) => emit( 'change', item.id, Boolean( event?.target?.checked ) );
		const onReordering = ( event ) => emit( 'change', 'meta-box-reordering', Boolean( event?.target?.checked ) );
		const onColumns = ( count ) => emit( 'change', 'screen_columns', count );

		// The list table's options.
		const shownColumns = computed( () => ( Array.isArray( props.tableColumns ) ? props.tableColumns : [] ).filter( ( column ) => typeof column?.key === 'string' && column.key !== '' ) );
		const modeChoices = computed( () => ( Array.isArray( props.viewMode?.choices ) ? props.viewMode.choices : [] ).filter( ( choice ) => typeof choice?.value === 'string' && choice.value !== '' ) );
		const perPage = ref( '' );
		const mode = ref( null );
		watch( () => props.pagination, ( pagination ) => {
			perPage.value = pagination ? String( pagination.value ?? '' ) : '';
		}, { immediate: true } );
		watch( () => props.viewMode, ( viewMode ) => {
			mode.value = typeof viewMode?.value === 'string' ? viewMode.value : null;
		}, { immediate: true } );
		const applyShown = computed( () => Boolean( props.pagination ) || modeChoices.value.length > 0 );
		const onColumn = ( column, event ) => emit( 'change', 'hide-column', { key: column.key, hidden: ! event?.target?.checked } );
		const onPerPage = ( event ) => {
			perPage.value = String( event?.target?.value ?? '' );
		};
		const onMode = ( value, event ) => {
			if ( event?.target?.checked !== false ) {
				mode.value = value;
			}
		};
		function apply() {
			if ( ! applyShown.value ) {
				return;
			}
			const typed = Number( perPage.value );
			emit( 'apply', {
				perPage: props.pagination && perPage.value.trim() !== '' && Number.isInteger( typed ) ? typed : null,
				mode: modeChoices.value.length > 0 ? mode.value : null,
			} );
		}

		return { open, wrap, choices, shownSections, toggle, onItem, onReordering, onColumns, shownColumns, modeChoices, perPage, mode, applyShown, onColumn, onPerPage, onMode, apply };
	},
	template: `
		<div class="wp-admin-screen-options">
			<div class="wp-admin-screen-options__panel metabox-prefs" :hidden="! open">
				<div id="screen-options-wrap" ref="wrap" tabindex="-1" :aria-label="$__( 'Screen Options Tab', 'default' )">
					<form id="adv-settings" method="post" @submit.prevent="apply">
						<SlotOutlet name="before" :context="{ sections }" />
						<fieldset v-for="section in shownSections" :key="section.id" class="metabox-prefs" :data-section="section.id">
							<legend>{{ section.legend }}</legend>
							<p v-if="section.description">{{ section.description }}</p>
							<div class="metabox-prefs-container">
								<label v-for="item in section.items" :key="item.id" :for="item.id + '-hide'"><input class="hide-postbox-tog" :name="item.id + '-hide'" type="checkbox" :id="item.id + '-hide'" :value="item.id" :checked="item.checked" @change="onItem( item, $event )" />{{ item.label }}</label>
							</div>
						</fieldset>
						<fieldset v-if="shownColumns.length > 0" class="metabox-prefs">
							<legend>{{ tableColumnsLegend || $__( 'Columns', 'default' ) }}</legend>
							<label v-for="column in shownColumns" :key="column.key"><input class="hide-column-tog" :name="column.key + '-hide'" type="checkbox" :id="column.key + '-hide'" :value="column.key" :checked="! column.hidden" @change="onColumn( column, $event )" />{{ column.label }}</label>
						</fieldset>
						<fieldset v-if="choices.length > 0" class="columns-prefs">
							<legend class="screen-layout">{{ $__( 'Layout', 'default' ) }}</legend>
							<label v-for="choice in choices" :key="choice.value" :class="'columns-prefs-' + choice.value">
								<input type="radio" name="screen_columns" :value="String( choice.value )" :checked="columns.value === choice.value" @change="onColumns( choice.value )" />
								{{ choice.label }}
							</label>
						</fieldset>
						<fieldset v-if="reordering !== null" class="metabox-prefs additional-settings-prefs">
							<legend>{{ $__( 'Additional settings', 'default' ) }}</legend>
							<input class="meta-box-reordering-toggle" name="meta-box-reordering" type="checkbox" id="meta-box-reordering" value="enabled" :checked="reordering" @change="onReordering" /><label for="meta-box-reordering">{{ $__( 'Allow screen elements to be rearranged', 'default' ) }}</label>
						</fieldset>
						<fieldset v-if="pagination" class="screen-options">
							<legend>{{ $__( 'Pagination', 'default' ) }}</legend>
							<template v-if="pagination.label">
								<label :for="pagination.option">{{ pagination.label }}</label>
								<input type="number" step="1" :min="String( pagination.min ?? 1 )" :max="String( pagination.max ?? 999 )" class="screen-per-page small-text" name="wp_screen_options[value]" :id="pagination.option" :value="perPage" @input="onPerPage" />
							</template>
							<input type="hidden" name="wp_screen_options[option]" :value="pagination.option" />
						</fieldset>
						<fieldset v-if="modeChoices.length > 0" class="metabox-prefs view-mode">
							<legend>{{ $__( 'View mode', 'default' ) }}</legend>
							<label v-for="choice in modeChoices" :key="choice.value" :for="choice.value + '-view-mode'">
								<input :id="choice.value + '-view-mode'" type="radio" name="mode" :value="choice.value" :checked="mode === choice.value" @change="onMode( choice.value, $event )" />
								{{ choice.label }}
							</label>
						</fieldset>
						<LegacyHtml v-if="settingsHtml" :html="settingsHtml" />
						<p v-if="applyShown" class="submit"><input type="submit" name="screen-options-apply" id="screen-options-apply" class="button button-primary" :value="$__( 'Apply', 'default' )" /></p>
						<SlotOutlet name="after" :context="{ sections }" />
					</form>
				</div>
			</div>
			<div class="wp-admin-screen-options__links">
				<div id="screen-options-link-wrap" class="screen-meta-toggle">
					<button type="button" id="show-settings-link" :class="[ 'button', 'button-compact', 'show-settings', { 'screen-meta-active': open } ]" aria-controls="screen-options-wrap" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ $__( 'Screen Options', 'default' ) }}</button>
				</div>
			</div>
		</div>
	`,
};
