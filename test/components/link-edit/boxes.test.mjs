/** @jest-environment jsdom */
// The link form's meta boxes (edit-link-form.php): the core boxes rendered natively inside
// core/meta-box-holder with their classic ids and containers, the plugins' boxes and Save box
// hooks through LegacyHtml with their scripts and the note that their fields are not saved,
// collapse, hide, reorder and the Layout columns saved for screen `link`, the Advanced box, and
// the Help panel from the router.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { flushPromises } from '../../helpers/mount.mjs';
import { openHelp, titles } from '../../helpers/help-tabs.mjs';
import { addData, editData, host, layoutOf, loadContracts, mountAdd, mountLink, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	await loadContracts();
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
	delete window.__acmeRan;
} );

const PREFS = 'wp-admin/v1/screen-preferences/link';
const PLUGIN = { id: 'detached-fixture-link-box', title: 'Fixture link box', basename: 'Fixture link box', classes: [], html: '<input name="detached_fixture_link_note"><script>window.__acmeRan = ( window.__acmeRan || 0 ) + 1;</script>', error: false, configurable: false };
const ids = ( wrapper, selector ) => wrapper.findAll( selector + ' > .wp-admin-meta-box-host > .postbox, ' + selector + ' > .postbox' ).map( ( box ) => box.attributes( 'id' ) );

test( 'plugin boxes; submitHtml: the core boxes in their containers, a plugin box with its script, the Save box hooks, and the note', async () => {
	const submitHtml = { before: '<div class="acme-before">Before</div>', start: '<div class="acme-start">Start</div>', inside: '<div class="acme-inside">Inside</div>' };
	const wrapper = await mountLink( editData( { metaBoxes: [ PLUGIN ], layout: layoutOf( [ PLUGIN ] ), save: { ...editData().save, submitHtml } } ) );
	expect( ids( wrapper, '#postbox-container-1 #side-sortables' ) ).toEqual( [ 'linksubmitdiv' ] );
	expect( ids( wrapper, '#postbox-container-2 #normal-sortables' ) ).toEqual( [ 'linkcategorydiv', 'linktargetdiv', 'linkxfndiv', 'linkadvanceddiv', 'detached-fixture-link-box' ] );
	expect( wrapper.find( '#linksubmitdiv .postbox-header h2' ).text() ).toBe( 'Save' );
	expect( wrapper.find( '#linksubmitdiv #submitlink.submitbox' ).exists() ).toBe( true );
	expect( wrapper.find( '#detached-fixture-link-box input[name="detached_fixture_link_note"]' ).exists() ).toBe( true );
	await settle();
	expect( window.__acmeRan ).toBe( 1 );
	// post_submitbox_start prints before Delete, submitlink_box at the end of the box and before the side boxes.
	expect( wrapper.find( '#major-publishing-actions > .acme-start, #major-publishing-actions .acme-start' ).exists() ).toBe( true );
	expect( wrapper.find( '#submitlink .acme-inside' ).exists() ).toBe( true );
	expect( wrapper.find( '.acme-before' ).exists() ).toBe( true );
	expect( wrapper.find( '#linksubmitdiv .acme-before' ).exists() ).toBe( false );
	expect( wrapper.find( '.wp-admin-link-edit-plugin-note' ).text() ).toBe( 'This screen does not save the fields plugins add to this form.' );

	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	await wrapper.find( '#detached-fixture-link-box input' ).setValue( 'typed' );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	const saved = api.calls.find( ( call ) => call.route === 'wp-admin/v1/links/12' );
	expect( Object.keys( saved.payload.fields ) ).not.toContain( 'detached_fixture_link_note' );
} );

test( 'plugin boxes: no note without plugin output, and a box whose callback failed says so', async () => {
	const plain = await mountLink();
	expect( plain.find( '.wp-admin-link-edit-plugin-note' ).exists() ).toBe( false );
	const failed = { ...PLUGIN, html: '', error: true };
	const wrapper = await mountLink( editData( { metaBoxes: [ failed ], layout: layoutOf( [ failed ] ) } ) );
	expect( wrapper.find( '#detached-fixture-link-box .wp-admin-legacy-failure' ).text() ).toBe( 'This box could not be displayed.' );
} );

test( 'collapse and hide: a box\'s toggle saves the closed boxes for screen link, and Screen Options hide it', async () => {
	const record = host();
	const sections = [ { id: 'metabox-prefs', legend: 'Screen elements', description: '', items: [ { id: 'linkcategorydiv', label: 'Categories', checked: true } ] } ];
	const wrapper = await mountLink( editData( { screenOptions: { ...editData().screenOptions, sections } } ), record );
	await wrapper.find( '#linktargetdiv .handlediv' ).trigger( 'click' );
	await flushPromises();
	expect( wrapper.find( '#linktargetdiv' ).classes() ).toContain( 'closed' );
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: PREFS, payload: { closed: [ 'linktargetdiv' ], hidden: [] } } );
	expect( record.offered.sections ).toEqual( sections );
	record.offered.onChange( 'linkcategorydiv', false );
	await flushPromises();
	expect( api.calls.at( -1 ).payload ).toEqual( { closed: [ 'linktargetdiv' ], hidden: [ 'linkcategorydiv' ] } );
	expect( wrapper.find( '#linkcategorydiv' ).classes() ).toContain( 'hide-if-js' );
} );

test( 'reorder and columns: moving a box saves the order with the columns, and one column makes #post-body columns-1', async () => {
	const record = host();
	const wrapper = await mountLink( editData(), record );
	expect( record.offered.columns ).toEqual( { value: 2, choices: [ { value: 1, label: '1 column' }, { value: 2, label: '2 columns' } ] } );
	await wrapper.find( '#linktargetdiv .handle-order-higher' ).trigger( 'click' );
	await flushPromises();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: PREFS, payload: { order: { side: [ 'linksubmitdiv' ], normal: [ 'linktargetdiv', 'linkcategorydiv', 'linkxfndiv', 'linkadvanceddiv' ] }, columns: 2 } } );
	record.offered.onChange( 'screen_columns', '1' );
	await flushPromises();
	expect( wrapper.find( '#post-body' ).classes() ).toContain( 'columns-1' );
	expect( api.calls.at( -1 ).payload.columns ).toBe( 1 );
} );

test( 'the advanced box: rating options from data, the stored one selected, and image, RSS, notes and rating posted', async () => {
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const wrapper = await mountLink( editData( { advanced: { ratings: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] } } ) );
	const box = wrapper.find( '#linkadvanceddiv table.links-table' );
	expect( box.find( 'label[for="link_image"]' ).text() ).toBe( 'Image Address' );
	expect( box.find( 'label[for="rss_uri"]' ).text() ).toBe( 'RSS Address' );
	expect( box.find( '#rss_uri' ).attributes( 'name' ) ).toBe( 'link_rss' );
	expect( box.find( 'label[for="link_notes"]' ).text().trim() ).toBe( 'Notes' );
	expect( box.findAll( '#link_rating option' ).map( ( option ) => option.element.value ) ).toEqual( [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10' ] );
	expect( box.find( '#link_rating' ).element.value ).toBe( '7' );
	expect( box.text() ).toContain( '(Leave at 0 for no rating.)' );
	await box.find( '#link_image' ).setValue( 'https://img.example/x.png' );
	await box.find( '#rss_uri' ).setValue( 'https://img.example/feed' );
	await box.find( '#link_notes' ).setValue( 'New notes' );
	await box.find( '#link_rating' ).setValue( '3' );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	const fields = api.calls.at( -1 ).payload.fields;
	expect( [ fields.link_image, fields.link_rss, fields.link_notes, fields.link_rating ] ).toEqual( [ 'https://img.example/x.png', 'https://img.example/feed', 'New notes', '3' ] );
	// No rating on Add: the first option, as a browser shows it.
	const added = await mountAdd( addData() );
	expect( added.find( '#link_rating' ).element.value ).toBe( '0' );
} );

test( 'help: Overview and the sidebar, from the router', () => {
	const wrapper = openHelp( null, {
		tabs: [ { id: 'overview', title: 'Overview', content: '<p>You can add or edit links on this screen by entering information in each of the boxes.</p><p>XFN stands for <a href="https://gmpg.org/xfn/">XHTML Friends Network</a>, which is optional.</p>', priority: 10 } ],
		sidebar: '<p><strong>For more information:</strong></p><p><a href="https://codex.wordpress.org/Links_Add_New_Screen">Documentation on Creating Links</a></p><p><a href="https://wordpress.org/support/forums/">Support forums</a></p>',
	}, { data: {} } );
	expect( titles( wrapper ) ).toEqual( [ 'Overview' ] );
	expect( wrapper.find( '#tab-panel-overview a' ).attributes( 'href' ) ).toBe( 'https://gmpg.org/xfn/' );
	expect( wrapper.find( '.contextual-help-sidebar a' ).attributes( 'href' ) ).toBe( 'https://codex.wordpress.org/Links_Add_New_Screen' );
} );
