/** @jest-environment jsdom */
// The term edit form (core/term-edit), in edit-tag-form.php's markup: the values and the parent
// dropdown from the data, the save (POST terms/{id} with the core fields and the page's path as
// the referer, the redirect followed in place of the entry), the message with its back link, the
// classic refusals, a failed save, ajax-response.js's validateForm() on an empty name, and names
// that run nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { PATH, dieData, host, loadContracts, mountTerm, parentOf, settle, termData } from './data.mjs';

const SAVE = 'wp-admin/v1/terms/5';
const ANSWER = { redirect: 'term.php?taxonomy=category&tag_ID=5&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory%26s%3Djazz&message=3', location: null };

beforeEach( async () => {
	api.reset();
	await loadContracts();
	// The page logs a refused request; the tests read what it shows instead.
	jest.spyOn( console, 'warn' ).mockImplementation( () => {} );
} );
afterEach( () => {
	jest.restoreAllMocks();
	delete window.__ran;
	resetContracts();
	document.body.className = '';
	document.body.innerHTML = '';
} );

const posted = () => api.calls.filter( ( call ) => call.method === 'POST' );
const rowClasses = ( wrapper ) => wrapper.findAll( '#edittag table.form-table > tbody > tr' ).map( ( tr ) => tr.classes().find( ( name ) => name.startsWith( 'term-' ) ) );

test( 'fields from data; parent options: the values as text, the rows in classic order, the parent select without the term, its parent selected, body classes and focus', async () => {
	const wrapper = await mountTerm();
	const form = wrapper.find( 'form#edittag' );
	expect( form.attributes( 'name' ) ).toBe( 'edittag' );
	expect( form.classes() ).toContain( 'validate' );
	expect( wrapper.find( 'table.form-table' ).attributes( 'role' ) ).toBe( 'presentation' );
	expect( rowClasses( wrapper ) ).toEqual( [ 'term-name-wrap', 'term-slug-wrap', 'term-parent-wrap', 'term-description-wrap' ] );
	expect( wrapper.find( '.term-name-wrap' ).classes() ).toEqual( [ 'form-field', 'form-required', 'term-name-wrap' ] );

	expect( wrapper.find( '#name' ).element.value ).toBe( 'Jazz & Blues' );
	expect( wrapper.find( '#name' ).attributes( 'aria-required' ) ).toBe( 'true' );
	expect( wrapper.find( '#slug' ).element.value ).toBe( 'jazz' );
	expect( wrapper.find( 'textarea#description' ).element.value ).toBe( 'All that "jazz" & more' );
	expect( wrapper.find( 'label[for="name"]' ).text() ).toBe( 'Name' );
	expect( wrapper.find( 'label[for="slug"]' ).text() ).toBe( 'Slug' );
	expect( wrapper.find( 'label[for="parent"]' ).text() ).toBe( 'Parent Category' );
	expect( wrapper.find( 'label[for="description"]' ).text() ).toBe( 'Description' );
	expect( wrapper.find( '#slug-description' ).text() ).toBe( 'The “slug” is the URL-friendly version of the name. It is usually all lowercase and contains only letters, numbers, and hyphens.' );
	expect( wrapper.find( '#parent-description' ).text() ).toMatch( /^Categories, unlike tags, can have a hierarchy\./ );

	const options = wrapper.findAll( '#parent option' ).map( ( option ) => [ option.attributes( 'value' ), option.element.textContent, option.element.className ] );
	expect( options ).toEqual( [ [ '-1', 'None', '' ], [ '3', 'Music', 'level-0' ], [ '4', '   Rock', 'level-1' ], [ '9', 'Other', 'level-0' ] ] );
	expect( wrapper.find( '#parent' ).element.value ).toBe( '3' );
	expect( wrapper.find( '#parent' ).attributes( 'aria-describedby' ) ).toBe( 'parent-description' );

	expect( wrapper.find( 'input[name="tag_ID"]' ).element.value ).toBe( '5' );
	expect( wrapper.find( 'input[name="taxonomy"]' ).element.value ).toBe( 'category' );
	expect( wrapper.find( '.edit-tag-actions input[type="submit"]' ).element.value ).toBe( 'Update' );
	expect( wrapper.find( '.edit-tag-actions input[type="submit"]' ).classes() ).toEqual( [ 'button', 'button-primary' ] );
	expect( document.body.classList.contains( 'term-php' ) ).toBe( true );
	expect( document.body.classList.contains( 'taxonomy-category' ) ).toBe( true );
	expect( document.activeElement ).toBe( wrapper.find( '#name' ).element );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
	expect( wrapper.find( '#ajax-response' ).exists() ).toBe( true );

	wrapper.unmount();
	expect( document.body.classList.contains( 'term-php' ) ).toBe( false );
} );

test( 'fields from data: no focus when WordPress says the device is mobile', async () => {
	const wrapper = await mountTerm( termData( { focusName: false } ) );
	expect( document.activeElement ).not.toBe( wrapper.find( '#name' ).element );
} );

test( 'no parent row: a flat taxonomy has no parent row, and its save sends no parent', async () => {
	const wrapper = await mountTerm( termData( { taxonomy: { name: 'post_tag', hierarchical: false, labels: { name: 'Tags', editItem: 'Edit Tag', parentItem: null, backToItems: '← Go to Tags' } }, fields: { parent: null } } ) );
	expect( wrapper.find( '.term-parent-wrap' ).exists() ).toBe( false );
	expect( rowClasses( wrapper ) ).toEqual( [ 'term-name-wrap', 'term-slug-wrap', 'term-description-wrap' ] );
	api.respondWith( async () => ANSWER );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( Object.keys( posted()[ 0 ].payload ).sort() ).toEqual( [ 'description', 'name', 'referer', 'slug', 'taxonomy' ] );
	expect( posted()[ 0 ].payload.taxonomy ).toBe( 'post_tag' );
} );

test( 'save payload and redirect followed: the core fields, the page path as referer, then the redirect in place of the entry', async () => {
	api.respondWith( async () => ANSWER );
	const wrapper = await mountTerm();
	await wrapper.find( '#name' ).setValue( 'Jazz renamed' );
	await wrapper.find( '#slug' ).setValue( 'jazz-renamed' );
	await wrapper.find( '#parent' ).setValue( '9' );
	await wrapper.find( '#description' ).setValue( 'New words' );
	await wrapper.find( '.edit-tag-actions input[type="submit"]' ).trigger( 'click' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( posted()[ 0 ].route ).toBe( SAVE );
	expect( posted()[ 0 ].payload ).toEqual( { taxonomy: 'category', name: 'Jazz renamed', slug: 'jazz-renamed', parent: 9, description: 'New words', referer: PATH } );
	expect( wrapper.record.followed ).toEqual( [ [ ANSWER, { replace: true } ] ] );
} );

test( 'same address, so router.refresh(): an answer that leads to the address shown reads the page again', async () => {
	const record = host();
	record.refreshed = 0;
	record.provide.router.refresh = async () => {
		record.refreshed++;
	};
	// The second Update: the page is on the message's address, and the answer leads there again.
	const shownAt = ANSWER.redirect;
	record.provide.pageLocation = { origin: 'http://localhost', pathname: '/wp-admin/term.php', search: '?' + shownAt.split( '?' )[ 1 ] };
	api.respondWith( async () => ANSWER );
	const wrapper = await mountTerm( termData(), record );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( wrapper.record.followed ).toEqual( [ [ ANSWER, { replace: true } ] ] );
	expect( record.refreshed ).toBe( 1 );
} );

test( 'another address: the answer is followed and the page is not read twice', async () => {
	const record = host();
	record.refreshed = 0;
	record.provide.router.refresh = async () => {
		record.refreshed++;
	};
	api.respondWith( async () => ANSWER );
	const wrapper = await mountTerm( termData(), record );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( wrapper.record.followed ).toHaveLength( 1 );
	expect( record.refreshed ).toBe( 0 );
} );

test( 'save payload: None sends -1, and a parent dropdown a plugin filtered is read from the form', async () => {
	api.respondWith( async () => ANSWER );
	const wrapper = await mountTerm();
	await wrapper.find( '#parent' ).setValue( '-1' );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( posted()[ 0 ].payload.parent ).toBe( -1 );

	api.reset();
	api.respondWith( async () => ANSWER );
	const html = '<select name="parent" id="parent" class="postform acme"><option value="-1">None</option><option value="3">Music</option><option value="9" selected="selected">Other</option></select>';
	const filtered = await mountTerm( termData( { fields: { parent: { ...parentOf( [ [ 3, 'Music' ], [ 9, 'Other' ] ], '9' ), html } } } ), host(), {
		formEntries: ( form ) => [ ...form.querySelectorAll( 'select, input, textarea' ) ].filter( ( control ) => control.name ).map( ( control ) => [ control.name, control.value ] ),
	} );
	expect( filtered.find( 'select.acme' ).exists() ).toBe( true );
	filtered.find( 'select.acme' ).element.value = '3';
	await filtered.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( posted()[ 0 ].payload.parent ).toBe( 3 );
} );

test( 'save payload: a second submit while one is on its way is ignored', async () => {
	let finish;
	api.respondWith( () => new Promise( ( resolve ) => {
		finish = resolve;
	} ) );
	const wrapper = await mountTerm();
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	expect( wrapper.find( '.edit-tag-actions input[type="submit"]' ).element.disabled ).toBe( true );
	finish( ANSWER );
	await settle();
	expect( wrapper.record.followed ).toHaveLength( 1 );
} );

test( 'an empty name: validateForm() marks the row, nothing is sent, and a change of the name clears the mark', async () => {
	const wrapper = await mountTerm();
	await wrapper.find( '#name' ).setValue( '' );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toEqual( [] );
	expect( wrapper.find( '.term-name-wrap' ).classes() ).toContain( 'form-invalid' );
	await wrapper.find( '#name' ).setValue( 'Back' );
	await wrapper.find( '#name' ).trigger( 'change' );
	expect( wrapper.find( '.term-name-wrap' ).classes() ).not.toContain( 'form-invalid' );
} );

test( 'back link: the message in #message with the back link the data gives, opened in the admin', async () => {
	const wrapper = await mountTerm( termData( { message: { markup: 'Category updated.', type: 'success', back: { label: '← Go to Categories', path: 'edit-tags.php?taxonomy=category&s=jazz&paged=2', url: null } } } ) );
	const message = wrapper.find( 'div#message' );
	expect( message.classes() ).toEqual( [ 'notice', 'notice-success' ] );
	expect( message.findAll( 'p' ) ).toHaveLength( 2 );
	expect( message.find( 'p strong' ).text() ).toBe( 'Category updated.' );
	const back = message.find( 'p a' );
	expect( back.text() ).toBe( '← Go to Categories' );
	expect( back.attributes( 'href' ) ).toBe( '/wp-admin/edit-tags.php?taxonomy=category&s=jazz&paged=2' );

	const away = await mountTerm( termData( { message: { markup: 'Category updated.', type: 'success', back: { label: '← Go to Categories', path: null, url: 'https://example.org/elsewhere/' } } } ) );
	expect( away.find( '#message p a' ).attributes( 'href' ) ).toBe( 'https://example.org/elsewhere/' );

	const none = await mountTerm( termData( { message: { markup: 'Category updated.', type: 'success', back: null } } ) );
	expect( none.findAll( '#message p' ) ).toHaveLength( 1 );
} );

test( 'error message type: an error message shows as notice-error', async () => {
	const wrapper = await mountTerm( termData( { message: { markup: 'Category not updated.', type: 'error', back: null } } ) );
	expect( wrapper.find( 'div#message' ).classes() ).toEqual( [ 'notice', 'notice-error' ] );
	expect( wrapper.find( '#message strong' ).text() ).toBe( 'Category not updated.' );
} );

test( 'die screen: the classic refusal shows instead of the form, with its heading', async () => {
	const missing = await mountTerm( dieData( 500, 'You attempted to edit an item that does not exist. Perhaps it was deleted?' ) );
	expect( missing.find( 'form#edittag' ).exists() ).toBe( false );
	expect( missing.find( '.wp-admin-term-edit-error p' ).text() ).toBe( 'You attempted to edit an item that does not exist. Perhaps it was deleted?' );
	expect( missing.find( '.wp-admin-term-edit-error h2' ).exists() ).toBe( false );

	const refused = await mountTerm( dieData( 403, 'Sorry, you are not allowed to edit this item.', 'You need a higher level of permission.' ) );
	expect( refused.find( '.wp-admin-term-edit-error h2' ).text() ).toBe( 'You need a higher level of permission.' );
	expect( refused.find( '.wp-admin-term-edit-error p' ).text() ).toBe( 'Sorry, you are not allowed to edit this item.' );
} );

test( 'a failed answer: WordPress\'s message in a page notice, spoken and focused; the values stay and Update is enabled again', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Plugin stopped it.' ), { status: 500, code: 'term_write_died' } );
	} );
	const wrapper = await mountTerm();
	await wrapper.find( '#name' ).setValue( 'Not saved' );
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( wrapper.record.added.map( ( notice ) => [ notice.type, notice.message, notice.scope ] ) ).toEqual( [ [ 'error', 'Plugin stopped it.', 'page' ] ] );
	expect( wrapper.record.spoken ).toEqual( [ 'Plugin stopped it.' ] );
	expect( document.activeElement.id ).toBe( 'wp-admin-notice-1' );
	expect( wrapper.find( '#name' ).element.value ).toBe( 'Not saved' );
	expect( wrapper.find( '.edit-tag-actions input[type="submit"]' ).element.disabled ).toBe( false );
	expect( wrapper.record.followed ).toEqual( [] );
} );

test( 'a failed answer with no text of its own says the generic one', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( '' ), { status: 500, code: 'term_write_failed' } );
	} );
	const wrapper = await mountTerm();
	await wrapper.find( 'form#edittag' ).trigger( 'submit' );
	await settle();
	expect( wrapper.record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'An error occurred while processing your request. Please try again later.' ] );
} );

test( 'a failed answer while WordPress cannot be reached (or timed out) says so', async () => {
	for ( const code of [ 'admin_upstream_unreachable', 'admin_upstream_timeout' ] ) {
		api.respondWith( async () => {
			throw Object.assign( new Error( '' ), { status: 502, code } );
		} );
		const wrapper = await mountTerm();
		await wrapper.find( 'form#edittag' ).trigger( 'submit' );
		await settle();
		expect( wrapper.record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'WordPress cannot be reached right now. Please try again in a moment.' ] );
		wrapper.unmount();
	}
} );

test( 'values as text: a name, description and parent label holding markup are values and option text, and run nothing', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const script = '<script>window.__ran=2</script>';
	const wrapper = await mountTerm( termData( {
		term: { id: 5, name: evil, slug: 'img', description: script, parent: 0 },
		fields: { parent: { options: [ { value: '-1', label: 'None', level: null }, { value: '7', label: evil, level: 0 } ], html: null, selected: null } },
	} ) );
	expect( wrapper.find( '#name' ).element.value ).toBe( evil );
	expect( wrapper.find( '#description' ).element.value ).toBe( script );
	expect( wrapper.find( '#parent option[value="7"]' ).text() ).toBe( evil );
	expect( wrapper.find( '#parent' ).element.value ).toBe( '-1' );
	expect( document.querySelectorAll( '#edittag img, #edittag script' ).length ).toBe( 0 );
	expect( window.__ran ).toBeUndefined();
} );
