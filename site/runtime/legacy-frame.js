/**
 * Pure logic of the legacy page host (core/legacy): which URLs may be shown in
 * the frame, how a frame URL maps to the top-level URL (the identity on path,
 * query and hash), which screens get the full layout, and what to do when the
 * frame has loaded a document. No Vue, no window or document.
 */
import { toPagePath } from './router.js';

export const LEGACY = 'core/legacy';

/**
 * Screens that are applications filling the whole window: the frame gets the
 * full viewport height (scrolling inside) and the frame menu is collapsed.
 */
export const FULL_LAYOUT_SCREENS = Object.freeze( [ 'post.php', 'post-new.php', 'site-editor.php', 'customize.php', 'widgets.php' ] );

const ADMIN_SCREEN = /^(?:\/sites\/\d+)?\/wp-admin\//;
const SIGN_IN = /^(?:\/sites\/\d+)?\/wp-login\.php$/;
// Control characters, whitespace and backslashes (which browsers read as slashes).
const UNSAFE = /[\u0000- \u007f\\]/;
const BASE = 'http://legacy-frame.invalid';

/**
 * The value when it is a root-relative URL of an admin screen on this origin
 * (`/wp-admin/…` or `/sites/{id}/wp-admin/…`), else null. No scheme, no `//`,
 * no backslash, no whitespace or control characters, no dot segments.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function validateSrc( value ) {
	if ( typeof value !== 'string' || UNSAFE.test( value ) || ! ADMIN_SCREEN.test( value ) ) {
		return null;
	}
	const path = value.split( /[?#]/, 1 )[ 0 ];
	if ( path.split( '/' ).some( ( segment ) => /^(?:\.|%2e){1,2}$/i.test( segment ) ) ) {
		return null;
	}
	let url;
	try {
		url = new URL( value, BASE );
	} catch {
		return null;
	}
	return url.origin === BASE && ADMIN_SCREEN.test( url.pathname ) ? value : null;
}

/**
 * The top-level URL (path, query and hash) showing the same screen as a frame
 * at `href`, or null when `href` is not an admin screen on `origin`.
 *
 * @param {string|null} href   The frame's location.
 * @param {string}      origin The admin origin.
 * @returns {string|null}
 */
export function frameToTopUrl( href, origin ) {
	let url;
	try {
		url = new URL( href );
	} catch {
		return null;
	}
	if ( url.origin !== origin ) {
		return null;
	}
	return validateSrc( url.pathname + url.search + url.hash );
}

/** The frame URL of a top-level URL: the same URL, when it is a valid admin screen. */
export const topToFrameUrl = ( url ) => validateSrc( url );

function pageOf( url ) {
	const valid = validateSrc( url );
	if ( ! valid ) {
		return null;
	}
	const { pathname, search } = new URL( valid, BASE );
	return toPagePath( { pathname, search } );
}

/** Whether two admin URLs are the same router page (context, site, path and query; not the hash). */
export function samePage( a, b ) {
	const x = pageOf( a );
	const y = pageOf( b );
	return Boolean( x && y ) && x.context === y.context && x.siteId === y.siteId && x.path === y.path;
}

/** The router path (`edit.php?post_type=page`) of an admin URL, or null. */
export const pagePathOf = ( url ) => pageOf( url )?.path ?? null;

/** 'full' for the screens in FULL_LAYOUT_SCREENS, whatever their query; else 'default'. */
export function layoutFor( url ) {
	const page = pageOf( url );
	const file = page ? page.path.split( '?' )[ 0 ] : '';
	return FULL_LAYOUT_SCREENS.includes( file ) ? 'full' : 'default';
}

/**
 * What to do once the frame has loaded a document.
 *
 * - `ignore`: about:blank (or about:srcdoc) while the frame has not shown any document
 *   yet (`blankAllowed`); once a document has been there, a blank frame is `restore`d.
 * - `login`: the frame is on this origin's sign-in screen (the session has ended).
 * - `restore`: the frame is not on an admin screen of this origin (location
 *   unreadable, another origin, a path outside `/wp-admin/`), whoever started the
 *   navigation: show the last admin screen again (or nothing).
 * - `stay`: the frame is on the current page.
 * - `lookup`: another admin screen; ask the router which page it is (`answer` undefined).
 * - `adopt`: the router says it is a legacy page: the top URL follows the frame.
 * - `native`: the router says it is a converted page: drop the frame and navigate.
 * - `keep`: the router does not know the screen (or failed): leave everything as it is.
 *
 * @param {object}             args
 * @param {string|null}        args.href    The frame's location, null when unreadable.
 * @param {string}             args.origin  The admin origin.
 * @param {string}             args.current The URL of the page on screen.
 * @param {boolean}            [args.blankAllowed] No document has been shown in the frame yet.
 * @param {object|Error}       [args.answer] The router's manifest for the frame URL.
 * @returns {{action: string, url?: string}}
 */
export function syncDecision( { href, origin, current, blankAllowed = true, answer } ) {
	if ( href === null || href === undefined ) {
		return { action: 'restore' };
	}
	let url;
	try {
		url = new URL( href );
	} catch {
		return { action: 'restore' };
	}
	if ( url.protocol === 'about:' ) {
		return { action: blankAllowed ? 'ignore' : 'restore' };
	}
	if ( url.origin === origin && SIGN_IN.test( url.pathname ) ) {
		return { action: 'login' };
	}
	const top = frameToTopUrl( href, origin );
	if ( ! top ) {
		return { action: 'restore' };
	}
	if ( samePage( top, current ) ) {
		return { action: 'stay', url: top };
	}
	if ( answer === undefined ) {
		return { action: 'lookup', url: top };
	}
	const component = answer instanceof Error ? null : answer?.page?.component;
	if ( typeof component !== 'string' ) {
		return { action: 'keep', url: top };
	}
	return { action: component === LEGACY ? 'adopt' : 'native', url: top };
}

/** Height of a frame that follows its document: the content's bottom edge, at least `minimum`. */
export function frameHeight( { contentBottom, minimum } ) {
	const content = Number.isFinite( contentBottom ) ? Math.ceil( contentBottom ) : 0;
	return Math.max( content, Number.isFinite( minimum ) ? Math.ceil( minimum ) : 0 );
}

/**
 * The URL a plain click on a link inside the frame leads to when it leaves the
 * admin (an http(s) URL that is neither an admin screen nor the sign-in screen
 * of this origin), else null. Clicks with a modifier, another button, a target
 * or a download are left to the browser.
 */
export function outsideLink( { href, origin, button = 0, target = '', modified = false, download = false } ) {
	if ( button !== 0 || modified || download || ( target && target !== '_self' ) ) {
		return null;
	}
	let url;
	try {
		url = new URL( href );
	} catch {
		return null;
	}
	if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) {
		return null;
	}
	if ( url.origin === origin && ( frameToTopUrl( url.href, origin ) || SIGN_IN.test( url.pathname ) ) ) {
		return null;
	}
	return url.href;
}

/** Whether `href` is this origin's sign-in screen (`/wp-login.php`, also under `/sites/{id}`). */
export function isSignInUrl( href, origin ) {
	try {
		const url = new URL( href );
		return url.origin === origin && SIGN_IN.test( url.pathname );
	} catch {
		return false;
	}
}

/**
 * Whether the frame's navigation to the document it has just loaded pushed an entry
 * onto the joint session history, as the browser reports it: only a navigation the frame
 * made itself (not one this host started with location.replace or by creating the frame)
 * whose Navigation API activation type is `push`. Anything else (`replace`, `reload`,
 * `traverse`, an unreadable document, no Navigation API) is unknown and counts as no.
 *
 * @param {object}      args
 * @param {boolean}     args.hostNavigation The host itself sent the frame to this document.
 * @param {string|null} args.navigationType `navigation.activation.navigationType` of the frame's window.
 */
export function pushedHistoryEntry( { hostNavigation, navigationType } ) {
	return ! hostNavigation && navigationType === 'push';
}

/**
 * What to do with a link or a GET form in the frame that targets `_parent` or `_top`,
 * which the sandboxed frame may not navigate: an admin screen (or the sign-in screen) of
 * this origin opens in the frame itself, `{ action: 'frame', url }`; another http(s) URL
 * opens in a new tab, `{ action: 'outside', url }`; anything else is left alone (null).
 */
export function parentTargetAction( { href, origin, target } ) {
	if ( target !== '_parent' && target !== '_top' ) {
		return null;
	}
	let url;
	try {
		url = new URL( href );
	} catch {
		return null;
	}
	if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) {
		return null;
	}
	if ( url.origin === origin && ( frameToTopUrl( url.href, origin ) || SIGN_IN.test( url.pathname ) ) ) {
		return { action: 'frame', url: url.href };
	}
	return { action: 'outside', url: url.href };
}

/**
 * Whether a frame document is the admin app's own shell (served in place of a classic
 * screen to a browser that does not say it is loading a frame): it has the app's mount
 * point and none of a classic screen's body classes. Shown in the frame it would start
 * another admin inside it.
 */
export function isAppShell( doc ) {
	try {
		const body = doc?.body;
		const classic = body?.classList?.contains?.( 'wp-admin' ) || body?.classList?.contains?.( 'wp-detached' );
		return Boolean( doc?.getElementById?.( 'app' ) ) && ! classic;
	} catch {
		return false;
	}
}
