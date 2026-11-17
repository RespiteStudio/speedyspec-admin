import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../site/runtime/router.js';
import { createNotices } from '../site/runtime/notices.js';
import { ApiError } from '../site/runtime/api.js';
import { startLive, decidePage, countMenuChanges, homeUrl } from '../site/runtime/live.js';

const ORIGIN = 'http://admin.test';
const INTERVAL = 15000;

const err = ( status, code ) => new ApiError( { status, code, message: code } );
const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

const item = ( path, label, children = [] ) => ( { path, label, icon: '', count: null, children } );
const page = ( path, extra = {} ) => ( { path, title: 'Title of ' + path, component: 'core/dashboard', module: undefined, textDomains: [], data: { n: 1 }, ...extra } );

/** A fake WordPress: what the router endpoint answers, and every request made to it. */
function fakeServer() {
	const server = {
		version: 'v1',
		locale: { code: 'en_US', dir: 'ltr' },
		importMap: { imports: {} },
		menu: [ item( 'index.php', 'Dashboard' ) ],
		replacements: {},
		slots: {},
		pages: { 'index.php': page( 'index.php' ) },
		requests: [],
		failWith: null,
		unauthorized: null,
		hold: null,
	};
	server.manifest = () => ( {
		apiVersion: 1,
		version: server.version,
		locale: server.locale,
		user: { id: 1 },
		importMap: server.importMap,
		menu: server.menu,
		replacements: server.replacements,
		slots: server.slots,
	} );
	return server;
}

function harness( { initial = '/wp-admin/' } = {} ) {
	const server = fakeServer();
	const location = { origin: ORIGIN, pathname: '', search: '' };
	const set = ( url ) => {
		const u = new URL( url, ORIGIN );
		location.pathname = u.pathname;
		location.search = u.search;
	};
	set( initial );
	const history = {
		calls: [],
		pushState( s, t, url ) { this.calls.push( [ 'push', url ] ); set( url ); },
		replaceState( s, t, url ) { this.calls.push( [ 'replace', url ] ); set( url ); },
	};
	const api = {
		base: '/wp-json/',
		setBase( base ) { api.base = base; },
		setNonce() {},
		onUnauthorized( cb ) { api.unauthorized = cb; },
		async post() {
			return { nonce: 'n2', user: { id: 1 } };
		},
		async get( route, params ) {
			if ( route.endsWith( 'session' ) ) {
				return { nonce: 'n', user: { id: 1 } };
			}
			const base = api.base;
			server.requests.push( { params: { ...params }, base } );
			if ( server.hold ) {
				await server.hold;
			}
			if ( server.unauthorized ) {
				api.unauthorized?.( server.unauthorized );
				throw server.unauthorized;
			}
			if ( server.failWith ) {
				throw server.failWith;
			}
			if ( params?.path === undefined ) {
				return server.manifest();
			}
			const entry = server.pages[ params.path ];
			if ( server.pageError ) {
				throw server.pageError;
			}
			if ( ! entry ) {
				throw err( 404, 'rest_admin_page_not_found' );
			}
			return { ...server.manifest(), page: entry };
		},
	};
	const configured = [];
	const mapped = [];
	const router = createRouter( {
		api,
		history,
		location,
		async onManifest( manifest ) {
			mapped.push( manifest.importMap?.imports ?? {} );
			configured.push( { replacements: manifest.replacements, slots: manifest.slots } );
		},
	} );
	const notices = createNotices();
	const i18n = {
		__: ( s ) => s,
		_n: ( one, many, n ) => ( n === 1 ? one : many ),
		sprintf: ( format, ...args ) => { let i = 0; return format.replace( /%[sd]/g, () => String( args[ i++ ] ) ); },
	};

	// Timers and document.
	const timers = { next: 1, active: new Map() };
	const setTimer = ( fn, ms ) => { const id = timers.next++; timers.active.set( id, { fn, ms } ); return id; };
	const clearTimer = ( id ) => timers.active.delete( id );
	const fire = () => [ ...timers.active.values() ].forEach( ( t ) => t.fn() );
	const emitter = () => {
		const map = new Map();
		return {
			map,
			addEventListener: ( type, fn ) => map.set( type, [ ...( map.get( type ) ?? [] ), fn ] ),
			removeEventListener: ( type, fn ) => map.set( type, ( map.get( type ) ?? [] ).filter( ( f ) => f !== fn ) ),
			emit: ( type ) => ( map.get( type ) ?? [] ).forEach( ( fn ) => fn( { type } ) ),
			count: () => [ ...map.values() ].reduce( ( sum, list ) => sum + list.length, 0 ),
		};
	};
	const win = emitter();
	const doc = Object.assign( emitter(), { hidden: false, defaultView: win } );
	const clock = { t: 1_000_000 };
	const now = () => clock.t;

	const live = { stop: null };
	const start = () => {
		live.stop = startLive( { router, api, intervalMs: INTERVAL, notices, i18n, document: doc, now, setTimer, clearTimer } );
		return live.stop;
	};
	const checks = () => server.requests.filter( ( r ) => r.params.path === undefined );
	const pageRequests = () => server.requests.filter( ( r ) => r.params.path !== undefined );
	return { server, router, api, history, location, notices, timers, fire, doc, win, clock, start, live, configured, mapped, checks, pageRequests };
}

async function ready( h, path = 'index.php' ) {
	h.server.pages[ path ] ??= page( path );
	await h.router.start();
	assert.equal( h.router.state.status, 'ready' );
	h.start();
	h.server.requests.length = 0;
}

const kinds = ( h ) => h.notices.items.map( ( n ) => n.type + ':' + n.message );

// ---- pure decisions ----------------------------------------------------------------------

test( 'decidePage: same component and module keeps the page; data is not looked at', () => {
	const current = page( 'a.php', { component: 'x/y', module: 'x/y' } );
	assert.equal( decidePage( { current, answer: { page: { ...current, data: { other: true } } }, dirty: false } ), 'keep' );
	assert.equal( decidePage( { current, answer: { page: { ...current, title: 'New' } }, dirty: true } ), 'keep' );
} );

test( 'decidePage: a changed component or module swaps when clean, warns when dirty', () => {
	const current = page( 'a.php', { component: 'x/y', module: 'x/y' } );
	assert.equal( decidePage( { current, answer: { page: { ...current, component: 'core/legacy' } }, dirty: false } ), 'swap' );
	assert.equal( decidePage( { current, answer: { page: { ...current, module: 'x/z' } }, dirty: false } ), 'swap' );
	assert.equal( decidePage( { current, answer: { page: { ...current, module: 'x/z' } }, dirty: true } ), 'warn-changed' );
} );

test( 'decidePage: a page that is gone (404) or refused (403) leaves when clean and stays when dirty', () => {
	const current = page( 'a.php' );
	for ( const status of [ 404, 403 ] ) {
		assert.equal( decidePage( { current, answer: { status }, dirty: false } ), 'leave' );
		assert.equal( decidePage( { current, answer: { status }, dirty: true } ), 'stay' );
	}
} );

test( 'decidePage: any other failure changes nothing', () => {
	assert.equal( decidePage( { current: page( 'a.php' ), answer: { status: 500 }, dirty: false } ), 'keep' );
	assert.equal( decidePage( { current: page( 'a.php' ), answer: null, dirty: false } ), 'keep' );
} );

test( 'countMenuChanges counts items, submenu items included, added and removed by path', () => {
	const before = [ item( 'index.php', 'Dashboard', [ item( 'index.php', 'Home' ) ] ), item( 'tools.php', 'Tools' ) ];
	const after = [ item( 'index.php', 'Dashboard', [ item( 'index.php', 'Home' ), item( 'update-core.php', 'Updates' ) ] ), item( 'new.php', 'New' ) ];
	assert.deepEqual( countMenuChanges( before, after ), { added: 2, removed: 1 } );
	assert.deepEqual( countMenuChanges( before, before ), { added: 0, removed: 0 } );
	assert.deepEqual( countMenuChanges( undefined, null ), { added: 0, removed: 0 } );
} );

test( 'countMenuChanges ignores the request URL some items carry in a return argument', () => {
	const at = ( url ) => [ item( 'themes.php', 'Themes', [ item( 'customize.php?return=' + encodeURIComponent( url ), 'Customize' ), item( 'customize.php?return=' + encodeURIComponent( url ) + '&autofocus%5Bcontrol%5D=header', 'Header' ) ] ) ];
	assert.deepEqual( countMenuChanges( at( '/a?path=index.php' ), at( '/b' ) ), { added: 0, removed: 0 } );
} );

test( 'homeUrl is index.php of the context and site being shown', () => {
	assert.equal( homeUrl( { pathname: '/wp-admin/edit.php', search: '' } ), '/wp-admin/index.php' );
	assert.equal( homeUrl( { pathname: '/sites/3/wp-admin/edit.php', search: '' } ), '/sites/3/wp-admin/index.php' );
	assert.equal( homeUrl( { pathname: '/wp-admin/network/sites.php', search: '' } ), '/wp-admin/network/index.php' );
	assert.equal( homeUrl( { pathname: '/wp-admin/user/profile.php', search: '' } ), '/wp-admin/user/index.php' );
} );

// ---- brief stubs -------------------------------------------------------------------------

test( 'same version does nothing', async () => {
	const h = harness();
	await ready( h );
	const manifest = h.router.state.manifest;
	h.fire();
	await tick();
	assert.equal( h.checks().length, 1 );
	assert.equal( h.pageRequests().length, 0, 'the page is not looked up again' );
	assert.equal( h.router.state.manifest, manifest, 'the menu is not replaced' );
	assert.equal( h.configured.length, 1, 'configure is not called again' );
	assert.deepEqual( h.notices.items, [] );
} );

test( 'new version replaces menu and keeps current page instance', async () => {
	const h = harness();
	await ready( h );
	const shown = h.router.state.page;
	const data = shown.data;
	h.server.version = 'v2';
	h.server.menu = [ ...h.server.menu, item( 'extra.php', 'Extra' ) ];
	h.server.replacements = { 'core/notices': { module: 'p/notices', implements: '1.0.0' } };
	h.server.slots = { 'core/menu': { 'after-items': [ { module: 'p/slot' } ] } };
	h.server.importMap = { imports: { 'p/notices': '/p/notices.js?ver=1' } };
	h.server.pages[ 'index.php' ] = page( 'index.php', { data: { n: 2 } } );
	h.fire();
	await tick();

	assert.equal( h.router.state.manifest.version, 'v2' );
	assert.deepEqual( h.router.state.manifest.menu.map( ( m ) => m.path ), [ 'index.php', 'extra.php' ] );
	assert.equal( h.configured.length, 2 );
	assert.deepEqual( h.configured[ 1 ], { replacements: h.server.replacements, slots: h.server.slots } );
	assert.deepEqual( h.mapped[ 1 ], { 'p/notices': '/p/notices.js?ver=1' } );
	assert.equal( h.router.state.page, shown, 'the same page entry, so the mounted page is not remounted' );
	assert.equal( h.router.state.page.data, data, 'its data is not replaced under it' );
	assert.deepEqual( h.router.state.page.data, { n: 1 } );
	assert.equal( h.pageRequests().length, 1, 'the page is validated with one request' );
	assert.equal( h.router.state.status, 'ready' );
} );

test( 'removed current page navigates to index.php with a warning', async () => {
	const h = harness( { initial: '/wp-admin/gone.php' } );
	h.server.pages[ 'gone.php' ] = page( 'gone.php', { title: 'Gone Screen' } );
	await ready( h, 'gone.php' );
	h.server.version = 'v2';
	delete h.server.pages[ 'gone.php' ];
	h.fire();
	await tick();
	await tick();

	assert.deepEqual( h.history.calls.at( -1 ), [ 'replace', '/wp-admin/index.php' ] );
	assert.equal( h.router.state.page.path, 'index.php' );
	assert.deepEqual( kinds( h ), [ 'warning:The screen “Gone Screen” is no longer available.' ] );
} );

// ---- triggers ------------------------------------------------------------------------------

test( 'the timer is armed with the interval and checks the manifest alone', async () => {
	const h = harness();
	await ready( h );
	assert.deepEqual( [ ...h.timers.active.values() ].map( ( t ) => t.ms ), [ INTERVAL ] );
	h.fire();
	await tick();
	assert.deepEqual( h.checks().map( ( r ) => r.params ), [ {} ] );
} );

test( 'while the document is hidden there are no checks; visible again checks once when the interval has passed', async () => {
	const h = harness();
	await ready( h );
	h.doc.hidden = true;
	h.doc.emit( 'visibilitychange' );
	h.fire();
	h.fire();
	await tick();
	assert.equal( h.checks().length, 0 );

	h.clock.t += INTERVAL;
	h.doc.hidden = false;
	h.doc.emit( 'visibilitychange' );
	await tick();
	assert.equal( h.checks().length, 1 );
} );

test( 'becoming visible within the interval of the last check does not check', async () => {
	const h = harness();
	await ready( h );
	h.fire();
	await tick();
	h.server.requests.length = 0;
	h.doc.hidden = true;
	h.doc.emit( 'visibilitychange' );
	h.clock.t += INTERVAL - 1;
	h.doc.hidden = false;
	h.doc.emit( 'visibilitychange' );
	await tick();
	assert.equal( h.checks().length, 0 );
} );

test( 'regaining focus checks once when the interval has passed, and not before', async () => {
	const h = harness();
	await ready( h );
	h.fire();
	await tick();
	h.server.requests.length = 0;
	h.clock.t += INTERVAL - 1;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 0 );
	h.clock.t += 1;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 1 );
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 1, 'the check just made counts' );
} );

test( 'focus while the document is hidden does nothing', async () => {
	const h = harness();
	await ready( h );
	h.clock.t += INTERVAL * 2;
	h.doc.hidden = true;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 0 );
} );

test( 'only one check is in flight at a time', async () => {
	const h = harness();
	await ready( h );
	let release;
	h.server.hold = new Promise( ( resolve ) => { release = resolve; } );
	h.fire();
	h.fire();
	h.clock.t += INTERVAL;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 1 );
	h.server.hold = null;
	release();
	await tick();
	h.fire();
	await tick();
	assert.equal( h.checks().length, 2, 'the next check goes ahead once the first is done' );
} );

test( 'a failing check is silent and retried at the next tick', async () => {
	const h = harness();
	await ready( h );
	h.server.failWith = err( 503, 'service_unavailable' );
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [] );
	assert.equal( h.router.state.status, 'ready' );
	h.server.failWith = new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'x' } );
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [] );

	h.server.failWith = null;
	h.server.version = 'v2';
	h.server.menu = [ item( 'index.php', 'Dashboard' ), item( 'x.php', 'X' ) ];
	h.fire();
	await tick();
	assert.equal( h.router.state.manifest.version, 'v2' );
} );

test( 'a 401 goes through the unauthorized path and stops the timer until the next sign-in', async () => {
	const h = harness();
	await ready( h );
	h.server.unauthorized = err( 401, 'rest_not_logged_in' );
	h.fire();
	await tick();
	assert.equal( h.router.state.status, 'login' );
	assert.equal( h.timers.active.size, 0, 'the timer is stopped' );
	h.clock.t += INTERVAL * 2;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 1, 'no more checks while signed out' );

	h.server.unauthorized = null;
	await h.router.login( { username: 'a', password: 'b' } );
	assert.equal( h.router.state.status, 'ready' );
	assert.equal( h.timers.active.size, 1, 'the timer runs again after signing in' );
} );

test( 'a check does not run while a navigation is loading', async () => {
	const h = harness();
	await ready( h );
	h.router.state.status = 'loading';
	h.fire();
	await tick();
	assert.equal( h.checks().length, 0 );
} );

// ---- applying a new manifest -------------------------------------------------------------

test( 'a changed version re-validates the page: gone and dirty stays with a warning', async () => {
	const h = harness( { initial: '/wp-admin/gone.php' } );
	h.server.pages[ 'gone.php' ] = page( 'gone.php', { title: 'Gone Screen' } );
	await ready( h, 'gone.php' );
	h.router.setDirty( true );
	h.server.version = 'v2';
	delete h.server.pages[ 'gone.php' ];
	h.fire();
	await tick();
	assert.equal( h.router.state.page.path, 'gone.php' );
	assert.equal( h.history.calls.length, 0 );
	assert.deepEqual( kinds( h ), [ 'warning:The screen “Gone Screen” is no longer available.' ] );
} );

test( 'a page the user may no longer open (403) is treated like a removed one', async () => {
	const h = harness( { initial: '/wp-admin/secret.php' } );
	h.server.pages[ 'secret.php' ] = page( 'secret.php', { title: 'Secret' } );
	await ready( h, 'secret.php' );
	h.server.version = 'v2';
	h.server.pageError = err( 403, 'rest_forbidden' );
	h.fire();
	await tick();
	await tick();
	assert.deepEqual( h.history.calls.at( -1 ), [ 'replace', '/wp-admin/index.php' ] );
	assert.match( kinds( h )[ 0 ], /Secret/ );
} );

test( 'a page whose component changed is swapped when clean', async () => {
	const h = harness( { initial: '/wp-admin/p.php' } );
	h.server.pages[ 'p.php' ] = page( 'p.php', { component: 'core/legacy' } );
	await ready( h, 'p.php' );
	h.server.version = 'v2';
	const taken = page( 'p.php', { component: 'plugin/page', module: 'plugin/page' } );
	h.server.pages[ 'p.php' ] = taken;
	h.fire();
	await tick();
	assert.equal( h.router.state.page.component, 'plugin/page' );
	assert.equal( h.router.state.page.module, 'plugin/page' );
	assert.deepEqual( h.notices.items, [] );
} );

test( 'a page whose component changed is not swapped when dirty: a warning offers to reload the screen', async () => {
	const h = harness( { initial: '/wp-admin/p.php' } );
	h.server.pages[ 'p.php' ] = page( 'p.php', { component: 'core/legacy' } );
	await ready( h, 'p.php' );
	h.router.setDirty( true );
	const shown = h.router.state.page;
	h.server.version = 'v2';
	h.server.pages[ 'p.php' ] = page( 'p.php', { component: 'plugin/page', module: 'plugin/page' } );
	h.fire();
	await tick();
	assert.equal( h.router.state.page, shown );
	assert.equal( h.notices.items.length, 1 );
	const [ notice ] = h.notices.items;
	assert.equal( notice.type, 'warning' );
	assert.equal( notice.action.label, 'Reload this screen' );

	h.router.setDirty( false );
	h.server.requests.length = 0;
	notice.action.run();
	await tick();
	await tick();
	assert.equal( h.router.state.page.component, 'plugin/page' );
} );

test( 'a classic screen that is still there is left alone', async () => {
	const h = harness( { initial: '/wp-admin/admin.php?page=x' } );
	h.server.pages[ 'admin.php?page=x' ] = page( 'admin.php?page=x', { component: 'core/legacy' } );
	await ready( h, 'admin.php?page=x' );
	const shown = h.router.state.page;
	h.server.version = 'v2';
	h.fire();
	await tick();
	assert.equal( h.router.state.page, shown );
	assert.equal( h.router.state.manifest.version, 'v2', 'only the frame around it updates' );
} );

test( 'a classic screen whose page is gone follows the removed-page rule', async () => {
	const h = harness( { initial: '/wp-admin/admin.php?page=x' } );
	h.server.pages[ 'admin.php?page=x' ] = page( 'admin.php?page=x', { component: 'core/legacy', title: 'Plugin Classic' } );
	await ready( h, 'admin.php?page=x' );
	h.server.version = 'v2';
	delete h.server.pages[ 'admin.php?page=x' ];
	h.fire();
	await tick();
	await tick();
	assert.deepEqual( h.history.calls.at( -1 ), [ 'replace', '/wp-admin/index.php' ] );
	assert.match( kinds( h )[ 0 ], /Plugin Classic/ );
} );

test( 'a validation that fails is tried again at the next tick, without changing the version again', async () => {
	const h = harness( { initial: '/wp-admin/gone.php' } );
	h.server.pages[ 'gone.php' ] = page( 'gone.php', { title: 'Gone Screen' } );
	await ready( h, 'gone.php' );
	h.server.version = 'v2';
	delete h.server.pages[ 'gone.php' ];
	h.server.pageError = err( 500, 'boom' );
	h.fire();
	await tick();
	assert.equal( h.router.state.page.path, 'gone.php' );
	assert.deepEqual( h.notices.items, [] );
	h.server.pageError = null;
	h.fire();
	await tick();
	await tick();
	assert.equal( h.router.state.page.path, 'index.php' );
} );

test( 'a navigation made while the check was in flight wins', async () => {
	const h = harness();
	await ready( h );
	h.server.pages[ 'other.php' ] = page( 'other.php' );
	let release;
	h.server.hold = new Promise( ( resolve ) => { release = resolve; } );
	h.server.version = 'v2';
	h.fire();
	await tick();
	h.server.hold = null;
	await h.router.navigate( '/wp-admin/other.php' );
	const afterNavigation = h.router.state.manifest;
	release();
	await tick();
	assert.equal( h.router.state.manifest, afterNavigation );
	assert.equal( h.router.state.page.path, 'other.php' );
} );

// ---- announcements -------------------------------------------------------------------------

test( 'menu changes found by a check are announced once, as info, with counts', async () => {
	const h = harness();
	await ready( h );
	h.server.version = 'v2';
	h.server.menu = [ item( 'index.php', 'Dashboard' ), item( 'a.php', 'A' ), item( 'b.php', 'B' ) ];
	h.fire();
	await tick();
	assert.deepEqual( kinds( h ), [ 'info:2 menu items were added.' ] );

	h.server.version = 'v3';
	h.server.menu = [ item( 'index.php', 'Dashboard' ), item( 'a.php', 'A' ) ];
	h.fire();
	await tick();
	assert.deepEqual( kinds( h ), [ 'info:2 menu items were added.', 'info:1 menu item was removed.' ] );
} );

test( 'a change that arrives with a navigation is not announced, and is not applied twice', async () => {
	const h = harness();
	await ready( h );
	h.server.pages[ 'other.php' ] = page( 'other.php' );
	h.server.version = 'v2';
	h.server.menu = [ item( 'index.php', 'Dashboard' ), item( 'a.php', 'A' ) ];
	await h.router.navigate( '/wp-admin/other.php' );
	h.server.requests.length = 0;
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [] );
	assert.equal( h.pageRequests().length, 0, 'the version is already the one shown' );
	assert.equal( h.router.state.manifest.menu.length, 2 );
} );

test( 'a version change without menu changes is not announced', async () => {
	const h = harness();
	await ready( h );
	h.server.version = 'v2';
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [] );
} );

test( 'an already-mapped specifier at a new URL raises one info notice across repeated checks', async () => {
	const h = harness();
	h.server.importMap = { imports: { 'p/page': '/p/page.js?ver=1' } };
	await ready( h );
	h.server.version = 'v2';
	h.server.importMap = { imports: { 'p/page': '/p/page.js?ver=2' } };
	h.fire();
	await tick();
	assert.equal( h.notices.items.length, 1 );
	assert.equal( h.notices.items[ 0 ].type, 'info' );
	assert.equal( h.notices.items[ 0 ].dismissible, true );
	assert.match( h.notices.items[ 0 ].message, /extension was updated/i );
	assert.match( h.notices.items[ 0 ].message, /reload/i );

	h.notices.dismiss( h.notices.items[ 0 ].id );
	h.server.version = 'v3';
	h.fire();
	await tick();
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [], 'not raised again for the same update' );
	assert.equal( h.history.calls.length, 0, 'and no reload happens by itself' );
} );

test( 'a new specifier is not an update; an update that comes with a navigation is noticed too', async () => {
	const h = harness();
	h.server.importMap = { imports: { 'p/page': '/p/page.js?ver=1' } };
	await ready( h );
	h.server.version = 'v2';
	h.server.importMap = { imports: { 'p/page': '/p/page.js?ver=1', 'q/page': '/q/page.js?ver=1' } };
	h.fire();
	await tick();
	assert.deepEqual( h.notices.items, [] );

	h.server.version = 'v3';
	h.server.importMap = { imports: { 'p/page': '/p/page.js?ver=2', 'q/page': '/q/page.js?ver=1' } };
	h.server.pages[ 'other.php' ] = page( 'other.php' );
	await h.router.navigate( '/wp-admin/other.php' );
	assert.equal( h.notices.items.length, 1 );
} );

// ---- contexts ------------------------------------------------------------------------------

test( 'a sub-site context checks on the site base without changing the client base', async () => {
	const h = harness( { initial: '/sites/4/wp-admin/' } );
	await ready( h );
	const base = h.api.base;
	h.server.version = 'v2';
	h.fire();
	await tick();
	assert.equal( h.checks()[ 0 ].base, '/sites/4/wp-json/' );
	assert.equal( h.pageRequests()[ 0 ].base, '/sites/4/wp-json/' );
	assert.equal( h.api.base, base );
	assert.equal( h.router.state.manifest.version, 'v2' );
} );

test( 'the network context is passed to the manifest check', async () => {
	const h = harness( { initial: '/wp-admin/network/' } );
	await ready( h, 'index.php' );
	h.fire();
	await tick();
	assert.deepEqual( h.checks()[ 0 ].params, { context: 'network' } );
} );

// ---- stopping ------------------------------------------------------------------------------

test( 'stop() clears the timer and removes the listeners; nothing checks afterwards', async () => {
	const h = harness();
	await ready( h );
	assert.ok( h.doc.count() > 0 && h.win.count() > 0 );
	h.live.stop();
	assert.equal( h.timers.active.size, 0 );
	assert.equal( h.doc.count(), 0 );
	assert.equal( h.win.count(), 0 );
	h.clock.t += INTERVAL * 2;
	h.win.emit( 'focus' );
	await tick();
	assert.equal( h.checks().length, 0 );
} );

test( 'a check that finishes after stop() changes nothing', async () => {
	const h = harness();
	await ready( h );
	let release;
	h.server.hold = new Promise( ( resolve ) => { release = resolve; } );
	h.server.version = 'v2';
	h.fire();
	await tick();
	h.live.stop();
	release();
	await tick();
	assert.equal( h.router.state.manifest.version, 'v1' );
} );
