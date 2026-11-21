/** @jest-environment jsdom */
// The Help panel of Media Settings: the Overview, whose Uploading Files paragraph is there only while the upload paths can
// be edited (`flags.uploadPaths` of the page the frame holds), and which follows a save through `shownSettings`.
import { afterEach, expect, test } from '@jest/globals';
import { ref } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import HelpTabs, { mergeHelp } from '../../../site/components/core/help-tabs.js';
import { help, shownSettings } from '../../../site/components/core/options-media/help.js';
import { customPaths, mediaData } from './data.mjs';

afterEach( () => {
	shownSettings.value = null;
} );

function open( data ) {
	const page = { data };
	const { tabs, sidebar } = mergeHelp( help, null, page );
	return mountPart( HelpTabs, { props: { tabs, sidebar }, provide: { framePage: ref( page ) } } );
}

const panel = ( wrapper ) => wrapper.find( '[role="tabpanel"]:not([hidden])' );

test( 'one Overview tab, and the sidebar link to the documentation', () => {
	const wrapper = open( mediaData() );
	expect( wrapper.findAll( '[role="tab"]' ).map( ( tab ) => tab.text() ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.find( '.contextual-help-sidebar a[href="https://wordpress.org/documentation/article/settings-media-screen/"]' ).text() ).toBe( 'Documentation on Media Settings' );
} );

test( 'locked paths: no Uploading Files paragraph', () => {
	const text = panel( open( mediaData() ) ).text();
	expect( text ).toContain( 'You can set maximum sizes for images inserted into your written content' );
	expect( text ).not.toContain( 'Uploading Files allows you' );
	expect( text ).toContain( 'You must click the Save Changes button' );
} );

test( 'editable paths: the paragraph is shown between the other two', () => {
	const paragraphs = panel( open( customPaths() ) ).findAll( 'p' ).map( ( p ) => p.text() );
	expect( paragraphs[ 1 ] ).toBe( 'Uploading Files allows you to choose the folder and path for storing your uploaded files.' );
	expect( paragraphs ).toHaveLength( 3 );
} );

test( 'the settings the page shows win over the page the frame holds, so the help follows a save', async () => {
	const wrapper = open( customPaths() );
	expect( panel( wrapper ).text() ).toContain( 'Uploading Files allows you' );

	shownSettings.value = mediaData();
	await flushPromises();
	expect( panel( wrapper ).text() ).not.toContain( 'Uploading Files allows you' );

	shownSettings.value = null;
	await flushPromises();
	expect( panel( wrapper ).text() ).toContain( 'Uploading Files allows you' );
} );
