/**
 * Contract resolution: static default implementation, optional compatible
 * replacement, and slot entries. No document/window access; no Vue.
 */

const CORE_ID = /^core\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_PRIORITY = 10;

/** Own-property lookup: server-provided keys such as "constructor" must not hit Object.prototype. */
const own = ( object, key ) => ( object && Object.hasOwn( object, key ) ? object[ key ] : undefined );

const majorOf = ( version ) => {
	const match = /^(\d+)(?:\..*)?$/.exec( String( version ?? '' ).trim() );
	return match ? Number( match[ 1 ] ) : null;
};

/** JSON with object keys sorted, so that equal configurations compare equal. */
function canonical( value ) {
	if ( Array.isArray( value ) ) {
		return '[' + value.map( canonical ).join( ',' ) + ']';
	}
	if ( value && typeof value === 'object' ) {
		return '{' + Object.keys( value ).sort().map( ( key ) => JSON.stringify( key ) + ':' + canonical( value[ key ] ) ).join( ',' ) + '}';
	}
	return JSON.stringify( value ) ?? 'null';
}

/** Identity of a replacement's configuration: module and the version it says it implements. */
const replacementKey = ( replacement ) => canonical( [ replacement?.module ?? '', replacement?.implements ?? '' ] );

/** A replacement is compatible when ids match and major versions are equal. */
export function isCompatible( contract, implemented ) {
	if ( ! contract || ! implemented || implemented.id !== contract.id ) {
		return false;
	}
	const a = majorOf( contract.version );
	const b = majorOf( implemented.version );
	return a !== null && b !== null && a === b;
}

/** Ascending priority (lower first, as with WordPress hooks), then given order. */
export function orderEntries( entries ) {
	return ( Array.isArray( entries ) ? entries : [] )
		.map( ( entry, index ) => ( { entry, index } ) )
		.sort( ( a, b ) => ( ( a.entry.priority ?? DEFAULT_PRIORITY ) - ( b.entry.priority ?? DEFAULT_PRIORITY ) ) || a.index - b.index )
		.map( ( { entry } ) => entry );
}

/** What an error boundary does with a render error: fall back once, then show a failure. */
export function renderErrorAction( { replaced, usingDefault } ) {
	return replaced && ! usingDefault ? 'use-default' : 'show-failure';
}

export function createContracts( { loader, importFn } ) {
	let replacements = {};
	let slots = {};
	const listeners = new Set();
	const known = new Map(); // contract id -> contract, after resolve()
	const warned = new Set();
	// contract id -> { key: replacementKey(), reason } of a replacement that failed. Incompatible
	// and render failures are properties of the module; a load failure may be transient.
	const failed = new Map();
	const remember = ( contractId, key, reason ) => failed.set( contractId, { key, reason } );
	let current = canonical( { replacements, slots } );

	function warnOnce( key, message ) {
		if ( ! warned.has( key ) ) {
			warned.add( key );
			console.warn( message );
		}
	}

	async function loadDefault( contractId, module ) {
		if ( CORE_ID.test( contractId ) ) {
			const [ contractModule, componentModule ] = await Promise.allSettled( [
				importFn( '/contracts/' + contractId + '.js' ),
				importFn( '/components/' + contractId + '.js' ),
			] );
			// A file the proxy refuses (the user's role may not load this page) makes the contract forbidden.
			const refused = [ contractModule, componentModule ].find( ( result ) => result.status === 'rejected' && result.reason?.status === 403 );
			if ( refused ) {
				throw Object.assign( new Error( 'Contract forbidden: ' + contractId, { cause: refused.reason } ), { code: 'contract_forbidden', status: 403 } );
			}
			if ( contractModule.status === 'rejected' ) {
				// Only a contract file that does not exist means the contract does not exist;
				// any other failure (a syntax error, the network) is a failure to load it.
				if ( contractModule.reason?.status === 404 ) {
					throw Object.assign( new Error( 'Contract not found: ' + contractId, { cause: contractModule.reason } ), { code: 'contract_not_found' } );
				}
				throw contractModule.reason;
			}
			if ( componentModule.status === 'rejected' ) {
				throw componentModule.reason;
			}
			if ( ! componentModule.value?.default ) {
				throw new Error( 'Component for ' + contractId + ' has no default export' );
			}
			return { contract: contractModule.value.default, component: componentModule.value.default, help: componentModule.value.help, stylesheets: componentModule.value.stylesheets };
		}
		if ( typeof module !== 'string' || module === '' || contractId.startsWith( 'core/' ) ) {
			throw new Error( 'Cannot resolve contract: ' + contractId );
		}
		const loaded = await loader.loadModule( module );
		if ( ! loaded?.default ) {
			// Rendering nothing would be a blank page: fail so the failure message shows.
			throw new Error( 'Page module for ' + contractId + ' has no default export' );
		}
		let contract = loaded.contract;
		if ( ! contract ) {
			console.warn( 'Module for ' + contractId + ' exports no contract; assuming an empty one.' );
			contract = { id: contractId, version: '0.0.0', props: {}, slots: {}, emits: [] };
		}
		return { contract, component: loaded.default, help: loaded.help, stylesheets: loaded.stylesheets };
	}

	return {
		/** Sets replacements and slots; subscribers are told only when they differ from the current ones. */
		configure( config ) {
			replacements = config?.replacements ?? {};
			slots = config?.slots ?? {};
			const next = canonical( { replacements, slots } );
			if ( next !== current ) {
				current = next;
				for ( const [ contractId, memo ] of [ ...failed ] ) {
					// A removed replacement that comes back is tried again; a load failure is
					// retried at the next real change of the configuration.
					if ( ! own( replacements, contractId ) || memo.reason === 'load-failed' ) {
						failed.delete( contractId );
					}
				}
				listeners.forEach( ( listener ) => listener() );
			}
		},

		/**
		 * Remembers that the configured replacement of a contract failed (e.g. threw while
		 * rendering): until its configuration changes, resolve() returns the default without
		 * loading it again and without a fallback reason.
		 */
		markFailed( contractId, key ) {
			// The key of the replacement that failed (resolve()'s `replacementKey`): the configuration
			// may have changed since, and a newer replacement must not be set aside for it.
			if ( typeof key === 'string' ) {
				remember( contractId, key, 'render' );
				return;
			}
			const replacement = own( replacements, contractId );
			if ( replacement ) {
				remember( contractId, replacementKey( replacement ), 'render' );
			}
		},

		onChange( listener ) {
			listeners.add( listener );
			return () => listeners.delete( listener );
		},

		async resolve( contractId, { module } = {} ) {
			const { contract, component: defaultComponent, help, stylesheets } = await loadDefault( contractId, module );
			known.set( contractId, contract );
			// `help`: what the module exports as `help` (a page's Help panel, see components/core/help-tabs.js), else null.
			// `stylesheets`: what it exports as `stylesheets` (core style handles the page needs, see
			// runtime/stylesheets.js), else null.
			const result = { contract, component: defaultComponent, defaultComponent, replaced: false, fallbackReason: null, help: help ?? null, stylesheets: Array.isArray( stylesheets ) ? stylesheets : null };

			const replacement = own( replacements, contractId );
			if ( ! replacement ) {
				failed.delete( contractId );
				return result;
			}
			const key = replacementKey( replacement );
			result.replacementKey = key;
			if ( failed.get( contractId )?.key === key ) {
				// Already set aside and reported; a changed configuration is tried afresh.
				return result;
			}
			failed.delete( contractId );
			let loaded;
			try {
				loaded = await loader.loadModule( replacement.module );
			} catch {
				loaded = null;
			}
			if ( ! loaded?.default ) {
				remember( contractId, key, 'load-failed' );
				return { ...result, fallbackReason: 'load-failed' };
			}
			if ( ! isCompatible( contract, loaded.implementsContract ) ) {
				remember( contractId, key, 'incompatible' );
				return { ...result, fallbackReason: 'incompatible' };
			}
			// A replacement that exports `help` (or `stylesheets`) brings its own; otherwise the default's stays.
			return { ...result, component: loaded.default, replaced: true, help: loaded.help ?? result.help, stylesheets: Array.isArray( loaded.stylesheets ) ? loaded.stylesheets : result.stylesheets };
		},

		slotEntries( contractId, slotName ) {
			const contract = known.get( contractId );
			if ( ! contract || ! Object.hasOwn( contract.slots ?? {}, slotName ) ) {
				warnOnce( contractId + '\u0000' + slotName, 'Contract ' + contractId + ' does not declare slot: ' + slotName );
				return [];
			}
			return orderEntries( own( own( slots, contractId ), slotName ) );
		},
	};
}
