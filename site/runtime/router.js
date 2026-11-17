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
		// Bumped by every navigation asked for from outside the frame of a legacy screen
		// (links, Back/Forward, sign-in), also one to the URL already shown.
		visits: 0,
	} );
	let sequence = 0;
	let navigations = 0; // Every accepted navigate() and expire().
	let activeBase = null; // The API base the router last chose for the client.
	let loadedKey = null;
	let sessionFailed = false; // start() could not probe the session; refresh() probes again.

	const currentUrl = () => location.pathname + location.search;

	// The API base is read when a request starts, so it is set right before each call:
	// session calls always use the root site, router calls the site being shown.
	const useBase = ( base ) => {
		activeBase = base;
		api.setBase( base );
	};
	const siteBase = ( where ) => {
		const { siteId } = toPagePath( where );
		return siteId === null ? ROOT_BASE : '/sites/' + siteId + '/wp-json/';
	};
	const sessionCall = ( method, ...args ) => {
		useBase( ROOT_BASE );
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
		navigations++;
	}

	api.onUnauthorized?.( expire );

	const routerParams = ( where ) => {
		const { context, path } = toPagePath( where );
		return context === 'site' ? { path } : { path, context };
	};

	// `answer`: the router's manifest for the current location when the caller already has it.
	// Either way the client is left on the base of the site shown, for the page's own requests.
	async function load( answer = null ) {
		const ticket = ++sequence;
		state.status = 'loading';
		state.error = null;
		useBase( siteBase( location ) );
		try {
			const manifest = answer ?? await api.get( ROUTER_ROUTE, routerParams( location ) );
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

	/**
	 * Shows the page of an admin URL.
	 *
	 * `adopt`: the content of that URL is already on screen (a legacy screen navigated by
	 * itself, in its own frame, which added its own history entry): the current history
	 * entry is replaced rather than a new one pushed, so that one Back goes back one screen.
	 *
	 * `manifest`: the router's answer for that URL when the caller already has it (no request).
	 * `since`: a navigationCount() taken by the caller; when the router has navigated since,
	 * this navigation is out of date and refused (resolves false), so that a slow answer
	 * about an older frame navigation never overrides a newer one.
	 *
	 * @returns {Promise<boolean>} Whether the navigation was accepted.
	 */
	async function navigate( url, { replace = false, adopt = false, manifest = null, since } = {} ) {
		if ( since !== undefined && since !== navigations ) {
			return false;
		}
		navigations++;
		if ( ! adopt ) {
			state.visits++;
		}
		const target = new URL( url, location.origin );
		const next = target.pathname + target.search;
		if ( state.status === 'ready' && next === loadedKey && next === currentUrl() ) {
			return true;
		}
		if ( next !== currentUrl() ) {
			( replace || adopt ? history.replaceState : history.pushState ).call( history, null, '', next + target.hash );
		}
		await load( manifest );
		return true;
	}

	/** Number of navigations so far; see navigate()'s `since`. */
	const navigationCount = () => navigations;

	/**
	 * The router's answer (manifest) for an admin URL, without showing it: no state or
	 * history change, and the client's API base is left as it was.
	 */
	function lookup( url ) {
		const target = new URL( url, location.origin );
		const where = { pathname: target.pathname, search: target.search };
		// The base is read synchronously when the request starts.
		api.setBase( siteBase( where ) );
		try {
			return api.get( ROUTER_ROUTE, routerParams( where ) );
		} finally {
			api.setBase( activeBase ?? ROOT_BASE );
		}
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

	return { state, start, navigate, navigationCount, lookup, refresh, login, signOut, expire, listen };
}
