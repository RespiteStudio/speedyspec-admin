// What wp_admin_get_terms_list() and the Terms routes answer, built for the terms list's component
// tests: rows with the row actions WordPress describes, the add form, the notes and the Quick
// Edit data, and the page mounted the way the router mounts it. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { column, settle };

/** The row actions of a term (handle_row_actions()), as wp_admin_terms_list_row() describes them. */
export const actionsOf = ( id, name = 'Term ' + id, { del = true, view = true } = {} ) => [
	{ action: 'edit', text: 'Edit', ariaLabel: 'Edit “' + name + '”', classes: [ 'edit' ], url: 'term.php?taxonomy=category&tag_ID=' + id + '&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory', request: null, newTab: false },
	{ action: 'inline', text: 'Quick Edit', ariaLabel: 'Quick edit “' + name + '” inline', classes: [ 'inline', 'hide-if-no-js' ], url: null, request: null, newTab: false },
	...( del ? [ { action: 'delete', text: 'Delete', ariaLabel: 'Delete “' + name + '”', classes: [ 'delete' ], url: null, request: { method: 'DELETE', path: 'terms/' + id }, newTab: false } ] : [] ),
	...( view ? [ { action: 'view', text: 'View', ariaLabel: 'View “' + name + '” archive', classes: [ 'view' ], url: 'http://localhost:8889/category/term-' + id + '/', request: null, newTab: true } ] : [] ),
];

/** A row of the list. `over` replaces any of its keys. */
export const row = ( id, { name = 'Term ' + id, level = 0, parent = 0, ...over } = {} ) => ( {
	id, level, classes: [ 'level-' + level ], selectable: true,
	checkboxLabel: 'Select ' + name, rowHeaderLabel: name,
	name: { html: '&#8212; '.repeat( level ) + ' ' + name, pad: level, editUrl: 'term.php?taxonomy=category&tag_ID=' + id + '&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory' },
	description: null,
	slug: 'term-' + id,
	count: { text: '0', url: 'edit.php?category_name=term-' + id },
	actions: actionsOf( id, name ),
	actionsHtml: null, coreActions: null,
	inline: { name, slug: 'term-' + id, parent },
	cells: {},
	...over,
} );

/** The parent dropdown (wp_admin_terms_parent_dropdown()): None, then each term, padded as printed. */
export const parentOf = ( terms ) => ( {
	options: [ { value: '-1', label: 'None', level: null }, ...terms.map( ( [ id, label, level = 0 ] ) => ( { value: String( id ), label: ' '.repeat( 3 * level ) + label, level } ) ) ],
	html: null,
	selected: null,
} );

export const ADD_FORM = {
	labels: {
		addNewItem: 'Add Category',
		nameDescription: 'The name is how it appears on your site.',
		slugDescription: 'The “slug” is the URL-friendly version of the name.',
		parentItem: 'Parent Category',
		parentDescription: 'Categories, unlike tags, can have a hierarchy.',
		descDescription: 'The description is not prominent by default; however, some themes may show it.',
	},
	parent: parentOf( [ [ 7, 'Term 7' ], [ 8, 'Term 8' ], [ 9, 'Term 9' ] ] ),
	hooks: { pre: null, fields: null, after: null },
};

export const pagination = ( total ) => ( { total, totalText: total + ( total === 1 ? ' item' : ' items' ), perPage: 20, page: 1, pages: total ? 1 : 0, pagesText: '1', links: { first: null, prev: null, next: null, last: null } } );

/** The page's data. `over` replaces any of its keys. */
export const termsData = ( over = {} ) => ( {
	query: { taxonomy: 'category' },
	taxonomy: { name: 'category', hierarchical: true, labels: { name: 'Categories', notFound: 'No categories found.', searchItems: 'Search Categories', addNewItem: 'Add Category', parentItem: 'Parent Category', updateItem: 'Update Category', backToItems: '← Go to Categories' } },
	error: null,
	title: 'Categories',
	heading: { title: 'Categories', search: null },
	headings: { pagination: 'Categories list navigation', list: 'Categories list' },
	formFields: [ { name: 'taxonomy', value: 'category' }, { name: 'post_type', value: 'post' } ],
	messages: [],
	menuCurrent: 'edit-tags.php?taxonomy=category',
	bodyClasses: [ 'edit-tags-php', 'taxonomy-category' ],
	columns: [ column( 'cb', '' ), column( 'name', 'Name', { primary: true } ), column( 'description', 'Description' ), column( 'slug', 'Slug' ), column( 'posts', 'Count', { num: true } ) ],
	caption: 'Table ordered hierarchically. Ascending.',
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'tags' ],
	views: [], viewsHtml: null,
	bulkActions: [ { value: 'delete', label: 'Delete' } ],
	search: { shown: true, value: '', label: 'Search Categories', inputId: 'tag-search-input', keep: [] },
	pagination: pagination( 3 ),
	screenOptions: null,
	items: [ row( 7 ), row( 8 ), row( 9 ) ],
	noItems: 'No categories found.',
	addForm: ADD_FORM,
	afterTableHtml: null,
	notes: { defaultCategory: null, converter: null },
	inlineEdit: { saveLabel: 'Update Category', customBoxes: [] },
	...over,
} );

/** A list answer (wp_admin_terms_list_answer()). */
export const answer = ( over = {} ) => ( {
	id: 0, row: null, parentRow: null, parentOptions: ADD_FORM.parent, pagination: pagination( 3 ), noItems: 'No categories found.', notice: null,
	...over,
} );

export const loadContracts = () => fillContracts( [ 'edit-tags', 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav', 'inline-edit' ] );

/** Mounts the terms list page (`core/edit-tags`) with `data`; `provide` adds to what it injects. */
export async function mountTerms( data = termsData(), provide = {} ) {
	const spoken = [];
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/edit-tags', data, page: { path: 'edit-tags.php?taxonomy=category', title: 'Categories' } } ) }, {
		provide: { frameChannel: null, speak: ( message, politeness ) => spoken.push( [ message, politeness ?? null ] ), ...provide },
	} );
	await settle();
	wrapper.spoken = spoken;
	return wrapper;
}

/** The ids of the rows shown, in order. */
export const rowIds = ( wrapper ) => wrapper.findAll( '#the-list > tr[id^="tag-"]' ).map( ( tr ) => Number( tr.attributes( 'id' ).slice( 4 ) ) );
