/** @jest-environment jsdom */
// The Help panel of General Settings: the Overview tab and the sidebar from the page's own help, and the tabs the
// router adds, which switch with the arrow keys, Home and End, wrapping at both ends.
import { expect, test } from '@jest/globals';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { help } from '../../../site/components/core/options-general/help.js';

const ROUTER = { tabs: [ { id: 'fixture-help', title: 'Fixture Help', content: '<p>Help from a plugin.</p>', priority: 10 } ], sidebar: null };

function open( page = { data: { multisite: false } }, router = ROUTER ) {
	const { tabs, sidebar } = mergeHelp( help, router, page );
	return mountPart( HelpTabs, { props: { tabs, sidebar }, provide: { framePage: { value: page } } } );
}

const tabs = ( wrapper ) => wrapper.findAll( '[role="tab"]' );
const selected = ( wrapper ) => tabs( wrapper ).filter( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' ).map( ( tab ) => tab.text() );

test( 'the tabs are the Overview and the router\'s, the first selected, and the sidebar links to the documentation', () => {
	const wrapper = open();
	expect( tabs( wrapper ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview', 'Fixture Help' ] );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.find( '#tab-panel-overview' ).text() ).toContain( 'The fields on this screen determine some of the basics of your site setup.' );
	expect( wrapper.find( '.contextual-help-sidebar a[href="https://wordpress.org/documentation/article/settings-general-screen/"]' ).text() ).toBe( 'Documentation on General Settings' );
} );

test( 'the arrow keys, Home and End move the selection and the focus, wrapping at both ends', async () => {
	const wrapper = open();
	const press = async ( key ) => {
		const current = tabs( wrapper ).findIndex( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' );
		await tabs( wrapper )[ current ].trigger( 'keydown', { key } );
		await flushPromises();
	};

	await press( 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Fixture Help' ] );
	expect( document.activeElement ).toBe( tabs( wrapper )[ 1 ].element );
	expect( wrapper.find( '#tab-panel-fixture-help' ).attributes( 'hidden' ) ).toBeUndefined();
	expect( wrapper.find( '#tab-panel-overview' ).attributes( 'hidden' ) ).toBeDefined();
	expect( wrapper.find( '#tab-panel-fixture-help' ).text() ).toBe( 'Help from a plugin.' );

	await press( 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	await press( 'ArrowUp' );
	expect( selected( wrapper ) ).toEqual( [ 'Fixture Help' ] );
	await press( 'Home' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	await press( 'End' );
	expect( selected( wrapper ) ).toEqual( [ 'Fixture Help' ] );
	expect( tabs( wrapper )[ 1 ].attributes( 'tabindex' ) ).toBe( '0' );
	expect( tabs( wrapper )[ 0 ].attributes( 'tabindex' ) ).toBe( '-1' );
} );

test( 'a key that is not a tab key leaves the selection alone', async () => {
	const wrapper = open();
	await tabs( wrapper )[ 0 ].trigger( 'keydown', { key: 'a' } );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
} );

test( 'on a network the Overview leaves out the paragraphs about the addresses and membership', () => {
	const single = open( { data: { multisite: false } }, null );
	const network = open( { data: { multisite: true } }, null );
	expect( single.find( '#tab-panel-overview' ).text() ).toContain( 'WordPress URL and the site URL' );
	expect( network.find( '#tab-panel-overview' ).text() ).not.toContain( 'WordPress URL and the site URL' );
	expect( network.find( '#tab-panel-overview' ).text() ).toContain( 'UTC means Coordinated Universal Time.' );
} );
