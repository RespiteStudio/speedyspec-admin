// The terms list's pure answer reducers (edit-tags/state.js): where tags.js puts an added row,
// how a Quick Edit row replaces its row, a deleted row leaves, and where the focus goes after a
// delete, as tags.js chooses it.
import { expect, test } from '@jest/globals';
import { afterAdd, afterDelete, afterInline, listState, nextFocus, placeRow, removeRow, replaceRow } from '../../../site/components/core/edit-tags/state.js';
import { ADD_FORM, answer, pagination, row, termsData } from './data.mjs';

const ids = ( items ) => items.map( ( item ) => item.id );
const ITEMS = [ row( 7 ), row( 8 ), row( 9 ) ];

test( 'placeRow: after the parent\'s row when the parent is on the page, else first', () => {
	expect( ids( placeRow( ITEMS, row( 20, { level: 1, parent: 8 } ), 8 ) ) ).toEqual( [ 7, 8, 20, 9 ] );
	// Right after the parent, before the parent's other children, as tags.js's after().
	const withChild = [ row( 7 ), row( 8 ), row( 21, { level: 1, parent: 8 } ), row( 9 ) ];
	expect( ids( placeRow( withChild, row( 20, { level: 1, parent: 8 } ), 8 ) ) ).toEqual( [ 7, 8, 20, 21, 9 ] );
	expect( ids( placeRow( ITEMS, row( 20 ), 99 ) ) ).toEqual( [ 20, 7, 8, 9 ] );
	expect( ids( placeRow( ITEMS, row( 20 ), 0 ) ) ).toEqual( [ 20, 7, 8, 9 ] );
	expect( ids( placeRow( [], row( 20 ), -1 ) ) ).toEqual( [ 20 ] );
	// The input is not changed.
	expect( ids( ITEMS ) ).toEqual( [ 7, 8, 9 ] );
} );

test( 'replaceRow puts the row in place of the row with its id; removeRow takes a row out', () => {
	const replaced = replaceRow( ITEMS, row( 8, { name: 'Renamed' } ) );
	expect( ids( replaced ) ).toEqual( [ 7, 8, 9 ] );
	expect( replaced[ 1 ].inline.name ).toBe( 'Renamed' );
	expect( ids( replaceRow( ITEMS, row( 99 ) ) ) ).toEqual( [ 7, 8, 9 ] );
	expect( ids( removeRow( ITEMS, 8 ) ) ).toEqual( [ 7, 9 ] );
	expect( ids( removeRow( ITEMS, 99 ) ) ).toEqual( [ 7, 8, 9 ] );
} );

test( 'nextFocus: the next row, else the previous one, else none (the name field)', () => {
	expect( nextFocus( ITEMS, 8 ) ).toEqual( { id: 9 } );
	expect( nextFocus( ITEMS, 9 ) ).toEqual( { id: 8 } );
	expect( nextFocus( [ row( 7 ) ], 7 ) ).toEqual( { id: null } );
	expect( nextFocus( ITEMS, 99 ) ).toEqual( { id: null } );
} );

test( 'afterAdd places the row under its parent, or the parents version at the top, and takes the answer\'s parent options and count', () => {
	const state = listState( termsData() );
	const options = { ...ADD_FORM.parent, options: [ ...ADD_FORM.parent.options, { value: '20', label: '   Child', level: 1 } ] };
	const child = row( 20, { level: 1, parent: 8 } );
	const top = row( 20, { name: 'Term 8 — Child' } );
	const next = afterAdd( state, answer( { id: 20, row: child, parentRow: top, parentOptions: options, pagination: pagination( 4 ) } ), 8 );
	expect( ids( next.items ) ).toEqual( [ 7, 8, 20, 9 ] );
	expect( next.items[ 2 ] ).toBe( child );
	expect( next.parent ).toBe( options );
	expect( next.pagination.totalText ).toBe( '4 items' );
	expect( next.emptied ).toBe( false );

	// The parent is not on the page: the parents version goes first.
	const away = afterAdd( listState( termsData( { items: [ row( 7 ), row( 9 ) ] } ) ), answer( { id: 20, row: child, parentRow: top } ), 8 );
	expect( ids( away.items ) ).toEqual( [ 20, 7, 9 ] );
	expect( away.items[ 0 ] ).toBe( top );

	// A flat taxonomy: no parents version, the row first.
	const flat = afterAdd( state, answer( { id: 20, row: row( 20 ), parentRow: null, parentOptions: null } ), -1 );
	expect( ids( flat.items ) ).toEqual( [ 20, 7, 8, 9 ] );
	expect( flat.parent ).toBe( null );
} );

test( 'afterInline replaces the row and the parent options; afterDelete removes it and says whether the list is now empty', () => {
	const state = listState( termsData() );
	const renamed = row( 8, { name: 'Renamed' } );
	const options = { ...ADD_FORM.parent, options: ADD_FORM.parent.options.map( ( option ) => ( option.value === '8' ? { ...option, label: 'Renamed' } : option ) ) };
	const inline = afterInline( state, answer( { id: 8, row: renamed, parentOptions: options } ) );
	expect( inline.items[ 1 ] ).toBe( renamed );
	expect( inline.parent.options.find( ( option ) => option.value === '8' ).label ).toBe( 'Renamed' );

	const deleted = afterDelete( state, 8, answer( { id: 8, pagination: pagination( 2 ) } ) );
	expect( ids( deleted.items ) ).toEqual( [ 7, 9 ] );
	expect( deleted.pagination.totalText ).toBe( '2 items' );
	expect( deleted.emptied ).toBe( false );

	const last = afterDelete( listState( termsData( { items: [ row( 7 ) ], pagination: pagination( 1 ) } ) ), 7, answer( { id: 7, pagination: pagination( 0 ), noItems: 'No categories found.' } ) );
	expect( last.items ).toEqual( [] );
	expect( last.emptied ).toBe( true );
	expect( last.noItems ).toBe( 'No categories found.' );
} );
