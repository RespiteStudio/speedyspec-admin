/** @jest-environment jsdom */
// The plugin information dialog (core/plugin-information): what install_plugin_information()
// prints, from WordPress's data (`GET plugins/information`): the banner, the section tabs and the
// active section (WordPress.org content, through InertHtml), the sidebar facts, the compatibility
// notices, the footer button and its action, Escape and the close button, and the classic text of
// a failed load.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import PluginInformation from '../../../site/components/core/plugin-information.js';
import contract from '../../../site/contracts/core/plugin-information.js';
import { information } from './data.mjs';

const FAILED = 'An unexpected error occurred. Something may be wrong with WordPress.org or this server&#8217;s configuration. If you continue to have problems, please try the <a href="https://wordpress.org/support/forums/">support forums</a>.';

let opener;
beforeEach( () => {
	opener = document.createElement( 'a' );
	opener.href = '#';
	opener.textContent = 'More Details';
	document.body.append( opener );
	opener.focus();
	delete window.__ran;
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	delete window.__ran;
	document.body.innerHTML = '';
} );

/** Mounts the dialog; `answer` is what load() resolves (or a function of slug and section). */
async function mountInfo( { answer = information(), section, act = jest.fn( async () => {} ), slug = 'e2e-test-plugin' } = {} ) {
	const load = jest.fn( async ( ...args ) => ( typeof answer === 'function' ? answer( ...args ) : answer ) );
	const props = { slug, load, act };
	if ( section !== undefined ) {
		props.section = section;
	}
	// A listener counts `close` (@vue/test-utils' emitted() needs Vue's development build).
	const closes = [];
	props.onClose = () => closes.push( true );
	const wrapper = mountPart( PluginInformation, { props } );
	await settle();
	return Object.assign( wrapper, { load, act, closes } );
}

test( 'the contract: shared (not a page), two segments, 1.2.0, slug, section, load and act, emits close', () => {
	expect( contract.id ).toBe( 'core/plugin-information' );
	expect( contract.version ).toBe( '1.2.0' );
	expect( contract.page ).toBeUndefined();
	expect( contract.props ).toEqual( {
		slug: { type: 'String', required: true },
		section: { type: 'String', required: false },
		load: { type: 'Function', required: true },
		act: { type: 'Function', required: true },
	} );
	expect( contract.emits ).toEqual( [ 'close' ] );
} );

test( 'it loads the slug and the default section (description) once, as a modal dialog', async () => {
	const wrapper = await mountInfo();
	expect( wrapper.load ).toHaveBeenCalledTimes( 1 );
	expect( wrapper.load ).toHaveBeenCalledWith( 'e2e-test-plugin', 'description' );
	const dialog = wrapper.find( 'dialog#plugin-information' );
	expect( dialog.attributes( 'open' ) ).toBeDefined();
	expect( dialog.attributes( 'aria-labelledby' ) ).toBe( 'plugin-information-name' );
	expect( wrapper.find( '#plugin-information-title h2#plugin-information-name' ).text() ).toBe( 'E2E Test Plugin' );
} );

test( 'the tabs and the active section; another tab shows its section without loading again', async () => {
	const wrapper = await mountInfo();
	const tabs = wrapper.findAll( '#plugin-information-tabs a' );
	expect( tabs.map( ( tab ) => tab.text() ) ).toEqual( [ 'Description', 'Installation', 'Changelog' ] );
	expect( tabs.map( ( tab ) => tab.attributes( 'name' ) ) ).toEqual( [ 'description', 'installation', 'changelog' ] );
	expect( tabs[ 0 ].classes() ).toContain( 'current' );
	expect( tabs[ 0 ].attributes( 'aria-current' ) ).toBe( 'true' );
	expect( wrapper.find( '#section-holder #section-description.section strong' ).text() ).toBe( 'for tests' );
	expect( wrapper.find( '#section-installation' ).exists() ).toBe( false );

	await tabs[ 2 ].trigger( 'click' );
	await settle();
	expect( wrapper.find( '#section-changelog h4' ).text() ).toBe( '2.0' );
	expect( wrapper.find( '#section-description' ).exists() ).toBe( false );
	expect( wrapper.findAll( '#plugin-information-tabs a' )[ 2 ].classes() ).toContain( 'current' );
	expect( wrapper.load ).toHaveBeenCalledTimes( 1 );
} );

test( 'a given section opens on that tab; one the plugin has not falls back to the first', async () => {
	const changelog = await mountInfo( { section: 'changelog' } );
	expect( changelog.load ).toHaveBeenCalledWith( 'e2e-test-plugin', 'changelog' );
	expect( changelog.find( '#section-changelog' ).exists() ).toBe( true );
	const missing = await mountInfo( { section: 'reviews' } );
	expect( missing.find( '#section-description' ).exists() ).toBe( true );
} );

test( 'a <script> and an <img onerror> in a section run nothing', async () => {
	const hostile = information( { sections: [ { name: 'description', title: 'Description', html: '<p>Hi<script>window.__ran = 1</script><img src="x" onerror="window.__ran = 2"></p>' } ] } );
	const wrapper = await mountInfo( { answer: hostile } );
	await settle();
	expect( wrapper.find( '#section-description script' ).exists() ).toBe( false );
	expect( wrapper.find( '#section-description img' ).attributes( 'onerror' ) ).toBeUndefined();
	expect( window.__ran ).toBeUndefined();
} );

test( 'a section\'s links open in a new tab, and the Reviews\' dashicon stars keep their classes, no other (1.2.0)', async () => {
	const reviews = '<div class="review notice"><div class="star-rating"><span class="star dashicons dashicons-star-filled"></span><span class="star dashicons dashicons-star-half"></span><span class="star dashicons dashicons-star-empty"></span></div><p>By <a href="https://profiles.wordpress.org/someone/" class="reviewer-name">someone</a></p></div>';
	const wrapper = await mountInfo( { answer: information( { sections: [ { name: 'reviews', title: 'Reviews', html: reviews } ] } ) } );
	await settle();
	const section = wrapper.find( '#section-reviews' );
	expect( section.findAll( '.star-rating .star.dashicons' ).map( ( star ) => star.classes().join( ' ' ) ) ).toEqual( [ 'star dashicons dashicons-star-filled', 'star dashicons dashicons-star-half', 'star dashicons dashicons-star-empty' ] );
	expect( section.find( '.review' ).exists() ).toBe( false );
	expect( section.find( '.notice' ).exists() ).toBe( false );
	const link = section.find( 'a' );
	expect( link.attributes( 'target' ) ).toBe( '_blank' );
	expect( link.attributes( 'rel' ) ).toBe( 'noopener noreferrer' );
	expect( link.attributes( 'class' ) ).toBeUndefined();
} );

test( 'the banner: http(s) addresses only, as the title background', async () => {
	const wrapper = await mountInfo();
	const title = wrapper.find( '#plugin-information-title' );
	expect( title.classes() ).toContain( 'with-banner' );
	expect( title.attributes( 'style' ) ).toContain( 'https://ps.w.org/e2e-test-plugin/assets/banner-772x250.png' );
	expect( wrapper.find( '#plugin-information-tabs' ).classes() ).toContain( 'with-banner' );

	const unsafe = await mountInfo( { answer: information( { banners: { low: 'javascript:alert(1)', high: 'data:image/png;base64,AAAA' } } ) } );
	const plain = unsafe.find( '#plugin-information-title' );
	expect( plain.classes() ).not.toContain( 'with-banner' );
	expect( plain.attributes( 'style' ) ?? '' ).toBe( '' );
} );

test( 'the sidebar facts: version, author (inline markup), last updated, requirements, rating, active installs', async () => {
	const wrapper = await mountInfo( { answer: information( { facts: { ...information().facts, author: '<a href="https://example.org/author" onclick="window.__ran=1">Test Author</a><img src=x onerror="window.__ran=2">' } } ) } );
	const fyi = wrapper.find( '#plugin-information-content .fyi' );
	const items = fyi.findAll( 'ul li' ).map( ( item ) => item.text().replace( /\s+/g, ' ' ) );
	expect( items ).toEqual( [
		'Version: 2.0',
		'Author: Test Author',
		'Last Updated: 3 days ago',
		'Requires WordPress Version: 5.0 or higher',
		'Requires PHP Version: 7.4 or higher',
		'Active Installations: 10,000+',
	] );
	const author = fyi.find( 'a[href="https://example.org/author"]' );
	expect( author.attributes( 'onclick' ) ).toBeUndefined();
	expect( fyi.find( 'img' ).exists() ).toBe( false );
	expect( fyi.find( 'h3' ).text() ).toBe( 'Average Rating' );
	const stars = fyi.find( '.star-rating' );
	expect( stars.find( '.screen-reader-text' ).text() ).toBe( '4.5 rating based on 12 ratings' );
	expect( stars.findAll( '.star-full' ) ).toHaveLength( 4 );
	expect( stars.findAll( '.star-half' ) ).toHaveLength( 1 );
	expect( stars.findAll( '.star-empty' ) ).toHaveLength( 0 );
	expect( fyi.find( '.fyi-description' ).text() ).toBe( '(based on 12 ratings)' );
	await settle();
	expect( window.__ran ).toBeUndefined();
} );

test( 'facts the data leaves out are not shown, and no rating shows no stars', async () => {
	const wrapper = await mountInfo( { answer: information( { facts: { version: '1.0' }, rating: null } ) } );
	expect( wrapper.findAll( '.fyi ul li' ).map( ( item ) => item.text() ) ).toEqual( [ 'Version: 1.0' ] );
	expect( wrapper.find( '.star-rating' ).exists() ).toBe( false );
} );

test( 'the compatibility notices from the data, through InlineMarkup', async () => {
	const wrapper = await mountInfo( { answer: information( { notices: [
		{ type: 'error', message: '<strong>Error:</strong> This plugin <strong>requires a newer version of PHP</strong>.' },
		{ type: 'warning', message: '<strong>Warning:</strong> This plugin <strong>has not been tested</strong> with your current version of WordPress.<script>window.__ran=1</script>' },
	] } ) } );
	const notices = wrapper.findAll( '#section-holder .notice.notice-alt' );
	expect( notices ).toHaveLength( 2 );
	expect( notices[ 0 ].classes() ).toContain( 'notice-error' );
	expect( notices[ 0 ].text() ).toBe( 'Error: This plugin requires a newer version of PHP.' );
	expect( notices[ 1 ].classes() ).toContain( 'notice-warning' );
	expect( notices[ 1 ].find( 'script' ).exists() ).toBe( false );
	await settle();
	expect( window.__ran ).toBeUndefined();
} );

const footerButton = async ( action, label, disabled ) => {
	const wrapper = await mountInfo( { answer: information( { button: { action, label, disabled } } ) } );
	return { wrapper, button: wrapper.find( '#plugin-information-footer button' ) };
};

test.each( [
	[ 'install', 'Install Now', [ 'right', 'install-now', 'button' ], 'plugin_install_from_iframe' ],
	[ 'update', 'Update Now', [ 'right', 'update-now', 'button' ], 'plugin_install_from_iframe' ],
	[ 'activate', 'Activate', [ 'right', 'button', 'button-primary', 'activate-now' ], undefined ],
] )( 'the footer button %s acts: its label, classes and state, and act() is called with it', async ( action, label, classes, id ) => {
	const { wrapper, button } = await footerButton( action, label, false );
	expect( button.text() ).toBe( label );
	expect( button.classes() ).toEqual( expect.arrayContaining( classes ) );
	expect( button.attributes( 'id' ) ).toBe( id );
	expect( button.element.disabled ).toBe( false );
	await button.trigger( 'click' );
	expect( wrapper.act ).toHaveBeenCalledWith( action, { action, label, disabled: false } );
} );

test.each( [
	[ 'active', 'Active' ],
	[ 'installed', 'Installed' ],
	[ 'incompatible', 'Install Now' ],
] )( 'the footer button %s never acts: its label, the disabled classes, and act() is not called', async ( action, label ) => {
	const { wrapper, button } = await footerButton( action, label, true );
	expect( button.text() ).toBe( label );
	expect( button.classes() ).toEqual( expect.arrayContaining( [ 'right', 'button', 'button-disabled' ] ) );
	expect( button.attributes( 'id' ) ).toBe( 'plugin_install_from_iframe' );
	expect( button.element.disabled ).toBe( true );
	await button.trigger( 'click' );
	expect( wrapper.act ).not.toHaveBeenCalled();
} );

test( 'a button state that cannot act calls nothing, even when the data does not disable it', async () => {
	const wrapper = await mountInfo( { answer: information( { button: { action: 'installed', label: 'Installed', disabled: false } } ) } );
	await wrapper.find( '#plugin-information-footer button' ).trigger( 'click' );
	expect( wrapper.act ).not.toHaveBeenCalled();
} );

test( 'act() runs one at a time: the button is busy until it settles', async () => {
	let finish;
	const act = jest.fn( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await mountInfo( { act } );
	const button = wrapper.find( '#plugin-information-footer button' );
	await button.trigger( 'click' );
	await button.trigger( 'click' );
	expect( act ).toHaveBeenCalledTimes( 1 );
	expect( button.element.disabled ).toBe( true );
	finish();
	await settle();
	expect( button.element.disabled ).toBe( false );
} );

test( 'no button in the data, no footer button', async () => {
	const wrapper = await mountInfo( { answer: information( { button: null } ) } );
	expect( wrapper.find( '#plugin-information-footer' ).exists() ).toBe( true );
	expect( wrapper.find( '#plugin-information-footer button' ).exists() ).toBe( false );
} );

test( 'a failed load shows the classic text from the error', async () => {
	const wrapper = await mountInfo( { answer: () => {
		throw { code: 'plugins_api_failed', message: FAILED, status: 500 };
	} } );
	const notice = wrapper.find( '#plugin-information .notice-error' );
	expect( notice.text() ).toBe( 'An unexpected error occurred. Something may be wrong with WordPress.org or this server’s configuration. If you continue to have problems, please try the support forums.' );
	expect( notice.find( 'a' ).attributes( 'href' ) ).toBe( 'https://wordpress.org/support/forums/' );
	expect( wrapper.find( '#plugin-information-tabs' ).exists() ).toBe( false );
} );

test( 'the close button and Escape emit close; closing returns the focus to the opener', async () => {
	const wrapper = await mountInfo();
	await wrapper.find( 'button.plugin-information-close' ).trigger( 'click' );
	expect( wrapper.closes ).toHaveLength( 1 );
	const event = new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true, cancelable: true } );
	wrapper.find( 'dialog' ).element.dispatchEvent( event );
	expect( event.defaultPrevented ).toBe( true );
	const nativeCancel = new Event( 'cancel', { cancelable: true } );
	wrapper.find( 'dialog' ).element.dispatchEvent( nativeCancel );
	expect( nativeCancel.defaultPrevented ).toBe( true );
	expect( wrapper.closes ).toHaveLength( 3 );
	wrapper.unmount();
	expect( document.activeElement ).toBe( opener );
} );

test( 'a new slug loads that plugin', async () => {
	const wrapper = await mountInfo( { answer: ( slug ) => information( { slug, name: slug === 'hello-dolly' ? 'Hello Dolly' : 'E2E Test Plugin' } ) } );
	await wrapper.setProps( { slug: 'hello-dolly' } );
	await settle();
	expect( wrapper.load ).toHaveBeenLastCalledWith( 'hello-dolly', 'description' );
	expect( wrapper.find( '#plugin-information-name' ).text() ).toBe( 'Hello Dolly' );
} );

test( 'the sidebar links (1.1.0): the WordPress.org page, the homepage and the donation link, http(s) only, opening a new tab', async () => {
	const wrapper = await mountInfo( { answer: information( { facts: { ...information().facts, wporgUrl: 'https://wordpress.org/plugins/e2e-test-plugin/', homepage: 'https://example.org/', donate: 'javascript:window.__ran=1' } } ) } );
	const links = wrapper.findAll( '.fyi ul li a' );
	expect( links.map( ( a ) => [ a.text(), a.attributes( 'href' ), a.attributes( 'target' ) ] ) ).toEqual( [
		[ 'Test Author', 'https://example.org/author', undefined ],
		[ 'WordPress.org Plugin Page »', 'https://wordpress.org/plugins/e2e-test-plugin/', '_blank' ],
		[ 'Plugin Homepage »', 'https://example.org/', '_blank' ],
	] );
	expect( window.__ran ).toBeUndefined();
} );

test( 'the reviews by stars (1.1.0): a bar per star with its link, label, width and count', async () => {
	const breakdown = [
		{ stars: 5, count: 3, countText: '3', text: '5 stars', label: 'Reviews with 5 stars: 3. Opens in a new tab.', url: 'https://wordpress.org/support/plugin/e2e-test-plugin/reviews/?filter=5', width: 55.2 },
		{ stars: 1, count: 1, countText: '1', text: '1 star', label: 'Reviews with 1 star: 1. Opens in a new tab.', url: 'https://wordpress.org/support/plugin/e2e-test-plugin/reviews/?filter=1', width: 18.4 },
	];
	const wrapper = await mountInfo( { answer: information( { rating: { ...information().rating, value: 4, count: 5, breakdown } } ) } );
	expect( wrapper.findAll( '.fyi h3' ).map( ( h3 ) => h3.text() ) ).toEqual( [ 'Average Rating', 'Reviews' ] );
	expect( wrapper.find( '.fyi h3 + p.fyi-description' ).exists() ).toBe( true );
	expect( wrapper.text() ).toContain( 'Read all reviews on WordPress.org or write your own!' );
	const bars = wrapper.findAll( '.counter-container' );
	expect( bars.map( ( bar ) => [ bar.find( '.counter-label a' ).text(), bar.find( '.counter-label a' ).attributes( 'href' ), bar.find( '.counter-label a' ).attributes( 'aria-label' ), bar.find( '.counter-bar' ).attributes( 'style' ), bar.find( '.counter-count' ).text() ] ) ).toEqual( [
		[ '5 stars', 'https://wordpress.org/support/plugin/e2e-test-plugin/reviews/?filter=5', 'Reviews with 5 stars: 3. Opens in a new tab.', 'width: 55.2px;', '3' ],
		[ '1 star', 'https://wordpress.org/support/plugin/e2e-test-plugin/reviews/?filter=1', 'Reviews with 1 star: 1. Opens in a new tab.', 'width: 18.4px;', '1' ],
	] );
} );

test( 'the contributors (1.1.0): names as text with their avatars, and the donation link after them', async () => {
	const wrapper = await mountInfo( { answer: information( {
		facts: { ...information().facts, donate: 'https://example.org/donate' },
		contributors: [ { name: 'Fixture <b>Dev</b>', url: 'https://profiles.wordpress.org/fixture/', avatar: 'https://secure.gravatar.com/avatar/x?s=36' }, { name: 'Other', url: null, avatar: null } ],
	} ) } );
	expect( wrapper.find( '.fyi ul:not(.contributors)' ).text() ).not.toContain( 'Donate' );
	const items = wrapper.findAll( 'ul.contributors li' );
	expect( items.map( ( li ) => li.text() ) ).toEqual( [ 'Fixture <b>Dev</b>', 'Other' ] );
	expect( items[ 0 ].find( 'a' ).attributes( 'href' ) ).toBe( 'https://profiles.wordpress.org/fixture/' );
	expect( items[ 0 ].find( 'img' ).attributes() ).toMatchObject( { src: 'https://secure.gravatar.com/avatar/x?s=36', width: '18', height: '18', alt: '' } );
	expect( items[ 1 ].find( 'a' ).exists() ).toBe( false );
	const donate = wrapper.find( 'ul.contributors + a' );
	expect( donate.text() ).toBe( 'Donate to this plugin »' );
	expect( donate.attributes( 'href' ) ).toBe( 'https://example.org/donate' );
} );

test( 'the donation link is in the list when the plugin has no contributors', async () => {
	const wrapper = await mountInfo( { answer: information( { facts: { ...information().facts, donate: 'https://example.org/donate' }, contributors: [] } ) } );
	expect( wrapper.find( '.fyi ul li:last-child a' ).text() ).toBe( 'Donate to this plugin »' );
	expect( wrapper.find( 'ul.contributors' ).exists() ).toBe( false );
} );

test( 'act is given WordPress\'s button with its request (1.1.0)', async () => {
	const request = { method: 'POST', path: 'plugins/install', body: { slug: 'e2e-test-plugin' } };
	const wrapper = await mountInfo( { answer: information( { button: { action: 'install', label: 'Install Now', disabled: false, request } } ) } );
	await wrapper.find( '#plugin_install_from_iframe' ).trigger( 'click' );
	expect( wrapper.act ).toHaveBeenCalledWith( 'install', { action: 'install', label: 'Install Now', disabled: false, request } );
} );
