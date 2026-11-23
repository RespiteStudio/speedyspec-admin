import test from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { createI18n, evaluatePlural } from '../site/runtime/i18n.js';

function fakeApi( payloads ) {
	const calls = [];
	return {
		calls,
		async get( route, params ) {
			calls.push( { route, params } );
			const p = payloads[ params.domain ];
			if ( p instanceof Error ) {
				throw p;
			}
			return p ?? { domain: params.domain, locale_data: { [ params.domain ]: { '': { domain: params.domain } } } };
		},
	};
}

const data = ( domain, entries ) => ( { domain, locale_data: { [ domain ]: entries } } );

test( 'missing translation returns source', () => {
	const i18n = createI18n( { api: fakeApi( {} ) } );
	assert.equal( i18n.__( 'Save Changes', 'nope' ), 'Save Changes' );
	assert.equal( i18n._n( 'one', 'many', 1 ), 'one' );
	assert.equal( i18n._n( 'one', 'many', 2 ), 'many' );
} );

test( 'load translates and requests the translations endpoint', async () => {
	const api = fakeApi( { d: data( 'd', { '': { domain: 'd' }, Save: [ 'Speichern' ] } ) } );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	assert.equal( i18n.__( 'Save', 'd' ), 'Speichern' );
	assert.equal( i18n.__( 'Other', 'd' ), 'Other' );
	assert.deepEqual( api.calls[ 0 ], { route: 'wp-admin/v1/translations', params: { domain: 'd', locale: 'de_DE' } } );
} );

test( 'arabic plural picks form by header', async () => {
	const header = { domain: 'd', 'plural-forms': 'nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);' };
	const api = fakeApi( { d: data( 'd', { '': header, '%d item': [ 'f0', 'f1', 'f2', 'f3', 'f4', 'f5' ] } ) } );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'ar', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'ar' );
	assert.equal( i18n._n( '%d item', '%d items', 3, 'd' ), 'f3' );
	assert.equal( i18n._n( '%d item', '%d items', 0, 'd' ), 'f0' );
	assert.equal( i18n._n( '%d item', '%d items', 11, 'd' ), 'f4' );
	assert.equal( i18n._n( '%d item', '%d items', 100, 'd' ), 'f5' );
} );

test( 'header-only locale data does not throw and keeps dir', async () => {
	const i18n = createI18n( { api: fakeApi( {} ) } );
	await i18n.load( [ 'wp-admin-site' ], 'fr_FR' );
	i18n.setLocale( { code: 'fr_FR', dir: 'rtl' } );
	assert.equal( i18n.__( 'Hello', 'wp-admin-site' ), 'Hello' );
	assert.deepEqual( i18n.getLocale(), { code: 'fr_FR', dir: 'rtl' } );
} );

test( 'context separates messages', async () => {
	const api = fakeApi( { d: data( 'd', { '': {}, 'verb\u0004Post': [ 'Veroeffentlichen' ], 'noun\u0004Post': [ 'Beitrag' ] } ) } );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	assert.equal( i18n._x( 'Post', 'verb', 'd' ), 'Veroeffentlichen' );
	assert.equal( i18n._x( 'Post', 'noun', 'd' ), 'Beitrag' );
	assert.equal( i18n._x( 'Post', 'other', 'd' ), 'Post' );
	assert.equal( i18n.__( 'Post', 'd' ), 'Post' );
} );

test( '_nx uses context and plural', async () => {
	const api = fakeApi( { d: data( 'd', { '': { 'plural-forms': 'nplurals=2; plural=(n != 1);' }, 'c\u0004%d post': [ 'ein', 'viele' ] } ) } );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	assert.equal( i18n._nx( '%d post', '%d posts', 1, 'c', 'd' ), 'ein' );
	assert.equal( i18n._nx( '%d post', '%d posts', 5, 'c', 'd' ), 'viele' );
} );

test( 'default domain is "default"', async () => {
	const api = fakeApi( { default: data( 'default', { '': {}, Yes: [ 'Ja' ] } ) } );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'default' ], 'de_DE' );
	assert.equal( i18n.__( 'Yes' ), 'Ja' );
} );

test( 'a failed fetch is treated as no translations, without throwing, and can be retried', async () => {
	const payloads = { d: new Error( 'boom' ) };
	const api = fakeApi( payloads );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	assert.equal( i18n.__( 'Save', 'd' ), 'Save' );
	payloads.d = data( 'd', { '': {}, Save: [ 'Speichern' ] } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	assert.equal( i18n.__( 'Save', 'd' ), 'Speichern' );
} );

test( 'concurrent and repeated loads are de-duplicated', async () => {
	const api = fakeApi( {} );
	const i18n = createI18n( { api } );
	await Promise.all( [ i18n.load( [ 'a', 'b' ], 'de_DE' ), i18n.load( [ 'a' ], 'de_DE' ) ] );
	await i18n.load( [ 'a', 'b' ], 'de_DE' );
	assert.equal( api.calls.length, 2 );
	i18n.setLocale( { code: 'fr_FR', dir: 'ltr' } );
	await i18n.load( [ 'a' ], 'fr_FR' );
	assert.equal( api.calls.length, 3 );
} );

test( 'sprintf supports %s, %d, positional arguments and %%', () => {
	const { sprintf } = createI18n( { api: fakeApi( {} ) } );
	assert.equal( sprintf( 'Hello %s, you have %d items', 'Ann', 3 ), 'Hello Ann, you have 3 items' );
	assert.equal( sprintf( '%2$s %1$s', 'a', 'b' ), 'b a' );
	assert.equal( sprintf( '100%% of %s', 'x' ), '100% of x' );
	assert.equal( sprintf( '%d', '42abc' ), '42' );
	assert.equal( sprintf( '%s', ), '%s' );
	assert.equal( sprintf( '%0$s-%s', 'a' ), '%0$s-a' );
} );

test( 'plural-forms is evaluated safely', () => {
	assert.equal( evaluatePlural( 'nplurals=2; plural=(n != 1);', 1 ), 0 );
	assert.equal( evaluatePlural( 'nplurals=2; plural=(n != 1);', 2 ), 1 );
	assert.equal( evaluatePlural( 'nplurals=1; plural=0;', 5 ), 0 );
	assert.equal( evaluatePlural( 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);', 22 ), 1 );
	for ( const bad of [
		'nplurals=2; plural=constructor.constructor("globalThis.pwned=1")()',
		'nplurals=2; plural=process.exit(1)',
		'nplurals=2; plural=(n)(1)',
		'nplurals=2; plural=n n',
		'nplurals=2; plural=(n ?',
		'nplurals=2; plural=1/0',
		'garbage',
		undefined,
	] ) {
		assert.equal( evaluatePlural( bad, 5 ), 1, String( bad ) ); // English rule for 5.
		assert.equal( evaluatePlural( bad, 1 ), 0, String( bad ) );
	}
	assert.equal( globalThis.pwned, undefined );
} );

test( 'a failed load for one locale keeps another locale\'s strings, and lookups follow the current locale', async () => {
	const payloads = { d: data( 'd', { '': {}, Save: [ 'Speichern' ] } ) };
	const api = fakeApi( payloads );
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'd' ], 'de_DE' );
	payloads.d = new Error( 'down' );
	await i18n.load( [ 'd' ], 'fr_FR' );
	assert.equal( i18n.__( 'Save', 'd' ), 'Speichern' );
	i18n.setLocale( { code: 'fr_FR', dir: 'ltr' } );
	assert.equal( i18n.__( 'Save', 'd' ), 'Save' );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	assert.equal( i18n.__( 'Save', 'd' ), 'Speichern' );
} );

test( 'concurrent loads of different locales do not overwrite each other', async () => {
	const api = {
		async get( route, { domain, locale } ) {
			await new Promise( ( r ) => setTimeout( r, locale === 'de_DE' ? 10 : 0 ) );
			return data( domain, { '': {}, Save: [ locale ] } );
		},
	};
	const i18n = createI18n( { api } );
	await Promise.all( [ i18n.load( [ 'd' ], 'de_DE' ), i18n.load( [ 'd' ], 'fr_FR' ) ] );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	assert.equal( i18n.__( 'Save', 'd' ), 'de_DE' );
	i18n.setLocale( { code: 'fr_FR', dir: 'ltr' } );
	assert.equal( i18n.__( 'Save', 'd' ), 'fr_FR' );
} );

test( 'a page\'s script translations are asked for with the default domain, with its path and context', async () => {
	const calls = [];
	const api = {
		calls,
		async get( route, params ) {
			calls.push( { route, params } );
			if ( params.scripts ) {
				return data( 'default', { '': {}, Save: [ 'Speichern' ], 'Move up': [ 'Nach oben' ] } );
			}
			return data( params.domain, { '': {}, Save: [ 'Speichern' ] } );
		},
	};
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'default', 'wp-admin-site' ], 'de_DE', { scripts: [ 'postbox', 'dashboard', 'postbox' ], path: 'index.php', context: 'network' } );
	assert.deepEqual( calls, [
		{ route: 'wp-admin/v1/translations', params: { domain: 'default', locale: 'de_DE', scripts: 'dashboard,postbox', path: 'index.php', context: 'network' } },
		{ route: 'wp-admin/v1/translations', params: { domain: 'wp-admin-site', locale: 'de_DE' } },
	] );
	assert.equal( i18n.__( 'Move up', 'default' ), 'Nach oben' );
	assert.equal( i18n.__( 'Save', 'default' ), 'Speichern' );

	// A page without script translations gets the default domain alone, and those of the page before are not used.
	await i18n.load( [ 'default' ], 'de_DE' );
	assert.deepEqual( calls.at( -1 ), { route: 'wp-admin/v1/translations', params: { domain: 'default', locale: 'de_DE' } } );
	assert.equal( i18n.__( 'Move up', 'default' ), 'Move up' );
	assert.equal( i18n.__( 'Save', 'default' ), 'Speichern' );

	// Back on the page: cached, not asked for again.
	const count = calls.length;
	await i18n.load( [ 'default' ], 'de_DE', { scripts: [ 'dashboard', 'postbox' ], path: 'index.php', context: 'network' } );
	assert.equal( calls.length, count );
	assert.equal( i18n.__( 'Move up', 'default' ), 'Nach oben' );
} );

test( 'script translations of the site context send no context; an empty path is the area\'s Dashboard', async () => {
	const api = fakeApi( {} );
	const i18n = createI18n( { api } );
	await i18n.load( [ 'default' ], 'fr_FR', { scripts: [ 'postbox' ], path: '', context: 'site' } );
	assert.deepEqual( api.calls[ 0 ].params, { domain: 'default', locale: 'fr_FR', scripts: 'postbox', path: '' } );
} );

test( 'while a page\'s script translations load, the default domain already loaded is used', async () => {
	let release;
	const api = {
		async get( route, params ) {
			if ( params.scripts ) {
				await new Promise( ( resolve ) => {
					release = resolve;
				} );
				return data( 'default', { '': {}, Save: [ 'Speichern!' ] } );
			}
			return data( 'default', { '': {}, Save: [ 'Speichern' ] } );
		},
	};
	const i18n = createI18n( { api } );
	i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
	await i18n.load( [ 'default' ], 'de_DE' );
	const loading = i18n.load( [ 'default' ], 'de_DE', { scripts: [ 'postbox' ], path: 'index.php' } );
	await new Promise( ( resolve ) => setImmediate( resolve ) );
	assert.equal( i18n.__( 'Save', 'default' ), 'Speichern' );
	release();
	await loading;
	assert.equal( i18n.__( 'Save', 'default' ), 'Speichern!' );
} );
