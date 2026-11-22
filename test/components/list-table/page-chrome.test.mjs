/** @jest-environment jsdom */
// The page chrome the Taxonomies and Link Manager pages share (list-table-parts/page-chrome.js):
// one failure text (WordPress's message, that WordPress cannot be reached, or the generic one),
// one follow (the page read again when the answer leads to the address shown), the die-error
// block, and the title and body classes while a page is shown.
import { afterEach, expect, test } from '@jest/globals';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { DieError, failureText, followAnswer, isUnreachable, usePageChrome } from '../../../site/components/core/list-table-parts/page-chrome.js';

const BROKEN = 'An error occurred while processing your request. Please try again later.';
const UNREACHABLE = 'WordPress cannot be reached right now. Please try again in a moment.';

afterEach( () => {
	document.body.className = '';
} );

test( 'isUnreachable: both upstream codes and a status of 0, nothing else', () => {
	expect( isUnreachable( { code: 'admin_upstream_unreachable' } ) ).toBe( true );
	expect( isUnreachable( { code: 'admin_upstream_timeout' } ) ).toBe( true );
	expect( isUnreachable( { status: 0 } ) ).toBe( true );
	expect( isUnreachable( { status: 500, code: 'term_write_died' } ) ).toBe( false );
	expect( isUnreachable( null ) ).toBe( false );
} );

test( 'failureText: unreachable first, then WordPress\'s message, then the fallback', () => {
	expect( failureText( { code: 'admin_upstream_timeout', message: 'ignored' } ) ).toBe( UNREACHABLE );
	expect( failureText( { status: 500, message: 'A plugin refused.' } ) ).toBe( 'A plugin refused.' );
	expect( failureText( { status: 500, message: '' } ) ).toBe( BROKEN );
	expect( failureText( { status: 500 }, 'Error while saving the changes.' ) ).toBe( 'Error while saving the changes.' );
} );

test( 'followAnswer: the address shown is followed and read again; another is only followed; none does nothing', async () => {
	const calls = [];
	const router = { follow: async ( answer, options ) => calls.push( [ 'follow', answer, options ?? null ] ), refresh: async () => calls.push( [ 'refresh' ] ) };
	const where = { origin: 'http://localhost', pathname: '/wp-admin/term.php', search: '?taxonomy=category&tag_ID=5&message=3' };
	await followAnswer( { router, where }, { redirect: 'term.php?taxonomy=category&tag_ID=5&message=3' }, { replace: true } );
	expect( calls ).toEqual( [ [ 'follow', { redirect: 'term.php?taxonomy=category&tag_ID=5&message=3' }, { replace: true } ], [ 'refresh' ] ] );
	calls.length = 0;
	await followAnswer( { router, where }, { redirect: 'edit-tags.php?taxonomy=category' } );
	expect( calls ).toEqual( [ [ 'follow', { redirect: 'edit-tags.php?taxonomy=category' }, null ] ] );
	calls.length = 0;
	await followAnswer( { router, where }, { redirect: null, location: null } );
	expect( calls ).toEqual( [] );
} );

test( 'DieError: the heading when given, and the message, as text', () => {
	const wrapper = mountPart( DieError, { props: { error: { heading: '<b>No</b>', message: 'Invalid taxonomy.' }, classes: 'wp-admin-x-error' } } );
	expect( wrapper.classes() ).toContain( 'wp-admin-x-error' );
	expect( wrapper.find( 'h2' ).text() ).toBe( '<b>No</b>' );
	expect( wrapper.find( 'p' ).text() ).toBe( 'Invalid taxonomy.' );
	expect( mountPart( DieError, { props: { error: { message: 'x' }, classes: 'c' } } ).find( 'h2' ).exists() ).toBe( false );
} );

test( 'usePageChrome: title and body classes while shown, again on new data; classes removed on unmount; invalid class tokens dropped', async () => {
	const titles = [];
	const shown = [];
	const data = ref( { title: 'Edit Category', bodyClasses: [ 'term-php', 'bad token', 'taxonomy-category' ] } );
	const Page = defineComponent( {
		props: [ 'data' ],
		setup( props ) {
			const chrome = usePageChrome( props, { onShown: ( value ) => shown.push( value.title ) } );
			return () => h( 'p', chrome.blocked.value ? 'blocked' : 'open' );
		},
	} );
	const wrapper = mountPart( { setup: () => () => h( Page, { data: data.value } ) }, { provide: { frameChannel: { setTitle: ( title ) => titles.push( title ) } } } );
	await nextTick();
	expect( titles ).toEqual( [ 'Edit Category' ] );
	expect( [ ...document.body.classList ] ).toEqual( [ 'term-php', 'taxonomy-category' ] );
	expect( wrapper.text() ).toBe( 'open' );
	data.value = { title: '', bodyClasses: [ 'edit-tags-php' ], error: { message: 'No.' } };
	await nextTick();
	await nextTick();
	expect( titles ).toEqual( [ 'Edit Category', null ] );
	expect( [ ...document.body.classList ] ).toEqual( [ 'edit-tags-php' ] );
	expect( wrapper.text() ).toBe( 'blocked' );
	expect( shown ).toEqual( [ 'Edit Category', '' ] );
	wrapper.unmount();
	expect( [ ...document.body.classList ] ).toEqual( [] );
} );

test( 'body classes keep one-token entries only: a name with a space, a tab, an empty string or a non-string is dropped', async () => {
	const data = ref( { bodyClasses: [ 'wp-detached', 'two words', 'tab\tname', '', 5, null, 'edit-tags-php', 'a.b', 'under_score-1' ] } );
	const Page = defineComponent( {
		props: [ 'data' ],
		setup( props ) {
			usePageChrome( props );
			return () => h( 'p' );
		},
	} );
	mountPart( { setup: () => () => h( Page, { data: data.value } ) } );
	await nextTick();
	expect( [ ...document.body.classList ] ).toEqual( [ 'wp-detached', 'edit-tags-php', 'under_score-1' ] );
} );
