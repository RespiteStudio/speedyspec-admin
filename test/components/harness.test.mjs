/** @jest-environment jsdom */
// The component-test harness itself: one Vue shared by @vue/test-utils and the components,
// provide/inject and the template translation helpers through mountPart(), the contract table
// through fillContracts(), and the node:test shim's mock.method shape.
import { expect, test } from '@jest/globals';
import { defineComponent, inject } from 'vue';
import { mountPart, flushPromises } from '../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../helpers/contracts-table.mjs';
import nodeTest from '../helpers/node-test-shim.mjs';
import Contracted from '../../site/runtime/Contracted.js';

test( 'one Vue: test-utils mounts with the vendored build', async () => {
	const wrapper = mountPart( defineComponent( { template: '<p>Vue</p>' } ) );
	expect( wrapper.vm.$.appContext.app.version ).toBe( '3.5.45' );
	expect( ( await import( 'vue' ) ).version ).toBe( '3.5.45' );
} );

test( 'provide reaches the component', () => {
	const Title = defineComponent( {
		setup() {
			return { pageState: inject( 'pageState' ) };
		},
		template: '<h1>{{ pageState.title }}</h1>',
	} );
	const wrapper = mountPart( Title, { provide: { pageState: { title: 'General Settings' } } } );
	expect( wrapper.find( 'h1' ).text() ).toBe( 'General Settings' );
} );

test( 'template i18n is installed', () => {
	const wrapper = mountPart( defineComponent( { template: '<span>{{ $__( \'Settings\' ) }}</span>' } ) );
	expect( wrapper.find( 'span' ).text() ).toBe( 'Settings' );
} );

test( 'contracts resolve through the stub', async () => {
	await fillContracts( [ 'screen-options' ] );
	const wrapper = mountPart( Contracted, { props: { id: 'core/screen-options', sections: [] } } );
	await flushPromises();
	expect( wrapper.find( '#screen-options-wrap' ).exists() ).toBe( true );
} );

test( 'resetContracts empties the module table that fillContracts fills', async () => {
	await fillContracts( [ 'screen-options' ] );
	globalThis.__modules[ '/components/fixture.js' ] = new Error( 'fixture' );
	resetContracts();
	expect( globalThis.__modules ).toEqual( {} );
	await fillContracts( [ 'screen-options' ] );
	expect( Object.keys( globalThis.__modules ) ).toEqual( [ '/contracts/core/screen-options.js', '/components/core/screen-options.js' ] );
} );

test( 'mountPart passes extra global options: plugins, mocks, components and provide, with its own', () => {
	const seen = [];
	const Part = defineComponent( {
		setup() {
			return { pageState: inject( 'pageState' ), extra: inject( 'extra' ) };
		},
		template: '<div><fixture-child /><span class="i18n">{{ $__( \'Settings\' ) }}</span><i>{{ $route }}</i><u>{{ pageState }} {{ extra }}</u></div>',
	} );
	const wrapper = mountPart( Part, {
		provide: { pageState: 'page' },
		global: {
			plugins: [ { install: () => seen.push( 'plugin' ) } ],
			components: { FixtureChild: { template: '<b class="double">double</b>' } },
			mocks: { $route: 'mocked route' },
			provide: { extra: 'extra' },
		},
	} );
	expect( seen ).toEqual( [ 'plugin' ] );
	expect( wrapper.find( '.double' ).exists() ).toBe( true );
	expect( wrapper.find( 'i' ).text() ).toBe( 'mocked route' );
	expect( wrapper.find( '.i18n' ).text() ).toBe( 'Settings' );
	expect( wrapper.find( 'u' ).text() ).toBe( 'page extra' );
} );

// A node:test-style test run through the shim, as the migrated files run theirs.
nodeTest( 'the shim\'s mock.method matches node\'s shape', ( t ) => {
	const target = { greet: ( name ) => 'hello ' + name };
	const greet = t.mock.method( target, 'greet', ( name ) => 'hi ' + name );
	expect( target.greet( 'Ada' ) ).toBe( 'hi Ada' );
	expect( greet.mock.callCount() ).toBe( 1 );
	expect( greet.mock.calls[ 0 ].arguments ).toEqual( [ 'Ada' ] );
} );
