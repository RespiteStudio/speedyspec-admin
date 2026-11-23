/**
 * Client-side router: maps admin URLs to router-endpoint requests and tracks
 * what the shell should show. No Vue and no window/document access at import
 * time (so it runs in the unit tests, under node): `reactive` is injected by the caller and
 * defaults to the identity function, and the DOM is only touched in listen().
 */

const ADMIN_URL = /^(?:\/sites\/(\d+))?\/wp-admin\/(.*)$/;
const ROUTER_ROUTE = 'wp-admin/v1/router';
const SESSION_ROUTE = 'wp-admin/v1/session';
const ADMIN_EMAIL_ROUTE = 'wp-admin/v1/session/admin-email';
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

/**
 * An admin address relative to the admin it is in, as WordPress's sign-in takes it
 * (`redirect_to`): without the `/wp-admin/` or `/sites/{id}/wp-admin/` prefix, with its query
 * (`edit.php?post_type=page`); empty for the admin itself or an address out of the admin.
 *
 * @param {string} url Root-relative address (path and query).
 * @return {string}
 */
export function adminRelative( url ) {
	const parsed = new URL( String( url ), 'http://admin.invalid' );
	const match = ADMIN_URL.exec( parsed.pathname );
	return match ? match[ 2 ] + parsed.search : '';
}

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

// The link targets that name the window a top document's link is in (an empty one is `_self`).
const SAME_WINDOW_TARGETS = new Set( [ '', '_self', '_top', '_parent' ] );

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

/**
 * `confirm( message )`: asks before a navigation leaves a page with a leave warning (see
 * setLeaveWarning()); true goes on. Default `window.confirm()`, or true where there is none.
 *
 * `onVerifyAdminEmail()`: called, not awaited, when a sign-in is held on the administration email
 * verification (`state.verifyAdminEmail`), so that the caller can load what renders it (app.js:
 * the protected entry). What it throws or rejects with is ignored.
 *
 * `onForbidden( markup )`: called, not awaited, when a page is refused with WordPress's own
 * access-denied message (the 403's `error.data.markup`), so that the caller can load what renders
 * it (app.js: the protected entry, whose markup renderer the shell's forbidden screen takes). A 403
 * is only ever answered to a signed-in user. What it throws or rejects with is ignored.
 */
export function createRouter( { api, history, location, reactive = ( value ) => value, onManifest, onForbidden, onVerifyAdminEmail, confirm: confirmLeave = ( message ) => ( typeof globalThis.confirm === 'function' ? globalThis.confirm( message ) : true ) } ) {
	const state = reactive( {
		manifest: null,
		page: null,
		user: null,
		status: 'loading',
		error: null,
		// The access-denied message of a refused page (the 403's `error.data.markup`), inline markup; null without one.
		forbiddenMarkup: null,
		rememberedUrl: null,
		// The administration email verification WordPress holds a sign-in on (the session's
		// `next.verifyAdminEmail`), shown alone (status `verify`) until it is answered; else null.
		verifyAdminEmail: null,
		// Bumped by every navigation asked for from outside the frame of a legacy screen
		// (links, Back/Forward, sign-in), also one to the URL already shown.
		visits: 0,
		// Whether the page shown was asked for in place (navigate()'s `inPlace`: a live search):
		// another query of the screen already shown, which the page host shows in the same page.
		inPlace: false,
	} );
	let sequence = 0;
	let navigations = 0; // Every accepted navigate() and expire().
	let activeBase = null; // The API base the router last chose for the client.
	let loadedKey = null;
	// The history entry of the page shown (see writeHistory()), and the popstates of the router's own
	// history.go() still to come, which are not navigations.
	let shownIndex = null;
	let ownTraversals = 0;
	let sessionFailed = false; // start() could not probe the session; refresh() probes again.
	let dirty = false; // The page shown reports unsaved changes (see setDirty()).
	let leaveWarning = null; // What to ask before leaving the page shown (see setLeaveWarning()).
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
	// A call on a given API base (the root site's, or a subsite's), put back at once as sessionCall.
	const baseCall = ( base, method, route, ...args ) => {
		api.setBase( base );
		try {
			return api[ method ]( route, ...args );
		} finally {
			api.setBase( activeBase ?? ROOT_BASE );
		}
	};
	const sessionCall = ( method, ...args ) => baseCall( ROOT_BASE, method, SESSION_ROUTE, ...args );
	// The API base of the site whose verification is shown (see login()).
	let verifyBase = ROOT_BASE;

	function remember() {
		state.rememberedUrl = currentUrl();
	}

	function toLogin() {
		loadedKey = null;
		remember();
		state.verifyAdminEmail = null;
		state.status = 'login';
	}

	/** The session has ended (noticed outside the router, e.g. a refused module): ask for a sign-in. */
	function expire() {
		toLogin();
		sequence++;
		navigations++;
	}

	api.onUnauthorized?.( expire );

	// Every entry the router writes holds its position in the history (`wpAdminIndex`), so that a
	// traversal can be measured and undone; an entry without one (the first page loaded) is 0.
	const indexOf = ( entry ) => ( Number.isInteger( entry?.wpAdminIndex ) ? entry.wpAdminIndex : 0 );
	const entryIndex = () => indexOf( history.state );
	function writeHistory( push, url ) {
		const entry = { wpAdminIndex: entryIndex() + ( push ? 1 : 0 ) };
		( push ? history.pushState : history.replaceState ).call( history, entry, '', url );
	}

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
		state.forbiddenMarkup = null;
		// Leaving the verification another way skips it, as leaving the classic screen does.
		state.verifyAdminEmail = null;
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
				writeHistory( false, target.url );
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
			shownIndex = entryIndex();
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
				state.forbiddenMarkup = typeof error?.data?.markup === 'string' && error.data.markup !== '' ? error.data.markup : null;
				if ( state.forbiddenMarkup !== null && onForbidden ) {
					try {
						Promise.resolve( onForbidden( state.forbiddenMarkup ) ).catch( () => {} );
					} catch {
						// The forbidden screen shows the generic text.
					}
				}
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
	 * `inPlace`: another query of the screen shown (a live search), which the page already shown
	 * takes in place (`state.inPlace`) instead of a new page.
	 *
	 * While the page shown has a leave warning (setLeaveWarning()), a navigation to another
	 * address asks it first (`confirm`, as a browser asks a classic screen's `beforeunload`); a
	 * declined one is refused (resolves false) and the address is put back: Back or Forward is undone
	 * with history.go(), so the history keeps every entry. An adopted or in-place navigation never asks.
	 *
	 * @returns {Promise<boolean>} Whether the navigation was accepted.
	 */
	async function navigate( url, { replace = false, adopt = false, manifest = null, since, inPlace = false } = {} ) {
		if ( since !== undefined && since !== navigations ) {
			return false;
		}
		const target = new URL( url, location.origin );
		const next = target.pathname + target.search;
		if ( leaveWarning !== null && ! adopt && ! inPlace && next !== loadedKey && ! confirmLeave( leaveWarning ) ) {
			// Back or Forward already moved the address: the move is undone, so the history stays as
			// it was. Without the shown entry's position, Back is undone by pushing the address again.
			if ( loadedKey !== null && currentUrl() !== loadedKey ) {
				const moved = shownIndex === null || typeof history.go !== 'function' ? 0 : shownIndex - entryIndex();
				if ( moved !== 0 ) {
					ownTraversals++;
					history.go( moved );
				} else {
					writeHistory( true, loadedKey );
				}
			}
			return false;
		}
		navigations++;
		if ( ! adopt ) {
			state.visits++;
		}
		state.inPlace = inPlace === true;
		if ( state.status === 'ready' && next === loadedKey && next === currentUrl() ) {
			return true;
		}
		if ( next !== currentUrl() ) {
			writeHistory( ! ( replace || adopt ), next + target.hash );
		}
		await load( manifest );
		return true;
	}

	/**
	 * Changes the address of the page shown to another query of the same screen, without reading
	 * the router: the history entry is pushed (or replaced with `replace`), stamped with its
	 * position as every entry the router writes, and the page shown stays mounted with its state
	 * (`state.inPlace`), as theme.js's router changes the address of its search and details. Back
	 * and Forward to such an entry are navigations of their own (popstate), which read it.
	 *
	 * Refused (false, nothing changed) unless a page is shown and the address is the same origin and
	 * path as the one shown.
	 *
	 * @param {string} url Address of the page shown, with another query.
	 * @param {{replace?: boolean}} [options]
	 * @returns {boolean} Whether the address changed.
	 */
	function setAddress( url, { replace = false } = {} ) {
		const target = new URL( url, location.origin );
		if ( state.status !== 'ready' || loadedKey === null || target.origin !== location.origin || target.pathname !== new URL( loadedKey, location.origin ).pathname ) {
			return false;
		}
		const next = target.pathname + target.search;
		if ( next !== currentUrl() ) {
			writeHistory( ! replace, next + target.hash );
		}
		navigations++;
		state.inPlace = true;
		loadedKey = next;
		shownUrl = next;
		shownIndex = entryIndex();
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

	/**
	 * Shows another entry for the page already shown (same URL), e.g. one a plugin now serves. It
	 * is a page of its own, not one taking an in-place navigation (`state.inPlace` is cleared).
	 */
	function replacePage( page ) {
		state.inPlace = false;
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

	/**
	 * Sets what to ask before a navigation leaves the page shown (see navigate()), or null for
	 * nothing: a page whose work would be lost (a package queue still running) sets the classic
	 * text; the page host clears it when the page changes or goes.
	 *
	 * @param {string|null} message The question, or null.
	 */
	function setLeaveWarning( message ) {
		leaveWarning = typeof message === 'string' && message !== '' ? message : null;
	}

	function refresh() {
		state.inPlace = false;
		return sessionFailed ? start() : load();
	}

	/**
	 * Signs in, then goes where WordPress says (the session's `next`, wp-login.php's decision for
	 * the remembered address, sent as `redirect_to`, on the subsite `site` when the address is a
	 * subsite's admin): its `redirect` or `location` is followed, in
	 * place of the address; a `verifyAdminEmail` is held, shown alone (status `verify`) until
	 * answerAdminEmail() answers it. Without a `next` (an older WordPress), or one that cannot be
	 * followed, the remembered address is opened.
	 */
	async function login( { username, password, remember: keep } ) {
		const target = state.rememberedUrl ?? currentUrl();
		const where = new URL( target, location.origin );
		const { siteId } = toPagePath( where );
		// The session is the root site's; a subsite's admin is decided on that subsite (`site`).
		const credentials = { username, password, remember: Boolean( keep ), redirect_to: adminRelative( target ) };
		const session = await sessionCall( 'post', siteId === null ? credentials : { ...credentials, site: siteId } );
		api.setNonce( session.nonce );
		state.user = session.user ?? null;
		state.rememberedUrl = null;
		const next = session?.next && typeof session.next === 'object' ? session.next : null;
		if ( next?.verifyAdminEmail && typeof next.verifyAdminEmail === 'object' ) {
			sequence++;
			navigations++;
			loadedKey = null;
			if ( target !== currentUrl() ) {
				writeHistory( false, target );
			}
			// Answered on the site it was decided on: its lifespan is the one the answer stores.
			verifyBase = siteBase( where );
			state.verifyAdminEmail = next.verifyAdminEmail;
			state.status = 'verify';
			if ( onVerifyAdminEmail ) {
				try {
					Promise.resolve( onVerifyAdminEmail() ).catch( () => {} );
				} catch {
					// The shell shows the loading screen until the step can be rendered.
				}
			}
			return;
		}
		if ( next && await follow( next, { replace: true } ) ) {
			return;
		}
		await navigate( target, { replace: true } );
	}

	/**
	 * Answers the administration email verification a sign-in is held on (`confirm`: The email is
	 * correct; `remind`: Remind me later) through `session/admin-email` on the site the sign-in was
	 * decided on (a subsite's own API base for a subsite's admin, else the root site's), then
	 * follows where WordPress says, in place of the address. A failure keeps the step and rethrows.
	 *
	 * @param {'confirm'|'remind'} action The answer.
	 * @return {Promise<boolean>} Whether a verification was answered.
	 */
	async function answerAdminEmail( action ) {
		const verification = state.verifyAdminEmail;
		if ( ! verification ) {
			return false;
		}
		const target = await baseCall( verifyBase, 'post', ADMIN_EMAIL_ROUTE, { action, redirect_to: typeof verification.redirectTo === 'string' ? verification.redirectTo : '' } );
		if ( state.verifyAdminEmail !== verification ) {
			return false;
		}
		state.verifyAdminEmail = null;
		if ( ! await follow( target ?? {}, { replace: true } ) ) {
			await navigate( currentUrl(), { replace: true } );
		}
		return true;
	}

	async function signOut() {
		await sessionCall( 'del' );
		api.setNonce( null );
		state.user = null;
		state.page = null;
		state.manifest = null;
		toLogin();
	}

	/**
	 * Whether a click on a link opens through the router: a same-origin admin link, opened in this
	 * window. That is the one link-routing rule for every page, the markup plugins print
	 * included: a relative `*.php` link is resolved by the browser against the admin address shown,
	 * and a `target` of `_self`, `_top` or `_parent` still opens here when the admin is the top
	 * document (it is no frame, so they name this window). Any other target, a download, `rel`
	 * external, a modifier key or another button is the browser's.
	 */
	function isInterceptable( event, anchor, topDocument ) {
		if ( ! anchor || event.defaultPrevented || event.button !== 0 ) {
			return false;
		}
		if ( event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ) {
			return false;
		}
		if ( anchor.hasAttribute( 'download' ) ) {
			return false;
		}
		if ( anchor.hasAttribute( 'target' ) && ! ( topDocument && SAME_WINDOW_TARGETS.has( String( anchor.getAttribute( 'target' ) ?? '' ).toLowerCase() ) ) ) {
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
			if ( isInterceptable( event, anchor, shouldBoot( win ) ) ) {
				event.preventDefault();
				const url = new URL( anchor.href );
				navigate( url.pathname + url.search + url.hash );
			}
		} );
		win.addEventListener( 'popstate', () => {
			// The router's own undo of a declined Back or Forward: back on the page shown, nothing to do.
			if ( ownTraversals > 0 ) {
				ownTraversals--;
				if ( currentUrl() === loadedKey ) {
					return Promise.resolve( true );
				}
			}
			return navigate( currentUrl() );
		} );
	}

	return { state, start, navigate, setAddress, follow, previousUrl, navigationCount, lookup, fetchManifest, applyManifest, replacePage, observe, currentUrl, setDirty, isDirty, setLeaveWarning, refresh, login, answerAdminEmail, signOut, expire, listen };
}
