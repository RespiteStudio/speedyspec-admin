/** @jest-environment jsdom */
// The homepage choice of Reading Settings: the radio buttons enable and disable the page selectors (as
// options_reading_add_js() does), the selectors show the pages the endpoint offers with their depth, the same-page warning
// comes from the page data, and a save sends the choice.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { readingData, readingPage, settle } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'options-reading', 'form-table', 'settings-field' ] );
} );

afterEach( () => resetContracts() );

const front = ( wrapper ) => wrapper.find( '#page_on_front' );
const posts = ( wrapper ) => wrapper.find( '#page_for_posts' );
const radio = ( wrapper, value ) => wrapper.find( `input[name="show_on_front"][value="${ value }"]` );

test( 'latest posts: both selectors are disabled, and the sentences around them are the classic ones', async () => {
	const wrapper = await readingPage( readingData() );
	expect( radio( wrapper, 'posts' ).element.checked ).toBe( true );
	expect( radio( wrapper, 'page' ).element.checked ).toBe( false );
	expect( front( wrapper ).attributes( 'disabled' ) ).toBeDefined();
	expect( posts( wrapper ).attributes( 'disabled' ) ).toBeDefined();
	expect( wrapper.find( 'label[for="page_on_front"]' ).text() ).toContain( 'Homepage:' );
	expect( wrapper.find( 'label[for="page_for_posts"]' ).text() ).toContain( 'Posts page:' );
} );

test( 'choosing A static page enables both selectors, and Your latest posts disables them again', async () => {
	const wrapper = await readingPage( readingData() );
	await radio( wrapper, 'page' ).setValue( true );
	expect( front( wrapper ).attributes( 'disabled' ) ).toBeUndefined();
	expect( posts( wrapper ).attributes( 'disabled' ) ).toBeUndefined();

	await radio( wrapper, 'posts' ).setValue( true );
	expect( front( wrapper ).attributes( 'disabled' ) ).toBeDefined();
	expect( posts( wrapper ).attributes( 'disabled' ) ).toBeDefined();
} );

test( 'a static page is stored: the selectors start enabled and show the stored pages', async () => {
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12 } ) );
	expect( radio( wrapper, 'page' ).element.checked ).toBe( true );
	expect( front( wrapper ).attributes( 'disabled' ) ).toBeUndefined();
	expect( front( wrapper ).element.value ).toBe( '11' );
	expect( posts( wrapper ).element.value ).toBe( '12' );
} );

test( 'the selectors list "— Select —" first, then the pages indented by depth', async () => {
	const wrapper = await readingPage( readingData() );
	const options = front( wrapper ).findAll( 'option' );
	expect( options.map( ( option ) => option.attributes( 'value' ) ) ).toEqual( [ '0', '11', '12', '13' ] );
	expect( options[ 0 ].text() ).toBe( '— Select —' );
	expect( options[ 2 ].classes() ).toContain( 'level-1' );
	expect( options[ 2 ].element.textContent ).toBe( '\u00a0\u00a0\u00a0Blog' );
} );

test( 'the same-page warning is shown when the data has it, and not otherwise', async () => {
	const none = await readingPage( readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12 } ) );
	expect( none.find( '#front-page-warning' ).exists() ).toBe( false );

	const same = await readingPage( readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 11, warnings: { frontPage: true } } ) );
	const warning = same.find( '#front-page-warning' );
	expect( warning.classes() ).toEqual( expect.arrayContaining( [ 'notice', 'notice-warning', 'inline' ] ) );
	expect( warning.text() ).toBe( 'Warning: these pages should not be the same!' );
	expect( warning.find( 'strong' ).text() ).toBe( 'Warning:' );
} );

test( 'the page does not decide the warning: a save shows the one the answer has', async () => {
	api.respondWith( async () => readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 11, warnings: { frontPage: true }, notices: [] } ) );
	const wrapper = await readingPage( readingData( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12 } ) );
	await posts( wrapper ).setValue( '11' );
	expect( wrapper.find( '#front-page-warning' ).exists() ).toBe( false );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();
	expect( wrapper.find( '#front-page-warning' ).exists() ).toBe( true );
} );

test( 'a save sends the changed choice, as numbers', async () => {
	api.respondWith( async ( method, route, payload ) => readingData( { ...payload, notices: [] } ) );
	const wrapper = await readingPage( readingData() );
	await radio( wrapper, 'page' ).setValue( true );
	await front( wrapper ).setValue( '11' );
	await posts( wrapper ).setValue( '12' );
	await wrapper.find( 'form' ).trigger( 'submit' );
	await settle();

	const save = api.calls.find( ( call ) => call.method === 'POST' );
	expect( save.route ).toBe( 'wp-admin/v1/settings/reading' );
	expect( save.payload ).toEqual( { show_on_front: 'page', page_on_front: 11, page_for_posts: 12 } );
} );

test( 'a site without pages has no homepage row', async () => {
	const wrapper = await readingPage( readingData( { flags: { pages: false, privacySelector: false }, choices: { pageOnFront: [], pageForPosts: [] } } ) );
	expect( wrapper.find( '#front-static-pages' ).exists() ).toBe( false );
	expect( wrapper.find( 'input[name="show_on_front"]' ).exists() ).toBe( false );
	expect( wrapper.find( '#posts_per_rss' ).exists() ).toBe( true );
} );
