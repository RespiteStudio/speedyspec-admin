/** @jest-environment jsdom */
// The views plugins filtered (`views_edit-{type}`, `viewsHtml`): each view is the plugin's HTML as
// printed, so its link keeps its address, text and classes; they replace the core views as the
// filter's result does in WP_List_Table::views(), keep their order, and are separated by " |".
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { settle } from '../edit-posts/data.mjs';

beforeEach( async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'list-table-views' ] );
} );
afterEach( () => {
	resetContracts();
	// Set by the plugin view script test; removed even when that test fails.
	delete window.__detachedFixtureView;
} );

const CORE = [
	{ key: 'all', url: 'edit.php?post_type=book', label: 'All', format: 'All %s', count: 3, current: true },
	{ key: 'publish', url: 'edit.php?post_status=publish&post_type=book', label: 'Published', format: 'Published %s', count: 2, current: false },
];
const FIXTURE = '<a href="edit.php?post_type=book&detached_fixture_view=1">Fixture view</a>';

async function views( props ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/list-table-views', views: CORE, ...props } ) } );
	await settle();
	return wrapper;
}
const keys = ( wrapper ) => wrapper.findAll( 'ul.subsubsub > li' ).map( ( li ) => li.element.classList[ 0 ] );

test( 'a view that a plugin added keeps its link, its text and its address', async () => {
	const wrapper = await views( { viewsHtml: { all: '<a href="edit.php" class="current" aria-current="page">All <span class="count">(3)</span></a>', fixture: FIXTURE } } );
	const link = wrapper.find( 'li.fixture a' );
	expect( link.text() ).toBe( 'Fixture view' );
	expect( link.attributes( 'href' ) ).toBe( 'edit.php?post_type=book&detached_fixture_view=1' );
	expect( wrapper.find( 'li.all a' ).attributes( 'aria-current' ) ).toBe( 'page' );
	expect( wrapper.find( 'li.all a .count' ).text() ).toBe( '(3)' );
} );

test( 'the filtered views replace the core views and keep the order the plugin returned; each li has its key as its class', async () => {
	const wrapper = await views( { viewsHtml: { fixture: FIXTURE, all: '<a href="edit.php">All</a>' } } );
	expect( keys( wrapper ) ).toEqual( [ 'fixture', 'all' ] );
	expect( wrapper.find( 'li.publish' ).exists() ).toBe( false );
} );

test( 'views are separated by " |" and the last has none', async () => {
	const wrapper = await views( { viewsHtml: { all: '<a href="edit.php">All</a>', fixture: FIXTURE } } );
	const [ first, last ] = wrapper.findAll( 'ul.subsubsub > li' );
	expect( first.element.textContent.endsWith( ' |' ) ).toBe( true );
	expect( last.element.textContent ).toBe( 'Fixture view' );
} );

test( 'a list of views, as the API may send it, is the same as the map', async () => {
	const wrapper = await views( { viewsHtml: [ { key: 'all', html: '<a href="edit.php">All</a>' }, { key: 'fixture', html: FIXTURE } ] } );
	expect( keys( wrapper ) ).toEqual( [ 'all', 'fixture' ] );
	expect( wrapper.find( 'li.fixture a' ).attributes( 'href' ) ).toBe( 'edit.php?post_type=book&detached_fixture_view=1' );
} );

test( 'entries that are not a key with HTML are left out', async () => {
	const wrapper = await views( { viewsHtml: [ { key: 'fixture', html: FIXTURE }, { key: 7, html: '<a>No</a>' }, { key: 'bad', html: null } ] } );
	expect( keys( wrapper ) ).toEqual( [ 'fixture' ] );
} );

test( 'without viewsHtml the core views show, with the current one marked', async () => {
	const wrapper = await views( { viewsHtml: null } );
	expect( keys( wrapper ) ).toEqual( [ 'all', 'publish' ] );
	expect( wrapper.find( 'li.all a' ).attributes( 'aria-current' ) ).toBe( 'page' );
	expect( wrapper.find( 'li.fixture' ).exists() ).toBe( false );
} );

test( 'a plugin\'s view script runs as it does on the classic screen, and the view stays', async () => {
	window.__detachedFixtureView = 0;
	const wrapper = await views( { viewsHtml: { fixture: FIXTURE + '<script>window.__detachedFixtureView += 1;</script>' } } );
	await settle();
	expect( window.__detachedFixtureView ).toBe( 1 );
	expect( wrapper.find( 'li.fixture a' ).text() ).toBe( 'Fixture view' );
} );
