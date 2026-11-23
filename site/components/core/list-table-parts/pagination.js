import { inject, ref, watch } from 'vue';
import Format from '../dashboard-parts/format.js';
import { adminHref } from '../dashboard-parts/links.js';

/**
 * The list's path for page `page`: a link of the pagination (each is the list's path with or
 * without `paged`) with `paged` set, its other arguments kept as they are written (never decoded).
 * A page that is not a positive whole number is page 1, as get_pagenum() reads it. Pure.
 *
 * @param {{first: ?string, prev: ?string, next: ?string, last: ?string}} links The pagination's links.
 * @param {number|string} page The page asked for.
 * @return {string|null} The path, or null when there is no link to build it from.
 */
export function pagedPath( links, page ) {
	const base = [ links?.first, links?.prev, links?.next, links?.last ].find( ( link ) => typeof link === 'string' && link !== '' );
	if ( ! base ) {
		return null;
	}
	const number = Number( String( page ).trim() );
	const paged = Number.isInteger( number ) && number > 0 ? number : 1;
	const [ beforeHash, hash = null ] = base.split( '#', 2 );
	const [ file, query = '' ] = beforeHash.split( '?', 2 );
	const args = query.split( '&' ).filter( ( arg ) => arg !== '' && arg.split( '=', 1 )[ 0 ] !== 'paged' );
	args.push( 'paged=' + paged );
	return file + '?' + args.join( '&' ) + ( hash === null ? '' : '#' + hash );
}

/**
 * WP_List_Table::pagination()'s markup (`div.tablenav-pages`): the number of items, the first,
 * previous, next and last links (disabled where WordPress gives no link), and the current page,
 * a field above the table (`current-page-selector`, which opens the page typed on Enter, as the
 * classic form's GET submit does) and text below it. The links are admin paths, opened by the
 * router as any admin link. Part of core/list-table-nav.
 */
export default {
	name: 'ListTablePagination',
	components: { Format },
	props: {
		pagination: { type: Object, required: true },
		which: { type: String, default: 'top' },
	},
	setup( props ) {
		const router = inject( 'router', null );
		const typed = ref( '' );
		watch( () => props.pagination?.page, ( page ) => {
			typed.value = String( page ?? '' );
		}, { immediate: true } );
		const links = () => props.pagination?.links ?? {};
		const href = ( path ) => adminHref( path );
		function open( event ) {
			if ( event?.key !== 'Enter' || event.isComposing ) {
				return;
			}
			event.preventDefault?.();
			const path = pagedPath( links(), typed.value );
			if ( path === null ) {
				return;
			}
			const url = href( path );
			if ( router?.navigate ) {
				router.navigate( url );
			} else {
				globalThis.location?.assign?.( url );
			}
		}
		const pageClass = () => {
			const pages = Number( props.pagination?.pages ?? 0 );
			return pages ? ( pages < 2 ? 'one-page' : '' ) : 'no-pages';
		};
		return { typed, links, href, open, pageClass, onTyped: ( event ) => {
			typed.value = String( event?.target?.value ?? '' );
		} };
	},
	template: `
		<div v-if="! pagination.total" class="tablenav-pages no-pages"><span class="displaying-num">{{ pagination.totalText }}</span></div>
		<div v-else :class="[ 'tablenav-pages', pageClass() ]"><span class="displaying-num">{{ pagination.totalText }}</span>
			<span class="pagination-links">
				<a v-if="links().first" class="first-page button" :href="href( links().first )"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'First page', 'default' ) }}</span><span aria-hidden="true">{{ '«' }}</span></a>
				<span v-else class="tablenav-pages-navspan button disabled" aria-hidden="true">{{ '«' }}</span>
				<a v-if="links().prev" class="prev-page button" :href="href( links().prev )"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Previous page', 'default' ) }}</span><span aria-hidden="true">{{ '‹' }}</span></a>
				<span v-else class="tablenav-pages-navspan button disabled" aria-hidden="true">{{ '‹' }}</span>
				<span v-if="which === 'top'" class="paging-input"><!-- translators: Hidden accessibility text. --><label for="current-page-selector" class="screen-reader-text">{{ $__( 'Current Page', 'default' ) }}</label><input class="current-page" id="current-page-selector" type="text" name="paged" :value="typed" :size="String( String( pagination.pages ).length )" aria-describedby="table-paging" @input="onTyped" @keydown="open" /><span class="tablenav-paging-text"><!-- translators: 1: Current page, 2: Total pages. --><Format :text="$_x( '%1$s of %2$s', 'paging', 'default' )"><template #arg1></template><template #arg2><span class="total-pages">{{ pagination.pagesText }}</span></template></Format></span></span>
				<template v-else><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Current Page', 'default' ) }}</span><span id="table-paging" class="paging-input"><span class="tablenav-paging-text"><!-- translators: 1: Current page, 2: Total pages. --><Format :text="$_x( '%1$s of %2$s', 'paging', 'default' )"><template #arg1>{{ pagination.page }}</template><template #arg2><span class="total-pages">{{ pagination.pagesText }}</span></template></Format></span></span></template>
				<a v-if="links().next" class="next-page button" :href="href( links().next )"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Next page', 'default' ) }}</span><span aria-hidden="true">{{ '›' }}</span></a>
				<span v-else class="tablenav-pages-navspan button disabled" aria-hidden="true">{{ '›' }}</span>
				<a v-if="links().last" class="last-page button" :href="href( links().last )"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Last page', 'default' ) }}</span><span aria-hidden="true">{{ '»' }}</span></a>
				<span v-else class="tablenav-pages-navspan button disabled" aria-hidden="true">{{ '»' }}</span>
			</span>
		</div>
	`,
};
