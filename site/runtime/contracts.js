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

	function warnOnce( key, message ) {
		if ( ! warned.has( key ) ) {
			warned.add( key );
			console.warn( message );
		}
	}

	async function loadDefault( contractId, module ) {
		if ( CORE_ID.test( contractId ) ) {
			const [ contractModule, componentModule ] = await Promise.all( [
				importFn( '/contracts/' + contractId + '.js' ),
				importFn( '/components/' + contractId + '.js' ),
			] );
			return { contract: contractModule.default, component: componentModule.default };
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
		configure( config ) {
			replacements = config?.replacements ?? {};
			slots = config?.slots ?? {};
			listeners.forEach( ( listener ) => listener() );
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
			let loaded;
			try {
				loaded = await loader.loadModule( replacement.module );
			} catch {
				loaded = null;
			}
			if ( ! loaded?.default ) {
				return { ...result, fallbackReason: 'load-failed' };
			}
			if ( ! isCompatible( contract, loaded.implementsContract ) ) {
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
