/**
 * Loads plugin modules and keeps the specifier -> URL table of the dynamic
 * import map. No document/window access at import time; `importFn` and an
 * optional `document` are injected.
 *
 * Limitation: the internal table makes every top-level specifier loadable via
 * loadComponent() regardless of browser support. A browser only honours
 * additional <script type="importmap"> elements in recent Chromium and Safari
 * (and importmaps added after the first module load may be ignored elsewhere),
 * so a plugin module that itself imports *another* plugin's bare specifier
 * depends on that browser feature.
 */

const RESERVED = ( specifier ) => specifier === 'vue' || specifier.startsWith( '@wp-admin/' );

/** Renders nothing; carries the specifier that failed to load. */
function makeModuleFailure( specifier ) {
	return {
		name: 'ModuleFailure',
		moduleFailure: true,
		failedSpecifier: specifier,
		render: () => null,
	};
}

export const isModuleFailure = ( component ) => Boolean( component?.moduleFailure );

export function createLoader( { importFn, document: doc } ) {
	const table = new Map();
	const modules = new Map();
	const origin = doc?.location?.origin ?? null;

	function acceptable( url ) {
		if ( typeof url !== 'string' || url === '' || /[\\\u0000-\u001f]/.test( url ) ) {
			return false;
		}
		if ( url.startsWith( '/' ) ) {
			return ! url.startsWith( '//' );
		}
		if ( ! origin ) {
			return false;
		}
		try {
			return new URL( url ).origin === origin;
		} catch {
			return false;
		}
	}

	function applyImportMap( imports ) {
		const added = {};
		for ( const [ specifier, url ] of Object.entries( imports ?? {} ) ) {
			if ( RESERVED( specifier ) ) {
				console.warn( 'Refusing to remap reserved specifier: ' + specifier );
			} else if ( ! acceptable( url ) ) {
				console.warn( 'Refusing import map entry with a disallowed URL: ' + specifier );
			} else if ( ! table.has( specifier ) ) {
				table.set( specifier, url );
				added[ specifier ] = url;
			}
		}
		if ( doc && Object.keys( added ).length > 0 ) {
			const script = doc.createElement( 'script' );
			script.type = 'importmap';
			script.textContent = JSON.stringify( { imports: added } );
			doc.head.appendChild( script );
		}
	}

	function loadModule( specifier ) {
		if ( ! modules.has( specifier ) ) {
			const promise = Promise.resolve()
				.then( () => {
					// Unmapped specifiers are only passed on when they are themselves an acceptable URL.
					const url = table.get( specifier ) ?? ( acceptable( specifier ) ? specifier : null );
					if ( url === null ) {
						throw new Error( 'Unknown module specifier: ' + specifier );
					}
					return importFn( url );
				} )
				.catch( ( error ) => {
					modules.delete( specifier );
					throw error;
				} );
			modules.set( specifier, promise );
		}
		return modules.get( specifier );
	}

	async function loadComponent( specifier ) {
		try {
			const module = await loadModule( specifier );
			if ( ! module?.default ) {
				return makeModuleFailure( specifier );
			}
			return module.default;
		} catch {
			return makeModuleFailure( specifier );
		}
	}

	return { applyImportMap, loadComponent, loadModule };
}
