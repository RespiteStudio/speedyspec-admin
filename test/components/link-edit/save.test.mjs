/** @jest-environment jsdom */
// The link form (core/link-edit) in edit-link-form.php's markup: the values from the data, the
// focus on Name (link.js), the save (POST links with the fields as the classic form posts them and
// the page's path as the referer, or POST links/{id}), the redirect followed, Visit Link, Delete
// with WordPress's question, the notice, the classic refusals and a failed answer.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import { CONFIRM, addData, editData, host, loadContracts, mountAdd, mountLink, settle } from './data.mjs';

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
} );

const posted = () => api.calls.filter( ( call ) => call.method === 'POST' && call.route.startsWith( 'wp-admin/v1/links' ) );

test( 'fields from data: Edit Link\'s values as text, the classic form and ids, the focus on Name and the body class', async () => {
	const wrapper = await mountLink();
	const form = wrapper.find( 'form#editlink' );
	expect( form.attributes( 'name' ) ).toBe( 'editlink' );
	expect( form.find( '#poststuff #post-body.metabox-holder.columns-2 #post-body-content' ).exists() ).toBe( true );
	expect( wrapper.find( '#namediv.postbox label[for="link_name"]' ).text() ).toBe( 'Name' );
	expect( wrapper.find( '#link_name' ).element.value ).toBe( 'Tom & Jerry' );
	expect( wrapper.find( '#link_name' ).attributes( 'maxlength' ) ).toBe( '255' );
	expect( wrapper.find( '#addressdiv label[for="link_url"]' ).text() ).toBe( 'Web Address' );
	expect( wrapper.find( '#link_url' ).element.value ).toBe( 'https://example.org/?a=1&b=2' );
	expect( wrapper.find( '#addressdiv code' ).text() ).toBe( 'https://wordpress.org/' );
	expect( wrapper.find( '#descriptiondiv label[for="link_description"]' ).text() ).toBe( 'Description' );
	expect( wrapper.find( '#link_description' ).element.value ).toBe( 'A "cartoon" & more' );
	expect( wrapper.find( 'input[name="action"]' ).element.value ).toBe( 'save' );
	expect( wrapper.find( 'input[name="link_id"]' ).element.value ).toBe( '12' );
	expect( wrapper.find( '#publish' ).element.value ).toBe( 'Update Link' );
	expect( document.activeElement ).toBe( wrapper.find( '#link_name' ).element );
	expect( document.body.classList.contains( 'link-php' ) ).toBe( true );
	expect( wrapper.find( 'a.page-title-action' ).attributes( 'href' ) ).toBe( '/wp-admin/link-add.php' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
	wrapper.unmount();
	expect( document.body.classList.contains( 'link-php' ) ).toBe( false );
} );

test( 'fields from data: Add Link\'s form #addlink, prefilled from ?linkurl=&name= as WordPress sends them, no Delete and no Visit Link', async () => {
	const wrapper = await mountAdd( addData( { link: { ...addData().link, name: 'Prefilled <name>', url: 'https://prefill.example/' } } ) );
	expect( wrapper.find( 'form#addlink' ).exists() ).toBe( true );
	expect( wrapper.find( '#link_name' ).element.value ).toBe( 'Prefilled <name>' );
	expect( wrapper.find( '#link_url' ).element.value ).toBe( 'https://prefill.example/' );
	expect( wrapper.find( 'input[name="action"]' ).element.value ).toBe( 'add' );
	expect( wrapper.find( 'input[name="link_id"]' ).exists() ).toBe( false );
	expect( wrapper.find( '#publish' ).element.value ).toBe( 'Add Link' );
	expect( wrapper.find( '#delete-action a' ).exists() ).toBe( false );
	expect( wrapper.find( '#preview-action a' ).exists() ).toBe( false );
} );

test( 'add payload; redirect followed: POST links with the fields as the form posts them and the page\'s path as the referer', async () => {
	api.respondWith( async () => ( { redirect: 'link-add.php?added=true', location: null } ) );
	const record = host( '', '/wp-admin/link-add.php' );
	const wrapper = await mountAdd( addData(), record );
	await wrapper.find( '#link_name' ).setValue( 'Back\\slash & "q"' );
	await wrapper.find( '#link_url' ).setValue( 'https://new.example/' );
	await wrapper.find( '#link_description' ).setValue( 'Desc' );
	await wrapper.find( 'form#addlink' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/links', payload: {
		fields: { link_name: 'Back\\slash & "q"', link_url: 'https://new.example/', link_description: 'Desc', link_rel: '', link_image: '', link_rss: '', link_notes: '', link_rating: '0' },
		referer: 'link-add.php',
	} } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'link-add.php?added=true', location: null }, null ] ] );
	expect( record.refreshed ).toBe( 0 );
} );

test( 'add payload; redirect followed: an answer that leads to the address shown reads the form again', async () => {
	api.respondWith( async () => ( { redirect: 'link-add.php', location: null } ) );
	const record = host( '', '/wp-admin/link-add.php' );
	const wrapper = await mountAdd( addData(), record );
	await wrapper.find( 'form#addlink' ).trigger( 'submit' );
	await settle();
	expect( record.followed ).toHaveLength( 1 );
	expect( record.refreshed ).toBe( 1 );
} );

test( 'private posts N: Keep this link private sends link_visible N, and unchecked sends none', async () => {
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const wrapper = await mountLink( editData( { save: { ...editData().save, private: true } } ) );
	const box = wrapper.find( '#link_private' );
	expect( box.attributes( 'name' ) ).toBe( 'link_visible' );
	expect( box.element.value ).toBe( 'N' );
	expect( box.element.checked ).toBe( true );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( posted()[ 0 ].payload.fields.link_visible ).toBe( 'N' );
	await box.setValue( false );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( Object.hasOwn( posted()[ 1 ].payload.fields, 'link_visible' ) ).toBe( false );
} );

test( 'edit payload: POST links/{id} with every field the form posts, no referer, then the answer is followed', async () => {
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const record = host();
	const wrapper = await mountLink( editData(), record );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toEqual( [ { method: 'POST', route: 'wp-admin/v1/links/12', payload: { fields: {
		link_name: 'Tom & Jerry', link_url: 'https://example.org/?a=1&b=2', link_description: 'A "cartoon" & more',
		link_category: [ '2' ], link_target: '_blank', link_rel: 'friend met',
		link_image: 'https://example.org/i.png', link_rss: 'https://example.org/feed', link_notes: 'Notes & <b>bold</b>', link_rating: '7',
	} } } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'link-manager.php', location: null }, null ] ] );
} );

test( 'edit payload: a second submit while one is on its way is ignored, and Update is disabled meanwhile', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( { redirect: 'link-manager.php', location: null } );
	} ) );
	const wrapper = await mountLink();
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#publish' ).element.disabled ).toBe( true );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( posted() ).toHaveLength( 1 );
	release();
	await settle();
	expect( wrapper.find( '#publish' ).element.disabled ).toBe( false );
} );

test( 'Visit Link href: the link\'s address in a new tab, and none for a script address', async () => {
	const wrapper = await mountLink();
	const visit = wrapper.find( '#minor-publishing-actions #preview-action a.preview.button' );
	expect( visit.text() ).toBe( 'Visit Link' );
	expect( visit.attributes( 'href' ) ).toBe( 'https://example.org/?a=1&b=2' );
	expect( visit.attributes( 'target' ) ).toBe( '_blank' );
	const bad = await mountLink( editData( { save: { ...editData().save, visitUrl: 'javascript:alert(1)' } } ) );
	expect( bad.find( '#preview-action a' ).attributes( 'href' ) ).toBe( '#' );
} );

test( 'delete confirm: dismissed, nothing is sent; accepted, DELETE links/{id} and the answer is followed', async () => {
	const asked = [];
	let answer = false;
	api.respondWith( async () => ( { redirect: 'link-manager.php', location: null } ) );
	const record = host();
	const wrapper = await mountLink( editData(), record, { confirm: ( message ) => {
		asked.push( message );
		return answer;
	} } );
	const link = wrapper.find( '#delete-action a.submitdelete.deletion' );
	expect( link.text() ).toBe( 'Delete' );
	await link.trigger( 'click' );
	await settle();
	expect( asked ).toEqual( [ CONFIRM ] );
	expect( api.calls ).toEqual( [] );
	answer = true;
	await link.trigger( 'click' );
	await settle();
	expect( api.calls ).toEqual( [ { method: 'DELETE', route: 'wp-admin/v1/links/12', payload: undefined } ] );
	expect( record.followed ).toEqual( [ [ { redirect: 'link-manager.php', location: null }, null ] ] );
} );

test( 'the notice: "Link added." in #message, dismissible', async () => {
	const wrapper = await mountAdd( addData( { notice: { markup: 'Link added.' } } ) );
	expect( wrapper.find( '#message' ).classes() ).toEqual( expect.arrayContaining( [ 'updated', 'notice', 'is-dismissible' ] ) );
	expect( wrapper.find( '#message p' ).text() ).toBe( 'Link added.' );
	await wrapper.find( '#message .notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
} );

test( 'die screen: "Link not found." instead of the form, and the load failure\'s own text', async () => {
	const wrapper = await mountLink( { query: { link_id: '99999' }, error: { kind: 'die', status: 500, heading: null, message: 'Link not found.' } } );
	expect( wrapper.find( '.wp-admin-link-edit-error p' ).text() ).toBe( 'Link not found.' );
	expect( wrapper.find( 'form' ).exists() ).toBe( false );
	const failed = await mountLink( { failed: true } );
	expect( failed.find( '.wp-admin-link-edit-failed' ).text() ).toBe( 'The link form could not be loaded.' );
} );

test( 'a failed answer: a refused save says WordPress\'s message in a focused page notice, keeps the values and enables the button', async () => {
	api.respondWith( async () => {
		throw Object.assign( new Error( 'Link not found.' ), { status: 404, code: 'link_missing' } );
	} );
	const record = host();
	const wrapper = await mountLink( editData(), record );
	await wrapper.find( '#link_name' ).setValue( 'Typed' );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	expect( record.added.map( ( notice ) => [ notice.type, notice.message ] ) ).toEqual( [ [ 'error', 'Link not found.' ] ] );
	expect( record.spoken ).toEqual( [ 'Link not found.' ] );
	expect( document.activeElement?.id ).toBe( noticeElementId( 'notice-1' ) );
	expect( wrapper.find( '#link_name' ).element.value ).toBe( 'Typed' );
	expect( wrapper.find( '#publish' ).element.disabled ).toBe( false );
	expect( record.followed ).toEqual( [] );
} );

test( 'a failed answer: WordPress unreachable says so, and a refused delete is said too', async () => {
	api.respondWith( async ( method ) => {
		throw method === 'POST' ? Object.assign( new Error( '' ), { status: 0, code: 'admin_upstream_unreachable' } ) : Object.assign( new Error( 'Fixture failure.' ), { status: 500, code: 'fixture_failure' } );
	} );
	const record = host();
	const wrapper = await mountLink( editData(), record, { confirm: () => true } );
	await wrapper.find( 'form#editlink' ).trigger( 'submit' );
	await settle();
	await wrapper.find( '#delete-action a' ).trigger( 'click' );
	await settle();
	expect( record.added.map( ( notice ) => notice.message ) ).toEqual( [ 'WordPress cannot be reached right now. Please try again in a moment.', 'Fixture failure.' ] );
	expect( record.followed ).toEqual( [] );
} );

test( 'name as text: a link named <img onerror> runs nothing in the fields', async () => {
	const evil = '<img src=x onerror="window.__ran=1">';
	const wrapper = await mountLink( editData( { link: { ...editData().link, name: evil, description: evil, notes: evil } } ) );
	expect( wrapper.find( '#link_name' ).element.value ).toBe( evil );
	expect( wrapper.find( '#link_notes' ).element.value ).toBe( evil );
	expect( wrapper.find( 'form img' ).exists() ).toBe( false );
	expect( window.__ran ).toBeUndefined();
	delete window.__ran;
} );
