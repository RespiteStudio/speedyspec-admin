import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatic, pageContractId, mayServe } from '../server/tiers.mjs';

const PUBLIC = new Set( [ '/index.html', '/runtime/app.js' ] );
const SHARED = new Set( [ '/runtime/protected.js', '/kit/index.js', '/contracts/core/frame.js', '/components/core/frame.js', '/components/core/menu-item.js' ] );
const ALLOWED = new Set( [ 'core/options-general' ] );

test( 'classifyStatic: public and shared lists are matched exactly, public first', () => {
	assert.deepEqual( classifyStatic( '/runtime/app.js', PUBLIC, SHARED ), { tier: 'public' } );
	assert.deepEqual( classifyStatic( '/kit/index.js', PUBLIC, SHARED ), { tier: 'shared' } );
	assert.deepEqual( classifyStatic( '/contracts/core/frame.js', PUBLIC, SHARED ), { tier: 'shared' } );
	assert.deepEqual( classifyStatic( '/x.js', new Set( [ '/x.js' ] ), new Set( [ '/x.js' ] ) ), { tier: 'public' } );
	for ( const key of [ '/Kit/index.js', '/kit/Index.js', '/kit/index.js.map', '/kit', '/kit/' ] ) {
		assert.notEqual( classifyStatic( key, PUBLIC, SHARED ).tier, 'shared', key );
	}
} );

test( 'classifyStatic: other paths under /contracts/ and /components/ are page files named by their path', () => {
	assert.deepEqual( classifyStatic( '/contracts/core/options-general.js', PUBLIC, SHARED ), { tier: 'page', contractId: 'core/options-general', area: 'contracts' } );
	assert.deepEqual( classifyStatic( '/components/core/options-general.js', PUBLIC, SHARED ), { tier: 'page', contractId: 'core/options-general', area: 'components' } );
	assert.deepEqual( classifyStatic( '/components/core/options-general/timezone.js', PUBLIC, SHARED ), { tier: 'page', contractId: 'core/options-general/timezone', area: 'components' } );
	assert.deepEqual( classifyStatic( '/contracts/core/options-general', PUBLIC, SHARED ), { tier: 'page', contractId: 'core/options-general', area: 'contracts' } );
} );

test( 'classifyStatic: anything else that is on no list is a page file with no id (never served)', () => {
	for ( const key of [
		'/runtime/stray.js', '/kit/stray.js', '/styles/stray.css', '/vendor/README.md', '/posts/12', '/', '',
		'/public-files.json', '/shared-files.json', '/Components/core/options-general.js', '/CONTRACTS/core/options-general.js',
		'/components', '/contracts', '/componentsx/core/a.js', '/components/.hidden.js', '/components/core/.x/y.js', '/components/core/options-general/.js',
	] ) {
		assert.deepEqual( classifyStatic( key, PUBLIC, SHARED ), { tier: 'page' }, key );
	}
} );

test( 'classifyStatic: the list files are never served, even when listed', () => {
	const listed = new Set( [ '/public-files.json', '/shared-files.json' ] );
	assert.deepEqual( classifyStatic( '/public-files.json', listed, listed ), { tier: 'page' } );
	assert.deepEqual( classifyStatic( '/shared-files.json', listed, listed ), { tier: 'page' } );
} );

test( 'pageContractId: a contract path names its own id', () => {
	const page = ( key ) => pageContractId( classifyStatic( key, PUBLIC, SHARED ), ALLOWED );
	assert.equal( page( '/contracts/core/options-general.js' ), 'core/options-general' );
	assert.equal( page( '/contracts/core/other.js' ), 'core/other' );
	// No directory rule for contracts: a file below a contract's name is its own id.
	assert.equal( page( '/contracts/core/options-general/x.js' ), 'core/options-general/x' );
	assert.equal( page( '/runtime/stray.js' ), null );
	assert.equal( page( '/kit/index.js' ), null );
} );

test( 'pageContractId: a component file below an allowed contract directory belongs to that contract', () => {
	const page = ( key, allowed = ALLOWED ) => pageContractId( classifyStatic( key, PUBLIC, SHARED ), allowed );
	assert.equal( page( '/components/core/options-general.js' ), 'core/options-general' );
	assert.equal( page( '/components/core/options-general/timezone.js' ), 'core/options-general' );
	assert.equal( page( '/components/core/options-general/deep/er.js' ), 'core/options-general' );
	// Not allowed: the id is the path itself, which is not in the set either.
	assert.equal( page( '/components/core/options-general/timezone.js', new Set() ), 'core/options-general/timezone' );
	// The longest allowed prefix wins.
	assert.equal( page( '/components/acme/a/b/c.js', new Set( [ 'acme/a', 'acme/a/b' ] ) ), 'acme/a/b' );
	// A prefix of a name is not a directory prefix.
	assert.equal( page( '/components/core/options-general-x.js' ), 'core/options-general-x' );
	assert.equal( page( '/components/core/options-general-x/a.js' ), 'core/options-general-x/a' );
	// The whole remainder is not a proper prefix of itself.
	assert.equal( page( '/components/core/options-general.js/x' ), 'core/options-general.js/x' );
} );

test( 'mayServe: decides from the tier, the session and the allowed set alone', () => {
	const signedIn = { authenticated: true, components: ALLOWED };
	const nobody = { authenticated: true, components: new Set() };
	const anonymous = { authenticated: false, components: new Set() };
	const decide = ( key, session ) => mayServe( classifyStatic( key, PUBLIC, SHARED ), session );
	assert.equal( decide( '/runtime/app.js', anonymous ), 'serve' );
	assert.equal( decide( '/kit/index.js', anonymous ), 'unauthenticated' );
	assert.equal( decide( '/kit/index.js', nobody ), 'serve' );
	assert.equal( decide( '/components/core/options-general.js', signedIn ), 'serve' );
	assert.equal( decide( '/components/core/options-general/timezone.js', signedIn ), 'serve' );
	assert.equal( decide( '/contracts/core/options-general.js', signedIn ), 'serve' );
	assert.equal( decide( '/components/core/options-general.js', nobody ), 'forbidden' );
	assert.equal( decide( '/components/core/options-general.js', anonymous ), 'unauthenticated' );
	assert.equal( decide( '/components/core/options-general-x.js', signedIn ), 'forbidden' );
	assert.equal( decide( '/components/core/does-not-exist.js', signedIn ), 'forbidden' );
	assert.equal( decide( '/runtime/stray.js', signedIn ), 'forbidden' );
	assert.equal( decide( '/runtime/stray.js', anonymous ), 'unauthenticated' );
	assert.equal( decide( '/shared-files.json', signedIn ), 'forbidden' );
	// An id that is not a valid contract id is never served, even if a set somehow held it.
	assert.equal( mayServe( classifyStatic( '/components/Core/X.js', PUBLIC, SHARED ), { authenticated: true, components: new Set( [ 'Core/X' ] ) } ), 'forbidden' );
} );
