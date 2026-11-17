/**
 * Client-side router: maps admin URLs to router-endpoint requests and tracks
 * what the shell should show. No Vue and no window/document access at import
 * time (so it runs under node:test): `reactive` is injected by the caller and
 * defaults to the identity function, and the DOM is only touched in listen().
 */

const ADMIN_URL = /^(?:\/sites\/(\d+))?\/wp-admin\/(.*)$/;
const ROUTER_ROUTE = 'wp-admin/v1/router';
const SESSION_ROUTE = 'wp-admin/v1/session';

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

	function remember() {
		state.rememberedUrl = currentUrl();
	}

	function toLogin() {
		loadedKey = null;
		remember();
		state.status = 'login';
	}

	api.onUnauthorized?.( () => {
		toLogin();
		sequence++;
	} );

	async function load() {
		const ticket = ++sequence;
		const { context, siteId, path } = toPagePath( location );
		state.status = 'loading';
		state.error = null;
		api.setBase( siteId === null ? '/wp-json/' : '/sites/' + siteId + '/wp-json/' );
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
			if ( ticket !== sequence ) {
				return;
			}
			loadedKey = null;
			state.error = error;
			if ( error?.status === 401 ) {
				toLogin();
			} else if ( error?.status === 403 ) {
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
			const session = await api.get( SESSION_ROUTE );
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
			( replace ? history.replaceState : history.pushState ).call( history, null, '', next );
		} else if ( replace ) {
			history.replaceState( null, '', next );
		}
		return load();
	}

	function refresh() {
		return sessionFailed ? start() : load();
	}

	async function login( { username, password, remember: keep } ) {
		const session = await api.post( SESSION_ROUTE, { username, password, remember: Boolean( keep ) } );
		api.setNonce( session.nonce );
		state.user = session.user ?? null;
		const target = state.rememberedUrl ?? currentUrl();
		state.rememberedUrl = null;
		await navigate( target, { replace: true } );
	}

	async function signOut() {
		await api.del( SESSION_ROUTE );
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
		return url.origin === location.origin && isAdminPathname( url.pathname );
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

	return { state, start, navigate, refresh, login, signOut, listen };
}
