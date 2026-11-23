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

test( 'the contract: shared (not a page), two segments, 1.0.0, slug, section, load and act, emits close', () => {
	expect( contract.id ).toBe( 'core/plugin-information' );
	expect( contract.version ).toBe( '1.0.0' );
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

test.each( [
	[ 'install', 'Install Now', false, [ 'right', 'install-now', 'button' ], 'plugin_install_from_iframe' ],
	[ 'update', 'Update Now', false, [ 'right', 'update-now', 'button' ], 'plugin_install_from_iframe' ],
	[ 'activate', 'Activate', false, [ 'right', 'button', 'button-primary', 'activate-now' ], undefined ],
	[ 'active', 'Active', true, [ 'right', 'button', 'button-disabled' ], 'plugin_install_from_iframe' ],
	[ 'installed', 'Installed', true, [ 'right', 'button', 'button-disabled' ], 'plugin_install_from_iframe' ],
	[ 'incompatible', 'Install Now', true, [ 'right', 'button', 'button-disabled' ], 'plugin_install_from_iframe' ],
] )( 'the footer button %s: its label, classes and state', async ( action, label, disabled, classes, id ) => {
	const wrapper = await mountInfo( { answer: information( { button: { action, label, disabled } } ) } );
	const button = wrapper.find( '#plugin-information-footer button' );
	expect( button.text() ).toBe( label );
	for ( const name of classes ) {
		expect( button.classes() ).toContain( name );
	}
	expect( button.attributes( 'id' ) ).toBe( id );
	expect( button.element.disabled ).toBe( disabled );
	await button.trigger( 'click' );
	if ( disabled ) {
		expect( wrapper.act ).not.toHaveBeenCalled();
	} else {
		expect( wrapper.act ).toHaveBeenCalledWith( action );
	}
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
