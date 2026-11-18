import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteInfo } from '../site/runtime/site-info.js';

const respond = ( body, ok = true ) => async () => ( { ok, json: async () => body } );

test( 'siteName reads the name from the REST index of the site, once per site', async () => {
	const calls = [];
	const info = createSiteInfo( {
		fetch: async ( url, init ) => {
			calls.push( [ url, init.credentials ] );
			return { ok: true, json: async () => ( { name: url.startsWith( '/sites/2/' ) ? 'Second' : 'Main' } ) };
		},
	} );
	assert.equal( await info.siteName( null ), 'Main' );
	assert.equal( await info.siteName( null ), 'Main' );
	assert.equal( await info.siteName( 2 ), 'Second' );
	assert.deepEqual( calls, [
		[ '/wp-json/?_fields=name', 'same-origin' ],
		[ '/sites/2/wp-json/?_fields=name', 'same-origin' ],
	] );
} );

test( 'siteName is an empty string when the index fails or has no name, and retries later', async () => {
	let n = 0;
	const info = createSiteInfo( {
		fetch: async () => {
			n++;
			if ( n === 1 ) {
				throw new Error( 'offline' );
			}
			return { ok: true, json: async () => ( { name: 42 } ) };
		},
	} );
	assert.equal( await info.siteName( null ), '' );
	assert.equal( await info.siteName( null ), '' );
	assert.equal( n, 2 );
	assert.equal( await createSiteInfo( { fetch: respond( {}, false ) } ).siteName( null ), '' );
} );
