import { test } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { classifyStatic, mayServe } from '../server/tiers.mjs';

const PUBLIC = new Set( [ '/index.html', '/runtime/app.js' ] );
const SHARED = new Set( [ '/runtime/protected.js', '/kit/index.js', '/contracts/core/frame.js', '/components/core/frame.js', '/components/core/menu-item.js' ] );
const ALLOWED = new Set( [ 'core/options-general' ] );

const classify = ( key ) => classifyStatic( key, PUBLIC, SHARED );

test( 'classifyStatic: public and shared lists are matched exactly, public first', () => {
	assert.deepEqual( classify( '/runtime/app.js' ), { tier: 'public' } );
	assert.deepEqual( classify( '/kit/index.js' ), { tier: 'shared' } );
	assert.deepEqual( classify( '/contracts/core/frame.js' ), { tier: 'shared' } );
	assert.deepEqual( classifyStatic( '/x.js', new Set( [ '/x.js' ] ), new Set( [ '/x.js' ] ) ), { tier: 'public' } );
	for ( const key of [ '/Kit/index.js', '/kit/Index.js', '/kit/index.js.map', '/kit', '/kit/' ] ) {
		assert.notEqual( classify( key ).tier, 'shared', key );
	}
} );

test( 'classifyStatic: a page file is named by the first two segments below its area', () => {
	assert.deepEqual( classify( '/contracts/core/options-general.js' ), { tier: 'page', contractId: 'core/options-general' } );
	assert.deepEqual( classify( '/contracts/core/options-general' ), { tier: 'page', contractId: 'core/options-general' } );
	assert.deepEqual( classify( '/components/core/options-general.js' ), { tier: 'page', contractId: 'core/options-general' } );
	assert.deepEqual( classify( '/components/core/options-general/timezone.js' ), { tier: 'page', contractId: 'core/options-general' } );
	assert.deepEqual( classify( '/components/core/options-general/deep/er.js' ), { tier: 'page', contractId: 'core/options-general' } );
	assert.deepEqual( classify( '/components/acme/page/sub.js' ), { tier: 'page', contractId: 'acme/page' } );
	// A prefix of a name is not the name.
	assert.deepEqual( classify( '/components/core/options-general-x.js' ), { tier: 'page', contractId: 'core/options-general-x' } );
	// A file name used as a directory keeps its extension, which no valid id has.
	assert.deepEqual( classify( '/components/core/options-general.js/x' ), { tier: 'page', contractId: 'core/options-general.js' } );
} );

test( 'classifyStatic: anything else that is on no list is a page file with no id (never served)', () => {
	for ( const key of [
		'/runtime/stray.js', '/kit/stray.js', '/styles/stray.css', '/vendor/README.md', '/posts/12', '/', '',
		'/public-files.json', '/shared-files.json', '/Components/core/options-general.js', '/CONTRACTS/core/options-general.js',
		'/components', '/contracts', '/componentsx/core/a.js', '/components/.hidden.js', '/components/core/.x/y.js', '/components/core/options-general/.js',
		// A contract file is exactly two segments deep; a component path at least two.
		'/contracts/core/options-general/x.js', '/contracts/core/options-general/timezone.js', '/contracts/core.js', '/contracts/a/b/c/d.js',
		'/components/core.js', '/components/options-general.js',
	] ) {
		assert.deepEqual( classify( key ), { tier: 'page' }, key );
	}
} );

test( 'classifyStatic: the list files are never served, even when listed', () => {
	const listed = new Set( [ '/public-files.json', '/shared-files.json' ] );
	assert.deepEqual( classifyStatic( '/public-files.json', listed, listed ), { tier: 'page' } );
	assert.deepEqual( classifyStatic( '/shared-files.json', listed, listed ), { tier: 'page' } );
} );

test( 'mayServe: decides from the tier, the session and the allowed set alone', () => {
	const signedIn = { authenticated: true, components: ALLOWED };
	const nobody = { authenticated: true, components: new Set() };
	const anonymous = { authenticated: false, components: new Set() };
	const decide = ( key, session ) => mayServe( classify( key ), session );
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
	assert.equal( decide( '/contracts/core/options-general/x.js', signedIn ), 'forbidden' );
	assert.equal( decide( '/components/core/options-general.js/x', signedIn ), 'forbidden' );
	assert.equal( decide( '/runtime/stray.js', signedIn ), 'forbidden' );
	assert.equal( decide( '/runtime/stray.js', anonymous ), 'unauthenticated' );
	assert.equal( decide( '/shared-files.json', signedIn ), 'forbidden' );
	// An id that is not a valid contract id is never served, even if a set somehow held it.
	assert.equal( mayServe( classify( '/components/Core/X.js' ), { authenticated: true, components: new Set( [ 'Core/X' ] ) } ), 'forbidden' );
} );

test( 'mayServe: a page owns everything below its directory, and a nested id grants nothing', () => {
	// Allowed acme/page: its helper below components/acme/page/ is served by its rule, by design.
	const acme = { authenticated: true, components: new Set( [ 'acme/page' ] ) };
	assert.equal( mayServe( classify( '/components/acme/page/sub.js' ), acme ), 'serve' );
	assert.equal( mayServe( classify( '/contracts/acme/page/sub.js' ), acme ), 'forbidden' );
	// A three-segment id (which the checker drops anyway) never stands for a helper's own page.
	const nested = { authenticated: true, components: new Set( [ 'core/options-general/timezone', 'acme/page/sub' ] ) };
	for ( const key of [ '/components/core/options-general/timezone.js', '/components/core/options-general.js', '/contracts/core/options-general.js', '/components/acme/page/sub.js', '/contracts/acme/page/sub.js' ] ) {
		assert.equal( mayServe( classify( key ), nested ), 'forbidden', key );
	}
} );

test( 'mayServe: the shared settings form is served to any signed-in user, without General Settings', () => {
	const shared = new Set( [ ...SHARED, '/components/core/settings-form/use-settings-form.js' ] );
	const privacyOnly = { authenticated: true, components: new Set( [ 'core/options-privacy' ] ) };
	const decide = ( key, session ) => mayServe( classifyStatic( key, PUBLIC, shared ), session );
	assert.equal( decide( '/components/core/settings-form/use-settings-form.js', privacyOnly ), 'serve' );
	assert.equal( decide( '/components/core/settings-form/use-settings-form.js', { authenticated: false, components: new Set() } ), 'unauthenticated' );
	// Under a page's directory it would be that page's file: what moving it out of options-general/ fixes.
	assert.equal( decide( '/components/core/options-general/legacy-fields.js', privacyOnly ), 'forbidden' );
	// An unlisted file of the directory is not shared.
	assert.equal( decide( '/components/core/settings-form/stray.js', privacyOnly ), 'forbidden' );
} );

test( 'the shared list table layer is served to any signed-in user, not as a page', async () => {
	const { readFileSync } = await import( 'node:fs' );
	const listed = new Set( JSON.parse( readFileSync( new URL( '../site/shared-files.json', import.meta.url ), 'utf8' ) ).files );
	const someone = { authenticated: true, components: new Set( [ 'core/options-general' ] ) };
	const files = [
		...[ 'list-table', 'list-table-views', 'list-table-search', 'list-table-nav', 'inline-edit', 'terms-checklist', 'tags-suggest', 'user-password', 'admin-email-confirm', 'filesystem-credentials', 'plugin-information' ].flatMap( ( name ) => [ `/contracts/core/${ name }.js`, `/components/core/${ name }.js` ] ),
		'/runtime/password-strength.js',
		'/components/core/list-table-parts/pagination.js',
		'/components/core/list-table-parts/selection.js',
		'/components/core/list-table-parts/ordered-answers.js',
		'/components/core/list-table-parts/form-fields.js',
		'/kit/InertHtml.js',
		'/runtime/quicktags.js',
		'/components/core/package-parts/queue.js',
		'/components/core/package-parts/events.js',
		'/components/core/package-parts/credentials.js',
	];
	for ( const file of files ) {
		assert.ok( listed.has( file ), file + ' is on the shared list' );
		assert.deepEqual( classifyStatic( file, PUBLIC, listed ), { tier: 'shared' }, file );
		assert.equal( mayServe( classifyStatic( file, PUBLIC, listed ), someone ), 'serve', file );
		assert.equal( mayServe( classifyStatic( file, PUBLIC, listed ), { authenticated: false, components: new Set() } ), 'unauthenticated', file );
	}
	// Unlisted, a part's directory would be read as a page of its own (`core/list-table-parts`), never served.
	assert.deepEqual( classify( '/components/core/list-table-parts/pagination.js' ), { tier: 'page', contractId: 'core/list-table-parts' } );
	assert.deepEqual( classify( '/components/core/package-parts/queue.js' ), { tier: 'page', contractId: 'core/package-parts' } );
} );
