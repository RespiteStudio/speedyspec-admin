/** @jest-environment jsdom */
// The component-test harness itself: one Vue shared by @vue/test-utils and the components,
// provide/inject and the template translation helpers through mountPart(), the contract table
// through fillContracts(), and the node:test shim's mock.method shape.
import { expect, test } from '@jest/globals';
import { defineComponent, inject } from 'vue';
import { mountPart, flushPromises } from '../helpers/mount.mjs';
import { fillContracts } from '../helpers/contracts-table.mjs';
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

// A node:test-style test run through the shim, as the migrated files run theirs.
nodeTest( 'the shim\'s mock.method matches node\'s shape', ( t ) => {
	const target = { greet: ( name ) => 'hello ' + name };
	const greet = t.mock.method( target, 'greet', ( name ) => 'hi ' + name );
	expect( target.greet( 'Ada' ) ).toBe( 'hi Ada' );
	expect( greet.mock.callCount() ).toBe( 1 );
	expect( greet.mock.calls[ 0 ].arguments ).toEqual( [ 'Ada' ] );
} );
