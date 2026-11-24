/** @jest-environment jsdom */
// The search of Add Themes (theme.js's InstallerSearch): searchRequest() as theme.js reads a value
// (`author:` and `tag:`), the read after the 500 ms pause with `?search=` kept in place and the
// history entry replaced, the tab no longer current, the same value not read again, Escape, Tab,
// nothing found, and the search the address gives.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { searchRequest } from '../../../site/components/core/theme-install.js';
import { DIRECTORY, directory, host, installData, loadContracts, mountInstall, reads, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	api.respondWith( async ( method, route, payload ) => ( route === DIRECTORY && payload.search === 'detached-nothing' ? directory( [] ) : directory() ) );
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

async function type( wrapper, value, event = 'input', key = undefined ) {
	const input = wrapper.find( '#wp-filter-search-input' );
	input.element.value = value;
	await input.trigger( event, key ? { key } : {} );
}

test( 'searchRequest: a term, author: and tag:, as theme.js reads them', () => {
	expect( [ searchRequest( 'blog' ), searchRequest( 'author:ann' ), searchRequest( 'tag:dark' ) ] ).toEqual( [ { search: 'blog' }, { search: '', author: 'ann' }, { search: '', tag: [ 'dark' ] } ] );
} );

test( 'typing reads after the pause, with ?search= in place (replaced); the tab is no longer current', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await type( wrapper, 'blo' );
	await type( wrapper, 'blog' );
	jest.advanceTimersByTime( 499 );
	await settle();
	expect( reads( api.calls ) ).toEqual( [ { browse: 'popular' } ] );
	jest.advanceTimersByTime( 1 );
	await settle();
	expect( reads( api.calls ) ).toEqual( [ { browse: 'popular' }, { search: 'blog' } ] );
	expect( record.addressed.at( -1 ) ).toEqual( [ '/wp-admin/theme-install.php?search=blog', { replace: true } ] );
	expect( wrapper.findAll( '.filter-links a.current' ) ).toHaveLength( 0 );
} );

test( 'tag:x reads the tag, author:x the author', async () => {
	jest.useFakeTimers();
	const wrapper = await mountInstall();
	await type( wrapper, 'tag:dark' );
	jest.advanceTimersByTime( 500 );
	await settle();
	await type( wrapper, 'author:ann' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( reads( api.calls ).slice( 1 ) ).toEqual( [ { tag: 'dark' }, { author: 'ann' } ] );
} );

test( 'the same value is not read again; Tab and Shift do not search; Escape empties the field and reads the empty search', async () => {
	jest.useFakeTimers();
	const wrapper = await mountInstall();
	await type( wrapper, 'blog' );
	jest.advanceTimersByTime( 500 );
	await settle();
	await type( wrapper, 'blog', 'keyup', 'Tab' );
	await type( wrapper, 'blog', 'keyup', 'Shift' );
	await type( wrapper, 'blog' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( reads( api.calls ) ).toHaveLength( 2 );
	await type( wrapper, 'blog', 'keyup', 'Escape' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( [ wrapper.find( '#wp-filter-search-input' ).element.value, reads( api.calls ).at( -1 ) ] ).toEqual( [ '', {} ] );
} );

test( 'nothing found: the body has no-results, the count is 0 and the classic text is spoken', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await type( wrapper, 'detached-nothing' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( [ document.body.classList.contains( 'no-results' ), wrapper.find( '.theme-count' ).text(), record.spoken.at( -1 ) ] ).toEqual( [ true, '0', 'No themes found. Try a different search.' ] );
} );

test( 'the search the address gives: the field holds it and it is read at once, without a browse', async () => {
	const wrapper = await mountInstall( installData( { query: { search: 'blog' }, search: { ...installData().search, term: 'blog' } } ) );
	expect( [ wrapper.find( '#wp-filter-search-input' ).element.value, reads( api.calls ), wrapper.findAll( '.filter-links a.current' ).length ] ).toEqual( [ 'blog', [ { search: 'blog' } ], 0 ] );
} );

test( 'a tab after a search empties the field', async () => {
	jest.useFakeTimers();
	const wrapper = await mountInstall();
	await type( wrapper, 'blog' );
	jest.advanceTimersByTime( 500 );
	await settle();
	await wrapper.find( '.filter-links a[data-sort="new"]' ).trigger( 'click' );
	await settle();
	expect( [ wrapper.find( '#wp-filter-search-input' ).element.value, reads( api.calls ).at( -1 ) ] ).toEqual( [ '', { browse: 'new' } ] );
} );
