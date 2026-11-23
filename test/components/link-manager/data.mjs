// What wp_admin_get_links_list() and the Links routes answer (wp-includes/admin/links-page.php),
// built for the Links list's component tests, and the page mounted the way the router mounts it.
// A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { column, settle };

const CONFIRM = ( name ) => 'You are about to delete this link \'' + name + '\'\n  \'Cancel\' to stop, \'OK\' to delete.';

/** A row of the list (wp_admin_links_list_row()). `over` replaces any of its keys. */
export const row = ( id, { name = 'Link ' + id, ...over } = {} ) => ( {
	id,
	selectable: true,
	checkboxLabel: 'Select ' + name,
	rowHeaderLabel: name,
	name: { text: name, editUrl: 'link.php?action=edit&link_id=' + id },
	url: { href: 'https://example.org/' + id, text: 'example.org/' + id },
	categories: [ { name: 'Blogroll', url: 'link-manager.php?cat_id=2' } ],
	rel: '',
	visible: 'Yes',
	rating: 0,
	actions: [
		{ action: 'edit', text: 'Edit', classes: [], url: 'link.php?action=edit&link_id=' + id, request: null, confirm: null },
		{ action: 'delete', text: 'Delete', classes: [ 'submitdelete' ], url: null, request: { method: 'DELETE', path: 'links/' + id }, confirm: CONFIRM( name ) },
	],
	cells: {},
	...over,
} );

export const sortable = ( orderby, url ) => ( { orderby, initialDesc: false, abbr: '', description: '', url } );

/** The page's data. `over` replaces any of its keys. */
export const linksData = ( over = {} ) => ( {
	query: {},
	error: null,
	title: 'Links',
	heading: { title: 'Links', addNew: { label: 'Add Link', path: 'link-add.php' }, search: null },
	headings: { list: 'Links list' },
	messages: [],
	filter: { label: null, options: [ { value: '0', label: 'All Link Categories', level: null }, { value: '2', label: 'Blogroll', level: 0 }, { value: '3', label: 'Friends', level: 0 } ], value: '0', html: null },
	columns: [
		column( 'cb', '' ),
		column( 'name', 'Name', { primary: true, sortable: sortable( 'name', 'link-manager.php?orderby=name&order=asc' ) } ),
		column( 'url', 'URL', { sortable: sortable( 'url', 'link-manager.php?orderby=url&order=asc' ) } ),
		column( 'categories', 'Categories' ),
		column( 'rel', 'Relationship' ),
		column( 'visible', 'Visible', { sortable: sortable( 'visible', 'link-manager.php?orderby=visible&order=asc' ) } ),
		column( 'rating', 'Rating', { sortable: sortable( 'rating', 'link-manager.php?orderby=rating&order=asc' ) } ),
	],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'bookmarks' ],
	bulkActions: [ { value: 'delete', label: 'Delete' } ],
	search: { shown: true, value: '', label: 'Search Links', inputId: 'link-search-input', keep: [] },
	screenOptions: null,
	items: [ row( 7 ), row( 8 ), row( 9 ) ],
	noItems: 'No links found.',
	bodyClasses: [ 'link-manager-php' ],
	...over,
} );

export const loadContracts = () => fillContracts( [ 'link-manager', 'list-table', 'list-table-search', 'list-table-nav' ] );

/** A host that records what the page gives it: notices, speech and the router's targets. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/link-manager.php', search: '' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], refreshed: 0 };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message ) => record.spoken.push( message ),
		router: {
			navigate: async ( url ) => record.navigated.push( url ),
			follow: async ( answer ) => record.followed.push( answer ),
			refresh: async () => {
				record.refreshed++;
			},
		},
		frameChannel: null,
		pageLocation: location,
	};
	return record;
}

/** Mounts the Links list page (`core/link-manager`) with `data`; `provide` adds to what it injects. */
export async function mountLinks( data = linksData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/link-manager', data, page: { path: 'link-manager.php', title: 'Links' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The ids of the rows shown, in order. */
export const rowIds = ( wrapper ) => wrapper.findAll( '#the-list > tr[id^="link-"]' ).map( ( tr ) => Number( tr.attributes( 'id' ).slice( 5 ) ) );
