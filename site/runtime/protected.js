import { reactive } from 'vue';
import Contracted from './Contracted.js';
import PageHost from './PageHost.js';
// The kit's InlineMarkup, under the name the public ErrorScreen's `markupComponent` takes it by: the
// shell (public) cannot import the kit, so it renders the router's access-denied markup with this.
import MessageMarkup from '../kit/InlineMarkup.js';
import { SlotOutlet } from './slots.js';
import { loader, contracts, onModuleUnauthorized } from './contracts-instance.js';
import { createNotices } from './notices.js';
import { adminBase, currentMenuPath } from './menu.js';
import { syncStylesheets } from './stylesheets.js';
import { startLive } from './live.js';
import i18n from './i18n-instance.js';

/**
 * Everything the signed-in admin needs, in one module. The proxy serves it, and
 * everything it imports, only to a visitor whose login cookie WordPress accepts;
 * app.js imports it after the session check (or the sign-in) succeeds.
 */

export const STYLESHEETS = [ '/styles/frame.css', '/styles/kit.css', '/styles/legacy.css' ];

// Kept for the whole visit, so that notices raised while a page loads are shown once the frame is.
export const notices = createNotices( { reactive } );

// What pages get: the service without addCaptured(), which only the frame uses (as `capturedNotices`).
const { addCaptured, ...pageNotices } = notices;

let stopLive = null;

function insertStylesheets( doc ) {
	const loads = [];
	for ( const href of STYLESHEETS ) {
		if ( doc.head.querySelector( `link[rel="stylesheet"][href="${ href }"]` ) ) {
			continue;
		}
		const link = doc.createElement( 'link' );
		link.setAttribute( 'rel', 'stylesheet' );
		link.setAttribute( 'href', href );
		// A stylesheet that fails is not a reason to keep the admin from showing.
		loads.push( new Promise( ( resolve ) => {
			link.addEventListener( 'load', resolve, { once: true } );
			link.addEventListener( 'error', resolve, { once: true } );
		} ) );
		doc.head.appendChild( link );
	}
	return Promise.all( loads );
}

/**
 * Wires the admin into the running app: the notices service, the router (for
 * pages that navigate by themselves, such as core/legacy), the global
 * <SlotOutlet>, the frame and kit stylesheets, and what happens when a module
 * turns out to be refused because the session has ended.
 *
 * @param {object} app The Vue app.
 * @param {{document?: Document, onUnauthorized?: () => void, router?: object}} options
 */
export async function install( app, { document: doc = globalThis.document, onUnauthorized, router } = {} ) {
	app.provide( 'notices', pageNotices );
	app.provide( 'capturedNotices', addCaptured );
	if ( router ) {
		app.provide( 'router', router );
	}
	// Page and slot modules write <SlotOutlet name="…" /> without importing it.
	app.component( 'SlotOutlet', SlotOutlet );
	if ( onUnauthorized ) {
		onModuleUnauthorized( onUnauthorized );
	}
	if ( doc ) {
		await insertStylesheets( doc );
	}
	if ( router && ! stopLive ) {
		stopLive = startLive( { router, notices, i18n, document: doc } );
	}
}

/**
 * The contract of the administration email verification after sign-in, which the public shell
 * shows by this name once the entry is loaded (it names no other contract than core/frame).
 */
export const ADMIN_EMAIL_CONFIRM = 'core/admin-email-confirm';

export { Contracted, PageHost, MessageMarkup, loader, contracts, adminBase, currentMenuPath, syncStylesheets };
