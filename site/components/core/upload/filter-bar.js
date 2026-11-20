import LegacyHtml from '../../../kit/LegacyHtml.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The Media list's filter bar, WP_Media_List_Table::views(): the view switch (view_switcher(),
 * with its hidden `mode` field), the type filter (`#attachment-filter`, get_views()'s options),
 * the bar's extra_tablenav( 'bar' ) (the months, what plugins print on `restrict_manage_posts`,
 * Filter and Empty Trash), the plugins' filter links (`views_upload`) and the search box. Which of
 * them show, their choices, their values and the view switch's addresses are data WordPress
 * computed (`filterBar`). Every control is a field of the list form (`#posts-filter`), as
 * classic: Filter and Search Media submit the form.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The mode the view switch's hidden field sends: the current mode's, else `list`. Pure. */
export function currentMode( filterBar ) {
	return list( filterBar?.modes ).find( ( mode ) => mode?.current === true )?.mode ?? 'list';
}

/** The plugins' filter links (`{ [class]: html }`), in order, or none. Pure. */
export function filterLinks( filterBar ) {
	const links = filterBar?.filterLinksHtml;
	if ( ! links || typeof links !== 'object' || Array.isArray( links ) ) {
		return [];
	}
	return Object.entries( links ).filter( ( [ , html ] ) => typeof html === 'string' ).map( ( [ key, html ] ) => ( { key, html } ) );
}

/**
 * Props: `filterBar` (the page data's). Emits `empty-trash` when Empty Trash is used; Filter and
 * Search Media are the form's own submit buttons.
 */
export default {
	name: 'UploadFilterBar',
	components: { LegacyHtml },
	props: {
		filterBar: { type: Object, required: true },
	},
	emits: [ 'empty-trash' ],
	setup( props ) {
		return {
			list,
			mode: () => currentMode( props.filterBar ),
			links: () => filterLinks( props.filterBar ),
			href: ( path ) => adminHref( path ),
			search: () => ( props.filterBar.search && typeof props.filterBar.search === 'object' ? props.filterBar.search : null ),
		};
	},
	template: `
		<div class="wp-filter">
			<div class="filter-items">
				<input type="hidden" name="mode" :value="mode()" />
				<div class="view-switch"><a v-for="choice in list( filterBar.modes )" :key="choice.mode" :href="href( choice.path )" :class="[ 'view-' + choice.mode, { current: choice.current === true } ]" :id="'view-switch-' + choice.mode" :aria-current="choice.current === true ? 'page' : null"><span class="screen-reader-text">{{ choice.label }}</span></a></div>

				<!-- translators: Hidden accessibility text. -->
				<label for="attachment-filter" class="screen-reader-text">{{ $__( 'Filter by type', 'default' ) }}</label>
				<select class="attachment-filters" name="attachment-filter" id="attachment-filter"><option v-for="option in list( filterBar.types?.options )" :key="option.key" :value="option.value" :selected="String( filterBar.types?.value ?? '' ) === String( option.value )">{{ option.label }}</option></select>

				<div class="actions">
					<template v-if="filterBar.months">
						<label for="filter-by-date" class="screen-reader-text">{{ filterBar.months.label }}</label>
						<select name="m" id="filter-by-date"><option value="0" :selected="String( filterBar.months.value ) === '0'">{{ $__( 'All dates', 'default' ) }}</option><option v-for="month in list( filterBar.months.options )" :key="month.value" :value="month.value" :selected="String( filterBar.months.value ) === String( month.value )">{{ month.label }}</option></select>
					</template>
					<LegacyHtml v-if="filterBar.restrictHtml?.html" tag="span" :html="filterBar.restrictHtml.html" />
					<input type="submit" name="filter_action" id="post-query-submit" class="button button-compact" :value="$__( 'Filter', 'default' )" />
					<input v-if="filterBar.emptyTrash" type="submit" name="delete_all" id="delete_all" class="button apply button-compact" :value="filterBar.emptyTrash.label" @click.prevent="$emit( 'empty-trash' )" />
				</div>

				<ul v-if="links().length" class="filter-links"><li v-for="link in links()" :key="link.key" :class="link.key"><LegacyHtml tag="span" :html="link.html" /></li></ul>
			</div>

			<div v-if="search()" class="search-form">
				<p class="search-box">
					<label class="screen-reader-text" :for="search().inputId">{{ search().label }}</label>
					<input type="search" :id="search().inputId" class="search" name="s" :value="search().value ?? ''" />
					<input id="search-submit" type="submit" class="button button-compact" :value="search().label" />
				</p>
			</div>
		</div>
	`,
};
