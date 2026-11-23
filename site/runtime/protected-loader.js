/**
 * Loads the protected entry of the admin (frame, page host, kit, contracts) once WordPress has
 * accepted the session. No window/document access: the import, the status probe and the install
 * step are injected (so it runs in the unit tests, under node).
 */

export const PROTECTED_ENTRY = '/runtime/protected.js';

/**
 * @param {{importModule: (url: string) => Promise<object>, probe: (url: string) => Promise<number|null>,
 *          install: (module: object) => Promise<void>|void}} options
 *        `probe` resolves to the HTTP status of the entry (a HEAD request), or null when that failed.
 * @returns {{load: () => Promise<object>, loaded: () => object|null}}
 */
export function createProtectedLoader( { importModule, probe, install } ) {
	let loaded = null;
	let pending = null;
	let attempts = 0;

	/**
	 * Imports the protected entry. The browser does not say why an import failed, so the entry
	 * is asked for again, headers only: only a 401 (the proxy no longer accepts the session) is an
	 * ended session. Anything else (a refused or missing file, a syntax error, a network failure,
	 * a timed-out session check) is an error the user can retry, never the sign-in screen again.
	 */
	function load() {
		if ( loaded ) {
			return Promise.resolve( loaded );
		}
		if ( ! pending ) {
			// A failed import may be remembered by the browser: a retry asks for a fresh URL.
			const url = PROTECTED_ENTRY + ( attempts > 0 ? '?attempt=' + attempts : '' );
			attempts++;
			pending = Promise.resolve()
				.then( () => importModule( url ) )
				.then( async ( module ) => {
					await install( module );
					loaded = module;
					return module;
				} )
				.catch( async ( cause ) => {
					pending = null;
					let status = null;
					try {
						status = await probe( PROTECTED_ENTRY );
					} catch {
						// Unknown: not an ended session.
					}
					if ( status === 401 ) {
						throw Object.assign( new Error( 'admin_not_authenticated', { cause } ), { status: 401, code: 'admin_not_authenticated' } );
					}
					throw Object.assign( new Error( 'admin_unavailable', { cause } ), { status: null, code: 'admin_unavailable' } );
				} );
		}
		return pending;
	}

	return { load, loaded: () => loaded };
}
