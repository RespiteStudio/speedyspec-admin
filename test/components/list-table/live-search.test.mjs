/** @jest-environment jsdom */
// The live search the Plugins pages share (list-table-parts/live-search.js), as updates.js runs it:
// the address after the page's pause with history replaced, nothing below two characters unless the
// last search was longer, the same term not twice unless asked again, Escape, the submit, reset()
// and the timer stopped on unmount.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { useLiveSearch } from '../../../site/components/core/list-table-parts/live-search.js';

beforeEach( () => jest.useFakeTimers() );
afterEach( () => jest.useRealTimers() );

function mountSearch( delay = 500 ) {
	const navigated = [];
	let search;
	const wrapper = mountPart( {
		setup() {
			search = useLiveSearch( { delay, path: ( term ) => 'x.php?s=' + term, navigate: ( path, options ) => navigated.push( options ? [ path, options ] : path ) } );
			return () => h( 'input', { onInput: search.onInput, onKeyup: search.onInput } );
		},
	} );
	return { wrapper, search, navigated };
}

const type = async ( wrapper, value ) => {
	wrapper.element.value = value;
	await wrapper.trigger( 'input' );
};

test( 'the address opens after the page\'s pause, replacing the history entry; the same term not twice', async () => {
	const { wrapper, search, navigated } = mountSearch( 1000 );
	await type( wrapper, 'seo' );
	jest.advanceTimersByTime( 999 );
	expect( navigated ).toEqual( [] );
	jest.advanceTimersByTime( 1 );
	expect( navigated ).toEqual( [ [ 'x.php?s=seo', { replace: true } ] ] );
	expect( search.term.value ).toBe( 'seo' );
	await type( wrapper, 'seo' );
	jest.advanceTimersByTime( 1000 );
	expect( navigated ).toHaveLength( 1 );
	search.again();
	jest.advanceTimersByTime( 1000 );
	expect( navigated ).toHaveLength( 2 );
} );

test( 'one character searches nothing, unless the last search was longer than two', async () => {
	const { wrapper, navigated } = mountSearch();
	await type( wrapper, 'a' );
	jest.advanceTimersByTime( 500 );
	expect( navigated ).toEqual( [] );
	await type( wrapper, 'abc' );
	jest.advanceTimersByTime( 500 );
	await type( wrapper, 'a' );
	jest.advanceTimersByTime( 500 );
	expect( navigated.map( ( [ path ] ) => path ) ).toEqual( [ 'x.php?s=abc', 'x.php?s=a' ] );
} );

test( 'Escape clears the field; the submit opens the search at once in a new entry; reset sets the term shown', async () => {
	const { wrapper, search, navigated } = mountSearch();
	await type( wrapper, 'seo' );
	await wrapper.trigger( 'keyup', { key: 'Escape' } );
	expect( wrapper.element.value ).toBe( '' );
	expect( search.term.value ).toBe( '' );
	await type( wrapper, 'seo' );
	search.onSubmit( new Event( 'submit' ) );
	expect( navigated ).toEqual( [ 'x.php?s=seo' ] );
	jest.advanceTimersByTime( 500 );
	expect( navigated ).toHaveLength( 1 );
	search.reset( 'shown' );
	expect( search.term.value ).toBe( 'shown' );
} );

test( 'unmounted, a pending search never opens', async () => {
	const { wrapper, navigated } = mountSearch();
	await type( wrapper, 'seo' );
	wrapper.unmount();
	jest.advanceTimersByTime( 500 );
	expect( navigated ).toEqual( [] );
} );
