/** @jest-environment jsdom */
// The search of Themes (theme.js on themes.php): matchThemes() as theme.js's collection search
// matches (name, id, description, author and tags; words in any order; markup ignored; RegExp
// characters as text), the filter after the 500 ms pause with the count and the speech, `?search=`
// kept in place with the history entry replaced, nothing found, Escape, and the search the address
// gives.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { matchThemes, showsAuthor } from '../../../site/components/core/themes/search.js';
import { card, cardIds, host, loadContracts, mountThemes, settle, themesData } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

const THEMES = [
	card( 'one', { name: 'Twenty <strong>One</strong>', author: 'Ann Author', description: 'A calm blog.', tags: 'Blog, Two columns' } ),
	card( 'two', { name: 'Portfolio Pro', author: 'Bob', description: 'Grid of (photos).', tags: 'Portfolio' } ),
	card( 'three', { name: 'Magazine', author: 'Cara', description: 'News.', tags: '' } ),
];

async function type( wrapper, value ) {
	const input = wrapper.find( '#wp-filter-search-input' );
	input.element.value = value;
	await input.trigger( 'input' );
}

test( 'matchThemes: an empty term matches every theme, in order', () => {
	expect( matchThemes( THEMES, '' ) ).toEqual( [ 'one', 'two', 'three' ] );
	expect( matchThemes( THEMES, '   ' ) ).toEqual( [ 'one', 'two', 'three' ] );
} );

test( 'matchThemes: name without markup, id, description, author and tags, case-insensitive', () => {
	expect( matchThemes( THEMES, 'twenty one' ) ).toEqual( [ 'one' ] );
	expect( matchThemes( THEMES, 'THREE' ) ).toEqual( [ 'three' ] );
	expect( matchThemes( THEMES, 'calm' ) ).toEqual( [ 'one' ] );
	expect( matchThemes( THEMES, 'bob' ) ).toEqual( [ 'two' ] );
	expect( matchThemes( THEMES, 'portfolio' ) ).toEqual( [ 'two' ] );
	expect( matchThemes( THEMES, 'strong' ) ).toEqual( [] );
} );

test( 'matchThemes: words match in any order, and RegExp characters are text', () => {
	expect( matchThemes( THEMES, 'columns blog' ) ).toEqual( [ 'one' ] );
	expect( matchThemes( THEMES, '(photos)' ) ).toEqual( [ 'two' ] );
	expect( matchThemes( THEMES, '.*' ) ).toEqual( [] );
} );

test( 'showsAuthor: a term longer than two characters that matches the author', () => {
	expect( showsAuthor( THEMES[ 0 ], 'ann' ) ).toBe( true );
	expect( showsAuthor( THEMES[ 0 ], 'an' ) ).toBe( false );
	expect( showsAuthor( THEMES[ 1 ], 'ann' ) ).toBe( false );
} );

test( 'the search field: its label and the classic id, in form.search-themes', async () => {
	const wrapper = await mountThemes();
	const form = wrapper.find( 'form.search-form.search-themes' );
	expect( form.find( 'label[for="wp-filter-search-input"]' ).text() ).toBe( 'Search installed themes' );
	const input = form.find( '#wp-filter-search-input' );
	expect( input.attributes( 'type' ) ).toBe( 'search' );
	expect( input.classes() ).toContain( 'wp-filter-search' );
	expect( input.attributes( 'aria-describedby' ) ).toBe( 'live-search-desc' );
} );

test( 'typing filters after the 500 ms pause, updates the count, speaks it and keeps ?search= in place (history replaced)', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountThemes( themesData( { themes: THEMES } ), record );
	await type( wrapper, 'portfolio' );
	jest.advanceTimersByTime( 499 );
	await settle();
	expect( cardIds( wrapper ) ).toEqual( [ 'one', 'two', 'three' ] );
	jest.advanceTimersByTime( 1 );
	await settle();
	expect( cardIds( wrapper ) ).toEqual( [ 'two' ] );
	expect( wrapper.find( '.title-count.theme-count' ).text() ).toBe( '1' );
	expect( record.spoken ).toContain( 'Number of Themes found: 1' );
	expect( record.navigated ).toEqual( [ [ '/wp-admin/themes.php?search=portfolio', { replace: true, inPlace: true } ] ] );
	// No request: the themes the page was sent are searched.
	expect( api.calls ).toEqual( [] );
} );

test( 'nothing found: no card, the classic text shows (body.no-results), and it is spoken; clearing shows them all at themes.php', async () => {
	jest.useFakeTimers();
	const record = host();
	const wrapper = await mountThemes( themesData( { themes: THEMES } ), record );
	await type( wrapper, 'zzz-missing' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( cardIds( wrapper ) ).toEqual( [] );
	expect( wrapper.find( 'p.no-themes' ).text() ).toBe( 'No themes found. Try a different search.' );
	expect( document.body.classList.contains( 'no-results' ) ).toBe( true );
	expect( record.spoken ).toContain( 'No themes found. Try a different search.' );
	await type( wrapper, '' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( cardIds( wrapper ) ).toEqual( [ 'one', 'two', 'three' ] );
	expect( document.body.classList.contains( 'no-results' ) ).toBe( false );
	expect( record.navigated.at( -1 ) ).toEqual( [ '/wp-admin/themes.php', { replace: true, inPlace: true } ] );
} );

test( 'Escape clears the field and shows every theme; an author match shows the author on its card', async () => {
	jest.useFakeTimers();
	const wrapper = await mountThemes( themesData( { themes: THEMES } ) );
	await type( wrapper, 'ann' );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( cardIds( wrapper ) ).toEqual( [ 'one' ] );
	expect( wrapper.find( '.theme[data-slug="one"]' ).classes() ).toContain( 'display-author' );
	await wrapper.find( '#wp-filter-search-input' ).trigger( 'keyup', { key: 'Escape' } );
	jest.advanceTimersByTime( 500 );
	await settle();
	expect( wrapper.find( '#wp-filter-search-input' ).element.value ).toBe( '' );
	expect( cardIds( wrapper ) ).toEqual( [ 'one', 'two', 'three' ] );
} );

test( 'the search the address gives fills the field and filters at once; fresh data keeps the typed term', async () => {
	const wrapper = await mountThemes( themesData( { themes: THEMES, search: 'magazine' } ) );
	expect( wrapper.find( '#wp-filter-search-input' ).element.value ).toBe( 'magazine' );
	expect( cardIds( wrapper ) ).toEqual( [ 'three' ] );
	expect( wrapper.find( '.title-count.theme-count' ).text() ).toBe( '1' );
} );
