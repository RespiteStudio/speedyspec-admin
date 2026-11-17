import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const render = await import( './helpers/render.mjs' );
const { mount, unmountAll, find, findAll, byTag, byClass, textOf, Vue } = render;
const { flush } = await import( './helpers/dom.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: PageHost } = await import( '../site/runtime/PageHost.js' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );

const { h, reactive, shallowRef, defineComponent } = Vue;
const ORIGIN = 'http://admin.test';
const TIMEOUT = 30000;

globalThis.__modules = {};
const contractFile = await import( '../site/contracts/core/legacy.js' );
globalThis.__modules[ '/contracts/core/legacy.js' ] = contractFile;
globalThis.__modules[ '/components/core/legacy.js' ] = await import( '../site/components/core/legacy.js' );
for ( const name of [ 'frame', 'menu', 'admin-bar', 'notices' ] ) {
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = await import( '../site/contracts/core/' + name + '.js' );
	globalThis.__modules[ '/components/core/' + name + '.js' ] = await import( '../site/components/core/' + name + '.js' );
}

afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

/** The legacy page of an admin URL, as the router returns it. */
const legacyPage = ( src, title = 'Posts' ) => ( { path: src.replace( /^(?:\/sites\/\d+)?\/wp-admin\//, '' ) || 'index.php', title, component: 'core/legacy', data: {}, textDomains: [ 'default' ], legacy: { src } } );

/** A same-origin document loaded in the frame. */
function fakeWindow( href, { title = 'Posts ‹ Site — WordPress', readable = true, type = 'navigate' } = {} ) {
	const observers = [];
	const listeners = [];
	const own = []; // The window's own listeners (pagehide).
	const content = { getBoundingClientRect: () => ( { bottom: 1500.4 } ) };
	const win = {
		replaced: [],
		observers,
		listeners,
		own,
		performance: { getEntriesByType: ( kind ) => ( kind === 'navigation' ? [ { type } ] : [] ) },
		addEventListener: ( name, fn ) => own.push( [ name, fn ] ),
		removeEventListener: ( name, fn ) => {
			const i = own.findIndex( ( [ n, f ] ) => n === name && f === fn );
			if ( i !== -1 ) {
				own.splice( i, 1 );
			}
		},
		/** Fires the window's pagehide listeners. */
		hide() {
			[ ...own ].filter( ( [ n ] ) => n === 'pagehide' ).forEach( ( [ , fn ] ) => fn() );
		},
		document: {
			title,
			documentElement: { scrollHeight: 2000 },
			body: {},
			getElementById: ( id ) => ( id === 'wpbody-content' ? content : null ),
			addEventListener: ( type, fn ) => listeners.push( [ type, fn ] ),
		},
		ResizeObserver: class {
			constructor( callback ) {
				this.callback = callback;
				this.targets = [];
				this.disconnected = false;
				observers.push( this );
			}
			observe( target ) {
				this.targets.push( target );
			}
			disconnect() {
				this.disconnected = true;
			}
		},
	};
	const location = { replace: ( url ) => win.replaced.push( url ) };
	Object.defineProperty( location, 'href', { get() {
		if ( ! readable ) {
			throw new Error( 'SecurityError' );
		}
		return win.href;
	} } );
	win.href = href;
	win.location = location;
	return win;
}

/** Everything the component talks to, faked, and the page host around it. */
function setup( t, first, { origin = ORIGIN } = {} ) {
	globalThis.location = { origin };
	globalThis.innerHeight = 900;
	globalThis.scrollY = 0;
	const opened = [];
	globalThis.open = ( ...args ) => opened.push( args );
	const backs = [];
	globalThis.history = { back: () => backs.push( 1 ) };
	t.after( () => {
		delete globalThis.history;
		delete globalThis.location;
		delete globalThis.innerHeight;
		delete globalThis.scrollY;
		delete globalThis.open;
	} );

	const timers = [];
	const realSet = globalThis.setTimeout;
	const realClear = globalThis.clearTimeout;
	t.mock.method( globalThis, 'setTimeout', ( fn, ms, ...rest ) => {
		if ( ms >= 1000 ) {
			const timer = { fn, ms, cleared: false };
			timers.push( timer );
			return timer;
		}
		return realSet( fn, ms, ...rest );
	} );
	t.mock.method( globalThis, 'clearTimeout', ( id ) => {
		if ( timers.includes( id ) ) {
			id.cleared = true;
		} else {
			realClear( id );
		}
	} );

	const noticeList = [];
	const notices = { add: ( n ) => noticeList.push( n ) };
	const layouts = [];
	const frameLayout = { set: ( value ) => layouts.push( value ) };
	const answers = {};
	const router = {
		state: reactive( { status: 'ready', page: null, visits: 0 } ),
		count: 0,
		lookups: [],
		navigations: [],
		expired: 0,
		navigationCount: () => router.count,
		async lookup( url ) {
			router.lookups.push( url );
			const answer = answers[ url ];
			if ( answer instanceof Error ) {
				throw answer;
			}
			return answer;
		},
		async navigate( url, options ) {
			router.navigations.push( [ url, options ] );
			return true;
		},
		expire() {
			router.expired++;
		},
	};
	const current = shallowRef( first );
	router.state.page = first;
	const view = mount( () => h( PageHost, { page: current.value, siteName: 'Site' } ), { provide: { notices, router, frameLayout } } );
	const iframe = () => find( view.container, byTag( 'iframe' ) );
	// Pending timers, by default the 30-second load timeouts only.
	const live = ( ms = TIMEOUT ) => timers.filter( ( timer ) => ! timer.cleared && ! timer.fired && ( ms === null || timer.ms === ms ) );
	/** Fires the pending timer of `ms`. */
	async function fire( ms ) {
		const [ timer ] = live( ms );
		assert.ok( timer, 'a pending ' + ms + ' ms timer' );
		timer.fired = true;
		timer.fn();
		await flush();
	}
	/** Shows another page, as the router does. */
	async function showPage( page ) {
		current.value = page;
		router.state.page = page;
		await flush();
	}

	/** Loads `win` into the frame and lets the component react. */
	async function load( win ) {
		const el = iframe();
		el.contentWindow = win;
		el.props.onLoad();
		await flush();
	}

	return { view, current, iframe, load, router, answers, noticeList, layouts, timers, live, fire, showPage, opened, backs };
}

// Contract -----------------------------------------------------------------------------

test( 'the contract file has exactly the required shape', () => {
	assert.deepEqual( Object.keys( contractFile ), [ 'default' ] );
	assert.deepEqual( contractFile.default, {
		id: 'core/legacy',
		version: '1.0.0',
		props: { page: { type: 'object', required: true }, data: { type: 'object', required: false } },
		slots: { 'before-frame': { props: {} }, 'after-frame': { props: {} } },
		emits: [ 'navigated' ],
	} );
} );

test( 'core/legacy and the legacy frame logic are not public', () => {
	const list = JSON.parse( fs.readFileSync( new URL( '../site/public-files.json', import.meta.url ), 'utf8' ) ).files;
	for ( const file of [ '/contracts/core/legacy.js', '/components/core/legacy.js', '/runtime/legacy-frame.js', '/styles/legacy.css' ] ) {
		assert.ok( ! list.includes( file ), file );
		assert.ok( fs.existsSync( new URL( '../site' + file, import.meta.url ) ), file + ' exists' );
	}
	assert.match( fs.readFileSync( new URL( '../site/runtime/protected.js', import.meta.url ), 'utf8' ), /'\/styles\/legacy\.css'/ );
} );

// Rendering ------------------------------------------------------------------------------

test( 'the frame gets the validated src and a translated title, with a spinner until it has loaded', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php?post_type=page', 'Pages' ) );
	await flush();
	const el = env.iframe();
	assert.equal( el.props.src, '/wp-admin/edit.php?post_type=page' );
	assert.equal( el.props.title, 'Classic screen: Pages' );
	assert.equal( el.props.class, 'wp-legacy' );
	// A document of another origin that lands in the frame cannot navigate the top window.
	assert.equal( el.props.sandbox, 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads' );
	assert.ok( ! /allow-top-navigation/.test( el.props.sandbox ) );
	assert.equal( find( env.view.container, byTag( 'main' ) ).props.class.includes( 'wp-admin-page--legacy' ), true );
	const spinner = find( env.view.container, byClass( 'wp-admin-spinner' ) );
	assert.equal( textOf( spinner ).trim(), 'Loading Pages…' );
	assert.equal( env.live().length, 1, 'the load is timed' );

	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php?post_type=page' );
	await env.load( win );
	assert.equal( find( env.view.container, byClass( 'wp-admin-spinner' ) ), null );
	assert.equal( env.live().length, 0 );
	assert.equal( env.router.lookups.length, 0, 'the current page is not looked up' );
	assert.deepEqual( env.layouts, [ 'default' ] );
} );

test( 'an invalid src renders the failure message and a notice, and no frame', async ( t ) => {
	for ( const src of [ '//evil.test/wp-admin/', '/\\evil.test/wp-admin/', 'javascript:alert(1)', 'https://evil.test/wp-admin/', '/wp-admin/x\u0000', '/wp-content/x.html', undefined ] ) {
		const env = setup( t, { ...legacyPage( '/wp-admin/edit.php' ), legacy: { src } } );
		await flush();
		assert.equal( env.iframe(), null, String( src ) );
		assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
		assert.equal( env.noticeList.length, 1 );
		const values = findAll( env.view.container, () => true ).flatMap( ( el ) => Object.values( el.props ) );
		assert.ok( ! values.some( ( value ) => typeof value === 'string' && /evil|javascript|wp-content/.test( value ) ), 'the value is not rendered anywhere' );
		unmountAll();
	}
} );

test( 'a frame that navigates by itself to another legacy screen is adopted: same frame, no reload', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const el = env.iframe();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );

	const manifest = { page: legacyPage( '/wp-admin/post-new.php', 'Add Post' ) };
	env.answers[ '/wp-admin/post-new.php' ] = manifest;
	const win = fakeWindow( ORIGIN + '/wp-admin/post-new.php', { title: 'Add Post ‹ Site — WordPress' } );
	await env.load( win );
	assert.deepEqual( env.router.lookups, [ '/wp-admin/post-new.php' ] );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/post-new.php', { adopt: true, manifest, since: 0 } ] ] );

	// The router shows the adopted page.
	env.current.value = manifest.page;
	await flush();
	assert.equal( env.iframe(), el, 'the same frame element' );
	assert.equal( el.props.src, '/wp-admin/edit.php', 'src is not set again' );
	assert.deepEqual( win.replaced, [], 'the frame is not sent anywhere' );
	assert.equal( find( env.view.container, byClass( 'wp-admin-spinner' ) ), null );
	assert.equal( render.focused, null, 'focus stays where the user is' );
	assert.equal( env.layouts.at( -1 ), 'full' );
} );

test( 'the page host takes the document title from the frame for the page it shows', async ( t ) => {
	const doc = { title: '' };
	globalThis.document = doc;
	t.after( () => delete globalThis.document );
	const env = setup( t, legacyPage( '/wp-admin/edit.php', 'Posts' ) );
	await flush();
	assert.equal( doc.title, 'Posts ‹ Site — WordPress' );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { title: 'Posts (filtered) ‹ Site — WordPress' } ) );
	assert.equal( doc.title, 'Posts (filtered) ‹ Site — WordPress' );

	// Another page (a top-level navigation): its own title until the frame reports one for it.
	env.current.value = legacyPage( '/wp-admin/upload.php', 'Media' );
	await flush();
	assert.equal( doc.title, 'Media ‹ Site — WordPress' );
} );

test( 'a top-level navigation to another legacy page sends the same frame there without a history entry and focuses it', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const el = env.iframe();
	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );

	env.current.value = legacyPage( '/wp-admin/upload.php', 'Media' );
	await flush();
	assert.equal( env.iframe(), el );
	assert.deepEqual( win.replaced, [ '/wp-admin/upload.php' ] );
	assert.equal( render.focused, el, 'keyboard users continue into the screen' );
	assert.ok( find( env.view.container, byClass( 'wp-admin-spinner' ) ), 'loading again' );
	assert.equal( env.live().length, 1 );

	win.href = ORIGIN + '/wp-admin/upload.php';
	await env.load( win );
	assert.equal( env.router.lookups.length, 0 );
	assert.equal( env.live().length, 0 );
} );

test( 'a frame that reaches a converted page by itself hands over to it: its own history entry is removed first, then the page is pushed', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php' ) );
	assert.equal( env.backs.length, 1, 'a Back traversal removes the frame entry' );
	assert.deepEqual( env.router.navigations, [], 'not before the traversal is done' );
	assert.equal( env.iframe().props.style.visibility, 'hidden' );

	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { type: 'back_forward' } ) );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { manifest, since: 0 } ] ] );
	assert.equal( env.iframe(), null );
} );

test( 'a converted page reached through a navigation the host started replaces the entry; a traversal that never ends hands over anyway', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/old.php' ) );
	await flush();
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	// The host's first navigation was redirected to a converted page.
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php' ) );
	assert.equal( env.backs.length, 0 );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: 0 } ] ] );

	const env2 = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env2.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	env2.answers[ '/wp-admin/acme.php' ] = manifest;
	await env2.load( fakeWindow( ORIGIN + '/wp-admin/acme.php' ) );
	await env2.fire( 5000 );
	assert.deepEqual( env2.router.navigations, [ [ '/wp-admin/acme.php', { manifest, since: 0 } ] ] );
	assert.equal( env2.iframe(), null );
} );

test( 'a frame on the sign-in screen hands over to the app sign-in, without leaving its own history entry', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	await env.load( fakeWindow( ORIGIN + '/wp-login.php?redirect_to=x&reauth=1' ) );
	assert.equal( env.backs.length, 1 );
	assert.equal( env.router.expired, 0 );
	await env.load( fakeWindow( ORIGIN + '/wp-login.php?redirect_to=x&reauth=1', { type: 'back_forward' } ) );
	assert.equal( env.router.expired, 1 );
	assert.equal( env.iframe(), null );

	// The first screen asked for is already the sign-in: no entry of its own.
	const env2 = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env2.load( fakeWindow( ORIGIN + '/wp-login.php' ) );
	assert.equal( env2.backs.length, 0 );
	assert.equal( env2.router.expired, 1 );
} );

test( 'a frame that leaves the admin by itself is taken back with a Back traversal and a notice; a second time it gives up', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );

	const away = fakeWindow( 'https://evil.test/', { readable: false } );
	await env.load( away );
	assert.equal( env.backs.length, 1 );
	assert.equal( env.noticeList.length, 1 );
	assert.equal( env.router.expired, 0 );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { type: 'back_forward' } ) );
	assert.ok( env.iframe() );
	assert.equal( env.live( 5000 ).length, 0, 'the fallback is cleared' );

	// Outside again, straight after a restore that did not get back: give up.
	await env.load( fakeWindow( 'https://evil.test/', { readable: false } ) );
	assert.equal( env.backs.length, 2 );
	await env.load( fakeWindow( ORIGIN + '/wp-content/uploads/x.html' ) );
	assert.equal( env.iframe(), null );
	assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
	assert.deepEqual( env.router.lookups, [ '/wp-admin/edit.php' ], 'the session was checked first' );
} );

test( 'a restore whose traversal does not happen sends the frame back instead', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	const away = fakeWindow( 'https://evil.test/', { readable: false } );
	await env.load( away );
	await env.fire( 5000 );
	assert.deepEqual( away.replaced, [ '/wp-admin/edit.php' ] );
} );

test( 'an unreadable or outside document is never kept, also when the host asked for the screen (a redirect)', async ( t ) => {
	for ( const win of [ fakeWindow( 'https://example.org/', { readable: false } ), fakeWindow( ORIGIN + '/' ) ] ) {
		const env = setup( t, legacyPage( '/wp-admin/admin.php?page=x&go=1' ) );
		await flush();
		await env.load( win );
		assert.equal( env.iframe(), null );
		assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
		assert.equal( env.noticeList.length, 1 );
		assert.deepEqual( win.replaced, [] );
		unmountAll();
	}
} );

test( 'when nothing can be shown and the session has ended, the sign-in is shown instead of the failure', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	env.answers[ '/wp-admin/edit.php' ] = Object.assign( new Error( 'rest_not_logged_in' ), { status: 401 } );
	// A sign-in screen that is not wp-login.php: outside the admin, twice.
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	await env.load( fakeWindow( ORIGIN + '/my-login/' ) );
	await env.load( fakeWindow( ORIGIN + '/my-login/', { type: 'back_forward' } ) );
	assert.equal( env.router.expired, 1 );
	assert.equal( find( env.view.container, byClass( 'wp-legacy-failure' ) ), null );
	assert.equal( env.iframe(), null );
} );

test( 'a document that goes away by itself and never loads a readable admin screen is restored', async ( t ) => {
	// pagehide, then a readable admin load: nothing.
	let env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	let win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	win.hide();
	assert.equal( env.live( 4000 ).length, 1 );
	env.answers[ '/wp-admin/edit.php?paged=2' ] = { page: legacyPage( '/wp-admin/edit.php?paged=2' ) };
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?paged=2' ) );
	assert.equal( env.live( 4000 ).length, 0 );
	assert.equal( env.noticeList.length, 0 );
	unmountAll();

	// pagehide, then silence on a document that is not a readable admin screen: restored.
	env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	win.hide();
	env.iframe().contentWindow = fakeWindow( 'https://evil.test/', { readable: false } );
	await env.fire( 4000 );
	assert.equal( env.backs.length, 1 );
	assert.equal( env.noticeList.length, 1 );
	unmountAll();

	// pagehide, then silence on an admin screen still loading: its load decides.
	env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	win.hide();
	env.iframe().contentWindow = fakeWindow( ORIGIN + '/wp-admin/update-core.php' );
	await env.fire( 4000 );
	assert.equal( env.backs.length, 0 );
	assert.equal( env.noticeList.length, 0 );
	unmountAll();

	// pagehide, then an unreadable load: restored.
	env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	win.hide();
	await env.load( fakeWindow( 'https://evil.test/', { readable: false } ) );
	assert.equal( env.backs.length, 1 );
	assert.equal( env.noticeList.length, 1 );
	assert.equal( env.live( 4000 ).length, 0 );
} );

test( 'asking for the page on screen again sends the frame back to it when the frame shows another screen', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	const win = fakeWindow( ORIGIN + '/wp-admin/unknown.php' );
	await env.load( win ); // The router does not know it: 'keep'.
	assert.deepEqual( env.router.navigations, [] );
	env.router.state.visits++; // The menu item of the page on screen is clicked.
	await flush();
	assert.deepEqual( win.replaced, [ '/wp-admin/edit.php' ] );
	// While the router loads another page, nothing is sent.
	env.router.state.status = 'loading';
	env.router.state.visits++;
	await flush();
	assert.equal( win.replaced.length, 1 );
} );

test( 'an adopted navigation never moves focus, also when the paths are spelled differently', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	env.answers[ '/wp-admin/edit.php?orderby=title' ] = { page: legacyPage( '/wp-admin/edit.php?orderby=title' ) };
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?orderby=title' ) );
	assert.equal( env.router.navigations[ 0 ][ 1 ].adopt, true );
	// The router's path differs from what the frame reported.
	await env.showPage( { ...legacyPage( '/wp-admin/edit.php?orderby=title' ), path: 'edit.php?orderby=title&x=' } );
	assert.equal( render.focused, null );
	// The next navigation made here does move it.
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	assert.equal( render.focused, env.iframe() );
} );

test( 'a plain click on a link that leaves the admin opens it in a new tab instead of the frame', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	const [ [ type, onClick ] ] = win.listeners;
	assert.equal( type, 'click' );
	const click = ( href, extra = {} ) => {
		const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
		const anchor = { href, getAttribute: () => null, hasAttribute: () => false };
		event.target = { closest: () => anchor };
		onClick( event );
		return event.defaultPrevented;
	};
	assert.equal( click( 'http://site.test/hello/' ), true );
	assert.deepEqual( env.opened, [ [ 'http://site.test/hello/', '_blank', 'noopener,noreferrer' ] ] );
	assert.equal( click( ORIGIN + '/wp-admin/post.php?post=1' ), false );
	assert.equal( click( 'http://site.test/', { ctrlKey: true } ), false );
	assert.equal( env.opened.length, 1 );
} );

test( 'a load that does not finish in 30 seconds shows a message with a Retry control', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const el = env.iframe();
	await env.fire( TIMEOUT );
	const message = find( env.view.container, byClass( 'wp-legacy-stalled' ) );
	assert.match( textOf( message ), /This screen is taking a long time to load\./ );
	const retry = find( message, byTag( 'button' ) );
	assert.equal( textOf( retry ).trim(), 'Retry' );

	const win = fakeWindow( 'about:blank' );
	el.contentWindow = win;
	retry.props.onClick();
	await flush();
	assert.deepEqual( win.replaced, [ '/wp-admin/edit.php' ] );
	assert.equal( find( env.view.container, byClass( 'wp-legacy-stalled' ) ), null );
	assert.equal( env.live().length, 1, 'timed again' );
} );

test( 'the frame height follows its document; a full-document screen gets the full layout and no observer', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( win );
	const [ observer ] = win.observers;
	assert.ok( observer.targets.length > 0 );
	assert.equal( env.iframe().props.style.blockSize, '1501px' );

	const next = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	await env.load( next );
	assert.equal( observer.disconnected, true, 'the old document is no longer observed' );
	assert.equal( next.observers.length, 1 );

	env.current.value = legacyPage( '/wp-admin/post.php?post=1&action=edit', 'Edit Post' );
	await flush();
	assert.equal( env.layouts.at( -1 ), 'full' );
	assert.equal( next.observers[ 0 ].disconnected, true );
	next.href = ORIGIN + '/wp-admin/post.php?post=1&action=edit';
	await env.load( next );
	assert.equal( next.observers.length, 1, 'no observer in the full layout' );
	assert.equal( env.iframe().props.style?.blockSize, undefined );
} );

test( 'unmounting removes the frame, disconnects the observer, clears timers and resets the layout', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/post-new.php' ) );
	await flush();
	assert.deepEqual( env.layouts, [ 'full' ] );
	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	env.answers[ '/wp-admin/edit.php' ] = { page: legacyPage( '/wp-admin/edit.php' ) };
	await env.load( win );
	env.current.value = legacyPage( '/wp-admin/upload.php', 'Media' );
	await flush();
	assert.equal( env.live().length, 1 );
	const observer = win.observers.at( -1 );

	// A converted page replaces the legacy one.
	const Page = defineComponent( { render: () => h( 'p', { class: 'native' }, 'native' ) } );
	globalThis.__modules[ '/m/native.js' ] = { default: Page, contract: { id: 'acme/native', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	const { loader } = await import( './helpers/contracts-instance-stub.mjs' );
	loader.applyImportMap( { native: '/m/native.js' } );
	env.current.value = { path: 'native.php', title: 'Native', component: 'acme/native', module: 'native', data: {}, textDomains: [] };
	await flush();
	assert.equal( env.iframe(), null );
	assert.ok( find( env.view.container, byClass( 'native' ) ) );
	assert.equal( env.live().length, 0 );
	assert.equal( observer?.disconnected ?? true, true );
	assert.equal( env.layouts.at( -1 ), 'default' );
	assert.equal( findAll( env.view.container, byTag( 'iframe' ) ).length, 0 );
} );

test( 'consecutive legacy pages keep the same component instance; native pages are still keyed by path', async ( t ) => {
	let mounts = 0;
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const el = env.iframe();
	env.current.value = legacyPage( '/wp-admin/upload.php', 'Media' );
	await flush();
	env.current.value = legacyPage( '/wp-admin/users.php', 'Users' );
	await flush();
	assert.equal( env.iframe(), el );
	assert.equal( findAll( env.view.container, byTag( 'iframe' ) ).length, 1 );

	const Page = defineComponent( { mounted: () => mounts++, render: () => h( 'p', 'n' ) } );
	globalThis.__modules[ '/m/many.js' ] = { default: Page, contract: { id: 'acme/many', version: '1.0.0', props: {}, slots: {}, emits: [] } };
	const { loader } = await import( './helpers/contracts-instance-stub.mjs' );
	loader.applyImportMap( { many: '/m/many.js' } );
	env.current.value = { path: 'a.php', title: 'A', component: 'acme/many', module: 'many', data: {}, textDomains: [] };
	await flush();
	env.current.value = { path: 'b.php', title: 'B', component: 'acme/many', module: 'many', data: {}, textDomains: [] };
	await flush();
	assert.equal( mounts, 2 );
} );

test( 'the frame applies the layout the legacy page asks for through the provided setter', async () => {
	const manifest = { user: { id: 1, name: 'Ada', avatar: '' }, menu: [] };
	const page = reactive( { value: legacyPage( '/wp-admin/edit.php' ) } );
	const notices = { items: [], add() {}, dismiss() {} };
	const router = { lookup: async () => null, navigate: async () => {}, expire() {} };
	globalThis.location = { origin: ORIGIN };
	try {
		const view = mount( () => h( Contracted, { id: 'core/frame', manifest, page: page.value, current: 'edit.php', base: '/wp-admin/' } ), { provide: { notices, router } } );
		await flush();
		const wrap = () => find( view.container, ( el ) => el.props.id === 'wpwrap' );
		assert.ok( ! String( wrap().props.class ).includes( 'wp-admin-frame--full' ) );
		page.value = legacyPage( '/wp-admin/post-new.php', 'Add Post' );
		await flush();
		assert.ok( String( wrap().props.class ).includes( 'wp-admin-frame--full' ) );
		assert.ok( String( wrap().props.class ).includes( 'folded' ) );
		page.value = legacyPage( '/wp-admin/nav-menus.php', 'Menus' );
		await flush();
		assert.ok( ! String( wrap().props.class ).includes( 'wp-admin-frame--full' ) );
	} finally {
		delete globalThis.location;
	}
} );
