/** @jest-environment jsdom */
// The Help panel of Privacy Settings: one Overview tab with the classic paragraphs, and the sidebar documentation link.
import { expect, test } from '@jest/globals';
import { openHelp } from '../../helpers/help-tabs.mjs';
import { help } from '../../../site/components/core/options-privacy/help.js';
import { privacyData } from './data.mjs';

function open() {
	return openHelp( help, null, { data: privacyData() } );
}

test( 'one Overview tab with the two classic paragraphs', () => {
	const wrapper = open();
	expect( wrapper.findAll( '[role="tab"]' ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview' ] );
	const paragraphs = wrapper.find( '[role="tabpanel"]:not([hidden])' ).findAll( 'p' ).map( ( p ) => p.text() );
	expect( paragraphs ).toHaveLength( 2 );
	expect( paragraphs[ 0 ] ).toBe( 'The Privacy screen lets you either build a new privacy-policy page or choose one you already have to show.' );
	expect( paragraphs[ 1 ] ).toContain( 'it is your responsibility to use these resources correctly' );
} );

test( 'the sidebar links to the documentation', () => {
	const wrapper = open();
	expect( wrapper.find( '.contextual-help-sidebar strong' ).text() ).toBe( 'For more information:' );
	const link = wrapper.find( '.contextual-help-sidebar a' );
	expect( link.text() ).toBe( 'Documentation on Privacy Settings' );
	expect( link.attributes( 'href' ) ).toBe( 'https://wordpress.org/documentation/article/settings-privacy-screen/' );
} );
