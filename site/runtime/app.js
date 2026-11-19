import { createApp, reactive, shallowRef, watchEffect } from 'vue';
import api from './api-instance.js';
import { createRouter, shouldBoot, toPagePath } from './router.js';
import { browserLocales, setLanguage } from './locale.js';
import i18n from './i18n-instance.js';
import { installTemplateI18n } from './template-i18n.js';
import Shell from './Shell.js';
import { createProtectedLoader, PROTECTED_ENTRY } from './protected-loader.js';

/*
 * Unauthorized by default: this module and its static imports are all an anonymous
 * visitor can load (site/public-files.json). The admin itself (frame, page host, kit,
 * contracts, components, notices, frame styles) is one protected entry, imported
 * only once WordPress has accepted the session.
 */

// The protected entry once loaded, else null.
const signedIn = shallowRef( null );

const protectedEntry = createProtectedLoader( {
	// The one dynamic import of public code, and only ever for the protected entry.
	importModule: ( url ) => ( url.split( '?' )[ 0 ] === PROTECTED_ENTRY ? import( url ) : Promise.reject( new Error( 'Not the protected entry: ' + url ) ) ),
	probe: async ( url ) => ( await fetch( url, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' } ) ).status,
	async install( module ) {
		await module.install( app, { document, router, onUnauthorized: () => router.expire() } );
		signedIn.value = module;
	},
} );

/** The protected entry; only a 401 for it is an ended session (see protected-loader.js). */
const loadProtected = () => protectedEntry.load();

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
			// The page's core JavaScript strings (postbox.js…) come with the default domain.
			await setLanguage( manifest.locale.code, {
				dir: manifest.locale.dir,
				domains: manifest.page?.textDomains ?? [],
				scripts: manifest.page?.scriptTranslations ?? [],
				path: manifest.page?.path ?? '',
				context: toPagePath( window.location ).context,
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
