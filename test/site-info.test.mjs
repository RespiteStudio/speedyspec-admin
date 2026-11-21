import test from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { createSiteInfo } from '../site/runtime/site-info.js';

const respond = ( body, ok = true ) => async () => ( { ok, json: async () => body } );

test( 'siteName reads the name from the REST index of the site, once per site', async () => {
	const calls = [];
	const info = createSiteInfo( {
		fetch: async ( url, init ) => {
			calls.push( [ url, init.credentials ] );
			const second = url.startsWith( '/sites/2/' );
			return { ok: true, json: async () => ( { name: second ? 'Second' : 'Main', home: second ? 'http://example.test/second' : 'http://example.test' } ) };
		},
	} );
	assert.equal( await info.siteName( null ), 'Main' );
	assert.equal( await info.siteName( null ), 'Main' );
	assert.equal( await info.siteName( 2 ), 'Second' );
	// The home address comes from the same request: one per site.
	assert.equal( await info.siteHome( null ), 'http://example.test' );
	assert.equal( await info.siteHome( 2 ), 'http://example.test/second' );
	assert.deepEqual( calls, [
		[ '/wp-json/?_fields=name,home', 'same-origin' ],
		[ '/sites/2/wp-json/?_fields=name,home', 'same-origin' ],
	] );
} );

test( 'siteHome is an empty string when the index has no home address or fails', async () => {
	assert.equal( await createSiteInfo( { fetch: async () => ( { ok: true, json: async () => ( { name: 'Main' } ) } ) } ).siteHome( null ), '' );
	assert.equal( await createSiteInfo( { fetch: respond( {}, false ) } ).siteHome( null ), '' );
	const info = createSiteInfo( { fetch: async () => ( { ok: true, json: async () => ( { name: 'Main', home: 'http://example.test' } ) } ) } );
	assert.equal( await info.siteHome( null ), 'http://example.test' );
	assert.equal( await info.siteName( null ), 'Main' );
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
