/** @jest-environment jsdom */
// The Help panel of Writing Settings: Overview, Post Via Email and Update Services, the last two only when the page's
// flags (the `enable_*_configuration` filters) have them, switching with the arrow keys, Home and End.
import { expect, test } from '@jest/globals';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, tabs, titles, selected } from '../../helpers/help-tabs.mjs';
import { help } from '../../../site/components/core/options-writing/help.js';
import { writingData } from './data.mjs';

function open( flags = {} ) {
	const page = { data: writingData( { flags: { ...writingData().flags, ...flags } } ) };
	return openHelp( help, null, page );
}


async function press( wrapper, key ) {
	const current = tabs( wrapper ).findIndex( ( tab ) => tab.attributes( 'aria-selected' ) === 'true' );
	await tabs( wrapper )[ current ].trigger( 'keydown', { key } );
	await flushPromises();
}

test( 'all three tabs, and the sidebar link to the documentation', () => {
	const wrapper = open();
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Post Via Email', 'Update Services' ] );
	expect( wrapper.find( '.contextual-help-sidebar a[href="https://wordpress.org/documentation/article/settings-writing-screen/"]' ).text() ).toBe( 'Documentation on Writing Settings' );
} );

test( 'the arrow keys, Home and End switch the tabs and show their panels', async () => {
	const wrapper = open();
	await press( wrapper, 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Post Via Email' ] );
	expect( document.activeElement ).toBe( tabs( wrapper )[ 1 ].element );
	expect( wrapper.find( '#tab-panel-options-postemail' ).text() ).toContain( 'Post via email settings allow you to send your WordPress installation an email' );
	expect( wrapper.find( '#tab-panel-options-postemail' ).attributes( 'hidden' ) ).toBeUndefined();

	await press( wrapper, 'End' );
	expect( selected( wrapper ) ).toEqual( [ 'Update Services' ] );
	expect( wrapper.find( '#tab-panel-options-services' ).text() ).toBe( 'If desired, WordPress will automatically alert various services of your new posts.' );

	await press( wrapper, 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
	await press( wrapper, 'ArrowUp' );
	expect( selected( wrapper ) ).toEqual( [ 'Update Services' ] );
	await press( wrapper, 'Home' );
	expect( selected( wrapper ) ).toEqual( [ 'Overview' ] );
} );

test( 'a tab the flags turn off is not there, and the arrow keys skip it', async () => {
	const wrapper = open( { postByEmail: false } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview', 'Update Services' ] );
	await press( wrapper, 'ArrowDown' );
	expect( selected( wrapper ) ).toEqual( [ 'Update Services' ] );
} );

test( 'with both turned off, only the Overview', () => {
	const wrapper = open( { postByEmail: false, updateServices: false } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview' ] );
} );

test( 'the visibility of the site does not decide the Update Services tab: the flag does', () => {
	expect( titles( open( { blogPublic: false } ) ) ).toEqual( [ 'Overview', 'Post Via Email', 'Update Services' ] );
} );
