/** @jest-environment jsdom */
// The Site Icon row of General Settings: the link to the Customizer's Site Identity section is built from the admin
// prefix the page reads, and the label and preview follow the icon in the data.
import { expect, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import SiteIcon from '../../../site/components/core/options-general/site-icon.js';

const mountIcon = ( icon, base = '/wp-admin/' ) => mountPart( SiteIcon, { props: { icon, base } } );

test( 'with no icon: Choose a Site Icon, linked to the Site Identity section, and no preview', () => {
	const wrapper = mountIcon( { id: 0, url: '', alt: '' } );
	const link = wrapper.find( '.site-icon-action-buttons a.button' );
	expect( link.text() ).toBe( 'Choose a Site Icon' );
	expect( link.attributes( 'href' ) ).toBe( '/wp-admin/customize.php?autofocus%5Bsection%5D=title_tagline' );
	expect( wrapper.find( '#site-icon-preview' ).exists() ).toBe( false );
} );

test( 'the link follows the admin prefix in the data, for a subsite too', () => {
	const wrapper = mountIcon( { id: 0, url: '', alt: '' }, '/sites/3/wp-admin/' );
	expect( wrapper.find( 'a.button' ).attributes( 'href' ) ).toBe( '/sites/3/wp-admin/customize.php?autofocus%5Bsection%5D=title_tagline' );
} );

test( 'with an icon: Change Site Icon, the preview from the data and its alternative text', () => {
	const wrapper = mountIcon( { id: 7, url: 'https://example.org/wp-content/uploads/icon.png?ver=2', alt: 'Our logo' } );
	expect( wrapper.find( 'a.button' ).text() ).toBe( 'Change Site Icon' );
	const image = wrapper.find( '#app-icon-preview' );
	expect( image.attributes( 'src' ) ).toBe( 'https://example.org/wp-content/uploads/icon.png?ver=2' );
	expect( image.attributes( 'alt' ) ).toBe( 'App icon preview: Current image: Our logo' );
} );

test( 'an icon without alternative text names the file instead', () => {
	const wrapper = mountIcon( { id: 7, url: 'https://example.org/wp-content/uploads/icon.png?ver=2', alt: '' } );
	expect( wrapper.find( '#app-icon-preview' ).attributes( 'alt' ) ).toBe( 'App icon preview: The current image has no alternative text. The file name is: icon.png' );
} );

test( 'an image source that is not http or https is not shown', () => {
	const wrapper = mountIcon( { id: 7, url: 'javascript:window.ran = true', alt: '' } );
	expect( wrapper.find( '#site-icon-preview' ).exists() ).toBe( false );
	expect( wrapper.find( 'img' ).exists() ).toBe( false );
	expect( wrapper.find( 'a.button' ).text() ).toBe( 'Change Site Icon' );
} );
