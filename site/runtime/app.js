import { createApp, reactive, shallowRef, watchEffect } from 'vue';
import api from './api-instance.js';
import { createRouter, shouldBoot } from './router.js';
import { browserLocales, setLanguage } from './locale.js';
import i18n from './i18n-instance.js';
import { installTemplateI18n } from './template-i18n.js';
import Shell from './Shell.js';

/*
 * Unauthorized by default: this module and its static imports are all an anonymous
 * visitor can load (site/public-files.json). The admin itself (frame, page host, kit,
 * contracts, components, notices, frame styles) is one protected entry, imported
 * only once WordPress has accepted the session.
 */
const PROTECTED_ENTRY = '/runtime/protected.js';

// The protected entry once loaded, else null.
const signedIn = shallowRef( null );
let pending = null;
let attempts = 0;

/**
 * Imports the protected entry. A failure (the proxy refused it: the session has ended)
 * is reported as a 401, which the router treats like any other ended session.
 */
function loadProtected() {
	if ( signedIn.value ) {
		return Promise.resolve( signedIn.value );
	}
	if ( ! pending ) {
		// A failed import may be remembered by the browser: a retry asks for a fresh URL.
		const url = PROTECTED_ENTRY + ( attempts > 0 ? '?attempt=' + attempts : '' );
		attempts++;
		pending = import( url )
			.then( async ( module ) => {
				await module.install( app, { document, router, onUnauthorized: () => router.expire() } );
				signedIn.value = module;
				return module;
			} )
			.catch( ( cause ) => {
				pending = null;
				throw Object.assign( new Error( 'admin_not_authenticated', { cause } ), { status: 401, code: 'admin_not_authenticated' } );
			} );
	}
	return pending;
}

const router = createRouter( {
	api,
	history: window.history,
	location: window.location,
	reactive,
	// Only called with the router's answer for a signed-in user.
	async onManifest( manifest ) {
		const { loader, contracts } = await loadProtected();
		loader.applyImportMap( manifest.importMap?.imports );
		contracts.configure( { replacements: manifest.replacements, slots: manifest.slots } );
		// A manifest without a page (a live update) refreshes the translations only when the
		// language changed. Missing translations show the source strings; they never stop the page.
		if ( manifest.page || manifest.locale.code !== i18n.getLocale().code ) {
			await setLanguage( manifest.locale.code, {
				dir: manifest.locale.dir,
				domains: manifest.page?.textDomains ?? [],
			} ).catch( () => {} );
		}
	},
} );

const app = createApp( Shell, { router, signedIn } );
installTemplateI18n( app );

// Inside a frame (a classic screen's frame answered with this app) nothing starts and the
// document stays empty: otherwise the app would frame itself again, without end.
if ( shouldBoot( window ) ) {
	window.__wpAdmin = {
		get status() {
			return router.state.status;
		},
		get page() {
			return router.state.page;
		},
		get manifest() {
			return router.state.manifest;
		},
	};

	// WordPress's admin styles follow the signed-in user's language direction.
	watchEffect( () => {
		const manifest = router.state.manifest;
		signedIn.value?.syncStylesheets( document, manifest ? ( manifest.locale?.dir === 'rtl' ? 'rtl' : 'ltr' ) : null );
	} );

	app.mount( '#app' );
	router.listen( { window, document } );

	// Before the router answers, use the browser's language; a signed-in response replaces it.
	// A failure to load translations must not keep the router from starting.
	try {
		await setLanguage( browserLocales()[ 0 ] );
	} catch {
		// Source strings are shown.
	}
	await router.start();
}
