/** @jest-environment jsdom */
// The PHP update nag (core/dashboard-php-nag). Classic prints no Dismiss for it: the box is hidden from Screen Options.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { BOX, dashboardData, mountDashboard, mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const DATA = {
	message: 'insecure',
	phpVersion: '7.4.33',
	recommendedVersion: '8.3',
	updateUrl: 'https://wordpress.org/support/update-php/',
	defaultUpdateUrl: 'https://wordpress.org/support/update-php/',
	directUpdateUrl: null,
};

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const nag = async ( data = DATA ) => ( await mountWidget( 'php-nag', data ) ).wrapper;

test( 'each message names the server\'s PHP version', async () => {
	const texts = {
		'insecure-future': 'which does not receive security updates and soon will not be supported by WordPress.',
		insecure: 'which does not receive security updates. It should be updated.',
		future: 'which soon will not be supported by WordPress.',
		outdated: 'which should be updated.',
	};
	for ( const [ message, text ] of Object.entries( texts ) ) {
		const wrapper = await nag( { ...DATA, message } );
		const shown = wrapper.find( 'p.bigger-bolder-text' ).text();
		expect( [ message, shown.includes( '(7.4.33)' ), shown.includes( text ) ] ).toEqual( [ message, true, true ] );
	}
} );

test( 'the recommended version, the update link and the host\'s annotation come from the data', async () => {
	const wrapper = await nag();
	expect( wrapper.text() ).toContain( 'The minimum recommended version of PHP is 8.3.' );
	const learn = wrapper.find( 'p.button-container a' );
	expect( learn.attributes( 'href' ) ).toBe( DATA.updateUrl );
	expect( learn.attributes( 'target' ) ).toBe( '_blank' );
	expect( learn.text() ).toContain( 'Learn more about updating PHP' );
	expect( wrapper.find( 'p.description a' ).attributes( 'href' ) ).toBe( DATA.defaultUpdateUrl );
	expect( wrapper.findAll( 'a.button' ) ).toHaveLength( 1 );

	const direct = await nag( { ...DATA, directUpdateUrl: 'https://host.example/update-php', defaultUpdateUrl: null, recommendedVersion: null } );
	expect( direct.text() ).not.toContain( 'minimum recommended version' );
	expect( direct.find( 'p.description' ).exists() ).toBe( false );
	expect( direct.findAll( 'a.button' ).map( ( link ) => link.attributes( 'href' ) ) ).toEqual( [ DATA.updateUrl, 'https://host.example/update-php' ] );
} );

test( 'a message the page does not know shows nothing', async () => {
	const wrapper = await nag( { ...DATA, message: null } );
	expect( wrapper.text() ).toBe( '' );
} );

test( 'the widget has no Dismiss, and hiding the box posts the complete list of hidden boxes', async () => {
	const data = dashboardData( {
		boxes: [ BOX( 'dashboard_php_nag', 'PHP Update Required', { warning: true } ), BOX( 'dashboard_activity', 'Activity' ) ],
		widgets: { dashboard_php_nag: DATA, dashboard_activity: { future: [], published: [], onThisDay: [], empty: true } },
		screenOptions: { sections: [ { id: 'metabox-prefs', legend: 'Screen elements', description: '', items: [ { id: 'dashboard_php_nag', label: 'PHP Update Required', checked: true } ] } ], reordering: true, columns: null },
	} );
	const { wrapper, screenOptions } = await mountDashboard( data, { names: [ 'php-nag', 'activity' ] } );
	expect( wrapper.find( '#dashboard_php_nag a.dismiss' ).exists() ).toBe( false );

	// Hiding it is the box's Screen Options checkbox, which the holder gave the frame.
	screenOptions.onChange( 'dashboard_php_nag', false );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/dashboard', payload: { closed: [], hidden: [ 'dashboard_php_nag' ] } } ] );
	expect( wrapper.find( '#dashboard_php_nag' ).classes() ).toContain( 'hide-if-js' );
	screenOptions.onChange( 'dashboard_php_nag', true );
	await settle();
	expect( api.calls.at( -1 ).payload ).toEqual( { closed: [], hidden: [] } );
} );
