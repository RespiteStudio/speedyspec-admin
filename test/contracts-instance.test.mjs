import test from 'node:test';
import assert from 'node:assert/strict';

// The real contracts-instance.js: a failed import is probed (HEAD) to tell why. In node the
// root-relative imports themselves always fail, so the probe's answer decides.
const { contracts, loader, onModuleUnauthorized } = await import( '../site/runtime/contracts-instance.js' );

function answering( t, status ) {
	const calls = [];
	t.mock.method( globalThis, 'fetch', async ( url, init ) => {
		calls.push( [ url, init?.method ] );
		return { status };
	} );
	return calls;
}

test( 'a page file refused with 403 makes the contract forbidden', async ( t ) => {
	const calls = answering( t, 403 );
	await assert.rejects( contracts.resolve( 'core/options-general' ), ( e ) => e.code === 'contract_forbidden' && e.status === 403 );
	assert.deepEqual( calls.map( ( [ url, method ] ) => method + ' ' + url ).sort(), [ 'HEAD /components/core/options-general.js', 'HEAD /contracts/core/options-general.js' ] );
} );

test( 'a 404 is still a contract that does not exist, and a 401 an ended session', async ( t ) => {
	answering( t, 404 );
	await assert.rejects( contracts.resolve( 'core/not-converted' ), ( e ) => e.code === 'contract_not_found' );
	let ended = 0;
	onModuleUnauthorized( () => ended++ );
	t.mock.method( globalThis, 'fetch', async () => ( { status: 401 } ) );
	await assert.rejects( contracts.resolve( 'core/frame' ), ( e ) => e.code !== 'contract_forbidden' && e.code !== 'contract_not_found' );
	assert.ok( ended >= 1 );
	onModuleUnauthorized( null );
} );

test( 'a 403 for a module outside the static site is not a refused page file', async ( t ) => {
	answering( t, 403 );
	await assert.rejects( loader.loadModule( '/wp-content/plugins/acme/page.js' ), ( e ) => e.status === undefined && e.code !== 'admin_forbidden' );
} );
