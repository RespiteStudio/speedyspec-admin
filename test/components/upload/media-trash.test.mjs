/** @jest-environment jsdom */
// The Media Library list with the Media Trash on (`MEDIA_TRASH`; the throwaway e2e project drives
// the same page). The fixtures are what wp_admin_get_media_list() gives with the constant set: a
// Trash row action and a "Move to Trash" bulk action outside the Trash; Restore and Delete
// Permanently in it; and `confirmDelete` false everywhere. The page shows and runs what the data
// gives, and asks only where `confirmDelete` says so.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

const REQUEST = ( id, action ) => ( { method: 'POST', route: 'wp-admin/v1/posts/' + id + '/' + action, body: [] } );
const FILE = ( id ) => 'http://localhost:8891/wp-content/uploads/2026/11/file-' + id + '.jpg';
const ACTION = ( action, text, ariaLabel, extra = {} ) => ( { action, text, ariaLabel, classes: [ action ], request: null, url: null, newTab: false, confirm: false, ...extra } );
// Outside the Trash: Edit, Trash, View, Copy URL, Download file.
const LIST_ACTIONS = ( id ) => [
	ACTION( 'edit', 'Edit', `Edit “File ${ id }”`, { url: 'post.php?post=' + id + '&action=edit' } ),
	ACTION( 'trash', 'Trash', `Move “File ${ id }” to the Trash`, { request: REQUEST( id, 'trash' ) } ),
	ACTION( 'view', 'View', `View “File ${ id }”`, { url: 'http://localhost:8891/file-' + id + '/', newTab: true } ),
	ACTION( 'copy', 'Copy URL', `Copy “File ${ id }” URL to clipboard` ),
	ACTION( 'download', 'Download file', `Download “File ${ id }”`, { url: FILE( id ) } ),
];
// In the Trash: Restore, Delete Permanently, Download file.
const TRASH_ACTIONS = ( id ) => [
	ACTION( 'untrash', 'Restore', `Restore “File ${ id }” from the Trash`, { request: REQUEST( id, 'untrash' ) } ),
	ACTION( 'delete', 'Delete Permanently', `Delete “File ${ id }” permanently`, { request: REQUEST( id, 'delete' ) } ),
	ACTION( 'download', 'Download file', `Download “File ${ id }”`, { url: FILE( id ) } ),
];
const ROW = ( id, actions ) => ( {
	id, classes: [ 'author-self', 'status-inherit' ], selectable: true, checkboxLabel: 'Select File ' + id, rowHeaderLabel: 'File ' + id,
	title: { html: 'File ' + id, editUrl: 'post.php?post=' + id + '&action=edit', thumbHtml: null, thumb: null, iconClass: 'image-icon', filename: 'file-' + id + '.jpg' },
	states: [],
	author: { name: 'admin', url: 'upload.php?author=1' },
	terms: [],
	bubble: null,
	parent: { unattached: true, attach: false, attachAriaLabel: null },
	date: { text: '2026/11/01', timeHtml: null },
	actions,
	copyUrl: FILE( id ),
	download: FILE( id ),
	actionsHtml: null,
	actionsVisible: false,
	cells: [],
} );
const TYPES = [ { key: 'all', value: '', label: 'All media items' }, { key: 'image', value: 'post_mime_type:image', label: 'Images' }, { key: 'detached', value: 'detached', label: 'Unattached' }, { key: 'mine', value: 'mine', label: 'Mine' }, { key: 'trash', value: 'trash', label: 'Trash' } ];
const DATA = ( trash ) => ( {
	query: trash ? { mode: 'list', 'attachment-filter': 'trash' } : { mode: 'list' },
	error: null,
	title: 'Media Library',
	headings: { views: 'Filter media items list', pagination: 'Media items list navigation', list: 'Media items list' },
	heading: { title: 'Media Library', addNew: { label: 'Add Media File', path: 'media-new.php' }, search: null },
	messages: [],
	filterBar: {
		modes: [ { mode: 'list', label: 'List view', path: 'upload.php?mode=list', current: true }, { mode: 'grid', label: 'Grid view', path: 'upload.php?mode=grid', current: false } ],
		types: { options: TYPES, value: trash ? 'trash' : '' },
		months: trash ? null : { label: 'Filter by date', options: [], value: '0' },
		restrictHtml: null,
		emptyTrash: null,
		search: { label: 'Search Media', inputId: 'media-search-input', value: '' },
		filterLinksHtml: null,
	},
	columns: [ column( 'cb', '' ), column( 'title', 'File', { primary: true } ), column( 'date', 'Date' ) ],
	caption: null,
	classes: [ 'widefat', 'fixed', 'striped', 'table-view-list', 'media' ],
	bulkActions: trash ? [ { value: 'untrash', label: 'Restore' }, { value: 'delete', label: 'Delete permanently' } ] : [ { value: 'trash', label: 'Move to Trash' } ],
	pagination: { total: 2, totalText: '2 items', perPage: 20, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	items: [ 7, 8 ].map( ( id ) => ROW( id, trash ? TRASH_ACTIONS( id ) : LIST_ACTIONS( id ) ) ),
	noItems: 'No media files found.',
	screenOptions: null,
	confirmDelete: false,
} );

let asked;
let followed;
const provide = () => ( {
	router: { navigate: async () => true, follow: async ( target ) => {
		followed.push( target );
		return true;
	}, refresh: async () => {} },
	speak: () => {},
	notices: { add: () => 'n1' },
	screenOptions: { set: () => () => {} },
	frameChannel: { setTitle: () => {} },
	formEntries: () => [],
	pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/upload.php', search: '?mode=list' },
	confirm: ( message ) => {
		asked.push( message );
		return true;
	},
	clipboard: { writeText: async () => {} },
	copyTimers: { setTimeout: () => 0, clearTimeout: () => {} },
} );

beforeEach( async () => {
	asked = [];
	followed = [];
	api.reset();
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&trashed=1&ids=7', location: null } ) );
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'upload', 'list-table', 'list-table-nav' ] );
} );

afterEach( () => resetContracts() );

async function mediaPage( trash = false ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/upload', data: DATA( trash ), page: { path: 'upload.php?mode=list', title: 'Media Library' } } ) }, { provide: provide() } );
	await settle();
	expect( wrapper.find( '#post-7' ).exists() ).toBe( true );
	return wrapper;
}

const action = ( wrapper, id, name ) => wrapper.find( `#post-${ id } .row-actions .${ name } a, #post-${ id } .row-actions .${ name } button` );
const bulkOptions = ( wrapper ) => wrapper.findAll( '#bulk-action-selector-top option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] );

test( 'the row offers Trash, not Delete Permanently, and Trash posts its route without asking', async () => {
	const wrapper = await mediaPage();
	expect( action( wrapper, 7, 'delete' ).exists() ).toBe( false );
	const trash = action( wrapper, 7, 'trash' );
	expect( trash.text() ).toBe( 'Trash' );
	expect( trash.attributes( 'aria-label' ) ).toBe( 'Move “File 7” to the Trash' );
	await trash.trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [] );
	expect( api.calls.map( ( call ) => [ call.method, call.route ] ) ).toEqual( [ [ 'POST', 'wp-admin/v1/posts/7/trash' ] ] );
	expect( api.calls[ 0 ].payload ).toEqual( { referer: 'upload.php?mode=list' } );
} );

test( 'the bulk actions list Move to Trash, and the type filter offers the Trash', async () => {
	const wrapper = await mediaPage();
	expect( bulkOptions( wrapper ) ).toEqual( [ [ '-1', 'Bulk actions' ], [ 'trash', 'Move to Trash' ] ] );
	expect( wrapper.find( '#attachment-filter option[value="trash"]' ).exists() ).toBe( true );
} );

test( 'the bulk Move to Trash posts media/bulk with the checked rows and asks nothing', async () => {
	const wrapper = await mediaPage();
	wrapper.find( '#post-7 input[type="checkbox"]' ).element.click();
	wrapper.find( '#post-8 input[type="checkbox"]' ).element.click();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'trash' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [] );
	expect( api.calls ).toHaveLength( 1 );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/media/bulk' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { action: 'trash', ids: [ 7, 8 ] } );
} );

test( 'in the Trash, with confirmDelete false, Delete Permanently asks nothing; Restore is offered row and bulk', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&attachment-filter=trash&deleted=1', location: null } ) );
	const wrapper = await mediaPage( true );
	expect( bulkOptions( wrapper ) ).toEqual( [ [ '-1', 'Bulk actions' ], [ 'untrash', 'Restore' ], [ 'delete', 'Delete permanently' ] ] );
	expect( action( wrapper, 7, 'untrash' ).text() ).toBe( 'Restore' );
	await action( wrapper, 7, 'delete' ).trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [] );
	expect( api.calls.map( ( call ) => call.route ) ).toEqual( [ 'wp-admin/v1/posts/7/delete' ] );
} );

test( 'in the Trash, the bulk Restore posts media/bulk untrash with the checked rows', async () => {
	api.respondWith( async () => ( { redirect: 'upload.php?mode=list&attachment-filter=trash&untrashed=2', location: null } ) );
	const wrapper = await mediaPage( true );
	wrapper.find( '#post-7 input[type="checkbox"]' ).element.click();
	wrapper.find( '#post-8 input[type="checkbox"]' ).element.click();
	await wrapper.find( '#bulk-action-selector-top' ).setValue( 'untrash' );
	await wrapper.find( '#doaction' ).trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [] );
	expect( api.calls[ 0 ].route ).toBe( 'wp-admin/v1/media/bulk' );
	expect( api.calls[ 0 ].payload ).toMatchObject( { action: 'untrash', ids: [ 7, 8 ] } );
} );
