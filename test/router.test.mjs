import { test } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { toPagePath, createRouter, shouldBoot } from '../site/runtime/router.js';
import { ApiError } from '../site/runtime/api.js';

const ORIGIN = 'http://admin.test';

function fakeEnv( initial = '/wp-admin/' ) {
	const location = { origin: ORIGIN, pathname: '', search: '' };
	const set = ( url ) => {
		const u = new URL( url, ORIGIN );
		location.pathname = u.pathname;
		location.search = u.search;
	};
	set( initial );
	const calls = [];
	const history = {
		pushState( s, t, url ) { calls.push( [ 'push', url ] ); set( url ); },
		replaceState( s, t, url ) { calls.push( [ 'replace', url ] ); set( url ); },
	};
	return { location, history, calls, set };
}

function fakeApi( handlers = {} ) {
	const log = [];
	const api = {
		log,
		base: '/wp-json/',
		nonce: null,
		setBase( b ) { api.base = b; },
		setNonce( n ) { api.nonce = n; },
		onUnauthorized( cb ) { api.unauthorized = cb; },
		async get( route, params ) {
			log.push( [ 'get', route, params, api.base ] );
			return handlers.get( route, params );
		},
		async post( route, body ) {
			log.push( [ 'post', route, body, api.base ] );
			return handlers.post( route, body );
		},
		async del( route ) {
			log.push( [ 'del', route, undefined, api.base ] );
			return handlers.del?.( route ) ?? null;
		},
	};
	return api;
}

const manifestFor = ( path ) => ( {
	apiVersion: 1,
	locale: { code: 'en_US', dir: 'ltr' },
	importMap: { imports: {} },
	menu: [],
	replacements: {},
	slots: {},
	page: { path, title: 'T', component: 'c', textDomains: [], data: {} },
} );

const err = ( status, code ) => new ApiError( { status, code, message: code } );

function setup( { env = fakeEnv(), handlers } = {} ) {
	const api = fakeApi( handlers ?? {
		get: async ( route, params ) => manifestFor( params?.path ),
		post: async () => ( { user: { id: 1 }, nonce: 'n2' } ),
	} );
	const router = createRouter( { api, history: env.history, location: env.location } );
	return { api, env, router };
}

test( 'path strips prefix and keeps query', () => assert.deepEqual(
	toPagePath( { pathname: '/wp-admin/edit.php', search: '?post_type=page' } ),
	{ context: 'site', siteId: null, path: 'edit.php?post_type=page' } ) );

test( 'network prefix sets context', () => assert.equal(
	toPagePath( { pathname: '/wp-admin/network/sites.php', search: '' } ).context, 'network' ) );

test( 'user prefix sets context', () => assert.deepEqual(
	toPagePath( { pathname: '/wp-admin/user/profile.php', search: '' } ),
	{ context: 'user', siteId: null, path: 'profile.php' } ) );

test( 'subsite prefix sets siteId', () => assert.equal(
	toPagePath( { pathname: '/sites/3/wp-admin/', search: '' } ).siteId, 3 ) );

test( 'empty path is index.php', () => assert.equal(
	toPagePath( { pathname: '/wp-admin/', search: '' } ).path, 'index.php' ) );

test( 'navigate fetches the router with the page path and sets ready', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/edit.php?post_type=page' );
	assert.equal( router.state.status, 'ready' );
	assert.equal( router.state.page.path, 'edit.php?post_type=page' );
	assert.deepEqual( api.log[ 0 ].slice( 0, 3 ), [ 'get', 'wp-admin/v1/router', { path: 'edit.php?post_type=page' } ] );
} );

test( 'network context is sent as a parameter', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/network/sites.php' );
	assert.deepEqual( api.log[ 0 ][ 2 ], { path: 'sites.php', context: 'network' } );
} );

// Cross-repository contract: WordPress's WP_Test_REST_Admin_Router_Controller::
// test_network_screen_resolves_with_the_parameters_the_admin_site_sends dispatches exactly these
// parameters. Change both together.
test( 'the router parameters for a network screen are exactly path and context', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/network/sites.php' );
	const [ method, route, params, base ] = api.log[ 0 ];
	assert.deepEqual( [ method, route, base ], [ 'get', 'wp-admin/v1/router', '/wp-json/' ] );
	assert.deepEqual( Object.keys( params ).sort(), [ 'context', 'path' ] );
	assert.deepEqual( params, { path: 'sites.php', context: 'network' } );
	// The network dashboard: the empty path becomes index.php; WordPress adds the network/ prefix.
	await router.navigate( '/wp-admin/network/' );
	assert.deepEqual( api.log.at( -1 )[ 2 ], { path: 'index.php', context: 'network' } );
} );

test( '/sites/3/wp-admin/ sets the API base', async () => {
	const { api, router } = setup();
	await router.navigate( '/sites/3/wp-admin/' );
	assert.equal( api.log[ 0 ][ 3 ], '/sites/3/wp-json/' );
	await router.navigate( '/wp-admin/' );
	assert.equal( api.log[ 1 ][ 3 ], '/wp-json/' );
} );

test( '401 from router sets status login and remembers url', async () => {
	const env = fakeEnv();
	const { router } = setup( { env, handlers: { get: async () => { throw err( 401, 'rest_not_logged_in' ); } } } );
	await router.navigate( '/wp-admin/options-general.php' );
	assert.equal( router.state.status, 'login' );
	assert.equal( router.state.rememberedUrl, '/wp-admin/options-general.php' );
} );

test( 'after login the remembered url is navigated to', async () => {
	const env = fakeEnv();
	let signedIn = false;
	const { api, router } = setup( { env, handlers: {
		get: async ( route, params ) => {
			if ( ! signedIn ) { throw err( 401, 'rest_not_logged_in' ); }
			return manifestFor( params.path );
		},
		post: async ( route, body ) => {
			assert.equal( route, 'wp-admin/v1/session' );
			assert.deepEqual( body, { username: 'a', password: 'b', remember: true, redirect_to: 'options-general.php' } );
			signedIn = true;
			return { user: { id: 1 }, nonce: 'abc' };
		},
	} } );
	await router.navigate( '/wp-admin/options-general.php' );
	await router.login( { username: 'a', password: 'b', remember: true } );
	assert.equal( api.nonce, 'abc' );
	assert.equal( router.state.status, 'ready' );
	assert.equal( router.state.page.path, 'options-general.php' );
	assert.equal( env.location.pathname, '/wp-admin/options-general.php' );
} );

test( 'login failure keeps login status and rethrows', async () => {
	const { router } = setup( { handlers: {
		get: async () => { throw err( 401, 'rest_not_logged_in' ); },
		post: async () => { throw err( 401, 'incorrect_password' ); },
	} } );
	await router.navigate( '/wp-admin/' );
	await assert.rejects( router.login( { username: 'a', password: 'x', remember: false } ), { code: 'incorrect_password' } );
	assert.equal( router.state.status, 'login' );
} );

test( 'upstream unreachable sets status error; refresh retries', async () => {
	let down = true;
	const { api, router } = setup( { handlers: {
		get: async ( route, params ) => {
			if ( down ) { throw err( 502, 'admin_upstream_unreachable' ); }
			return manifestFor( params.path );
		},
	} } );
	await router.navigate( '/wp-admin/' );
	assert.equal( router.state.status, 'error' );
	assert.equal( router.state.error.code, 'admin_upstream_unreachable' );
	down = false;
	await router.refresh();
	assert.equal( router.state.status, 'ready' );
	assert.equal( api.log.length, 2 );
} );

test( '403 sets forbidden, 404 sets notfound', async () => {
	let status = 403;
	const { router } = setup( { handlers: { get: async () => { throw err( status, 'x' ); } } } );
	await router.navigate( '/wp-admin/a.php' );
	assert.equal( router.state.status, 'forbidden' );
	status = 404;
	await router.navigate( '/wp-admin/b.php' );
	assert.equal( router.state.status, 'notfound' );
} );

test( 'a nonce refusal that survived the refresh is an error with Retry, never the forbidden screen', async () => {
	const { router } = setup( { handlers: { get: async () => { throw err( 403, 'rest_cookie_invalid_nonce' ); } } } );
	await router.navigate( '/wp-admin/a.php' );
	assert.equal( router.state.status, 'error' );
	assert.equal( router.state.error.code, 'rest_cookie_invalid_nonce' );
} );

test( 'a plugin redirect during admin_init (409 admin_init_redirect) is the forbidden screen, keeping the location', async () => {
	const { router } = setup( { handlers: { get: async () => {
		throw new ApiError( { status: 409, code: 'admin_init_redirect', message: 'A plugin redirected the admin while it started.', data: { status: 409, location: 'http://admin.test/' } } );
	} } } );
	await router.navigate( '/wp-admin/options-general.php' );
	assert.equal( router.state.status, 'forbidden' );
	assert.equal( router.state.error.data.location, 'http://admin.test/' );
} );

test( 'navigating to the same path and query does not refetch unless refresh', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/edit.php?post_type=page' );
	await router.navigate( '/wp-admin/edit.php?post_type=page' );
	assert.equal( api.log.length, 1 );
	await router.refresh();
	assert.equal( api.log.length, 2 );
} );

test( 'navigate pushes history, replace replaces it', async () => {
	const { env, router } = setup();
	await router.navigate( '/wp-admin/a.php' );
	await router.navigate( '/wp-admin/b.php', { replace: true } );
	assert.deepEqual( env.calls, [ [ 'push', '/wp-admin/a.php' ], [ 'replace', '/wp-admin/b.php' ] ] );
} );

test( 'popstate navigates to the current location without pushing', async () => {
	const { api, env, router } = setup();
	const handlers = {};
	const win = { addEventListener: ( type, fn ) => { handlers[ type ] = fn; } };
	router.listen( { window: win, document: { addEventListener: () => {} } } );
	env.set( '/wp-admin/plugins.php' );
	await handlers.popstate();
	assert.equal( router.state.page.path, 'plugins.php' );
	assert.equal( api.log.length, 1 );
	assert.deepEqual( env.calls, [] );
} );

function clickOn( router, anchor, overrides = {}, win = {} ) {
	let listener;
	router.listen( {
		window: { addEventListener: () => {}, ...win },
		document: { addEventListener: ( type, fn ) => { listener = fn; } },
	} );
	let prevented = false;
	const event = {
		defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
		target: { closest: () => anchor },
		preventDefault: () => { prevented = true; },
		...overrides,
	};
	listener( event );
	return () => prevented;
}

const anchorFor = ( href, attrs = {} ) => ( {
	href: new URL( href, ORIGIN ).href,
	getAttribute: ( name ) => ( name in attrs ? attrs[ name ] : null ),
	hasAttribute: ( name ) => name in attrs,
} );

test( 'same-origin /wp-admin/ clicks are intercepted', async () => {
	const { api, router } = setup();
	const prevented = clickOn( router, anchorFor( '/wp-admin/edit.php' ) );
	assert.equal( prevented(), true );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( api.log.length, 1 );
} );

for ( const [ name, anchor, overrides ] of [
	[ 'target', anchorFor( '/wp-admin/a.php', { target: '_blank' } ), {} ],
	[ 'download', anchorFor( '/wp-admin/a.php', { download: '' } ), {} ],
	[ 'rel external', anchorFor( '/wp-admin/a.php', { rel: 'noopener external' } ), {} ],
	[ 'other origin', { ...anchorFor( '/wp-admin/a.php' ), href: 'http://other.test/wp-admin/a.php', getAttribute: () => null }, {} ],
	[ 'outside wp-admin', anchorFor( '/wp-login.php' ), {} ],
	[ 'modifier key', anchorFor( '/wp-admin/a.php' ), { metaKey: true } ],
	[ 'non-primary button', anchorFor( '/wp-admin/a.php' ), { button: 1 } ],
] ) {
	test( 'clicks are not intercepted: ' + name, () => {
		const { api, router } = setup();
		const prevented = clickOn( router, anchor, overrides );
		assert.equal( prevented(), false );
		assert.equal( api.log.length, 0 );
	} );
}

// The one link-routing rule (core/plugins and core/plugin-install 1.2.0): a link in plugin output
// that opens in this window, even through `target`, opens through the router; resolved as the
// browser resolves it, against the admin address shown.
for ( const target of [ '_top', '_self', '_parent', '_TOP' ] ) {
	test( 'a same-origin link with target ' + target + ' opens through the router', async () => {
		const { api, router } = setup();
		const prevented = clickOn( router, anchorFor( '/wp-admin/update.php?action=install-plugin&plugin=x', { target } ) );
		assert.equal( prevented(), true );
		await new Promise( ( r ) => setImmediate( r ) );
		assert.equal( api.log.at( -1 )[ 2 ].path, 'update.php?action=install-plugin&plugin=x' );
	} );
}

test( 'a link with target _top inside a framed admin is the browser\'s: it leaves the frame', () => {
	const { api, router } = setup();
	const prevented = clickOn( router, anchorFor( '/wp-admin/plugins.php', { target: '_top' } ), {}, { top: {}, self: {} } );
	assert.equal( prevented(), false );
	assert.equal( api.log.length, 0 );
} );

test( 'a relative link in plugin output is resolved against the admin shown, and one that leaves the admin is the browser\'s', async () => {
	const { api, router } = setup();
	const inAdmin = clickOn( router, anchorFor( new URL( 'plugins.php?action=activate&plugin=x', ORIGIN + '/wp-admin/plugin-install.php' ).href, { target: '_parent' } ) );
	const out = clickOn( router, anchorFor( new URL( '../evil.php', ORIGIN + '/wp-admin/plugin-install.php' ).href ) );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.deepEqual( [ inAdmin(), out(), api.log.map( ( entry ) => entry[ 2 ].path ) ], [ true, false, [ 'plugins.php?action=activate&plugin=x' ] ] );
} );

/**
 * A browser history as a stack of entries (`{ state, url }`) and the position shown: push drops
 * the forward entries, go() moves and then fires popstate, as a browser does.
 */
function stackEnv( initial = '/wp-admin/' ) {
	const location = { origin: ORIGIN, pathname: '', search: '' };
	const show = ( url ) => {
		const u = new URL( url, ORIGIN );
		location.pathname = u.pathname;
		location.search = u.search;
	};
	const entries = [ { state: null, url: initial } ];
	let at = 0;
	const handlers = {};
	const history = {
		get state() {
			return entries[ at ].state;
		},
		pushState( state, title, url ) {
			entries.splice( at + 1, entries.length, { state, url } );
			at = entries.length - 1;
			show( url );
		},
		replaceState( state, title, url ) {
			entries[ at ] = { state, url };
			show( url );
		},
		go( delta ) {
			at = Math.min( Math.max( at + delta, 0 ), entries.length - 1 );
			show( entries[ at ].url );
			return handlers.popstate?.();
		},
	};
	show( initial );
	const traverse = ( delta ) => history.go( delta );
	const listen = ( router ) => router.listen( { window: { addEventListener: ( type, fn ) => { handlers[ type ] = fn; } }, document: { addEventListener: () => {} } } );
	return { location, history, listen, traverse, stack: () => ( { urls: entries.map( ( entry ) => entry.url ), at } ) };
}

for ( const [ name, from, delta ] of [ [ 'Back', 1, -1 ], [ 'Forward', 0, 1 ] ] ) {
	test( 'a declined leave after ' + name + ' keeps every history entry: the page shown stays current, and later the entry is reached', async () => {
		const env = stackEnv( '/wp-admin/index.php' );
		let answer = false;
		const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
		const router = createRouter( { api, history: env.history, location: env.location, confirm: () => answer } );
		env.listen( router );
		await router.navigate( '/wp-admin/index.php' );
		await router.navigate( '/wp-admin/plugins.php' );
		if ( from === 0 ) {
			await env.traverse( -1 );
		}
		const shown = router.state.page.path;
		router.setLeaveWarning( 'Updates may not complete if you navigate away from this page.' );
		await env.traverse( delta );
		await new Promise( ( r ) => setImmediate( r ) );
		const declined = [ env.stack(), router.state.page.path ];
		router.setLeaveWarning( null );
		answer = true;
		await env.traverse( delta );
		await new Promise( ( r ) => setImmediate( r ) );
		const urls = [ '/wp-admin/index.php', '/wp-admin/plugins.php' ];
		assert.deepEqual( [ declined, router.state.page.path ], [ [ { urls, at: from }, shown ], from === 1 ? 'index.php' : 'plugins.php' ] );
	} );
}

test( 'session expiry (401 from a later call) sets login and remembers the current url', async () => {
	const env = fakeEnv();
	const { api, router } = setup( { env } );
	await router.navigate( '/wp-admin/edit.php?post_type=page' );
	api.unauthorized( err( 401, 'rest_not_logged_in' ) );
	assert.equal( router.state.status, 'login' );
	assert.equal( router.state.rememberedUrl, '/wp-admin/edit.php?post_type=page' );
} );

test( 'start restores the session or falls back to login/error', async () => {
	const ok = setup( { handlers: {
		get: async ( route, params ) => ( route === 'wp-admin/v1/session' ? { user: { id: 1 }, nonce: 'n' } : manifestFor( params.path ) ),
	} } );
	await ok.router.start();
	assert.equal( ok.router.state.status, 'ready' );
	assert.equal( ok.api.nonce, 'n' );

	const out = setup( { handlers: { get: async () => { throw err( 401, 'rest_not_logged_in' ); } } } );
	await out.router.start();
	assert.equal( out.router.state.status, 'login' );

	const down = setup( { handlers: { get: async () => { throw err( 502, 'admin_upstream_unreachable' ); } } } );
	await down.router.start();
	assert.equal( down.router.state.status, 'error' );
} );

test( 'refresh after a failed start retries the session', async () => {
	let down = true;
	const { router } = setup( { handlers: {
		get: async ( route, params ) => {
			if ( down ) { throw err( 502, 'admin_upstream_unreachable' ); }
			return route === 'wp-admin/v1/session' ? { user: { id: 1 }, nonce: 'n' } : manifestFor( params.path );
		},
	} } );
	await router.start();
	down = false;
	await router.refresh();
	assert.equal( router.state.status, 'ready' );
} );

test( 'signOut deletes the session and sets login', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/' );
	await router.signOut();
	assert.deepEqual( api.log.at( -1 ).slice( 0, 2 ), [ 'del', 'wp-admin/v1/session' ] );
	assert.equal( router.state.status, 'login' );
	assert.equal( api.nonce, null );
} );

test( 'onManifest runs before ready and its failure leaves status error', async () => {
	const env = fakeEnv();
	const seen = [];
	const api = fakeApi( { get: async ( r, p ) => manifestFor( p.path ) } );
	const router = createRouter( {
		api, history: env.history, location: env.location,
		onManifest: async ( m ) => { seen.push( m.page.path ); },
	} );
	await router.navigate( '/wp-admin/x.php' );
	assert.deepEqual( seen, [ 'x.php' ] );
	assert.equal( router.state.status, 'ready' );
} );

const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise( ( res, rej ) => { resolve = res; reject = rej; } );
	return { promise, resolve, reject };
};
const tick = () => new Promise( ( r ) => setImmediate( r ) );

test( 'onManifest throwing sets status error and refresh recovers', async () => {
	const env = fakeEnv();
	const api = fakeApi( { get: async ( r, p ) => manifestFor( p.path ) } );
	let fail = true;
	const router = createRouter( {
		api, history: env.history, location: env.location,
		onManifest: async () => { if ( fail ) { throw new Error( 'boom' ); } },
	} );
	await router.navigate( '/wp-admin/x.php' );
	assert.equal( router.state.status, 'error' );
	fail = false;
	await router.refresh();
	assert.equal( router.state.status, 'ready' );
} );

test( 'a slow response for an older navigation is ignored', async () => {
	const env = fakeEnv();
	const slow = deferred();
	const api = fakeApi( { get: ( r, p ) => ( p.path === 'a.php' ? slow.promise : Promise.resolve( manifestFor( p.path ) ) ) } );
	const applied = [];
	const router = createRouter( {
		api, history: env.history, location: env.location,
		onManifest: async ( m ) => { applied.push( m.page.path ); },
	} );
	const a = router.navigate( '/wp-admin/a.php' );
	await router.navigate( '/wp-admin/b.php' );
	slow.resolve( manifestFor( 'a.php' ) );
	await a;
	assert.equal( router.state.status, 'ready' );
	assert.equal( router.state.page.path, 'b.php' );
	assert.equal( env.location.pathname, '/wp-admin/b.php' );
	assert.deepEqual( applied, [ 'b.php' ] );
} );

test( 'a slow failure for an older navigation does not change the newer state', async () => {
	const env = fakeEnv();
	const slow = deferred();
	const api = fakeApi( { get: ( r, p ) => ( p.path === 'a.php' ? slow.promise : Promise.resolve( manifestFor( p.path ) ) ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	const a = router.navigate( '/wp-admin/a.php' );
	await router.navigate( '/wp-admin/b.php' );
	slow.reject( err( 404, 'rest_admin_page_not_found' ) );
	await a;
	assert.equal( router.state.status, 'ready' );
	assert.equal( router.state.page.path, 'b.php' );
} );

test( 'a 401 for an older navigation means the session is gone: login, newest url remembered', async () => {
	const env = fakeEnv();
	const slow = deferred();
	const api = fakeApi( { get: ( r, p ) => ( p.path === 'a.php' ? slow.promise : Promise.resolve( manifestFor( p.path ) ) ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	const a = router.navigate( '/wp-admin/a.php' );
	await router.navigate( '/wp-admin/b.php?x=1' );
	slow.reject( err( 401, 'rest_not_logged_in' ) );
	await a;
	assert.equal( router.state.status, 'login' );
	assert.equal( router.state.rememberedUrl, '/wp-admin/b.php?x=1' );
} );

test( 'session calls use the root base, router calls the site base, even after a subsite visit', async () => {
	const env = fakeEnv( '/sites/3/wp-admin/' );
	const { api, router } = setup( { env, handlers: {
		get: async ( route, params ) => ( route === 'wp-admin/v1/session' ? { user: { id: 1 }, nonce: 'n' } : manifestFor( params.path ) ),
		post: async () => ( { user: { id: 1 }, nonce: 'm' } ),
	} } );
	await router.start();
	await router.navigate( '/sites/3/wp-admin/edit.php' );
	await router.login( { username: 'a', password: 'b', remember: false } );
	await router.refresh();
	await router.signOut();
	const bases = api.log.map( ( [ method, route, , base ] ) => [ method, route, base ] );
	assert.deepEqual( bases[ 0 ], [ 'get', 'wp-admin/v1/session', '/wp-json/' ] );
	assert.deepEqual( bases[ 1 ], [ 'get', 'wp-admin/v1/router', '/sites/3/wp-json/' ] );
	assert.deepEqual( bases.find( ( [ m ] ) => m === 'post' ), [ 'post', 'wp-admin/v1/session', '/wp-json/' ] );
	assert.deepEqual( bases.at( -1 ), [ 'del', 'wp-admin/v1/session', '/wp-json/' ] );
	// The router call after login is back on the site base.
	const afterPost = bases.slice( bases.findIndex( ( [ m ] ) => m === 'post' ) + 1 );
	assert.equal( afterPost[ 0 ][ 2 ], '/sites/3/wp-json/' );
} );

test( 'a failed sign-out on a subsite leaves the client on that site base', async () => {
	const env = fakeEnv( '/sites/3/wp-admin/options-general.php' );
	const { api, router } = setup( { env, handlers: {
		get: async ( route, params ) => ( route === 'wp-admin/v1/session' ? { user: { id: 1 }, nonce: 'n' } : manifestFor( params.path ) ),
		post: async () => ( { user: { id: 1 }, nonce: 'm' } ),
		del: async () => { throw err( 0, 'admin_upstream_unreachable' ); },
	} } );
	api.del = async ( route ) => {
		api.log.push( [ 'del', route, undefined, api.base ] );
		throw err( 0, 'admin_upstream_unreachable' );
	};
	await router.start();
	await assert.rejects( router.signOut() );
	assert.equal( api.log.at( -1 )[ 3 ], '/wp-json/', 'the session call itself goes to the root site' );
	assert.equal( api.base, '/sites/3/wp-json/', 'the page\'s next save still goes to site 3' );
	assert.equal( router.state.status, 'ready' );
} );

test( 'login does not touch history when the url is unchanged', async () => {
	const env = fakeEnv( '/wp-admin/options-general.php' );
	let signedIn = false;
	const { router } = setup( { env, handlers: {
		get: async ( route, params ) => {
			if ( ! signedIn ) { throw err( 401, 'rest_not_logged_in' ); }
			return manifestFor( params.path );
		},
		post: async () => { signedIn = true; return { user: { id: 1 }, nonce: 'n' }; },
	} } );
	await router.navigate( '/wp-admin/options-general.php' );
	assert.equal( router.state.status, 'login' );
	env.calls.length = 0;
	await router.login( { username: 'a', password: 'b', remember: false } );
	assert.equal( router.state.status, 'ready' );
	assert.deepEqual( env.calls, [] );
} );

function clickHref( router, env, href ) {
	let listener;
	router.listen( {
		window: { addEventListener: () => {} },
		document: { addEventListener: ( t, fn ) => { listener = fn; } },
	} );
	let prevented = false;
	listener( {
		defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
		target: { closest: () => anchorFor( href ) },
		preventDefault: () => { prevented = true; },
	} );
	return () => prevented;
}

test( 'an in-page anchor on the current screen is left to the browser', async () => {
	const { api, env, router } = setup( { env: fakeEnv( '/wp-admin/edit.php?post_type=page' ) } );
	const prevented = clickHref( router, env, '/wp-admin/edit.php?post_type=page#section' );
	await tick();
	assert.equal( prevented(), false );
	assert.equal( api.log.length, 0 );
	assert.deepEqual( env.calls, [] );
} );

test( 'a link to another screen keeps its hash in the pushed url', async () => {
	const { env, router } = setup();
	const prevented = clickHref( router, env, '/wp-admin/options-general.php#top' );
	await tick();
	assert.equal( prevented(), true );
	assert.deepEqual( env.calls, [ [ 'push', '/wp-admin/options-general.php#top' ] ] );
} );

test( 'onManifest failing with a 401 (a refused protected module) is an ended session: login, url remembered', async () => {
	const env = fakeEnv( '/wp-admin/options-general.php' );
	const api = fakeApi( { get: async ( r, p ) => manifestFor( p.path ) } );
	const router = createRouter( {
		api, history: env.history, location: env.location,
		onManifest: async () => { throw err( 401, 'admin_not_authenticated' ); },
	} );
	await router.navigate( '/wp-admin/options-general.php' );
	assert.equal( router.state.status, 'login' );
	assert.equal( router.state.rememberedUrl, '/wp-admin/options-general.php' );
} );

test( 'expire() sends a signed-in user to the login screen and ignores the navigation in flight', async () => {
	const env = fakeEnv( '/wp-admin/x.php' );
	const slow = deferred();
	const api = fakeApi( { get: async ( r, p ) => ( p.path === 'y.php' ? slow.promise : manifestFor( p.path ) ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	await router.navigate( '/wp-admin/x.php' );
	assert.equal( router.state.status, 'ready' );
	const pending = router.navigate( '/wp-admin/y.php' );
	await tick();
	router.expire();
	assert.equal( router.state.status, 'login' );
	assert.equal( router.state.rememberedUrl, '/wp-admin/y.php' );
	slow.resolve( manifestFor( 'y.php' ) );
	await pending;
	assert.equal( router.state.status, 'login' );
} );

test( 'lookup asks the router which page a URL is, without changing the state, history or the client base', async () => {
	const { api, env, router } = setup();
	await router.navigate( '/wp-admin/edit.php' );
	const before = { page: router.state.page, status: router.state.status, calls: env.calls.length };
	const answer = await router.lookup( '/sites/3/wp-admin/network/sites.php?x=1#h' );
	assert.equal( answer.page.path, 'sites.php?x=1' );
	assert.deepEqual( api.log.at( -1 ), [ 'get', 'wp-admin/v1/router', { path: 'sites.php?x=1', context: 'network' }, '/sites/3/wp-json/' ] );
	assert.deepEqual( { page: router.state.page, status: router.state.status, calls: env.calls.length }, before );
	assert.equal( env.location.pathname, '/wp-admin/edit.php' );
	assert.equal( api.base, '/wp-json/', 'the client stays on the site shown' );
} );

test( 'lookup leaves the client base untouched when the router answers 404 or fails', async () => {
	for ( const failure of [ err( 404, 'rest_admin_page_not_found' ), err( 0, 'admin_upstream_unreachable' ) ] ) {
		const env = fakeEnv( '/sites/2/wp-admin/' );
		const api = fakeApi( { get: async ( r, p ) => {
			if ( p.path === 'x.php' ) {
				throw failure;
			}
			return manifestFor( p.path );
		} } );
		const router = createRouter( { api, history: env.history, location: env.location } );
		await router.navigate( '/sites/2/wp-admin/' );
		assert.equal( api.base, '/sites/2/wp-json/' );
		await assert.rejects( router.lookup( '/wp-admin/x.php' ), { status: failure.status } );
		assert.equal( api.base, '/sites/2/wp-json/' );
	}
} );

test( 'navigate with adopt replaces the history entry and loads the page; a given manifest is used without a request', async () => {
	const { api, env, router } = setup();
	await router.navigate( '/wp-admin/edit.php' );
	await router.navigate( '/wp-admin/post-new.php#x', { adopt: true } );
	assert.deepEqual( env.calls, [ [ 'push', '/wp-admin/edit.php' ], [ 'replace', '/wp-admin/post-new.php#x' ] ] );
	assert.equal( router.state.page.path, 'post-new.php' );
	assert.equal( api.log.length, 2 );

	const seen = [];
	const env2 = fakeEnv( '/wp-admin/a.php' );
	const api2 = fakeApi( { get: async ( r, p ) => manifestFor( p.path ) } );
	const router2 = createRouter( { api: api2, history: env2.history, location: env2.location, onManifest: async ( m ) => seen.push( m.page.path ) } );
	await router2.navigate( '/wp-admin/a.php' );
	const manifest = manifestFor( 'b.php' );
	assert.equal( await router2.navigate( '/wp-admin/b.php', { adopt: true, manifest } ), true );
	assert.equal( router2.state.manifest, manifest );
	assert.equal( router2.state.status, 'ready' );
	assert.deepEqual( seen, [ 'a.php', 'b.php' ] );
	assert.equal( api2.log.length, 1, 'no second request' );
	assert.deepEqual( env2.calls.at( -1 ), [ 'replace', '/wp-admin/b.php' ] );
} );

test( 'an adopt to another site leaves the client on that site base', async () => {
	const { api, router } = setup();
	await router.navigate( '/wp-admin/edit.php' );
	const answer = await router.lookup( '/sites/2/wp-admin/edit.php' );
	assert.equal( api.base, '/wp-json/' );
	await router.navigate( '/sites/2/wp-admin/edit.php', { adopt: true, manifest: answer } );
	assert.equal( api.base, '/sites/2/wp-json/' );
	assert.equal( router.state.page.path, 'edit.php' );
} );

test( 'a stale adopt (the router navigated since the frame load) is refused: the newer menu navigation wins', async () => {
	const env = fakeEnv( '/wp-admin/a.php' );
	const slowC = deferred();
	const api = fakeApi( { get: async ( r, p ) => ( p.path === 'c.php' ? slowC.promise : manifestFor( p.path ) ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	await router.navigate( '/wp-admin/a.php' );
	const since = router.navigationCount(); // The frame loaded b.php; its lookup is slow.
	const lookupB = deferred();
	const adopted = lookupB.promise.then( ( answer ) => router.navigate( '/wp-admin/b.php', { adopt: true, manifest: answer, since } ) );
	const menu = router.navigate( '/wp-admin/c.php' ); // The user clicks C meanwhile.
	await tick();
	lookupB.resolve( manifestFor( 'b.php' ) );
	assert.equal( await adopted, false );
	slowC.resolve( manifestFor( 'c.php' ) );
	await menu;
	assert.equal( router.state.page.path, 'c.php' );
	assert.equal( env.location.pathname, '/wp-admin/c.php' );
	assert.deepEqual( env.calls.at( -1 ), [ 'push', '/wp-admin/c.php' ] );
	assert.ok( ! env.calls.some( ( [ , url ] ) => url === '/wp-admin/b.php' ) );
} );

test( 'every navigation asked for from outside a frame counts as a visit, also to the URL shown; adopting does not', async () => {
	const { router } = setup();
	await router.navigate( '/wp-admin/a.php' );
	const visits = router.state.visits;
	await router.navigate( '/wp-admin/a.php' );
	assert.equal( router.state.visits, visits + 1 );
	await router.navigate( '/wp-admin/b.php', { adopt: true } );
	assert.equal( router.state.visits, visits + 1 );
} );

test( 'shouldBoot: the app starts only in a top-level window', () => {
	const top = {};
	top.top = top;
	top.self = top;
	assert.equal( shouldBoot( top ), true );
	const framed = { top, self: null };
	framed.self = framed;
	assert.equal( shouldBoot( framed ), false );
	assert.equal( shouldBoot( { get top() {
		throw new Error( 'SecurityError' );
	}, self: {} } ), false );
} );

// Page redirects (WP_Admin_Page_Redirect) -----------------------------------------------------

/** A router whose answers redirect as `redirects` says ( path => page fields ), and whose location can be assigned. */
function redirecting( redirects, initial = '/wp-admin/' ) {
	const env = fakeEnv( initial );
	const assigned = [];
	env.location.assign = ( url ) => assigned.push( url );
	const shown = [];
	const api = fakeApi( {
		get: async ( route, params ) => {
			const extra = redirects[ params?.path ];
			const manifest = manifestFor( params?.path );
			if ( extra ) {
				manifest.page = { path: params.path, title: 'Redirect', component: 'c', redirect: extra.redirect, location: extra.location, data: {} };
			}
			return manifest;
		},
	} );
	const router = createRouter( { api, history: env.history, location: env.location } );
	router.observe( ( manifest ) => shown.push( manifest.page.path ) );
	return { env, api, router, assigned, shown };
}

test( 'a page answer with a redirect is followed with history replace, without showing the redirecting page', async () => {
	const { env, router, shown } = redirecting( { 'comment.php?action=approve&c=3': { redirect: 'edit-comments.php?approved=1' } } );
	await router.navigate( '/wp-admin/comment.php?action=approve&c=3' );
	assert.deepEqual( env.calls, [ [ 'push', '/wp-admin/comment.php?action=approve&c=3' ], [ 'replace', '/wp-admin/edit-comments.php?approved=1' ] ] );
	assert.equal( router.state.status, 'ready' );
	assert.equal( router.state.page.path, 'edit-comments.php?approved=1' );
	assert.deepEqual( shown, [ 'edit-comments.php?approved=1' ], 'only the page redirected to is shown' );
} );

test( 'a redirect resolves against the admin base of the site shown and is never percent-decoded', async () => {
	const { env, router } = redirecting( { 'x.php': { redirect: 'edit-comments.php?s=a%2Fb%20c&p=1#comment-2' }, 'n.php': { redirect: 'network/sites.php' } }, '/sites/3/wp-admin/' );
	await router.navigate( '/sites/3/wp-admin/x.php' );
	assert.deepEqual( env.calls.at( -1 ), [ 'replace', '/sites/3/wp-admin/edit-comments.php?s=a%2Fb%20c&p=1#comment-2' ] );
	assert.equal( router.state.page.path, 'edit-comments.php?s=a%2Fb%20c&p=1' );
	// From the network admin as well: the path is relative to the site's admin, not to network/.
	await router.navigate( '/sites/3/wp-admin/network/n.php' );
	assert.deepEqual( env.calls.at( -1 ), [ 'replace', '/sites/3/wp-admin/network/sites.php' ] );
	// An empty redirect is the admin itself.
	const empty = redirecting( { 'y.php': { redirect: '' } } );
	await empty.router.navigate( '/wp-admin/y.php' );
	assert.deepEqual( empty.env.calls.at( -1 ), [ 'replace', '/wp-admin/' ] );
	assert.equal( empty.router.state.page.path, 'index.php' );
} );

test( 'a location answer gets a full-page load, and so does a redirect that leaves the admin', async () => {
	const { router, assigned, shown } = redirecting( {
		'out.php': { location: 'http://admin.test/wp-login.php?action=logout' },
		'up.php': { redirect: '%2e%2e/wp-login.php' },
	} );
	await router.navigate( '/wp-admin/out.php' );
	assert.deepEqual( assigned, [ 'http://admin.test/wp-login.php?action=logout' ] );
	await router.navigate( '/wp-admin/up.php' );
	assert.deepEqual( assigned.at( -1 ), 'http://admin.test/wp-login.php', 'a dot segment the URL parser resolves leaves the admin: not a native page' );
	assert.deepEqual( shown, [] );
} );

test( 'a redirect to another origin, or a loop of redirects, is an error and never followed', async () => {
	const other = redirecting( { 'a.php': { redirect: '//evil.example/x' } } );
	await other.router.navigate( '/wp-admin/a.php' );
	assert.equal( other.router.state.status, 'error' );
	assert.deepEqual( other.assigned, [] );
	assert.ok( ! other.env.calls.some( ( [ , url ] ) => url.includes( 'evil' ) ) );

	const loop = redirecting( { 'a.php': { redirect: 'b.php' }, 'b.php': { redirect: 'a.php' } } );
	await loop.router.navigate( '/wp-admin/a.php' );
	assert.equal( loop.router.state.status, 'error' );
	assert.ok( loop.api.log.length <= 12, 'stops after a few hops' );
} );

test( 'follow() opens an answer\'s redirect as a navigation and its location as a full-page load', async () => {
	const { env, router, assigned } = redirecting( {}, '/sites/2/wp-admin/edit-comments.php' );
	assert.equal( await router.follow( { redirect: 'edit-comments.php?trashed=1&ids=4', location: null } ), true );
	assert.deepEqual( env.calls.at( -1 ), [ 'push', '/sites/2/wp-admin/edit-comments.php?trashed=1&ids=4' ] );
	assert.equal( await router.follow( { redirect: 'edit-comments.php?x=1' }, { replace: true } ), true );
	assert.deepEqual( env.calls.at( -1 ), [ 'replace', '/sites/2/wp-admin/edit-comments.php?x=1' ] );
	assert.equal( await router.follow( { redirect: null, location: 'http://admin.test/?p=1' } ), true );
	assert.deepEqual( assigned, [ 'http://admin.test/?p=1' ] );
	assert.equal( await router.follow( { redirect: null, location: null } ), false );
	assert.equal( await router.follow( { redirect: '//evil.example/' } ), false );
} );

test( 'previousUrl() is the address of the page shown before this one (redirecting pages and reloads aside)', async () => {
	const { router } = redirecting( { 'comment.php?action=approve&c=3': { redirect: 'edit-comments.php?approved=1' } }, '/wp-admin/edit-comments.php?comment_status=all' );
	assert.equal( router.previousUrl(), null, 'nothing shown yet' );
	await router.navigate( '/wp-admin/edit-comments.php?comment_status=all' );
	assert.equal( router.previousUrl(), null, 'the first page has none' );
	await router.navigate( '/wp-admin/comment.php?action=editcomment&c=3' );
	assert.equal( router.previousUrl(), '/wp-admin/edit-comments.php?comment_status=all' );
	await router.refresh();
	assert.equal( router.previousUrl(), '/wp-admin/edit-comments.php?comment_status=all', 'a reload of the same address keeps it' );
	await router.navigate( '/wp-admin/comment.php?action=approve&c=3' );
	assert.equal( router.previousUrl(), '/wp-admin/comment.php?action=editcomment&c=3', 'the redirecting page is never shown' );
} );

test( 'an in-place navigation (a live search) is marked on the state; any other navigation and a refresh are not', async () => {
	const { router } = setup();
	await router.navigate( '/wp-admin/plugins.php' );
	assert.equal( router.state.inPlace, false );
	await router.navigate( '/wp-admin/plugins.php?s=seo', { replace: true, inPlace: true } );
	assert.equal( router.state.inPlace, true );
	assert.equal( router.state.page.path, 'plugins.php?s=seo' );
	await router.refresh();
	assert.equal( router.state.inPlace, false );
	await router.navigate( '/wp-admin/plugins.php?s=forms', { replace: true, inPlace: true } );
	await router.navigate( '/wp-admin/plugin-install.php' );
	assert.equal( router.state.inPlace, false );
} );

test( 'a leave warning asks before a navigation leaves the page; declined, nothing changes and Back is put back', async () => {
	const env = fakeEnv();
	const asked = [];
	let answer = false;
	const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
	const router = createRouter( { api, history: env.history, location: env.location, confirm: ( message ) => {
		asked.push( message );
		return answer;
	} } );
	await router.navigate( '/wp-admin/plugins.php' );
	router.setLeaveWarning( 'Updates may not complete if you navigate away from this page.' );

	assert.equal( await router.navigate( '/wp-admin/index.php' ), false );
	assert.deepEqual( asked, [ 'Updates may not complete if you navigate away from this page.' ] );
	assert.equal( router.state.page.path, 'plugins.php' );
	assert.equal( env.location.pathname, '/wp-admin/plugins.php' );
	assert.equal( api.log.length, 1 );

	// In place, to the address shown, or adopted: never asked.
	assert.equal( await router.navigate( '/wp-admin/plugins.php?s=seo', { replace: true, inPlace: true } ), true );
	assert.equal( await router.navigate( '/wp-admin/plugins.php?s=seo' ), true );
	assert.equal( asked.length, 1 );

	// Back moved the address already: declined, it is put back.
	const handlers = {};
	router.listen( { window: { addEventListener: ( type, fn ) => { handlers[ type ] = fn; } }, document: { addEventListener: () => {} } } );
	env.set( '/wp-admin/plugins.php' );
	await handlers.popstate();
	assert.equal( asked.length, 2 );
	assert.deepEqual( env.calls.at( -1 ), [ 'push', '/wp-admin/plugins.php?s=seo' ] );
	assert.equal( router.state.page.path, 'plugins.php?s=seo' );

	// Accepted, the navigation goes on; cleared, nothing is asked.
	answer = true;
	assert.equal( await router.navigate( '/wp-admin/index.php' ), true );
	assert.equal( router.state.page.path, 'index.php' );
	router.setLeaveWarning( null );
	await router.navigate( '/wp-admin/edit.php' );
	assert.equal( asked.length, 3 );
} );

test( 'setAddress: another query of the page shown changes the address and its history entry, with no router read, and keeps the page', async () => {
	const env = stackEnv( '/wp-admin/themes.php' );
	const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	env.listen( router );
	await router.navigate( '/wp-admin/themes.php' );
	const page = router.state.page;
	const reads = api.log.length;
	assert.equal( router.setAddress( '/wp-admin/themes.php?theme=alpha' ), true );
	assert.equal( router.setAddress( '/wp-admin/themes.php?search=blog', { replace: true } ), true );
	assert.equal( api.log.length, reads );
	assert.equal( router.state.page, page );
	assert.equal( router.state.inPlace, true );
	assert.equal( router.currentUrl(), '/wp-admin/themes.php?search=blog' );
	assert.deepEqual( env.stack(), { urls: [ '/wp-admin/themes.php', '/wp-admin/themes.php?search=blog' ], at: 1 } );
	// The entry written holds its position, as every entry the router writes.
	assert.equal( env.history.state.wpAdminIndex, 1 );
} );

test( 'setAddress: Back returns to the previous address (a navigation of its own); another screen or a page not shown changes nothing', async () => {
	const env = stackEnv( '/wp-admin/themes.php' );
	const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	env.listen( router );
	assert.equal( router.setAddress( '/wp-admin/themes.php?theme=alpha' ), false );
	await router.navigate( '/wp-admin/themes.php' );
	router.setAddress( '/wp-admin/themes.php?theme=alpha' );
	await env.traverse( -1 );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( router.currentUrl(), '/wp-admin/themes.php' );
	assert.equal( router.state.page.path, 'themes.php' );
	assert.equal( router.state.inPlace, false );
	assert.equal( router.setAddress( '/wp-admin/plugins.php' ), false );
	assert.equal( router.setAddress( 'https://elsewhere.test/wp-admin/themes.php?x=1' ), false );
	assert.equal( router.currentUrl(), '/wp-admin/themes.php' );
} );

test( 'setAddressHandler: Back and Forward between the entries setAddress() wrote for the page shown tell the page, with no router read and no leave question', async () => {
	const env = stackEnv( '/wp-admin/index.php' );
	const asked = [];
	const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
	const router = createRouter( { api, history: env.history, location: env.location, confirm: ( message ) => asked.push( message ) > 0 } );
	env.listen( router );
	await router.navigate( '/wp-admin/index.php' );
	await router.navigate( '/wp-admin/themes.php' );
	const page = router.state.page;
	const told = [];
	router.setAddressHandler( ( url ) => told.push( url ) );
	router.setAddress( '/wp-admin/themes.php?theme=alpha' );
	router.setLeaveWarning( 'Updates may not complete if you navigate away from this page.' );
	const reads = api.log.length;

	await env.traverse( -1 );
	await env.traverse( 1 );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.deepEqual( told, [ '/wp-admin/themes.php', '/wp-admin/themes.php?theme=alpha' ] );
	assert.equal( api.log.length, reads, 'No router read.' );
	assert.deepEqual( asked, [], 'No leave question.' );
	assert.equal( router.state.page, page, 'The page shown stays.' );
	assert.equal( router.state.inPlace, true );
	assert.equal( router.currentUrl(), '/wp-admin/themes.php?theme=alpha' );

	// Back past the page's first entry leaves the page: the question, then a read.
	await env.traverse( -1 );
	await env.traverse( -1 );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( asked.length, 1 );
	assert.equal( router.state.page.path, 'index.php' );
	assert.equal( told.length, 3 );
} );

test( 'setAddressHandler: without a handler, after it is removed, or for the entries of an earlier page, Back is a navigation of its own', async () => {
	const env = stackEnv( '/wp-admin/themes.php' );
	const api = fakeApi( { get: async ( route, params ) => manifestFor( params?.path ) } );
	const router = createRouter( { api, history: env.history, location: env.location } );
	env.listen( router );
	await router.navigate( '/wp-admin/themes.php' );
	const told = [];
	const remove = router.setAddressHandler( ( url ) => told.push( url ) );
	router.setAddress( '/wp-admin/themes.php?theme=alpha' );
	remove();
	let reads = api.log.length;
	await env.traverse( -1 );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.deepEqual( [ told, api.log.length - reads ], [ [], 1 ] );

	// A handler that was replaced is not removed by its own remover.
	const first = router.setAddressHandler( () => told.push( 'first' ) );
	router.setAddressHandler( ( url ) => told.push( url ) );
	first();
	router.setAddress( '/wp-admin/themes.php?theme=beta' );
	await env.traverse( -1 );
	assert.deepEqual( told, [ '/wp-admin/themes.php' ] );

	// Another page shown: the entries setAddress() wrote for the one before are not its own.
	await env.traverse( 1 );
	await router.navigate( '/wp-admin/plugins.php' );
	reads = api.log.length;
	await env.traverse( -1 );
	await new Promise( ( r ) => setImmediate( r ) );
	assert.equal( router.state.page.path, 'themes.php?theme=beta' );
	assert.equal( api.log.length - reads, 1 );
	assert.deepEqual( told, [ '/wp-admin/themes.php', '/wp-admin/themes.php?theme=beta' ] );
} );
