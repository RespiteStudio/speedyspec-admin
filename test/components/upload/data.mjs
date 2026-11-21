// Fixtures and the mount helper of the Media list's component tests: the data
// wp_admin_get_media_list() gives for the list mode, and the page mounted through the real
// contracts with test doubles for the router, the clipboard and the confirmation.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { settle };

export const FILE = ( id ) => 'http://localhost:8891/wp-content/uploads/2026/11/file-' + id + '.jpg';
export const ACTION = ( action, text, ariaLabel, extra = {} ) => ( { action, text, ariaLabel, classes: [ action ], request: null, url: null, newTab: false, confirm: false, ...extra } );

// Edit, Delete Permanently, View, Copy URL, Download file, and Attach where the row is unattached.
const ACTIONS = ( id, attach ) => [
	ACTION( 'edit', 'Edit', `Edit “File ${ id }”`, { url: 'post.php?post=' + id + '&action=edit' } ),
	ACTION( 'delete', 'Delete Permanently', `Delete “File ${ id }” permanently`, { request: { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/delete', body: [] } } ),
	ACTION( 'view', 'View', `View “File ${ id }”`, { url: 'http://localhost:8891/file-' + id + '/', newTab: true } ),
	ACTION( 'copy', 'Copy URL', `Copy “File ${ id }” URL to clipboard` ),
	ACTION( 'download', 'Download file', `Download “File ${ id }”`, { url: FILE( id ) } ),
	...( attach ? [ ACTION( 'attach', 'Attach', `Attach “File ${ id }” to existing content` ) ] : [] ),
];

/** A row of the list; `attach` makes it unattached with Attach offered. */
export const ROW = ( id, { attach = false, author = { name: 'admin', url: 'upload.php?author=1' } } = {} ) => ( {
	id, classes: [ 'author-self', 'status-inherit' ], selectable: true, checkboxLabel: 'Select File ' + id, rowHeaderLabel: 'File ' + id,
	title: { html: 'File ' + id, editUrl: 'post.php?post=' + id + '&action=edit', thumbHtml: null, thumb: null, iconClass: 'image-icon', filename: 'file-' + id + '.jpg' },
	states: [],
	author,
	terms: [],
	bubble: null,
	parent: attach ? { unattached: true, attach: true, attachAriaLabel: `Attach “File ${ id }” to existing content` } : { unattached: true, attach: false, attachAriaLabel: null },
	date: { text: '2026/11/01', timeHtml: null },
	actions: ACTIONS( id, attach ),
	copyUrl: FILE( id ),
	download: FILE( id ),
	actionsHtml: null,
	actionsVisible: false,
	cells: [],
} );

export const TYPES = [
	{ key: 'all', value: '', label: 'All media items' },
	{ key: 'image', value: 'post_mime_type:image', label: 'Images' },
	{ key: 'detached', value: 'detached', label: 'Unattached' },
	{ key: 'mine', value: 'mine', label: 'Mine' },
];

export const FILTER_BAR = ( extra = {} ) => ( {
	modes: [ { mode: 'list', label: 'List view', path: 'upload.php?mode=list', current: true }, { mode: 'grid', label: 'Grid view', path: 'upload.php?mode=grid', current: false } ],
	types: { options: TYPES, value: '' },
	months: { label: 'Filter by date', options: [ { value: '202611', label: 'November 2026' } ], value: '0' },
	restrictHtml: null,
	emptyTrash: null,
	search: { label: 'Search Media', inputId: 'media-search-input', value: '' },
	filterLinksHtml: null,
	...extra,
} );

export const DATA = ( { items = [ ROW( 7 ), ROW( 8 ) ], filterBar = FILTER_BAR(), query = { mode: 'list' } } = {} ) => ( {
	query,
	error: null,
	title: 'Media Library',
	headings: { views: 'Filter media items list', pagination: 'Media items list navigation', list: 'Media items list' },
	heading: { title: 'Media Library', addNew: { label: 'Add Media File', path: 'media-new.php' }, search: null },
	messages: [],
	filterBar,
	columns: [ column( 'cb', '' ), column( 'title', 'File', { primary: true } ), column( 'author', 'Author' ), column( 'parent', 'Uploaded to' ), column( 'date', 'Date' ) ],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'media' ],
	bulkActions: [ { value: 'attach', label: 'Attach' }, { value: 'delete', label: 'Delete permanently' } ],
	pagination: { total: items.length, totalText: items.length + ' items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	items,
	noItems: 'No media files found.',
	screenOptions: null,
	confirmDelete: true,
} );

/** The rows Find Posts lists, as wp_admin_find_posts() gives them. */
export const FOUND = { rows: [ { id: 31, title: 'Parent one', type: 'Post', date: '2026/11/01', status: 'Published' }, { id: 32, title: 'Parent two', type: 'Page', date: '2026/11/02', status: 'Draft' } ] };

/**
 * Mounts core/upload. `seen` records what the page asked of its host: the addresses it navigated
 * to (`navigated`), the confirmations (`asked`) and the addresses it followed (`followed`).
 */
export async function mountMedia( data = DATA(), { confirm = true } = {} ) {
	const seen = { navigated: [], asked: [], followed: [] };
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'upload', 'list-table', 'list-table-nav' ] );
	const provide = {
		router: {
			navigate: async ( target ) => {
				seen.navigated.push( target );
				return true;
			},
			follow: async ( target ) => {
				seen.followed.push( target );
				return true;
			},
			refresh: async () => {},
		},
		speak: () => {},
		notices: { add: () => 'n1' },
		screenOptions: { set: () => () => {} },
		frameChannel: { setTitle: () => {} },
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/upload.php', search: '?mode=list' },
		confirm: ( message ) => {
			seen.asked.push( message );
			return confirm;
		},
		clipboard: { writeText: async () => {} },
		copyTimers: { setTimeout: () => 0, clearTimeout: () => {} },
	};
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/upload', data, page: { path: 'upload.php?mode=list', title: 'Media Library' } } ) }, { provide } );
	await settle();
	return { wrapper, seen };
}
