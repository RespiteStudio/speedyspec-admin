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

/** '/sites/3' for a path of site 3's admin, '' for the main site's. */
export function sitePrefix( pathname ) {
	const match = /^\/sites\/(\d+)(?=\/|$)/.exec( String( pathname ) );
	return match ? match[ 0 ] : '';
}

/**
 * Whether the admin app may start in this window: not inside a frame (for instance a
 * classic screen's frame that was answered with the app instead), where it would start
 * another admin, and another frame, again.
 */
export function shouldBoot( win ) {
	try {
		return win.top === win.self;
	} catch {
		return false;
	}
}

// How many page redirects one navigation follows before it gives up (a loop).
const MAX_REDIRECTS = 5;

/**
 * Where a redirect or location WordPress answered leads (wp_admin_redirect_target(),
 * WP_Admin_Page_Redirect): `redirect` is a path relative to the admin of the site shown
 * (`/wp-admin/` or `/sites/{id}/wp-admin/`, not the network or user admin), resolved with
 * `new URL( path, adminBase )` and never percent-decoded; `location` is an absolute http(s) URL.
 *
 * @param {{redirect?: string|null, location?: string|null}} target The answer's target.
 * @param {{origin: string, pathname: string}} where Location of the page shown.
 * @return {{kind: 'admin', url: string}|{kind: 'load', url: string}|null} An admin URL the
 *         router opens (path, query and hash), a URL to load in a new document (a location, or a
 *         redirect the URL parser resolved out of the admin), or null (no target, or one that
 *         cannot be followed).
 */
export function redirectTarget( target, where ) {
	const origin = where.origin;
	if ( typeof target?.redirect === 'string' ) {
		let url;
		try {
			url = new URL( target.redirect, origin + sitePrefix( where.pathname ) + '/wp-admin/' );
		} catch {
			return null;
		}
		if ( url.origin !== origin ) {
			return null;
		}
		return isAdminPathname( url.pathname ) ? { kind: 'admin', url: url.pathname + url.search + url.hash } : { kind: 'load', url: url.href };
	}
	if ( typeof target?.location === 'string' && target.location !== '' ) {
		try {
			const url = new URL( target.location );
			return url.protocol === 'http:' || url.protocol === 'https:' ? { kind: 'load', url: url.href } : null;
		} catch {
			return null;
		}
	}
	return null;
}

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
	let dirty = false; // The page shown reports unsaved changes (see setDirty()).
	let shownUrl = null; // The address of the page shown (path and query).
	let previous = null; // The address of the page shown before it, see previousUrl().
	const observers = new Set();

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
	// The base is read synchronously when the request starts, so it is put back at once: a session
	// call that fails (a sign-out during a network blip) must not leave a subsite page on the root site.
	const sessionCall = ( method, ...args ) => {
		api.setBase( ROOT_BASE );
		try {
			return api[ method ]( SESSION_ROUTE, ...args );
		} finally {
			api.setBase( activeBase ?? ROOT_BASE );
		}
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
	/** Loads a URL in a new document (a full-page load). */
	const loadDocument = ( url ) => ( typeof location.assign === 'function' ? location.assign( url ) : ( location.href = url ) );

	// `hops`: how many page redirects this navigation followed so far.
	async function load( answer = null, hops = 0 ) {
		const ticket = ++sequence;
		state.status = 'loading';
		state.error = null;
		useBase( siteBase( location ) );
		try {
			const manifest = answer ?? await api.get( ROUTER_ROUTE, routerParams( location ) );
			if ( ticket !== sequence ) {
				return;
			}
			// A page that redirects (WP_Admin_Page_Redirect) is never shown: its target replaces it in
			// the history, as the classic screen's redirect does; a location is loaded anew.
			const page = manifest?.page;
			if ( page && ( typeof page.redirect === 'string' || ( typeof page.location === 'string' && page.location !== '' ) ) ) {
				const target = redirectTarget( page, location );
				if ( target === null || ( target.kind === 'admin' && hops >= MAX_REDIRECTS ) ) {
					throw Object.assign( new Error( 'The page redirected to an address that cannot be opened.' ), { code: 'admin_page_redirect' } );
				}
				if ( target.kind === 'load' ) {
					loadedKey = null;
					loadDocument( target.url );
					return;
				}
				history.replaceState( null, '', target.url );
				await load( null, hops + 1 );
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
			if ( shownUrl !== null && shownUrl !== loadedKey ) {
				previous = shownUrl;
			}
			shownUrl = loadedKey;
			state.status = 'ready';
			for ( const observer of [ ...observers ] ) {
				try {
					observer( manifest );
				} catch ( observerError ) {
					console.error( observerError );
				}
			}
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
			// A nonce WordPress still refuses after the client renewed it is not a missing permission.
			// A plugin that redirected the admin away while it started (admin_init) keeps the user out.
			if ( ( error?.status === 403 && error.code !== 'rest_cookie_invalid_nonce' ) || error?.code === 'admin_init_redirect' ) {
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

	/**
	 * Opens where an answer says to go (`{ redirect, location }`, wp_admin_redirect_target()):
	 * a redirect as a navigation (pushed, or replacing the entry with `replace`), a location as a
	 * full-page load.
	 *
	 * @returns {Promise<boolean>} Whether there was a target that could be followed.
	 */
	async function follow( target, { replace = false } = {} ) {
		const resolved = redirectTarget( target, location );
		if ( resolved === null ) {
			return false;
		}
		if ( resolved.kind === 'load' ) {
			loadDocument( resolved.url );
			return true;
		}
		return navigate( resolved.url, { replace } );
	}

	/**
	 * The address (path and query) of the page shown before the one shown now, or null: where the
	 * page was opened from, as a classic screen reads its referer (Edit Comment's `referredby`).
	 * A page that redirected is never shown, and a reload of the same address keeps it.
	 */
	const previousUrl = () => previous;

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

	/**
	 * The router's manifest alone (no page) for the context and site of the current URL, without
	 * touching state, history or, afterwards, the client's API base.
	 */
	function fetchManifest() {
		const where = { pathname: location.pathname, search: location.search };
		const { context } = toPagePath( where );
		api.setBase( siteBase( where ) );
		try {
			return api.get( ROUTER_ROUTE, context === 'site' ? {} : { context } );
		} finally {
			api.setBase( activeBase ?? ROOT_BASE );
		}
	}

	/**
	 * Makes a manifest the one in use without a navigation (a live update): the callback given
	 * as `onManifest` runs for it, then the frame's menu and user follow it. The page shown is
	 * left as it is. Resolves false, changing nothing, when a navigation or load began meanwhile.
	 */
	async function applyManifest( manifest ) {
		const ticket = sequence;
		if ( onManifest ) {
			await onManifest( manifest );
		}
		if ( ticket !== sequence ) {
			return false;
		}
		state.manifest = manifest;
		return true;
	}

	/** Shows another entry for the page already shown (same URL), e.g. one a plugin now serves. */
	function replacePage( page ) {
		state.page = page ?? null;
	}

	/**
	 * Called with the manifest of every router response that a navigation or reload showed.
	 *
	 * @returns {() => void} Stops observing.
	 */
	function observe( observer ) {
		observers.add( observer );
		return () => observers.delete( observer );
	}

	/**
	 * Records whether the page shown has unsaved changes; pages report it through the
	 * `pageState` the page host gives them. Live updates never swap such a page.
	 */
	function setDirty( value ) {
		dirty = Boolean( value );
	}

	const isDirty = () => dirty;

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

	return { state, start, navigate, follow, previousUrl, navigationCount, lookup, fetchManifest, applyManifest, replacePage, observe, currentUrl, setDirty, isDirty, refresh, login, signOut, expire, listen };
}
