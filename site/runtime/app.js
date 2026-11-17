import { createApp, reactive, watchEffect } from 'vue';
import api from './api-instance.js';
import { loader, contracts } from './contracts-instance.js';
import { createRouter } from './router.js';
import { browserLocales, setLanguage } from './locale.js';
import { __ } from './text.js';
import Shell from './Shell.js';

const router = createRouter( {
	api,
	history: window.history,
	location: window.location,
	reactive,
	async onManifest( manifest ) {
		loader.applyImportMap( manifest.importMap?.imports );
		contracts.configure( { replacements: manifest.replacements, slots: manifest.slots } );
		await setLanguage( manifest.locale.code, {
			dir: manifest.locale.dir,
			domains: manifest.page?.textDomains ?? [],
		} );
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
		document.title = __( 'Sign in' );
	} else if ( status === 'loading' ) {
		document.title = __( 'Loading…' );
	} else {
		document.title = __( 'Error' );
	}
} );

createApp( Shell, { router } ).mount( '#app' );
router.listen( { window, document } );

// Before the router answers, use the browser's language; a signed-in response replaces it.
await setLanguage( browserLocales()[ 0 ] );
await router.start();
