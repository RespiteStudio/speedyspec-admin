import { toPagePath } from './router.js';
import { adminBase } from './menu.js';

/**
 * Live updates: keeps the open admin in step with the plugins installed on the server,
 * without a reload. A protected module, started from the protected entry for a signed-in
 * user only (no Vue and no window/document access at import time).
 *
 * The router response carries a `version` stamp that WordPress changes whenever the set of
 * pages, replacements or slot modules (or the user's rights, the theme, …) changes. A
 * check fetches the manifest alone and compares the stamp with the one in use:
 *
 *  - the timer, every `intervalMs` while the document is visible;
 *  - the document becoming visible, and the window regaining focus, when at least
 *    `intervalMs` has passed since the last check.
 *
 * Responses of navigations reach this module through `router.observe()`, so that they are
 * not applied twice and not announced as a live change.
 *
 * The limit of native ES modules: a specifier that is already mapped keeps its first URL for
 * the whole browser session, so an updated plugin module is only loaded by a reload. This
 * module says so (once) and never reloads by itself.
 */

const ADMIN_LOOKUP_GONE = [ 403, 404 ];

/**
 * What to do with the page shown, given the router's answer for the same URL after a
 * version change. Pure.
 *
 * @param {{current: object, answer: ({page: object}|{status: number}|null), dirty: boolean}} input
 *        `answer` is the new page entry, the HTTP status of a failed lookup, or null.
 * @returns {'keep'|'swap'|'warn-changed'|'leave'|'stay'}
 *   keep: leave the mounted page alone (also for a failure that says nothing about the page);
 *   swap: show the new entry; warn-changed: the entry changed but the page has unsaved changes;
 *   leave: the page is gone, go to the dashboard; stay: it is gone but has unsaved changes.
 */
export function decidePage( { current, answer, dirty } ) {
	if ( answer?.page ) {
		const same = ( answer.page.component ?? '' ) === ( current?.component ?? '' ) && ( answer.page.module ?? '' ) === ( current?.module ?? '' );
		if ( same ) {
			return 'keep';
		}
		return dirty ? 'warn-changed' : 'swap';
	}
	if ( ADMIN_LOOKUP_GONE.includes( answer?.status ) ) {
		return dirty ? 'stay' : 'leave';
	}
	return 'keep';
}

/**
 * Identity of a menu path for counting changes: some items carry the URL of the request that
 * built the menu in a `return` argument (the Customizer's), which differs between the router's
 * answers for different pages and says nothing about the item.
 */
const menuIdentity = ( path ) => {
	const [ file, query = '' ] = String( path ).split( '?', 2 );
	const params = new URLSearchParams( query );
	params.delete( 'return' );
	const rest = params.toString();
	return rest === '' ? file : file + '?' + rest;
};

const menuKeys = ( menu ) => {
	const keys = new Set();
	for ( const top of Array.isArray( menu ) ? menu : [] ) {
		const topKey = menuIdentity( top.path );
		keys.add( topKey );
		for ( const child of top.children ?? [] ) {
			keys.add( topKey + '\u0000' + menuIdentity( child.path ) );
		}
	}
	return keys;
};

/** How many menu items (submenu items included, identified by path) were added and removed. */
export function countMenuChanges( before, after ) {
	const a = menuKeys( before );
	const b = menuKeys( after );
	return {
		added: [ ...b ].filter( ( key ) => ! a.has( key ) ).length,
		removed: [ ...a ].filter( ( key ) => ! b.has( key ) ).length,
	};
}

/** `index.php` of the context (site, network or user) and site of an admin location. */
export function homeUrl( { pathname, search } ) {
	const { context, siteId } = toPagePath( { pathname, search } );
	return adminBase( siteId ) + ( context === 'site' ? '' : context + '/' ) + 'index.php';
}

/**
 * Starts watching for changes; returns the function that stops it.
 *
 * Requests go through the router (which owns the API base of the context shown), so no
 * `api` is needed here. A check that fails (network, server error) is ignored and retried
 * at the next trigger; a 401 stops the timer until the next response a sign-in brings.
 *
 * @param {object}   options
 * @param {object}   options.router     The router.
 * @param {object}   options.notices    The notices service.
 * @param {object}   options.i18n       Translation functions (`__`, `_n`, `sprintf`).
 * @param {number}   [options.intervalMs=15000] Time between checks.
 * @param {Document} [options.document] Where visibility and focus are read.
 * @param {Function} [options.now]      Milliseconds clock.
 * @param {Function} [options.setTimer] `( fn, ms ) => handle`, repeating.
 * @param {Function} [options.clearTimer]
 * @returns {() => void} Stop.
 */
export function startLive( {
	router,
	notices,
	i18n,
	intervalMs = 15000,
	document: doc = globalThis.document,
	now = () => Date.now(),
	setTimer = ( fn, ms ) => globalThis.setInterval( fn, ms ),
	clearTimer = ( handle ) => globalThis.clearInterval( handle ),
} ) {
	const win = doc?.defaultView ?? globalThis.window;
	let running = true;
	let timer = null;
	let inflight = false;
	let suspended = false;
	let needsValidation = false; // A new version was applied but the page was not validated yet.
	let lastCheck = now();
	const firstUrl = new Map(); // specifier -> the URL it was first mapped to (the one in use).
	const announcedUpdates = new Set();

	const arm = () => {
		if ( running && ! suspended && timer === null ) {
			timer = setTimer( () => check(), intervalMs );
		}
	};
	const disarm = () => {
		if ( timer !== null ) {
			clearTimer( timer );
			timer = null;
		}
	};

	function noteImports( manifest ) {
		for ( const [ specifier, url ] of Object.entries( manifest?.importMap?.imports ?? {} ) ) {
			if ( ! firstUrl.has( specifier ) ) {
				firstUrl.set( specifier, url );
			} else if ( firstUrl.get( specifier ) !== url && ! announcedUpdates.has( specifier + '\u0000' + url ) ) {
				announcedUpdates.add( specifier + '\u0000' + url );
				notices.add( {
					type: 'info',
					message: i18n.__( 'An extension was updated. Reload this page to load the new version.', 'wp-admin-site' ),
					dismissible: true,
				} );
			}
		}
	}

	function announceMenu( before, after ) {
		const { added, removed } = countMenuChanges( before, after );
		if ( added > 0 ) {
			/* translators: %d: Number of menu items. */
			notices.add( { type: 'info', message: i18n.sprintf( i18n._n( '%d menu item was added.', '%d menu items were added.', added, 'wp-admin-site' ), added ), dismissible: true } );
		}
		if ( removed > 0 ) {
			/* translators: %d: Number of menu items. */
			notices.add( { type: 'info', message: i18n.sprintf( i18n._n( '%d menu item was removed.', '%d menu items were removed.', removed, 'wp-admin-site' ), removed ), dismissible: true } );
		}
	}

	const goneNotice = ( title ) => notices.add( {
		type: 'warning',
		/* translators: %s: Admin screen title. */
		message: i18n.sprintf( i18n.__( 'The screen “%s” is no longer available.', 'wp-admin-site' ), title ),
		dismissible: true,
	} );

	/** Asks the router about the page shown and acts on the answer. */
	async function validatePage( since ) {
		const current = router.state.page;
		const url = router.currentUrl();
		if ( ! current ) {
			needsValidation = false;
			return;
		}
		let answer;
		try {
			const response = await router.lookup( url );
			answer = response?.page ? { page: response.page } : null;
		} catch ( error ) {
			if ( error?.status === 401 ) {
				throw error;
			}
			answer = { status: error?.status ?? 0 };
		}
		if ( ! running || since !== router.navigationCount() || router.currentUrl() !== url ) {
			return;
		}
		const verdict = Boolean( answer?.page ) || ADMIN_LOOKUP_GONE.includes( answer?.status );
		if ( ! verdict ) {
			return; // Tried again at the next check.
		}
		needsValidation = false;
		const action = decidePage( { current, answer, dirty: router.isDirty() } );
		if ( action === 'swap' ) {
			router.replacePage( answer.page );
		} else if ( action === 'warn-changed' ) {
			notices.add( {
				type: 'warning',
				message: i18n.__( 'An update changed how this screen works. Reload it to use the new version; unsaved changes will be lost.', 'wp-admin-site' ),
				dismissible: true,
				action: { label: i18n.__( 'Reload this screen', 'wp-admin-site' ), run: () => router.refresh() },
			} );
		} else if ( action === 'leave' ) {
			goneNotice( current.title );
			await router.navigate( homeUrl( new URL( url, 'http://admin.invalid' ) ), { replace: true } );
		} else if ( action === 'stay' ) {
			goneNotice( current.title );
		}
	}

	async function check() {
		if ( ! running || suspended || inflight || doc?.hidden ) {
			return;
		}
		if ( router.state.status !== 'ready' || ! router.state.manifest ) {
			return; // A navigation is under way; its answer is the newest.
		}
		inflight = true;
		lastCheck = now();
		const since = router.navigationCount();
		try {
			const manifest = await router.fetchManifest();
			if ( ! running || since !== router.navigationCount() || router.state.status !== 'ready' ) {
				return;
			}
			noteImports( manifest );
			const before = router.state.manifest;
			if ( manifest.version !== before.version ) {
				if ( ! await router.applyManifest( manifest ) ) {
					return;
				}
				needsValidation = true;
				announceMenu( before.menu, manifest.menu );
			}
			if ( needsValidation ) {
				await validatePage( since );
			}
		} catch ( error ) {
			if ( error?.status === 401 ) {
				suspended = true;
				disarm();
			}
			// Anything else (network, server error) is retried at the next check, silently.
		} finally {
			inflight = false;
		}
	}

	const onWake = () => {
		if ( ! doc?.hidden && now() - lastCheck >= intervalMs ) {
			check();
		}
	};

	const stopObserving = router.observe( ( manifest ) => {
		noteImports( manifest );
		needsValidation = false;
		lastCheck = now();
		if ( suspended ) {
			suspended = false;
			arm();
		}
	} );

	if ( router.state.manifest ) {
		noteImports( router.state.manifest );
	}
	doc?.addEventListener( 'visibilitychange', onWake );
	win?.addEventListener( 'focus', onWake );
	arm();

	return function stop() {
		running = false;
		disarm();
		stopObserving();
		doc?.removeEventListener( 'visibilitychange', onWake );
		win?.removeEventListener( 'focus', onWake );
	};
}
