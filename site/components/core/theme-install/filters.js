import { computed } from 'vue';

/*
 * The feature filter drawer of Add Themes, as theme-install.php prints `.filter-drawer`: Apply
 * Filters and Clear above and below the feature groups (`fieldset.filter-group`, a legend, then a
 * checkbox `#filter-id-<feature>` and its label per feature), then `.filtered-by` (Filtering by:,
 * the applied features' names and Edit Filters). The feature list is WordPress's
 * (get_theme_feature_list()).
 *
 * As theme.js's filtersChecked(): Apply Filters counts the checked features and Clear shows only
 * while one is checked. Whether the drawer and the applied filters show is the body's
 * `show-filters` and `filters-applied` (the page's), as core's CSS reads them.
 *
 * Props: `features` (`{ group, features: [ { value, label } ] }`), `checked` (the values checked),
 * `applied` (the names under Filtering by) and `labels`. Emits `toggle( value, on )`, `apply`,
 * `clear` and `edit`.
 */
export default {
	name: 'ThemeInstallFilters',
	props: {
		features: { type: Array, default: () => [] },
		checked: { type: Array, default: () => [] },
		applied: { type: Array, default: () => [] },
		labels: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'toggle', 'apply', 'clear', 'edit' ],
	setup( props, { emit } ) {
		const groups = computed( () => props.features
			.filter( ( group ) => typeof group?.group === 'string' && Array.isArray( group.features ) )
			.map( ( group ) => ( { group: group.group, features: group.features.filter( ( item ) => typeof item?.value === 'string' && typeof item.label === 'string' ) } ) ) );
		const count = computed( () => ( props.checked.length > 0 ? String( props.checked.length ) : '' ) );

		function run( name, event ) {
			event?.preventDefault?.();
			emit( name );
		}

		return {
			groups, count, run,
			isChecked: ( value ) => props.checked.includes( value ),
			onChange: ( value, event ) => emit( 'toggle', value, event?.target?.checked === true ),
		};
	},
	template: `
		<div class="filter-drawer">
			<div class="buttons">
				<button type="button" class="apply-filters button" @click="run( 'apply', $event )">{{ labels.applyFilters }}<span>{{ count }}</span></button>
				<button type="button" class="clear-filters button" :aria-label="labels.clearFilters" :style="{ display: count ? 'inline-block' : 'none' }" @click="run( 'clear', $event )">{{ labels.clear }}</button>
			</div>
			<fieldset v-for="group in groups" :key="group.group" class="filter-group">
				<legend>{{ group.group }}</legend>
				<div class="filter-group-feature">
					<template v-for="feature in group.features" :key="feature.value">
						<input type="checkbox" :id="'filter-id-' + feature.value" :value="feature.value" :checked="isChecked( feature.value )" @change="onChange( feature.value, $event )" />{{ ' ' }}<label :for="'filter-id-' + feature.value">{{ feature.label }}</label>
					</template>
				</div>
			</fieldset>
			<div class="buttons">
				<button type="button" class="apply-filters button" @click="run( 'apply', $event )">{{ labels.applyFilters }}<span>{{ count }}</span></button>
				<button type="button" class="clear-filters button" :aria-label="labels.clearFilters" :style="{ display: count ? 'inline-block' : 'none' }" @click="run( 'clear', $event )">{{ labels.clear }}</button>
			</div>
			<div class="filtered-by">
				<span>{{ labels.filteringBy }}</span>
				<div class="tags"><span v-for="name in applied" :key="name" class="tag">{{ name }}</span></div>
				<button type="button" class="button-link edit-filters" @click="run( 'edit', $event )">{{ labels.editFilters }}</button>
			</div>
		</div>
	`,
};
