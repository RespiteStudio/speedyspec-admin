/** @jest-environment jsdom */
// What `screen_settings` callbacks add to Screen Options (`settingsHtml`): the plugin's HTML as
// printed, after the core fields (Columns, Pagination, View mode) and before Apply, kept when the
// core fields change, and not part of what Apply sends (the recorded gap).
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { mountPart } from '../../helpers/mount.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { settle } from '../edit-posts/data.mjs';

beforeEach( async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'screen-options' ] );
} );
afterEach( () => resetContracts() );

const SETTINGS = '<fieldset class="detached-fixture-screen-settings"><legend>Fixture settings</legend><label><input type="checkbox" name="fixture_setting" value="1"> A setting</label></fieldset>';
const LIST = {
	sections: [],
	tableColumns: [ { key: 'author', label: 'Author', hidden: false }, { key: 'date', label: 'Date', hidden: false } ],
	tableColumnsLegend: 'Columns',
	pagination: { option: 'edit_post_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 },
	viewMode: { value: 'list', choices: [ { value: 'list', label: 'Compact view' }, { value: 'excerpt', label: 'Extended view' } ] },
};

async function options( props = {}, listeners = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/screen-options', ...LIST, ...props, ...listeners } ) } );
	await settle();
	return wrapper;
}
// The direct children of the form that make up the panel, as a short list.
const order = ( wrapper ) => [ ...wrapper.find( '#adv-settings' ).element.children ].map( ( child ) => {
	if ( child.tagName === 'FIELDSET' ) {
		return 'fieldset:' + child.querySelector( 'legend' ).textContent;
	}
	return child.classList.contains( 'wp-admin-legacy-html' ) ? 'plugin' : child.className;
} );

test( 'the plugin\'s HTML follows Columns, Pagination and View mode, and comes before Apply', async () => {
	const wrapper = await options( { settingsHtml: SETTINGS } );
	expect( order( wrapper ) ).toEqual( [ 'fieldset:Columns', 'fieldset:Pagination', 'fieldset:View mode', 'plugin', 'submit' ] );
} );

test( 'the plugin\'s fieldset is its HTML as printed, with its controls', async () => {
	const wrapper = await options( { settingsHtml: SETTINGS } );
	const plugin = wrapper.find( '.wp-admin-legacy-html' );
	expect( plugin.element.innerHTML ).toBe( SETTINGS );
	expect( plugin.find( 'legend' ).text() ).toBe( 'Fixture settings' );
	expect( plugin.find( 'input[name="fixture_setting"]' ).exists() ).toBe( true );
} );

test( 'without settingsHtml (none, or empty) the panel has no plugin area', async () => {
	for ( const settingsHtml of [ null, '' ] ) {
		const wrapper = await options( { settingsHtml } );
		expect( wrapper.find( '.wp-admin-legacy-html' ).exists() ).toBe( false );
		expect( order( wrapper ) ).toEqual( [ 'fieldset:Columns', 'fieldset:Pagination', 'fieldset:View mode', 'submit' ] );
	}
} );

test( 'the plugin\'s HTML shows when the screen has only it and the Columns, and Apply stays out when there is no Pagination or View mode', async () => {
	const wrapper = await options( { settingsHtml: SETTINGS, pagination: null, viewMode: null } );
	expect( order( wrapper ) ).toEqual( [ 'fieldset:Columns', 'plugin' ] );
	expect( wrapper.find( '#screen-options-apply' ).exists() ).toBe( false );
} );

test( 'a core column change is emitted at once with the plugin\'s fieldset present', async () => {
	const changes = [];
	const wrapper = await options( { settingsHtml: SETTINGS, onChange: ( id, value ) => changes.push( [ id, value ] ) } );
	await wrapper.find( '#author-hide' ).setValue( false );
	expect( changes ).toEqual( [ [ 'hide-column', { key: 'author', hidden: true } ] ] );
	expect( wrapper.find( '.detached-fixture-screen-settings' ).exists() ).toBe( true );
} );

test( 'Apply sends the per page value and the mode, and not the plugin\'s fields (the recorded gap)', async () => {
	const applied = [];
	const wrapper = await options( { settingsHtml: SETTINGS, onApply: ( value ) => applied.push( value ) } );
	await wrapper.find( 'input[name="fixture_setting"]' ).setValue( true );
	await wrapper.find( '#edit_post_per_page' ).setValue( '7' );
	await wrapper.find( '#excerpt-view-mode' ).setValue( true );
	await wrapper.find( '#adv-settings' ).trigger( 'submit' );
	expect( applied ).toEqual( [ { perPage: 7, mode: 'excerpt' } ] );
} );

test( 'a new settingsHtml replaces the plugin\'s area; what was typed in the core fields is kept', async () => {
	const wrapper = await options( { settingsHtml: SETTINGS } );
	await wrapper.find( '#edit_post_per_page' ).setValue( '9' );
	await wrapper.setProps( { settingsHtml: '<fieldset class="acme-settings"><legend>Acme</legend></fieldset>' } );
	await settle();
	expect( wrapper.find( '.detached-fixture-screen-settings' ).exists() ).toBe( false );
	expect( wrapper.find( '.acme-settings legend' ).text() ).toBe( 'Acme' );
	expect( wrapper.find( '#edit_post_per_page' ).element.value ).toBe( '9' );
} );
