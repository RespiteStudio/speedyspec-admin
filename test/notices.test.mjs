import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotices, liveRole } from '../site/runtime/notices.js';

test( 'add() keeps notices in order with ids and defaults', () => {
	const notices = createNotices();
	const a = notices.add( { type: 'success', message: 'Saved.' } );
	const b = notices.add( { type: 'error', message: 'Failed.', dismissible: false } );
	assert.notEqual( a, b );
	assert.deepEqual( notices.items.map( ( n ) => [ n.id, n.type, n.message, n.dismissible ] ), [
		[ a, 'success', 'Saved.', true ],
		[ b, 'error', 'Failed.', false ],
	] );
} );

test( 'an unknown type is shown as info; an empty message is ignored', () => {
	const notices = createNotices();
	notices.add( { type: 'bogus', message: 'x' } );
	assert.equal( notices.items[ 0 ].type, 'info' );
	assert.equal( notices.add( { type: 'info', message: '' } ), null );
	assert.equal( notices.items.length, 1 );
} );

test( 'dismiss() removes one notice by id', () => {
	const notices = createNotices();
	const a = notices.add( { type: 'info', message: 'one' } );
	notices.add( { type: 'info', message: 'two' } );
	notices.dismiss( a );
	assert.deepEqual( notices.items.map( ( n ) => n.message ), [ 'two' ] );
	notices.dismiss( 'nope' );
	assert.equal( notices.items.length, 1 );
} );

test( 'clear() removes every notice', () => {
	const notices = createNotices();
	notices.add( { type: 'info', message: 'one' } );
	notices.add( { type: 'error', message: 'two' } );
	notices.clear();
	assert.equal( notices.items.length, 0 );
} );

test( 'the same notice raised again while shown is not repeated', () => {
	const notices = createNotices();
	const a = notices.add( { type: 'warning', message: 'same' } );
	assert.equal( notices.add( { type: 'warning', message: 'same' } ), a );
	assert.equal( notices.items.length, 1 );
	notices.dismiss( a );
	notices.add( { type: 'warning', message: 'same' } );
	assert.equal( notices.items.length, 1 );
} );

test( 'notices raised before anything shows them are kept', () => {
	const notices = createNotices();
	notices.add( { type: 'warning', message: 'early' } );
	// Nothing has been mounted: the list still holds the notice for the frame to show later.
	assert.equal( notices.items[ 0 ].message, 'early' );
} );

test( 'the list goes through the injected reactive()', () => {
	let wrapped = null;
	const notices = createNotices( { reactive: ( value ) => ( wrapped = value ) } );
	assert.equal( notices.items, wrapped );
} );

test( 'liveRole: alert for errors and warnings, status otherwise', () => {
	assert.equal( liveRole( 'error' ), 'alert' );
	assert.equal( liveRole( 'warning' ), 'alert' );
	assert.equal( liveRole( 'success' ), 'status' );
	assert.equal( liveRole( 'info' ), 'status' );
} );
