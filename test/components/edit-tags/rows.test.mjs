/** @jest-environment jsdom */
// The terms list page (core/edit-tags) as WordPress's data describes it: the body classes, the
// search subtitle and empty state, the caption, the pagination, the levels and pads, Screen
// Options, the checkboxes, the notes, the row actions and their links, the count links, the
// messages, the die screen, the add form only with `addForm`, plugin cells, row actions and views,
// and names that run nothing (WP_Terms_List_Table, wp-admin/edit-tags.php).
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { column, loadContracts, mountTerms, pagination, row, rowIds, settle, termsData } from './data.mjs';

// jsdom cannot navigate: a click on a link is stopped at the document, after the page has seen it.
const stopNavigation = ( event ) => event.preventDefault();
const bodyClass = document.body.className;

beforeEach( async () => {
	document.addEventListener( 'click', stopNavigation );
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.removeEventListener( 'click', stopNavigation );
	document.body.className = bodyClass;
	delete window.__ran;
	resetContracts();
} );

test( 'body classes from data, while the page is shown', async () => {
	const wrapper = await mountTerms( termsData( { bodyClasses: [ 'edit-tags-php', 'taxonomy-detached-topic' ] } ) );
	expect( document.body.classList.contains( 'edit-tags-php' ) ).toBe( true );
	expect( document.body.classList.contains( 'taxonomy-detached-topic' ) ).toBe( true );
	wrapper.unmount();
	expect( document.body.classList.contains( 'taxonomy-detached-topic' ) ).toBe( false );
} );

test( 'search subtitle and noItems: the searched words as text, and the list\'s own not-found text', async () => {
	const wrapper = await mountTerms( termsData( { heading: { title: 'Categories', search: '<b>x</b>' }, items: [], pagination: pagination( 0 ), noItems: 'No categories found.' } ) );
	expect( wrapper.find( '.subtitle' ).text() ).toBe( 'Search results for: <b>x</b>' );
	expect( wrapper.find( '.subtitle strong' ).text() ).toBe( '<b>x</b>' );
	expect( wrapper.find( '#the-list tr.no-items td' ).text() ).toBe( 'No categories found.' );
	// The search box is its own GET form, with the list's hidden fields.
	const form = wrapper.find( 'form.search-form' );
	expect( form.attributes( 'method' ) ).toBe( 'get' );
	expect( form.find( '#tag-search-input' ).exists() ).toBe( true );
	expect( form.findAll( 'input[type="hidden"]' ).map( ( input ) => [ input.attributes( 'name' ), input.element.value ] ) ).toEqual( [ [ 'taxonomy', 'category' ], [ 'post_type', 'post' ] ] );
} );

test( 'a search navigates to edit-tags.php with the search form\'s fields', async () => {
	const navigated = [];
	const wrapper = await mountTerms( termsData(), { router: { navigate: async ( url ) => navigated.push( url ), follow: async () => true, refresh: async () => {} } } );
	await wrapper.find( '#tag-search-input' ).setValue( 'jazz' );
	await wrapper.find( '#search-submit' ).trigger( 'click' );
	await settle();
	expect( navigated ).toEqual( [ '/wp-admin/edit-tags.php?taxonomy=category&post_type=post&s=jazz' ] );
} );

test( 'caption from data, and the list form posts (method post) with its hidden fields', async () => {
	const wrapper = await mountTerms( termsData( { caption: 'Table ordered by Name. Descending.' } ) );
	expect( wrapper.find( 'table.wp-list-table caption' ).text() ).toBe( 'Table ordered by Name. Descending.' );
	expect( wrapper.find( 'form#posts-filter' ).attributes( 'method' ) ).toBe( 'post' );
	expect( wrapper.find( 'table.wp-list-table' ).classes() ).toEqual( [ 'wp-list-table', 'widefat', 'fixed', 'striped', 'table-view-list', 'tags' ] );
} );

test( 'pagination navigates through the router: the links, and the page typed', async () => {
	const navigated = [];
	const links = { first: null, prev: null, next: 'edit-tags.php?taxonomy=detached_genre&paged=2', last: 'edit-tags.php?taxonomy=detached_genre&paged=3' };
	const wrapper = await mountTerms( termsData( { pagination: { total: 6, totalText: '6 items', perPage: 2, page: 1, pages: 3, pagesText: '3', links } } ), { router: { navigate: async ( url ) => navigated.push( url ), follow: async () => true, refresh: async () => {} } } );
	expect( wrapper.find( '.tablenav.top .next-page' ).attributes( 'href' ) ).toBe( '/wp-admin/edit-tags.php?taxonomy=detached_genre&paged=2' );
	expect( wrapper.find( '.tablenav.top .last-page' ).attributes( 'href' ) ).toBe( '/wp-admin/edit-tags.php?taxonomy=detached_genre&paged=3' );
	const input = wrapper.find( '#current-page-selector' );
	await input.setValue( '3' );
	await input.trigger( 'keydown', { key: 'Enter' } );
	expect( navigated ).toEqual( [ '/wp-admin/edit-tags.php?taxonomy=detached_genre&paged=3' ] );
} );

test( 'pads and level classes come from the row: the name is shown as WordPress padded it', async () => {
	const wrapper = await mountTerms( termsData( { items: [ row( 7 ), row( 8, { level: 1, parent: 7 } ), row( 9, { level: 2, parent: 8 } ) ] } ) );
	expect( wrapper.find( '#tag-8' ).classes() ).toContain( 'level-1' );
	expect( wrapper.find( '#tag-9' ).classes() ).toContain( 'level-2' );
	expect( wrapper.find( '#tag-7 .row-title' ).text() ).toBe( 'Term 7' );
	expect( wrapper.find( '#tag-9 .row-title' ).element.textContent ).toBe( '— —  Term 9' );
} );

test( 'Screen Options per page and columns: offered from the data, saved for the screen of the taxonomy', async () => {
	let offered = null;
	const refreshed = [];
	const perPage = { option: 'edit_detached-topic_per_page', value: 20, label: 'Number of items per page:', min: 1, max: 999 };
	const data = termsData( {
		query: { taxonomy: 'detached-topic' }, taxonomy: { ...termsData().taxonomy, name: 'detached-topic' },
		screenOptions: { tableColumns: [ { key: 'description', label: 'Description', hidden: false } ], legend: 'Columns', perPage, viewMode: null, settingsHtml: null },
	} );
	const wrapper = await mountTerms( data, {
		screenOptions: { set: ( options ) => {
			offered = options;
			return () => {};
		} },
		router: { navigate: async () => true, follow: async () => true, refresh: async () => refreshed.push( true ) },
	} );
	expect( offered.pagination ).toEqual( perPage );
	await offered.onApply( { perPage: 7 } );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/edit-detached-topic', payload: { perPage: 7, referer: 'edit-tags.php?taxonomy=category' } } ] );
	expect( refreshed ).toEqual( [ true ] );

	api.reset();
	await offered.onChange( 'hide-column', { key: 'description', hidden: true } );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/screen-preferences/edit-detached-topic', payload: { columnsHidden: [ 'description' ] } } ] );
	expect( wrapper.find( 'thead th#description' ).classes() ).toContain( 'hidden' );
} );

test( 'no checkbox when not selectable: the default category has none and no Delete', async () => {
	const fixed = row( 1, { name: 'Uncategorized', selectable: false } );
	fixed.actions = fixed.actions.filter( ( action ) => action.action !== 'delete' );
	const wrapper = await mountTerms( termsData( { items: [ row( 7 ), fixed ] } ) );
	expect( wrapper.find( '#tag-7 input[type="checkbox"]' ).attributes( 'name' ) ).toBe( 'delete_tags[]' );
	expect( wrapper.find( '#tag-1 input[type="checkbox"]' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-1 .row-actions .delete' ).exists() ).toBe( false );
} );

test( 'notes from data: the default category\'s note, and the converter\'s link opens inside the admin', async () => {
	const notes = {
		defaultCategory: { html: 'The default category <strong>Uncategorized</strong> cannot be deleted.' },
		converter: { text: 'Categories can be selectively converted to tags using the <a href="import.php">category to tag converter</a>.', path: 'import.php' },
	};
	const wrapper = await mountTerms( termsData( { notes } ) );
	const paragraphs = wrapper.findAll( '.form-wrap.edit-term-notes p' );
	expect( paragraphs.map( ( p ) => p.text() ) ).toEqual( [ 'The default category Uncategorized cannot be deleted.', 'Categories can be selectively converted to tags using the category to tag converter.' ] );
	expect( paragraphs[ 0 ].find( 'strong' ).text() ).toBe( 'Uncategorized' );
	expect( paragraphs[ 1 ].find( 'a' ).attributes( 'href' ) ).toBe( '/wp-admin/import.php' );

	const plugin = await mountTerms( termsData( { notes: { defaultCategory: null, converter: { text: 'Tags can be converted using the <a href="admin.php?import=wpcat2tag">tag to category converter</a>.', path: 'admin.php?import=wpcat2tag' } } } ) );
	expect( plugin.find( '.edit-term-notes a' ).attributes( 'href' ) ).toBe( '/wp-admin/admin.php?import=wpcat2tag' );

	const none = await mountTerms( termsData() );
	expect( none.find( '.edit-term-notes' ).exists() ).toBe( false );
} );

test( 'editUrl: the name link and Edit open the term edit screen the data names, through the admin', async () => {
	const wrapper = await mountTerms();
	const url = '/wp-admin/term.php?taxonomy=category&tag_ID=7&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory';
	expect( wrapper.find( '#tag-7 a.row-title' ).attributes( 'href' ) ).toBe( url );
	expect( wrapper.find( '#tag-7 .row-actions .edit a' ).attributes( 'href' ) ).toBe( url );
	expect( wrapper.find( '#tag-7 .row-actions .edit a' ).attributes( 'aria-label' ) ).toBe( 'Edit “Term 7”' );
	// No edit link: the name is not a link.
	const unlinked = row( 7 );
	unlinked.name = { html: ' Term 7', pad: 0, editUrl: null };
	const plain = await mountTerms( termsData( { items: [ unlinked ] } ) );
	expect( plain.find( '#tag-7 a.row-title' ).exists() ).toBe( false );
	expect( plain.find( '#tag-7 .column-name strong' ).text() ).toBe( 'Term 7' );
} );

test( 'View newTab: the archive opens in a new tab, only http(s); no View when the data has none', async () => {
	const wrapper = await mountTerms();
	const view = wrapper.find( '#tag-7 .row-actions .view a' );
	expect( view.attributes( 'href' ) ).toBe( 'http://localhost:8889/category/term-7/' );
	expect( view.attributes( 'target' ) ).toBe( '_blank' );
	expect( view.attributes( 'aria-label' ) ).toBe( 'View “Term 7” archive' );
	const bad = row( 8 );
	bad.actions = bad.actions.map( ( action ) => ( action.action === 'view' ? { ...action, url: 'javascript:alert(1)' } : action ) );
	const none = row( 9 );
	none.actions = none.actions.filter( ( action ) => action.action !== 'view' );
	const other = await mountTerms( termsData( { items: [ bad, none ] } ) );
	expect( other.find( '#tag-8 .row-actions .view a' ).attributes( 'href' ) ).toBe( '#' );
	expect( other.find( '#tag-9 .row-actions .view' ).exists() ).toBe( false );
	expect( other.findAll( '#tag-9 .row-actions > span' ).map( ( span ) => span.classes().join( ' ' ) ) ).toEqual( [ 'edit', 'inline hide-if-no-js', 'delete' ] );
} );

test( 'count link: the posts list, the Media list or the Links list the data names; a count without a link is text', async () => {
	const items = [
		row( 7, { count: { text: '3', url: 'edit.php?category_name=term-7' } } ),
		row( 8, { count: { text: '2', url: 'upload.php?detached_media_tag=term-8&post_type=attachment' } } ),
		row( 9, { count: { text: '0', url: null } } ),
	];
	const wrapper = await mountTerms( termsData( { items } ) );
	expect( wrapper.find( '#tag-7 .column-posts a' ).attributes( 'href' ) ).toBe( '/wp-admin/edit.php?category_name=term-7' );
	expect( wrapper.find( '#tag-7 .column-posts a' ).text() ).toBe( '3' );
	expect( wrapper.find( '#tag-8 .column-posts a' ).attributes( 'href' ) ).toBe( '/wp-admin/upload.php?detached_media_tag=term-8&post_type=attachment' );
	expect( wrapper.find( '#tag-9 .column-posts a' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-9 .column-posts' ).text() ).toBe( '0' );

	const links = await mountTerms( termsData( {
		columns: [ column( 'cb', '' ), column( 'name', 'Name', { primary: true } ), column( 'links', 'Links', { num: true } ) ],
		items: [ row( 5, { count: { text: '4', url: 'link-manager.php?cat_id=5' } } ) ],
	} ) );
	expect( links.find( '#tag-5 .column-links a' ).attributes( 'href' ) ).toBe( '/wp-admin/link-manager.php?cat_id=5' );
} );

test( 'messages notice: the message of the redirect, with its class, dismissible', async () => {
	const wrapper = await mountTerms( termsData( { messages: [ { markup: 'Category added.', type: 'updated' } ] } ) );
	expect( wrapper.find( '#message' ).classes() ).toEqual( [ 'updated', 'notice', 'is-dismissible' ] );
	expect( wrapper.find( '#message p' ).text() ).toBe( 'Category added.' );
	await wrapper.find( '#message .notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );

	const error = await mountTerms( termsData( { messages: [ { markup: 'Category not added.', type: 'error' } ] } ) );
	expect( error.find( '#message' ).classes() ).toEqual( [ 'error', 'notice', 'is-dismissible' ] );
} );

test( 'die screen: the classic heading and text, and no list', async () => {
	const wrapper = await mountTerms( { query: { taxonomy: 'nope' }, taxonomy: null, error: { kind: 'die', status: 500, heading: null, message: 'Invalid taxonomy.' } } );
	expect( wrapper.find( '.wp-admin-edit-tags-error p' ).text() ).toBe( 'Invalid taxonomy.' );
	expect( wrapper.find( '.wp-admin-edit-tags-error h2' ).exists() ).toBe( false );
	expect( wrapper.find( '#posts-filter' ).exists() ).toBe( false );

	const higher = await mountTerms( { query: { taxonomy: 'category' }, taxonomy: null, error: { kind: 'die', status: 403, heading: 'You need a higher level of permission.', message: 'Sorry, you are not allowed to manage terms in this taxonomy.' } } );
	expect( higher.find( '.wp-admin-edit-tags-error h2' ).text() ).toBe( 'You need a higher level of permission.' );
} );

test( 'no add form without addForm: no #col-left, no Quick Edit, no checkboxes when the data says so', async () => {
	const plain = row( 7, { selectable: false, inline: null } );
	plain.actions = plain.actions.filter( ( action ) => action.action === 'view' );
	const wrapper = await mountTerms( termsData( { addForm: null, inlineEdit: null, bulkActions: [], items: [ plain ] } ) );
	expect( wrapper.find( '#col-left' ).exists() ).toBe( false );
	expect( wrapper.find( '#col-container' ).exists() ).toBe( false );
	expect( wrapper.find( '#addtag' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-7 .editinline' ).exists() ).toBe( false );
	expect( wrapper.find( '#tag-7 input[type="checkbox"]' ).exists() ).toBe( false );
	expect( wrapper.find( '#inline-edit' ).exists() ).toBe( false );
	expect( wrapper.find( '#posts-filter' ).exists() ).toBe( true );

	const full = await mountTerms();
	expect( full.find( '#col-container #col-left #addtag' ).exists() ).toBe( true );
	expect( full.find( '#col-container #col-right #posts-filter' ).exists() ).toBe( true );
} );

test( 'plugin cells, actionsHtml, viewsHtml and the after-table hook show as printed, scripts included', async () => {
	const items = [ row( 7, {
		cells: { detached_fixture: { html: 'term-7<script>window.__ran = ( window.__ran || 0 ) + 1;</script>', error: false } },
		actionsHtml: '<span class=\'edit\'><a href="term.php?tag_ID=7">Edit</a> | </span><span class=\'detached_fixture_term\'><a class="detached-fixture-term-action" href="edit-tags.php?taxonomy=category&amp;detached_fixture_term_action=7">Fixture term action</a></span>',
		coreActions: [ 'edit' ],
	} ) ];
	const wrapper = await mountTerms( termsData( {
		columns: [ ...termsData().columns, column( 'detached_fixture', 'Fixture term', { core: false } ) ],
		items,
		viewsHtml: { fixture: '<a href="edit-tags.php?taxonomy=category&amp;detached_fixture_view=1">Fixture view</a>' },
		afterTableHtml: '<div class="detached-fixture-after-table">Fixture after-table</div>',
	} ) );
	await settle();
	// The cell's text, its script left out.
	const cell = wrapper.find( '#tag-7 .column-detached_fixture' ).element.cloneNode( true );
	cell.querySelectorAll( 'script, button' ).forEach( ( node ) => node.remove() );
	expect( cell.textContent.trim() ).toBe( 'term-7' );
	expect( window.__ran ).toBe( 1 );
	expect( wrapper.find( '#tag-7 .row-actions .detached-fixture-term-action' ).text() ).toBe( 'Fixture term action' );
	expect( wrapper.find( '.subsubsub li.fixture a' ).text() ).toBe( 'Fixture view' );
	expect( wrapper.find( '.detached-fixture-after-table' ).text() ).toBe( 'Fixture after-table' );
} );

test( 'names through InertHtml: a name holding markup is text in the list, Quick Edit, the parent select and the note, and runs nothing', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const escaped = '&lt;img src=x onerror=&quot;window.__ran=1&quot;&gt;';
	const named = row( 7, { inline: { name: evil, slug: 'img', parent: 0 }, rowHeaderLabel: evil, checkboxLabel: 'Select ' + evil } );
	named.name = { html: ' ' + escaped, pad: 0, editUrl: 'term.php?tag_ID=7' };
	const items = [ named ];
	const data = termsData( {
		items,
		addForm: { ...termsData().addForm, parent: { options: [ { value: '-1', label: 'None', level: null }, { value: '7', label: evil, level: 0 } ], html: null, selected: null } },
		notes: { defaultCategory: { html: 'The default category <strong>' + escaped + '</strong> cannot be deleted.' }, converter: null },
	} );
	const wrapper = await mountTerms( data );
	await settle();
	expect( wrapper.find( '#tag-7 .row-title' ).text() ).toBe( evil );
	expect( wrapper.find( '#tag-7 img' ).exists() ).toBe( false );
	expect( wrapper.find( '#parent option[value="7"]' ).text() ).toBe( evil );
	expect( wrapper.find( '.edit-term-notes strong' ).text() ).toBe( evil );
	await wrapper.find( '#tag-7 .row-actions .editinline' ).trigger( 'click' );
	await settle();
	expect( wrapper.find( '#edit-7 input[name="name"]' ).element.value ).toBe( evil );
	expect( document.querySelectorAll( 'img' ).length ).toBe( 0 );
	expect( window.__ran ).toBeUndefined();
} );
