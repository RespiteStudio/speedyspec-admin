import LegacyHtml from '../../../kit/LegacyHtml.js';

/*
 * The filters above the Posts list (WP_Posts_List_Table::extra_tablenav( 'top' )): the months
 * (months_dropdown()), the categories (categories_dropdown(), wp_dropdown_categories()), the
 * formats (formats_dropdown()), what plugins print on `restrict_manage_posts`, then the Filter
 * button when any of them printed something. Which of them show, their choices and their values
 * are data WordPress computed (`filters`); the category dropdown plugins filtered is its HTML.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The categories of a tree in the order wp_dropdown_categories() lists them, each with its level. Pure. */
export function flatTree( tree, level = 0 ) {
	return list( tree ).flatMap( ( node ) => [ { id: node.id, name: String( node.name ?? '' ), level }, ...flatTree( node.children, level + 1 ) ] );
}

/** The text of a category option, padded as wp_dropdown_categories() pads it. Pure. */
export const categoryOption = ( node ) => ' '.repeat( 3 * node.level ) + node.name;

/**
 * Props: `filters` (the page data's), `submit` (the Filter button was clicked). Every control
 * is a field of the list form (`#posts-filter`), as classic: Filter sends the form.
 */
export default {
	name: 'EditPostsFilters',
	components: { LegacyHtml },
	props: {
		filters: { type: Object, required: true },
	},
	emits: [ 'submit' ],
	setup: () => ( { flatTree, categoryOption, list } ),
	template: `
		<template v-if="filters.months">
			<label for="filter-by-date" class="screen-reader-text">{{ filters.months.label }}</label>
			<select name="m" id="filter-by-date"><option value="0" :selected="String( filters.months.value ) === '0'">{{ $__( 'All dates', 'default' ) }}</option><option v-for="month in list( filters.months.options )" :key="month.value" :value="month.value" :selected="String( filters.months.value ) === String( month.value )">{{ month.label }}</option></select>
		</template>
		<LegacyHtml v-if="typeof filters.categoriesHtml === 'string'" tag="span" :html="filters.categoriesHtml" />
		<template v-else-if="filters.categories">
			<label class="screen-reader-text" for="cat">{{ filters.categories.label }}</label>
			<select name="cat" id="cat" class="postform"><option value="0" :selected="String( filters.categories.value ) === '0'">{{ filters.categories.allLabel }}</option><option v-for="node in flatTree( filters.categories.tree )" :key="node.id" :class="'level-' + node.level" :value="String( node.id )" :selected="String( filters.categories.value ) === String( node.id )">{{ categoryOption( node ) }}</option></select>
		</template>
		<template v-if="filters.formats">
			<!-- translators: Hidden accessibility text. -->
			<label for="filter-by-format" class="screen-reader-text">{{ $__( 'Filter by post format', 'default' ) }}</label>
			<select name="post_format" id="filter-by-format"><option value="" :selected="! filters.formats.value">{{ $__( 'All formats', 'default' ) }}</option><option v-for="format in list( filters.formats.options )" :key="format.value" :value="format.value" :selected="filters.formats.value === format.value">{{ format.label }}</option></select>
		</template>
		<LegacyHtml v-if="filters.restrictHtml?.html" tag="span" :html="filters.restrictHtml.html" />
		<template v-if="filters.filterButton">{{ ' ' }}<input type="submit" name="filter_action" id="post-query-submit" class="button" :value="$__( 'Filter', 'default' )" @click.prevent="$emit( 'submit' )" /></template>
	`,
};
