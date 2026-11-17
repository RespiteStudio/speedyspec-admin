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
	const failed = new Map(); // contract id -> replacementKey() of a replacement that failed
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
			return { contract: contractModule.value.default, component: componentModule.value.default };
		}
		if ( typeof module !== 'string' || module === '' || contractId.startsWith( 'core/' ) ) {
			throw new Error( 'Cannot resolve contract: ' + contractId );
		}
		const loaded = await loader.loadModule( module );
		let contract = loaded.contract;
		if ( ! contract ) {
			console.warn( 'Module for ' + contractId + ' exports no contract; assuming an empty one.' );
			contract = { id: contractId, version: '0.0.0', props: {}, slots: {}, emits: [] };
		}
		return { contract, component: loaded.default };
	}

	return {
		/** Sets replacements and slots; subscribers are told only when they differ from the current ones. */
		configure( config ) {
			replacements = config?.replacements ?? {};
			slots = config?.slots ?? {};
			const next = canonical( { replacements, slots } );
			if ( next !== current ) {
				current = next;
				listeners.forEach( ( listener ) => listener() );
			}
		},

		/**
		 * Remembers that the configured replacement of a contract failed (e.g. threw while
		 * rendering): until its configuration changes, resolve() returns the default without
		 * loading it again and without a fallback reason.
		 */
		markFailed( contractId ) {
			const replacement = own( replacements, contractId );
			if ( replacement ) {
				failed.set( contractId, replacementKey( replacement ) );
			}
		},

		onChange( listener ) {
			listeners.add( listener );
			return () => listeners.delete( listener );
		},

		async resolve( contractId, { module } = {} ) {
			const { contract, component: defaultComponent } = await loadDefault( contractId, module );
			known.set( contractId, contract );
			const result = { contract, component: defaultComponent, defaultComponent, replaced: false, fallbackReason: null };

			const replacement = own( replacements, contractId );
			if ( ! replacement ) {
				return result;
			}
			const key = replacementKey( replacement );
			if ( failed.get( contractId ) === key ) {
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
				failed.set( contractId, key );
				return { ...result, fallbackReason: 'load-failed' };
			}
			if ( ! isCompatible( contract, loaded.implementsContract ) ) {
				failed.set( contractId, key );
				return { ...result, fallbackReason: 'incompatible' };
			}
			return { ...result, component: loaded.default, replaced: true };
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
