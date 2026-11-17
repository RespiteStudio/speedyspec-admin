/**
 * Client-side router: maps admin URLs to router-endpoint requests and tracks
 * what the shell should show. No Vue and no window/document access at import
 * time (so it runs under node:test): `reactive` is injected by the caller and
 * defaults to the identity function, and the DOM is only touched in listen().
 */

const ADMIN_URL = /^(?:\/sites\/(\d+))?\/wp-admin\/(.*)$/;
const ROUTER_ROUTE = 'wp-admin/v1/router';
const SESSION_ROUTE = 'wp-admin/v1/session';
const ROOT_BASE = '/wp-json/';

export function toPagePath( { pathname, search } ) {
	const match = ADMIN_URL.exec( pathname );
	let rest = match ? match[ 2 ] : '';
	let context = 'site';
	if ( rest.startsWith( 'network/' ) || rest === 'network' ) {
		context = 'network';
		rest = rest.slice( 'network'.length + 1 );
	} else if ( rest.startsWith( 'user/' ) || rest === 'user' ) {
		context = 'user';
		rest = rest.slice( 'user'.length + 1 );
	}
	return {
		context,
		siteId: match && match[ 1 ] ? Number( match[ 1 ] ) : null,
		path: ( rest === '' ? 'index.php' : rest ) + ( search ?? '' ),
	};
}

const isAdminPathname = ( pathname ) => ADMIN_URL.test( pathname );

export function createRouter( { api, history, location, reactive = ( value ) => value, onManifest } ) {
	const state = reactive( {
		manifest: null,
		page: null,
		user: null,
		status: 'loading',
		error: null,
		rememberedUrl: null,
	} );
	let sequence = 0;
	let loadedKey = null;
	let sessionFailed = false; // start() could not probe the session; refresh() probes again.

	const currentUrl = () => location.pathname + location.search;

	// The API base is read when a request starts, so it is set right before each call:
	// session calls always use the root site, router calls the site being shown.
	const sessionCall = ( method, ...args ) => {
		api.setBase( ROOT_BASE );
		return api[ method ]( SESSION_ROUTE, ...args );
	};

	function remember() {
		state.rememberedUrl = currentUrl();
	}

	function toLogin() {
		loadedKey = null;
		remember();
		state.status = 'login';
	}

	/** The session has ended (noticed outside the router, e.g. a refused module): ask for a sign-in. */
	function expire() {
		toLogin();
		sequence++;
	}

	api.onUnauthorized?.( expire );

	async function load() {
		const ticket = ++sequence;
		const { context, siteId, path } = toPagePath( location );
		state.status = 'loading';
		state.error = null;
		api.setBase( siteId === null ? ROOT_BASE : '/sites/' + siteId + '/wp-json/' );
		const params = context === 'site' ? { path } : { path, context };
		try {
			const manifest = await api.get( ROUTER_ROUTE, params );
			if ( ticket !== sequence ) {
				return;
			}
			if ( onManifest ) {
				await onManifest( manifest );
				if ( ticket !== sequence ) {
					return;
				}
			}
			state.manifest = manifest;
			state.page = manifest.page ?? null;
			loadedKey = currentUrl();
			state.status = 'ready';
		} catch ( error ) {
			if ( error?.status === 401 ) {
				// The session is gone, whichever navigation noticed it: ask for a sign-in
				// and come back to the newest URL.
				sequence++;
				state.error = error;
				toLogin();
				return;
			}
			if ( ticket !== sequence ) {
				return;
			}
			loadedKey = null;
			state.error = error;
			if ( error?.status === 403 ) {
				state.status = 'forbidden';
			} else if ( error?.status === 404 ) {
				state.status = 'notfound';
			} else {
				state.status = 'error';
			}
		}
	}

	async function start() {
		const ticket = ++sequence;
		state.status = 'loading';
		state.error = null;
		try {
			const session = await sessionCall( 'get' );
			if ( ticket !== sequence ) {
				return;
			}
			api.setNonce( session.nonce );
			state.user = session.user ?? null;
			sessionFailed = false;
		} catch ( error ) {
			if ( ticket !== sequence ) {
				return;
			}
			if ( error?.status === 401 ) {
				sessionFailed = false;
				toLogin();
			} else {
				sessionFailed = true;
				state.error = error;
				state.status = 'error';
			}
			return;
		}
		await load();
	}

	async function navigate( url, { replace = false } = {} ) {
		const target = new URL( url, location.origin );
		const next = target.pathname + target.search;
		if ( state.status === 'ready' && next === loadedKey && next === currentUrl() ) {
			return;
		}
		if ( next !== currentUrl() ) {
			( replace ? history.replaceState : history.pushState ).call( history, null, '', next + target.hash );
		}
		return load();
	}

	function refresh() {
		return sessionFailed ? start() : load();
	}

	async function login( { username, password, remember: keep } ) {
		const session = await sessionCall( 'post', { username, password, remember: Boolean( keep ) } );
		api.setNonce( session.nonce );
		state.user = session.user ?? null;
		const target = state.rememberedUrl ?? currentUrl();
		state.rememberedUrl = null;
		await navigate( target, { replace: true } );
	}

	async function signOut() {
		await sessionCall( 'del' );
		api.setNonce( null );
		state.user = null;
		state.page = null;
		state.manifest = null;
		toLogin();
	}

	function isInterceptable( event, anchor ) {
		if ( ! anchor || event.defaultPrevented || event.button !== 0 ) {
			return false;
		}
		if ( event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ) {
			return false;
		}
		if ( anchor.hasAttribute( 'target' ) || anchor.hasAttribute( 'download' ) ) {
			return false;
		}
		if ( /\bexternal\b/i.test( anchor.getAttribute( 'rel' ) ?? '' ) ) {
			return false;
		}
		let url;
		try {
			url = new URL( anchor.href );
		} catch {
			return false;
		}
		if ( url.origin !== location.origin || ! isAdminPathname( url.pathname ) ) {
			return false;
		}
		// An in-page anchor on the current screen is left to the browser.
		return ! ( url.hash !== '' && url.pathname + url.search === currentUrl() );
	}

	function listen( { window: win, document: doc } ) {
		doc.addEventListener( 'click', ( event ) => {
			const anchor = event.target?.closest?.( 'a[href]' );
			if ( isInterceptable( event, anchor ) ) {
				event.preventDefault();
				const url = new URL( anchor.href );
				navigate( url.pathname + url.search + url.hash );
			}
		} );
		win.addEventListener( 'popstate', () => navigate( currentUrl() ) );
	}

	return { state, start, navigate, refresh, login, signOut, expire, listen };
}
