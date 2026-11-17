import { createApp, reactive, watchEffect } from 'vue';
import api from './api-instance.js';
import { loader, contracts } from './contracts-instance.js';
import { createRouter } from './router.js';
import { browserLocales, setLanguage } from './locale.js';
import { __ } from './text.js';
import { installTemplateI18n } from './template-i18n.js';
import Shell from './Shell.js';

const router = createRouter( {
	api,
	history: window.history,
	location: window.location,
	reactive,
	async onManifest( manifest ) {
		loader.applyImportMap( manifest.importMap?.imports );
		contracts.configure( { replacements: manifest.replacements, slots: manifest.slots } );
		// Missing translations show the source strings; they never stop the page.
		await setLanguage( manifest.locale.code, {
			dir: manifest.locale.dir,
			domains: manifest.page?.textDomains ?? [],
		} ).catch( () => {} );
	},
} );

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

watchEffect( () => {
	const { status, page } = router.state;
	if ( status === 'ready' && page?.title ) {
		document.title = page.title;
	} else if ( status === 'login' ) {
		document.title = __( 'Sign in', 'wp-admin-site' );
	} else if ( status === 'loading' ) {
		document.title = __( 'Loading…', 'wp-admin-site' );
	} else {
		document.title = __( 'Error', 'wp-admin-site' );
	}
} );

const app = createApp( Shell, { router } );
installTemplateI18n( app );
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
