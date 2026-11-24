/** @jest-environment jsdom */
// The page from its data (E1: the heading, the file, the selector, the tree, the textarea, the
// notices), the selector (E3, E10), the file tree and its keys as theme-plugin-editor.js's
// TreeLinks moves and opens (E3), the child theme's parent link, and the documentation list with
// Look Up (E9).
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { folder, host, leaf, loadContracts, mountEditor, pluginEditorData, settle, themeEditorData } from './data.mjs';

const bodyClass = document.body.className;
const PLAIN = { codeEditorApi: null };

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.restoreAllMocks();
	resetContracts();
} );

// The items of the file list (the root item, which holds the list, has no label of its own).
const items = ( wrapper ) => wrapper.findAll( '#templateside ul[role="group"] [role="treeitem"]' );
const squash = ( value ) => String( value ?? '' ).replace( /\s+/g, ' ' ).trim();
// An item's own label: a folder's is its `.folder-label`.
const ownLabel = ( element ) => squash( element?.matches?.( 'li' ) ? element.querySelector( '.folder-label' )?.textContent : element?.textContent );
const labelOf = ( item ) => ownLabel( item.element );
const focusedLabel = () => ownLabel( document.activeElement );
const key = async ( wrapper, name ) => {
	document.activeElement.dispatchEvent( new KeyboardEvent( 'keydown', { key: name, bubbles: true, cancelable: true } ) );
	await settle();
};

test( 'page from data: the heading names the theme in bold, as inline markup', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	expect( wrapper.find( '.fileedit-sub .alignleft h2' ).html() ).toContain( 'Editing <strong>Twenty Twenty-One</strong> (active)' );
} );

test( 'page from data: the file label, as text', async () => {
	const wrapper = await mountEditor( themeEditorData( { fileLabel: 'File: <b>functions.php</b>' } ), host(), PLAIN );
	expect( wrapper.find( '.fileedit-sub .alignleft span strong' ).text() ).toBe( 'File: <b>functions.php</b>' );
} );

test( 'page from data: the selector lists the themes with the open one selected, and Select', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	const select = wrapper.find( '.fileedit-sub .alignright select#theme' );
	expect( [
		wrapper.find( 'label[for="theme"]' ).text(),
		select.findAll( 'option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] ),
		select.element.value,
		wrapper.find( '.fileedit-sub .alignright input[type="submit"]' ).attributes( 'value' ),
	] ).toEqual( [ 'Select theme to edit:', [ [ 'twentytwentyfive', 'Twenty Twenty-Five' ], [ 'twentytwentyone', 'Twenty Twenty-One' ] ], 'twentytwentyone', 'Select' ] );
} );

test( 'page from data: the file\'s content is the textarea\'s value, described by the help\'s keyboard texts', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	const textarea = wrapper.find( 'form#template textarea#newcontent' );
	expect( [ textarea.element.value, textarea.attributes( 'aria-describedby' ), wrapper.find( 'label#theme-plugin-editor-label' ).text() ] ).toEqual( [
		"<?php\n// Functions.\n",
		'editor-keyboard-trap-help-1 editor-keyboard-trap-help-2 editor-keyboard-trap-help-3 editor-keyboard-trap-help-4',
		'Selected file content:',
	] );
} );

test( 'page from data: Update File and its spinner', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	expect( [ wrapper.find( 'p.submit input#submit.button-primary' ).attributes( 'value' ), wrapper.find( 'p.submit span.spinner' ).exists() ] ).toEqual( [ 'Update File', true ] );
} );

test( 'page from data: the title and the body class while it is shown', async () => {
	const record = host();
	await mountEditor( themeEditorData(), record, PLAIN );
	expect( [ record.titles.at( -1 ), document.body.classList.contains( 'theme-editor-php' ) ] ).toEqual( [ 'Edit Themes', true ] );
} );

test( 'page from data: the top notices before the heading, as inline markup that runs nothing', async () => {
	const notices = [ { id: 'custom-css', markup: '<strong>Did you know?</strong> <img src=x onerror="window.__ran=1">CSS', type: 'info', dismissible: false, place: 'top' } ];
	const wrapper = await mountEditor( themeEditorData( { notices } ), host(), PLAIN );
	const notice = wrapper.find( '.notice.notice-info' );
	expect( [ notice.find( 'strong' ).text(), notice.find( 'img' ).exists(), window.__ran ] ).toEqual( [ 'Did you know?', false, undefined ] );
} );

test( 'page from data: an editor notice goes in the form\'s notices, inline', async () => {
	const notices = [ { id: 'active-plugin', markup: '<strong>Warning:</strong> Making changes to active plugins is not recommended.', type: 'warning', dismissible: false, place: 'editor' } ];
	const wrapper = await mountEditor( pluginEditorData( { notices } ), host(), PLAIN );
	expect( wrapper.find( 'form#template .editor-notices .notice.notice-warning.inline' ).text() ).toBe( 'Warning: Making changes to active plugins is not recommended.' );
} );

test( 'page from data: a not-writable file shows the plain paragraph and no Update File', async () => {
	const notices = [ { id: 'not-writable', markup: 'You need to make this file writable before you can save your changes.', type: 'none', dismissible: false, place: 'editor' } ];
	const wrapper = await mountEditor( themeEditorData( { notices, save: null, file: { ...themeEditorData().file, writable: false } } ), host(), PLAIN );
	expect( [ wrapper.find( 'form#template > div > p:not(.submit)' ).text(), wrapper.find( 'p.submit' ).exists() ] ).toEqual( [ 'You need to make this file writable before you can save your changes.', false ] );
} );

test( 'page from data: a missing file shows its notice and no form', async () => {
	const notices = [ { id: 'file-missing', markup: 'File does not exist! Please double check the name and try again.', type: 'error', dismissible: false, place: 'editor' } ];
	const wrapper = await mountEditor( themeEditorData( { notices, save: null, docs: null, file: { ...themeEditorData().file, content: '', missing: true } } ), host(), PLAIN );
	expect( [ wrapper.find( '.notice.notice-error' ).text(), wrapper.find( 'form#template' ).exists() ] ).toEqual( [ 'File does not exist! Please double check the name and try again.', false ] );
} );

test( 'page from data: a file that is not valid UTF-8 has no textarea to save over it', async () => {
	const notices = [ { id: 'not-utf8', markup: 'This file is not valid UTF-8, so it cannot be shown or saved in the editor.', type: 'error', dismissible: false, place: 'editor' } ];
	const wrapper = await mountEditor( themeEditorData( { notices, save: null, file: { ...themeEditorData().file, content: null } } ), host(), PLAIN );
	expect( [ wrapper.find( 'textarea#newcontent' ).exists(), wrapper.find( 'p.submit' ).exists() ] ).toEqual( [ false, false ] );
} );

test( 'page from data: a refusal shows the classic text, and no editor', async () => {
	const wrapper = await mountEditor( { kind: 'theme', context: 'site', query: {}, refusal: { status: 403, heading: null, message: 'Sorry, that file cannot be edited.' }, title: 'Edit Themes' }, host(), PLAIN );
	expect( [ wrapper.find( '.wp-admin-file-editor-error p' ).text(), wrapper.find( 'form#template' ).exists() ] ).toEqual( [ 'Sorry, that file cannot be edited.', false ] );
} );

test( 'page from data: the tree under its label, the open file marked current', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	const current = wrapper.find( '#templateside li.current-file a[role="treeitem"]' );
	expect( [ wrapper.find( '#templateside h2#theme-files-label' ).text(), wrapper.find( '#templateside ul[role="tree"]' ).attributes( 'aria-labelledby' ), current.attributes( 'aria-current' ), current.find( '.notice.notice-info' ).text() ] ).toEqual( [
		'Theme Files',
		'theme-files-label',
		'page',
		'Theme Functions(functions.php)',
	] );
} );

test( 'page from data: each tree item has its level, the folders collapsed unless they hold the open file', async () => {
	const tree = [ leaf( 'style.css', 'theme-editor.php?file=style.css' ), folder( 'parts', [ leaf( 'a.php', 'theme-editor.php?file=parts%2Fa.php', { current: true } ) ] ), folder( 'other', [ leaf( 'b.php', 'theme-editor.php?file=other%2Fb.php' ) ] ) ];
	const wrapper = await mountEditor( themeEditorData( { tree } ), host(), PLAIN );
	expect( items( wrapper ).map( ( item ) => [ labelOf( item ), item.attributes( 'aria-level' ), item.attributes( 'aria-expanded' ) ?? null ] ) ).toEqual( [
		[ 'style.css', '2', null ],
		[ 'parts folder', '2', 'true' ],
		[ 'a.php', '3', null ],
		[ 'other folder', '2', 'false' ],
		[ 'b.php', '3', null ],
	] );
} );

test( 'page from data: the plugin tree under Plugin Files', async () => {
	const wrapper = await mountEditor( pluginEditorData(), host(), PLAIN );
	expect( [ wrapper.find( '#templateside h2#plugin-files-label' ).text(), wrapper.find( '#templateside li.current-file a' ).text() ] ).toEqual( [ 'Plugin Files', 'akismet.php' ] );
} );

test( 'tree: clicking a file opens its path through the router', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	await wrapper.find( '#templateside a[role="treeitem"]' ).trigger( 'click' );
	expect( record.navigated ).toEqual( [ '/wp-admin/theme-editor.php?file=style.css&theme=twentytwentyone' ] );
} );

test( 'tree: clicking a folder\'s label opens and closes it', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	const folderItem = () => wrapper.find( '#templateside ul[role="group"] li[role="treeitem"]' );
	await folderItem().find( '.folder-label' ).trigger( 'click' );
	const opened = folderItem().attributes( 'aria-expanded' );
	await folderItem().find( '.folder-label' ).trigger( 'click' );
	expect( [ opened, folderItem().attributes( 'aria-expanded' ) ] ).toEqual( [ 'true', 'false' ] );
} );

test( 'keys: the open file takes the tab stop; Down and Up move between the shown items', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, 'ArrowDown' );
	const down = focusedLabel();
	await key( wrapper, 'ArrowUp' );
	await key( wrapper, 'ArrowUp' );
	expect( [ down, focusedLabel() ] ).toEqual( [ 'template-parts folder', 'Stylesheet(style.css)' ] );
} );

test( 'keys: Right opens a folder and moves into it, Left goes back to the folder and closes it', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, 'ArrowDown' );
	await key( wrapper, 'ArrowRight' );
	await key( wrapper, 'ArrowRight' );
	const inside = focusedLabel();
	await key( wrapper, 'ArrowLeft' );
	await key( wrapper, 'ArrowLeft' );
	expect( [ inside, focusedLabel(), wrapper.find( '#templateside ul[role="group"] li[role="treeitem"]' ).attributes( 'aria-expanded' ) ] ).toEqual( [ 'header.php', 'template-parts folder', 'false' ] );
} );

test( 'keys: Home and End move to the first and the last item', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, 'End' );
	const last = focusedLabel();
	await key( wrapper, 'Home' );
	expect( [ last, focusedLabel() ] ).toEqual( [ 'template-parts folder', 'Stylesheet(style.css)' ] );
} );

test( 'keys: Enter on a folder opens it', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, 'ArrowDown' );
	await key( wrapper, 'Enter' );
	expect( wrapper.find( '#templateside ul[role="group"] li[role="treeitem"]' ).attributes( 'aria-expanded' ) ).toBe( 'true' );
} );

test( 'keys: Enter on a file opens it through the router', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, 'ArrowUp' );
	await key( wrapper, 'Enter' );
	expect( record.navigated ).toEqual( [ '/wp-admin/theme-editor.php?file=style.css&theme=twentytwentyone' ] );
} );

test( 'keys: Space on a file opens it through the router', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	wrapper.find( '#templateside li.current-file a' ).element.focus();
	await key( wrapper, ' ' );
	expect( record.navigated ).toEqual( [ '/wp-admin/theme-editor.php?file=functions.php&theme=twentytwentyone' ] );
} );

test( 'tree: a child theme\'s note links its parent, which opens through the router', async () => {
	const record = host();
	const treeNote = { text: 'This child theme inherits templates from a parent theme, %s.', parent: { label: 'Parent <Theme>', path: 'theme-editor.php?theme=parent' } };
	const wrapper = await mountEditor( themeEditorData( { treeNote } ), record, PLAIN );
	const note = wrapper.find( '#templateside li.howto' );
	await note.find( 'a' ).trigger( 'click' );
	expect( [ note.text(), record.navigated ] ).toEqual( [ 'This child theme inherits templates from a parent theme, Parent <Theme>.', [ '/wp-admin/theme-editor.php?theme=parent' ] ] );
} );

test( 'selector: Select opens the chosen theme through the router', async () => {
	const record = host();
	const wrapper = await mountEditor( themeEditorData(), record, PLAIN );
	await wrapper.find( 'select#theme' ).setValue( 'twentytwentyfive' );
	await wrapper.find( '.fileedit-sub form' ).trigger( 'submit' );
	expect( record.navigated ).toEqual( [ '/wp-admin/theme-editor.php?theme=twentytwentyfive' ] );
} );

test( 'selector: Select opens the chosen plugin through the router', async () => {
	const record = host( { origin: 'http://localhost', pathname: '/wp-admin/plugin-editor.php', search: '' } );
	const wrapper = await mountEditor( pluginEditorData(), record, PLAIN );
	await wrapper.find( 'select#plugin' ).setValue( 'hello.php' );
	await wrapper.find( '.fileedit-sub form' ).trigger( 'submit' );
	expect( record.navigated ).toEqual( [ '/wp-admin/plugin-editor.php?plugin=hello.php' ] );
} );

test( 'docs: the list names the file\'s functions after the placeholder; Look Up waits for a choice', async () => {
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	expect( [ wrapper.find( '#documentation label[for="docs-list"]' ).text(), wrapper.findAll( '#docs-list option' ).map( ( option ) => [ option.attributes( 'value' ), option.text() ] ), wrapper.find( '#docs-lookup' ).attributes( 'disabled' ) ] ).toEqual( [
		'Documentation:',
		[ [ '', 'Function Name…' ], [ 'add_action', 'add_action()' ], [ 'wp_enqueue_style', 'wp_enqueue_style()' ] ],
		'',
	] );
} );

test( 'docs: Look Up opens the chosen function\'s handbook address in a new tab, without an opener', async () => {
	const open = jest.spyOn( window, 'open' ).mockImplementation( () => null );
	const wrapper = await mountEditor( themeEditorData(), host(), PLAIN );
	await wrapper.find( '#docs-list' ).setValue( 'wp_enqueue_style' );
	await wrapper.find( '#docs-lookup' ).trigger( 'click' );
	expect( open.mock.calls ).toEqual( [ [ 'https://api.wordpress.org/core/handbook/1.0/?function=wp_enqueue_style&locale=en_US&version=7.3&redirect=true', '_blank', 'noopener' ] ] );
} );
