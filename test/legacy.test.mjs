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
const POLL = 250;
const STEP = 5000;

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

/** A document loaded in the frame. `navType`: what its Navigation API activation reports (null: no activation, 'none': no Navigation API). */
function fakeWindow( href, { title = 'Posts ‹ Site — WordPress', readable = true, navType = 'push', bodyClasses = [ 'wp-admin', 'wp-detached' ], appRoot = false } = {} ) {
	const observers = [];
	const listeners = [];
	const own = []; // The window's own listeners (pagehide).
	const content = { getBoundingClientRect: () => ( { bottom: 1500.4 } ) };
	const win = {
		replaced: [],
		assigned: [],
		observers,
		listeners,
		own,
		navigation: navType === 'none' ? undefined : {
			activation: navType === null ? null : { navigationType: navType },
			addEventListener: ( name, fn ) => own.push( [ 'navigation:' + name, fn ] ),
			removeEventListener: ( name, fn ) => {
				const i = own.findIndex( ( [ n, f ] ) => n === 'navigation:' + name && f === fn );
				if ( i !== -1 ) {
					own.splice( i, 1 );
				}
			},
		},
		/** Fires the Navigation API navigate event the document starts. */
		navigate( event ) {
			[ ...own ].filter( ( [ n ] ) => n === 'navigation:navigate' ).forEach( ( [ , fn ] ) => fn( event ) );
		},
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
		/** Fires the document's listeners of `type` with `event`. */
		fire( type, event ) {
			listeners.filter( ( [ n ] ) => n === type ).forEach( ( [ , fn ] ) => fn( event ) );
		},
		FormData: class {
			constructor( form ) {
				this.fields = form.fields ?? [];
			}
			[ Symbol.iterator ]() {
				return this.fields[ Symbol.iterator ]();
			}
		},
		document: {
			title,
			documentElement: { scrollHeight: 2000 },
			body: { classList: { contains: ( name ) => bodyClasses.includes( name ) } },
			getElementById: ( id ) => ( id === 'wpbody-content' ? content : id === 'app' && appRoot ? {} : null ),
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
	const location = { replace: ( url ) => win.replaced.push( url ), assign: ( url ) => win.assigned.push( url ) };
	Object.defineProperty( location, 'href', { get() {
		if ( ! win.readable ) {
			throw new Error( 'SecurityError' );
		}
		return win.href;
	} } );
	win.readable = readable;
	win.href = href;
	win.location = location;
	return win;
}

/** Records every timer with a delay; fire( ms ) runs the pending one. Delay-0 timers (flush) run for real. */
function mockTimers( t ) {
	const timers = [];
	const realSet = globalThis.setTimeout;
	const realClear = globalThis.clearTimeout;
	t.mock.method( globalThis, 'setTimeout', ( fn, ms, ...rest ) => {
		if ( ms > 0 ) {
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
	const live = ( ms = TIMEOUT ) => timers.filter( ( timer ) => ! timer.cleared && ! timer.fired && ( ms === null || timer.ms === ms ) );
	async function fire( ms ) {
		const [ timer ] = live( ms );
		assert.ok( timer, 'a pending ' + ms + ' ms timer' );
		timer.fired = true;
		timer.fn();
		await flush();
	}
	return { timers, live, fire };
}

/** Everything the component talks to, faked, and the page host around it. */
function setup( t, first, { origin = ORIGIN } = {} ) {
	const top = { origin, pathname: '/wp-admin/x.php', search: '', hash: '' };
	globalThis.location = top;
	globalThis.innerHeight = 900;
	globalThis.scrollY = 0;
	const opened = [];
	globalThis.open = ( ...args ) => opened.push( args );
	const backs = [];
	const forwards = [];
	const popListeners = [];
	globalThis.history = { back: () => backs.push( 1 ), forward: () => forwards.push( 1 ) };
	globalThis.addEventListener = ( name, fn ) => popListeners.push( [ name, fn ] );
	globalThis.removeEventListener = ( name, fn ) => {
		const i = popListeners.findIndex( ( [ n, f ] ) => n === name && f === fn );
		if ( i !== -1 ) {
			popListeners.splice( i, 1 );
		}
	};
	t.after( () => {
		for ( const key of [ 'history', 'location', 'innerHeight', 'scrollY', 'open', 'addEventListener', 'removeEventListener' ] ) {
			delete globalThis[ key ];
		}
	} );
	const { timers, live, fire } = mockTimers( t );

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
		applyAdopt: true, // An accepted adopt shows the adopted page, as the router does.
		async navigate( url, options ) {
			router.navigations.push( [ url, options ] );
			if ( options?.adopt && router.applyAdopt && options.manifest?.page ) {
				current.value = options.manifest.page;
				router.state.page = options.manifest.page;
			}
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
	const shown = () => {
		const el = iframe();
		return Boolean( el ) && ! String( el.props.class ).includes( 'wp-legacy--hidden' ) && ! el.props.inert;
	};
	const spinner = () => find( view.container, byClass( 'wp-admin-spinner' ) );

	/** Puts `win` in the frame (its document committed) without a load event. */
	function commit( win ) {
		iframe().contentWindow = win;
	}

	/** Loads `win` into the frame and lets the component react. */
	async function load( win ) {
		commit( win );
		iframe().props.onLoad();
		await flush();
	}

	/** Fires a popstate on the top window, at `url`. */
	function popstate( url ) {
		top.pathname = url;
		popListeners.filter( ( [ n ] ) => n === 'popstate' ).forEach( ( [ , fn ] ) => fn() );
	}

	/** Shows another page, as the router does. */
	async function showPage( page ) {
		current.value = page;
		router.state.page = page;
		await flush();
	}

	return { view, current, iframe, shown, spinner, commit, load, popstate, router, answers, noticeList, layouts, timers, live, fire, showPage, opened, backs, forwards };
}

/** A legacy screen loaded and confirmed. */
async function confirmedOn( t, src = '/wp-admin/edit.php', options = {} ) {
	const env = setup( t, legacyPage( src ) );
	await flush();
	const win = fakeWindow( ORIGIN + src, { navType: 'navigate', ...options } );
	await env.load( win );
	return { env, win };
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
	assert.match( fs.readFileSync( new URL( '../site/styles/legacy.css', import.meta.url ), 'utf8' ), /\.wp-legacy--hidden\s*\{\s*visibility:\s*hidden;/ );
} );

// Rendering ------------------------------------------------------------------------------

test( 'the frame gets the validated src and a translated title; it is hidden behind a spinner until its screen is confirmed', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php?post_type=page', 'Pages' ) );
	await flush();
	const el = env.iframe();
	assert.equal( el.props.src, '/wp-admin/edit.php?post_type=page' );
	assert.equal( el.props.title, 'Classic screen: Pages' );
	assert.equal( el.props.class, 'wp-legacy wp-legacy--hidden' );
	assert.equal( el.props.inert, true );
	assert.ok( ! el.props.style, 'hidden by a class, not an inline style' );
	// A document of another origin in the frame cannot navigate the top window; tabs the screen opens are not sandboxed.
	assert.equal( el.props.sandbox, 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads' );
	assert.ok( ! /allow-top-navigation/.test( el.props.sandbox ) );
	assert.equal( find( env.view.container, byTag( 'main' ) ).props.class.includes( 'wp-admin-page--legacy' ), true );
	assert.equal( textOf( env.spinner() ).trim(), 'Loading Pages…' );
	assert.equal( env.live().length, 1, 'the load is timed' );

	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?post_type=page' ) );
	assert.equal( env.shown(), true );
	assert.equal( env.iframe().props.class, 'wp-legacy' );
	assert.equal( env.iframe().props.inert, null );
	assert.equal( env.spinner(), null );
	assert.equal( env.live().length, 0 );
	assert.equal( env.live( POLL ).length, 0, 'no polling once confirmed' );
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
	const { env } = await confirmedOn( t );
	const el = env.iframe();
	const manifest = { page: legacyPage( '/wp-admin/post-new.php', 'Add Post' ) };
	env.answers[ '/wp-admin/post-new.php' ] = manifest;
	const win = fakeWindow( ORIGIN + '/wp-admin/post-new.php', { title: 'Add Post ‹ Site — WordPress' } );
	await env.load( win );
	assert.deepEqual( env.router.lookups, [ '/wp-admin/post-new.php' ] );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/post-new.php', { adopt: true, manifest, since: 0 } ] ] );
	assert.equal( env.backs.length, 0, 'an adopt never steps back' );

	await env.showPage( manifest.page );
	assert.ok( env.iframe() === el, 'the same frame element' );
	assert.equal( el.props.src, '/wp-admin/edit.php', 'src is not set again' );
	assert.deepEqual( win.replaced, [], 'the frame is not sent anywhere' );
	assert.equal( env.shown(), true );
	assert.ok( render.focused === null, 'focus stays where the user is' );
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
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	assert.equal( doc.title, 'Media ‹ Site — WordPress' );
} );

test( 'a top-level navigation sends the same frame there without a history entry, hidden until it has loaded, then focuses it', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	const el = env.iframe();
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	assert.ok( env.iframe() === el );
	assert.deepEqual( win.replaced, [ '/wp-admin/upload.php' ] );
	assert.equal( env.shown(), false, 'hidden from the moment the navigation starts' );
	assert.ok( env.spinner() );
	assert.ok( render.focused === null, 'not focused while hidden' );
	assert.equal( env.live().length, 1 );

	await env.load( fakeWindow( ORIGIN + '/wp-admin/upload.php', { navType: 'replace' } ) );
	assert.equal( env.shown(), true );
	assert.ok( render.focused === el, 'keyboard users continue into the screen' );
	assert.equal( env.router.lookups.length, 0 );
	assert.equal( env.live().length, 0 );
} );

// Hidden until confirmed -------------------------------------------------------------

test( 'a direct visit whose frame goes to another origin and never loads is given up within the grace, never shown', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/admin.php?page=x&go=1' ) );
	await flush();
	env.commit( fakeWindow( 'about:blank', { navType: null } ) );
	await env.fire( POLL );
	assert.equal( env.shown(), false );
	assert.ok( env.iframe(), 'the initial about:blank is waited for' );
	env.commit( fakeWindow( 'https://example.org/', { readable: false } ) );
	for ( let i = 0; i < 3; i++ ) {
		await env.fire( POLL );
		assert.equal( env.shown(), false );
		assert.ok( env.iframe(), 'within the grace' );
	}
	await env.fire( POLL );
	assert.equal( env.iframe(), null );
	assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
	assert.equal( env.noticeList.length, 1 );
	assert.equal( env.live( null ).length, 0, 'no timer left' );
} );

test( 'a navigation the host started that ends outside the admin without a load is restored, never shown', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	await env.showPage( legacyPage( '/wp-admin/admin.php?page=x&go=1', 'X' ) );
	assert.equal( env.shown(), false );
	// Still the old document while the navigation is pending: an admin screen, waited for.
	await env.fire( POLL );
	assert.ok( env.iframe() );
	const away = fakeWindow( ORIGIN + '/wp-content/never-loads.html' );
	env.commit( away );
	await env.fire( POLL );
	assert.deepEqual( away.replaced, [ '/wp-admin/edit.php' ], 'back to the last admin screen' );
	assert.equal( env.noticeList.length, 1 );
	assert.equal( env.shown(), false );
	assert.equal( env.backs.length, 0 );
	assert.deepEqual( win.replaced, [ '/wp-admin/admin.php?page=x&go=1' ] );
} );

test( 'a confirmed screen whose document goes away is hidden at once, and shown again only once an admin screen has loaded', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	assert.equal( env.shown(), true );
	win.hide();
	await flush();
	assert.equal( env.shown(), false );
	assert.ok( env.spinner() );
	// A slow admin screen: readable, not loaded yet: still hidden.
	const next = fakeWindow( ORIGIN + '/wp-admin/update-core.php', { navType: 'push' } );
	env.commit( next );
	for ( let i = 0; i < 8; i++ ) {
		await env.fire( POLL );
	}
	assert.equal( env.shown(), false );
	assert.ok( env.iframe() );
	assert.equal( env.noticeList.length, 0 );
	env.answers[ '/wp-admin/update-core.php' ] = { page: legacyPage( '/wp-admin/update-core.php' ) };
	await env.load( next );
	assert.equal( env.shown(), true );
} );

test( 'a navigation the confirmed screen starts hides the frame at once; if the screen stays (a download, a 204), it is shown again', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	const el = env.iframe();
	el.classList = { names: new Set(), add( name ) {
		this.names.add( name );
	} };
	win.navigate( { destination: { sameDocument: true, url: ORIGIN + '/wp-admin/edit.php#x' }, downloadRequest: null } );
	win.navigate( { destination: { sameDocument: false }, downloadRequest: 'export.xml' } );
	await flush();
	assert.equal( env.shown(), true, 'same-document navigations and downloads leave it shown' );

	win.navigate( { destination: { sameDocument: false, url: ORIGIN + '/wp-admin/export.php?download=true' }, downloadRequest: null } );
	assert.ok( el.classList.names.has( 'wp-legacy--hidden' ), 'hidden in the same task' );
	assert.equal( el.inert, true );
	await flush();
	assert.equal( env.shown(), false );
	for ( let i = 0; i < 7; i++ ) {
		await env.fire( POLL );
		assert.equal( env.shown(), false );
	}
	await env.fire( POLL );
	assert.equal( env.shown(), true, 'nothing replaced it' );
	assert.equal( env.live( POLL ).length, 0 );
	assert.equal( env.noticeList.length, 0 );
} );

test( 'a navigation the confirmed screen starts that ends outside the admin is never shown', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	win.navigate( { destination: { sameDocument: false, url: ORIGIN + '/wp-admin/admin.php?page=x&go=1' }, downloadRequest: null } );
	await flush();
	assert.equal( env.shown(), false );
	await env.fire( POLL );
	win.hide(); // The next document commits.
	env.commit( fakeWindow( 'https://example.org/', { readable: false } ) );
	for ( let i = 0; i < 4 && env.noticeList.length === 0; i++ ) {
		await env.fire( POLL );
		assert.equal( env.shown(), false );
	}
	assert.equal( env.noticeList.length, 1 );
} );

test( 'a document that goes away for another origin, or for a blank frame, is restored without a load', async ( t ) => {
	for ( const away of [ fakeWindow( 'https://evil.test/', { readable: false } ), fakeWindow( 'about:blank' ), fakeWindow( 'about:srcdoc' ) ] ) {
		const { env, win } = await confirmedOn( t );
		win.hide();
		env.commit( away );
		for ( let i = 0; i < 4 && env.noticeList.length === 0; i++ ) {
			await env.fire( POLL );
		}
		assert.deepEqual( away.replaced, [ '/wp-admin/edit.php' ], away.href );
		assert.equal( env.noticeList.length, 1 );
		assert.equal( env.shown(), false );
		unmountAll();
	}
} );

test( 'a blank frame that loads after a document is restored, not ignored', async ( t ) => {
	const { env } = await confirmedOn( t );
	const blank = fakeWindow( 'about:blank' );
	await env.load( blank );
	assert.deepEqual( blank.replaced, [ '/wp-admin/edit.php' ] );
	assert.equal( env.noticeList.length, 1 );
} );

test( 'when the load times out, an outside or unreadable frame is restored; an admin one shows the Retry message, still hidden', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	const el = env.iframe();
	env.commit( fakeWindow( ORIGIN + '/wp-admin/edit.php' ) );
	await env.fire( TIMEOUT );
	const message = find( env.view.container, byClass( 'wp-legacy-stalled' ) );
	assert.match( textOf( message ), /This screen is taking a long time to load\./ );
	assert.equal( env.shown(), false );
	const retry = find( message, byTag( 'button' ) );
	assert.equal( textOf( retry ).trim(), 'Retry' );
	const win = fakeWindow( ORIGIN + '/wp-admin/edit.php' );
	el.contentWindow = win;
	retry.props.onClick();
	await flush();
	assert.deepEqual( win.replaced, [ '/wp-admin/edit.php' ] );
	assert.equal( find( env.view.container, byClass( 'wp-legacy-stalled' ) ), null );
	assert.equal( env.live().length, 1, 'timed again' );
	unmountAll();

	const { env: env2 } = await confirmedOn( t );
	await env2.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	const away = fakeWindow( 'https://evil.test/', { readable: false } );
	env2.commit( away );
	await env2.fire( TIMEOUT );
	assert.deepEqual( away.replaced, [ '/wp-admin/edit.php' ] );
	assert.equal( find( env2.view.container, byClass( 'wp-legacy-stalled' ) ), null );
} );

test( 'the admin app itself in the frame is given up at once, with the failure message and a notice', async ( t ) => {
	const env = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { appRoot: true, bodyClasses: [] } ) );
	assert.equal( env.iframe(), null );
	assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
	assert.equal( env.noticeList.length, 1 );
	// A classic screen that happens to have an #app element is still a classic screen.
	const env2 = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env2.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { appRoot: true } ) );
	assert.equal( env2.shown(), true );
} );

// Hand-overs and history -------------------------------------------------------------

test( 'a converted page reached by a pushed frame navigation: one Back step removes the entry, then the page is pushed', async ( t ) => {
	const { env } = await confirmedOn( t );
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType: 'push' } ) );
	assert.equal( env.backs.length, 1 );
	assert.deepEqual( env.router.navigations, [], 'not before the step is done' );
	assert.equal( env.shown(), false );

	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php', { navType: 'traverse' } ) );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { manifest, since: 0 } ] ] );
	assert.equal( env.iframe(), null );
} );

test( 'without a reported push (replace, reload, traverse, no activation, no Navigation API) the hand-over replaces and never steps back', async ( t ) => {
	for ( const navType of [ 'replace', 'reload', 'traverse', null, 'none' ] ) {
		const { env } = await confirmedOn( t );
		const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
		env.answers[ '/wp-admin/acme.php' ] = manifest;
		await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType } ) );
		assert.equal( env.backs.length, 0, String( navType ) );
		assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: 0 } ] ] );
		assert.equal( env.iframe(), null );
		unmountAll();
	}
} );

test( 'navigations started by the host, also the location.replace of a restore, never count as pushed', async ( t ) => {
	// The first screen asked for redirects to a converted page.
	const env = setup( t, legacyPage( '/wp-admin/old.php' ) );
	await flush();
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType: 'push' } ) );
	assert.equal( env.backs.length, 0 );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: 0 } ] ] );

	// A restore sends the frame back; the screen it loads then redirects to a converted page.
	const { env: env2 } = await confirmedOn( t );
	env2.answers[ '/wp-admin/acme.php' ] = manifest;
	await env2.load( fakeWindow( 'https://evil.test/', { readable: false } ) );
	assert.equal( env2.backs.length, 0, 'a restore never steps back' );
	await env2.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType: 'push' } ) );
	assert.equal( env2.backs.length, 0 );
	assert.deepEqual( env2.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: 0 } ] ] );
} );

test( 'a Back step that moves the top document instead is undone at once, and the hand-over replaces without since', async ( t ) => {
	const { env } = await confirmedOn( t );
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType: 'push' } ) );
	assert.equal( env.backs.length, 1 );
	env.popstate( '/somewhere-else/' );
	await flush();
	assert.equal( env.forwards.length, 1, 'gone forward again' );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: undefined } ] ] );
	assert.equal( env.iframe(), null );
} );

test( 'a Back step that is not seen to finish hands over with a replace', async ( t ) => {
	const { env } = await confirmedOn( t );
	const manifest = { page: { path: 'acme.php', component: 'acme/page' } };
	env.answers[ '/wp-admin/acme.php' ] = manifest;
	await env.load( fakeWindow( ORIGIN + '/wp-admin/acme.php', { navType: 'push' } ) );
	await env.fire( STEP );
	assert.deepEqual( env.router.navigations, [ [ '/wp-admin/acme.php', { replace: true, manifest, since: undefined } ] ] );
} );

test( 'the sign-in screen in the frame hands over to the app sign-in; a pushed entry is stepped back first', async ( t ) => {
	const { env } = await confirmedOn( t );
	await env.load( fakeWindow( ORIGIN + '/sites/2/wp-login.php?redirect_to=x&reauth=1', { navType: 'push' } ) );
	assert.equal( env.backs.length, 1 );
	assert.equal( env.router.expired, 0 );
	await env.load( fakeWindow( ORIGIN + '/wp-login.php', { navType: 'traverse' } ) );
	assert.equal( env.router.expired, 1 );
	assert.equal( env.iframe(), null );

	const env2 = setup( t, legacyPage( '/wp-admin/edit.php' ) );
	await flush();
	await env2.load( fakeWindow( ORIGIN + '/wp-login.php', { navType: 'push' } ) );
	assert.equal( env2.backs.length, 0, 'the first screen asked for: no entry of its own' );
	assert.equal( env2.router.expired, 1 );
} );

test( 'a frame that leaves the admin by itself is sent back with a notice; a second time in a row it gives up', async ( t ) => {
	const { env } = await confirmedOn( t );
	const away = fakeWindow( 'https://evil.test/', { readable: false } );
	await env.load( away );
	assert.deepEqual( away.replaced, [ '/wp-admin/edit.php' ] );
	assert.equal( env.backs.length, 0 );
	assert.equal( env.noticeList.length, 1 );
	assert.equal( env.shown(), false );
	await env.load( fakeWindow( ORIGIN + '/wp-content/uploads/x.html' ) );
	assert.equal( env.iframe(), null );
	assert.equal( textOf( find( env.view.container, byClass( 'wp-legacy-failure' ) ) ), 'This screen could not be displayed.' );
	assert.deepEqual( env.router.lookups, [ '/wp-admin/edit.php' ], 'the session was checked first' );
} );

test( 'when nothing can be shown and the session has ended, the sign-in is shown instead of the failure', async ( t ) => {
	const { env } = await confirmedOn( t );
	env.answers[ '/wp-admin/edit.php' ] = Object.assign( new Error( 'rest_not_logged_in' ), { status: 401 } );
	await env.load( fakeWindow( ORIGIN + '/my-login/' ) );
	await env.load( fakeWindow( ORIGIN + '/my-login/' ) );
	assert.equal( env.router.expired, 1 );
	assert.equal( find( env.view.container, byClass( 'wp-legacy-failure' ) ), null );
	assert.equal( env.iframe(), null );
} );

// Links and forms -------------------------------------------------------------------

function clickEvent( href, { target = null, button = 0, ...extra } = {} ) {
	const anchor = { href, getAttribute: ( name ) => ( name === 'target' ? target : null ), hasAttribute: () => false };
	return { button, defaultPrevented: false, preventDefault() {
		this.defaultPrevented = true;
	}, target: { closest: () => anchor }, ...extra };
}

test( 'a plain click on a link that leaves the admin opens it in a new tab instead of the frame', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	const click = ( href, extra ) => {
		const event = clickEvent( href, extra );
		win.fire( 'click', event );
		return event.defaultPrevented;
	};
	assert.equal( click( 'http://site.test/hello/' ), true );
	assert.deepEqual( env.opened, [ [ 'http://site.test/hello/', '_blank', 'noopener,noreferrer' ] ] );
	assert.equal( click( ORIGIN + '/wp-admin/post.php?post=1' ), false );
	assert.equal( click( 'http://site.test/', { ctrlKey: true } ), false );
	assert.equal( env.opened.length, 1 );
} );

test( 'links aimed at _parent or _top open admin screens in the frame and anything else in a new tab', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	const click = ( href, target, extra ) => {
		const event = clickEvent( href, { target, ...extra } );
		win.fire( 'click', event );
		return event.defaultPrevented;
	};
	assert.equal( click( ORIGIN + '/wp-admin/plugins.php?activate=1', '_parent' ), true );
	assert.equal( click( ORIGIN + '/sites/2/wp-admin/update.php', '_top' ), true );
	assert.deepEqual( win.assigned, [ ORIGIN + '/wp-admin/plugins.php?activate=1', ORIGIN + '/sites/2/wp-admin/update.php' ] );
	assert.equal( click( 'https://example.org/docs', '_parent' ), true );
	assert.deepEqual( env.opened, [ [ 'https://example.org/docs', '_blank', 'noopener,noreferrer' ] ] );
	assert.equal( click( 'javascript:void(0)', '_top' ), false );
	assert.equal( click( ORIGIN + '/wp-admin/x.php', '_blank' ), false, 'a new tab is left to the browser' );
	assert.equal( click( ORIGIN + '/wp-admin/x.php', '_top', { shiftKey: true } ), false );
	assert.equal( win.assigned.length, 2 );
} );

test( 'forms aimed at _parent or _top: posts stay in the frame; GET forms to the admin stay in the frame, others open a new tab', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	const form = ( { action, method = 'get', target = '_parent', fields = [] } ) => {
		const attrs = { action, method, target };
		return { action, fields, getAttribute: ( n ) => attrs[ n ] ?? null, setAttribute: ( n, v ) => {
			attrs[ n ] = v;
		}, attrs };
	};
	const submit = ( f, submitter = null ) => {
		const event = { target: f, submitter, defaultPrevented: false, preventDefault() {
			this.defaultPrevented = true;
		} };
		win.fire( 'submit', event );
		return event;
	};
	const post = form( { action: 'https://example.org/collect', method: 'post' } );
	assert.equal( submit( post ).defaultPrevented, false );
	assert.equal( post.attrs.target, '_self' );

	const local = form( { action: ORIGIN + '/wp-admin/update.php', fields: [ [ 'action', 'install' ] ], target: '_top' } );
	assert.equal( submit( local ).defaultPrevented, false );
	assert.equal( local.attrs.target, '_self' );

	const away = form( { action: 'https://example.org/search', fields: [ [ 'q', 'a b' ] ] } );
	assert.equal( submit( away ).defaultPrevented, true );
	assert.deepEqual( env.opened, [ [ 'https://example.org/search?q=a+b', '_blank', 'noopener,noreferrer' ] ] );

	// A submit button's formtarget counts, and is rewritten too.
	const attrs = { formtarget: '_parent' };
	const button = { getAttribute: ( n ) => attrs[ n ] ?? null, setAttribute: ( n, v ) => {
		attrs[ n ] = v;
	}, hasAttribute: ( n ) => n in attrs };
	const plain = form( { action: ORIGIN + '/wp-admin/options.php', method: 'post', target: null } );
	submit( plain, button );
	assert.equal( attrs.formtarget, '_self' );

	const self = form( { action: 'https://example.org/', target: '' } );
	assert.equal( submit( self ).defaultPrevented, false );
	assert.equal( self.attrs.target, '' );
} );

// Other behaviour --------------------------------------------------------------------

test( 'asking for the page on screen again sends the frame back to it when the frame shows another screen', async ( t ) => {
	const { env } = await confirmedOn( t );
	const win = fakeWindow( ORIGIN + '/wp-admin/unknown.php' );
	await env.load( win ); // The router does not know it: 'keep'.
	assert.deepEqual( env.router.navigations, [] );
	env.router.state.visits++;
	await flush();
	assert.deepEqual( win.replaced, [ '/wp-admin/edit.php' ] );
	env.router.state.status = 'loading';
	env.router.state.visits++;
	await flush();
	assert.equal( win.replaced.length, 1 );
} );

test( 'an adopted navigation never moves focus, also when the paths are spelled differently', async ( t ) => {
	const { env } = await confirmedOn( t );
	// The router's path differs from the one the frame reports.
	env.answers[ '/wp-admin/edit.php?orderby=title' ] = { page: { ...legacyPage( '/wp-admin/edit.php?orderby=title' ), path: 'edit.php?orderby=title&x=' } };
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?orderby=title' ) );
	assert.equal( env.router.navigations[ 0 ][ 1 ].adopt, true );
	assert.equal( env.current.value.path, 'edit.php?orderby=title&x=' );
	assert.ok( render.focused === null );
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/upload.php', { navType: 'replace' } ) );
	assert.ok( render.focused === env.iframe() );
} );

test( 'an accepted adopt that does not change the page leaves no focus flag behind', async ( t ) => {
	const { env } = await confirmedOn( t );
	// The router accepts the adopt, but the page shown does not change (e.g. its load failed).
	env.router.applyAdopt = false;
	env.answers[ '/wp-admin/edit.php?paged=2' ] = { page: legacyPage( '/wp-admin/edit.php?paged=2' ) };
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?paged=2' ) );
	assert.equal( env.router.navigations.length, 1 );
	await flush();
	// The next navigation made here focuses the frame.
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/upload.php', { navType: 'replace' } ) );
	assert.ok( render.focused === env.iframe() );
} );

test( 'the late load of the document a navigation started here is leaving is not taken for the new screen', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	env.answers[ '/wp-admin/edit.php' ] = { page: legacyPage( '/wp-admin/edit.php' ) };
	await env.load( win ); // The old document's load arrives after the navigation started.
	assert.equal( env.shown(), false );
	assert.deepEqual( env.router.lookups, [] );
	assert.deepEqual( env.router.navigations, [] );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/upload.php', { navType: 'replace' } ) );
	assert.equal( env.shown(), true );
} );

test( 'focus asked for while the old screen is still shown waits for the new screen', async ( t ) => {
	const { env } = await confirmedOn( t );
	// The page host's request and the page change arrive in either order.
	await env.showPage( legacyPage( '/wp-admin/upload.php', 'Media' ) );
	assert.ok( render.focused === null, 'not the hidden frame' );
	await env.load( fakeWindow( ORIGIN + '/wp-admin/upload.php', { navType: 'replace' } ) );
	assert.ok( render.focused === env.iframe() );
} );

test( 'focus inside the frame comes back when the next screen is shown', async ( t ) => {
	const { env, win } = await confirmedOn( t );
	globalThis.document = { activeElement: env.iframe(), title: '' };
	t.after( () => delete globalThis.document );
	win.hide();
	await flush();
	assert.equal( env.shown(), false );
	env.answers[ '/wp-admin/edit.php?paged=2' ] = { page: legacyPage( '/wp-admin/edit.php?paged=2' ) };
	await env.load( fakeWindow( ORIGIN + '/wp-admin/edit.php?paged=2' ) );
	assert.ok( render.focused === env.iframe() );
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

	await env.showPage( legacyPage( '/wp-admin/post.php?post=1&action=edit', 'Edit Post' ) );
	assert.equal( env.layouts.at( -1 ), 'full' );
	assert.equal( next.observers[ 0 ].disconnected, true );
	const editor = fakeWindow( ORIGIN + '/wp-admin/post.php?post=1&action=edit', { navType: 'replace' } );
	await env.load( editor );
	assert.equal( editor.observers.length, 0, 'no observer in the full layout' );
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
	assert.ok( env.iframe() === el );
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

test( 'the frame applies the layout the legacy page asks for through the provided setter', async ( t ) => {
	mockTimers( t );
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
