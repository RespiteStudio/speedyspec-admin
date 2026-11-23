/** @jest-environment jsdom */
// The live search of Add Plugins (updates.js on plugin-install.php): the term WordPress shows,
// the search tab opened after the pause with the type and the term (history replaced), nothing
// below two characters, a type change searching again, Escape clearing, and the submit.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { searchPath } from '../../../site/components/core/plugin-install.js';
import { host, installData, loadContracts, mountInstall, SEARCH, settle } from './data.mjs';

const bodyClass = document.body.className;

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
	jest.useFakeTimers();
} );
afterEach( () => {
	document.body.className = bodyClass;
	jest.useRealTimers();
	jest.restoreAllMocks();
	resetContracts();
} );

async function type( wrapper, value ) {
	const input = wrapper.find( '#search-plugins' );
	input.element.value = value;
	await input.trigger( 'input' );
}

test( 'the term and type WordPress shows are in the form', async () => {
	const wrapper = await mountInstall( installData( 'search', { search: { ...SEARCH, term: 'seo', type: 'tag' } } ) );
	expect( wrapper.find( '#search-plugins' ).element.value ).toBe( 'seo' );
	expect( wrapper.find( '#typeselector' ).element.value ).toBe( 'tag' );
} );

test( 'typing searches by keyword after the pause, replacing the history entry; a second pause with the same term does nothing', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await type( wrapper, 'contact form' );
	jest.advanceTimersByTime( 999 );
	expect( record.navigated ).toEqual( [] );
	jest.advanceTimersByTime( 1 );
	await settle();
	expect( record.navigated ).toEqual( [ [ '/wp-admin/plugin-install.php?tab=search&type=term&s=contact+form', { replace: true } ] ] );
	await type( wrapper, 'contact form' );
	jest.advanceTimersByTime( 1000 );
	expect( record.navigated ).toHaveLength( 1 );
	expect( searchPath( 'a&b', 'author' ) ).toBe( 'plugin-install.php?tab=search&type=author&s=a%26b' );
} );

test( 'one character searches nothing; Author and Tag search by their type; changing the type searches again', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await type( wrapper, 'a' );
	jest.advanceTimersByTime( 1000 );
	expect( record.navigated ).toEqual( [] );
	await wrapper.find( '#typeselector' ).setValue( 'author' );
	await type( wrapper, 'automattic' );
	jest.advanceTimersByTime( 1000 );
	expect( record.navigated.at( -1 ) ).toEqual( [ '/wp-admin/plugin-install.php?tab=search&type=author&s=automattic', { replace: true } ] );
	await wrapper.find( '#typeselector' ).setValue( 'tag' );
	jest.advanceTimersByTime( 1000 );
	expect( record.navigated.at( -1 ) ).toEqual( [ '/wp-admin/plugin-install.php?tab=search&type=tag&s=automattic', { replace: true } ] );
} );

test( 'Escape clears the field; the submit opens the search at once, in a new history entry', async () => {
	const record = host();
	const wrapper = await mountInstall( installData(), record );
	await type( wrapper, 'seo' );
	await wrapper.find( '#search-plugins' ).trigger( 'keyup', { key: 'Escape' } );
	expect( wrapper.find( '#search-plugins' ).element.value ).toBe( '' );
	await type( wrapper, 'seo' );
	await wrapper.find( 'form.search-plugins' ).trigger( 'submit' );
	expect( record.navigated ).toEqual( [ '/wp-admin/plugin-install.php?tab=search&type=term&s=seo' ] );
	jest.advanceTimersByTime( 1000 );
	expect( record.navigated ).toHaveLength( 1 );
} );

test( 'nothing found shows the classic text', async () => {
	const wrapper = await mountInstall( installData( 'search', { cards: [], search: { ...SEARCH, term: 'zzz' } } ) );
	expect( wrapper.find( '#the-list .no-plugin-results' ).text() ).toBe( 'No plugins found. Try a different search.' );
} );
