/** @jest-environment jsdom */
// The feature filter of Add Themes (theme-install.php's .filter-drawer, theme.js's Installer view):
// Feature Filter opens the drawer and leaves `theme-install.php`; the groups and their features;
// a checked feature counts on Apply Filters and shows Clear; Apply Filters reads with the tags and
// shows them under Filtering by; Edit Filters reopens; Clear empties; nothing checked asks for a
// feature.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { directory, host, installData, loadContracts, mountInstall, reads, settle } from './data.mjs';

const bodyClass = document.body.className;
const body = () => [ 'show-filters', 'filters-applied' ].filter( ( name ) => document.body.classList.contains( name ) );

beforeEach( async () => {
	api.reset();
	api.respondWith( async () => directory() );
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

async function check( wrapper, ...values ) {
	for ( const value of values ) {
		const box = wrapper.find( '#filter-id-' + value );
		box.element.checked = true;
		await box.trigger( 'change' );
	}
}

test( 'Feature Filter opens the drawer (aria-expanded) and leaves theme-install.php; again closes it', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	const toggle = wrapper.find( 'button.drawer-toggle' );
	await toggle.trigger( 'click' );
	expect( [ body(), toggle.attributes( 'aria-expanded' ), record.addressed ] ).toEqual( [ [ 'show-filters' ], 'true', [ [ '/wp-admin/theme-install.php', { replace: false } ] ] ] );
	await toggle.trigger( 'click' );
	expect( [ body(), toggle.attributes( 'aria-expanded' ) ] ).toEqual( [ [], 'false' ] );
} );

test( 'the groups and their features, as get_theme_feature_list() gives them', async () => {
	const wrapper = await mountInstall();
	const groups = wrapper.findAll( '.filter-drawer fieldset.filter-group' );
	expect( groups.map( ( group ) => [ group.find( 'legend' ).text(), group.findAll( '.filter-group-feature input[type="checkbox"]' ).map( ( input ) => [ input.attributes( 'id' ), input.element.value, wrapper.find( `label[for="${ input.attributes( 'id' ) }"]` ).text() ] ) ] ) ).toEqual( [
		[ 'Layout', [ [ 'filter-id-grid-layout', 'grid-layout', 'Grid Layout' ], [ 'filter-id-one-column', 'one-column', 'One Column' ] ] ],
		[ 'Features', [ [ 'filter-id-custom-colors', 'custom-colors', 'Custom Colors' ], [ 'filter-id-blog', 'blog', 'Blog' ] ] ],
	] );
} );

test( 'a checked feature counts on Apply Filters and shows Clear', async () => {
	const wrapper = await mountInstall();
	await check( wrapper, 'blog', 'grid-layout' );
	const apply = wrapper.findAll( '.filter-drawer .apply-filters' );
	expect( [ apply.map( ( found ) => found.find( 'span' ).text() ), wrapper.findAll( '.filter-drawer .clear-filters' ).map( ( found ) => found.element.style.display ) ] ).toEqual( [ [ '2', '2' ], [ 'inline-block', 'inline-block' ] ] );
} );

test( 'Apply Filters reads with the tags, shows them under Filtering by, and no tab is current', async () => {
	const wrapper = await mountInstall();
	await wrapper.find( 'button.drawer-toggle' ).trigger( 'click' );
	await check( wrapper, 'grid-layout', 'blog' );
	await wrapper.find( '.filter-drawer .apply-filters' ).trigger( 'click' );
	await settle();
	expect( reads( api.calls ).at( -1 ) ).toEqual( { tag: 'grid-layout,blog' } );
	expect( wrapper.findAll( '.filtered-by .tags span.tag' ).map( ( found ) => found.text() ) ).toEqual( [ 'Grid Layout', 'Blog' ] );
	expect( [ body(), wrapper.findAll( '.filter-links a.current' ).length ] ).toEqual( [ [ 'show-filters', 'filters-applied' ], 0 ] );
} );

test( 'Edit Filters reopens the features; Feature Filter does too while filters are applied', async () => {
	const wrapper = await mountInstall();
	await wrapper.find( 'button.drawer-toggle' ).trigger( 'click' );
	await check( wrapper, 'blog' );
	await wrapper.find( '.filter-drawer .apply-filters' ).trigger( 'click' );
	await settle();
	await wrapper.find( '.filtered-by button.edit-filters' ).trigger( 'click' );
	expect( body() ).toEqual( [ 'show-filters' ] );
	await wrapper.find( '.filter-drawer .apply-filters' ).trigger( 'click' );
	await settle();
	await wrapper.find( 'button.drawer-toggle' ).trigger( 'click' );
	expect( body() ).toEqual( [ 'show-filters' ] );
} );

test( 'Clear empties the checked features, the count and Clear itself', async () => {
	const wrapper = await mountInstall();
	await check( wrapper, 'blog' );
	await wrapper.find( '.filter-drawer .clear-filters' ).trigger( 'click' );
	expect( [ wrapper.find( '#filter-id-blog' ).element.checked, wrapper.find( '.filter-drawer .apply-filters span' ).text(), wrapper.find( '.filter-drawer .clear-filters' ).element.style.display ] ).toEqual( [ false, '', 'none' ] );
} );

test( 'Apply Filters with nothing checked asks for a feature and reads nothing', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await wrapper.find( '.filter-drawer .apply-filters' ).trigger( 'click' );
	await settle();
	expect( [ reads( api.calls ).length, record.spoken.at( -1 ), body() ] ).toEqual( [ 1, 'Select one or more Theme features to filter by', [] ] );
} );

test( 'a tab closes the drawer and the applied filters', async () => {
	const wrapper = await mountInstall();
	await wrapper.find( 'button.drawer-toggle' ).trigger( 'click' );
	await check( wrapper, 'blog' );
	await wrapper.find( '.filter-drawer .apply-filters' ).trigger( 'click' );
	await settle();
	await wrapper.find( '.filter-links a[data-sort="new"]' ).trigger( 'click' );
	await settle();
	expect( [ body(), wrapper.find( 'button.drawer-toggle' ).attributes( 'aria-expanded' ) ] ).toEqual( [ [], 'false' ] );
} );
