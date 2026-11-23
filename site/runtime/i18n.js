/**
 * Translations for the skeleton and plugin modules. Gettext-style API.
 * No document/window access; the api client is injected.
 */

const ENGLISH = ( n ) => ( n === 1 ? 0 : 1 );
const SAFE_EXPRESSION = /^[n\d\s()?:<>=!&|%+\-*/]+$/;

/**
 * Tiny recursive-descent evaluator for C-style plural expressions over `n`.
 * Never uses eval/new Function. Returns null for anything it does not accept.
 */
function parseExpression( source ) {
	if ( ! SAFE_EXPRESSION.test( source ) ) {
		return null;
	}
	const tokens = source.match( /\d+|n|<=|>=|==|!=|&&|\|\||[()?:<>!%+\-*/]/g );
	if ( ! tokens || tokens.join( '' ) !== source.replace( /\s+/g, '' ) ) {
		return null;
	}
	let pos = 0;
	const peek = () => tokens[ pos ];
	const eat = ( t ) => {
		if ( tokens[ pos ] !== t ) {
			throw new Error( 'syntax' );
		}
		pos++;
	};
	const binary = ( next, ops ) => () => {
		let left = next();
		while ( ops[ peek() ] ) {
			const op = ops[ tokens[ pos++ ] ];
			const l = left;
			const r = next();
			left = ( n ) => op( l( n ), r( n ) );
		}
		return left;
	};
	const num = ( b ) => ( b === true ? 1 : b === false ? 0 : b );
	const primary = () => {
		const t = tokens[ pos++ ];
		if ( t === 'n' ) {
			return ( n ) => n;
		}
		if ( /^\d+$/.test( t ?? '' ) ) {
			const v = Number( t );
			return () => v;
		}
		if ( t === '(' ) {
			const inner = ternary();
			eat( ')' );
			return inner;
		}
		throw new Error( 'syntax' );
	};
	const unary = () => {
		if ( peek() === '!' ) {
			pos++;
			const operand = unary();
			return ( n ) => num( ! operand( n ) );
		}
		return primary();
	};
	const mul = binary( unary, {
		'*': ( a, b ) => a * b,
		'/': ( a, b ) => {
			if ( b === 0 ) {
				throw new Error( 'zero' );
			}
			return Math.trunc( a / b );
		},
		'%': ( a, b ) => {
			if ( b === 0 ) {
				throw new Error( 'zero' );
			}
			return a % b;
		},
	} );
	const add = binary( mul, { '+': ( a, b ) => a + b, '-': ( a, b ) => a - b } );
	const rel = binary( add, {
		'<': ( a, b ) => num( a < b ), '>': ( a, b ) => num( a > b ),
		'<=': ( a, b ) => num( a <= b ), '>=': ( a, b ) => num( a >= b ),
	} );
	const eq = binary( rel, { '==': ( a, b ) => num( a === b ), '!=': ( a, b ) => num( a !== b ) } );
	const and = binary( eq, { '&&': ( a, b ) => num( a !== 0 && b !== 0 ) } );
	const or = binary( and, { '||': ( a, b ) => num( a !== 0 || b !== 0 ) } );
	function ternary() {
		const cond = or();
		if ( peek() === '?' ) {
			pos++;
			const yes = ternary();
			eat( ':' );
			const no = ternary();
			return ( n ) => ( cond( n ) !== 0 ? yes( n ) : no( n ) );
		}
		return cond;
	}
	try {
		const fn = ternary();
		if ( pos !== tokens.length ) {
			return null;
		}
		return fn;
	} catch {
		return null;
	}
}

/**
 * Index of the plural form for `n` per a gettext `plural-forms` header value;
 * falls back to the English rule when the header is missing or not acceptable.
 */
export function evaluatePlural( header, n ) {
	const match = typeof header === 'string' ? /plural\s*=\s*([^;]+)/.exec( header ) : null;
	const fn = match ? parseExpression( match[ 1 ].trim() ) : null;
	if ( ! fn ) {
		return ENGLISH( n );
	}
	try {
		const index = fn( n );
		return Number.isInteger( index ) && index >= 0 ? index : ENGLISH( n );
	} catch {
		return ENGLISH( n );
	}
}

export function createI18n( { api } ) {
	const domains = new Map(); // `${locale}\u0000${domain}\u0000${variant}` -> entries
	const loads = new Map(); // same key -> Promise
	// domain -> the variant of the page shown: '' for the domain alone, else the scripts, path and
	// context whose script translations (core's JavaScript strings) are merged into it.
	const variants = new Map();
	let locale = { code: 'en_US', dir: 'ltr' };

	/** The request for a domain: with a page's script translations for `default`, else alone. */
	function requestOf( domain, code, extra ) {
		const scripts = domain === 'default' && Array.isArray( extra?.scripts ) ? [ ...new Set( extra.scripts.filter( ( handle ) => typeof handle === 'string' && handle !== '' ) ) ].sort() : [];
		if ( scripts.length === 0 ) {
			return { variant: '', params: { domain, locale: code } };
		}
		const path = typeof extra.path === 'string' ? extra.path : '';
		const context = typeof extra.context === 'string' && extra.context !== '' && extra.context !== 'site' ? extra.context : null;
		const params = { domain, locale: code, scripts: scripts.join( ',' ), path };
		if ( context ) {
			params.context = context;
		}
		return { variant: [ params.scripts, path, context ?? '' ].join( '\u0000' ), params };
	}

	function loadOne( domain, code, extra ) {
		const { variant, params } = requestOf( domain, code, extra );
		const key = code + '\u0000' + domain + '\u0000' + variant;
		variants.set( domain, variant );
		if ( ! loads.has( key ) ) {
			const promise = api.get( 'wp-admin/v1/translations', params ).then(
				( payload ) => {
					const entries = payload?.locale_data?.[ domain ];
					domains.set( key, entries && typeof entries === 'object' ? entries : {} );
				},
				() => {
					if ( ! domains.has( key ) ) {
						domains.set( key, {} );
					}
					loads.delete( key ); // Allow a retry, e.g. after signing in.
				}
			);
			loads.set( key, promise );
		}
		return loads.get( key );
	}

	// The entries of the page's variant once loaded, else those of the domain alone.
	const entriesFor = ( domain ) => {
		const variant = variants.get( domain ) ?? '';
		const base = locale.code + '\u0000' + domain + '\u0000';
		return ( variant !== '' ? domains.get( base + variant ) : undefined ) ?? domains.get( base );
	};

	const lookup = ( text, context, domain ) => {
		const entry = entriesFor( domain )?.[ context ? context + '\u0004' + text : text ];
		return Array.isArray( entry ) ? entry : null;
	};

	const translate = ( text, context, domain = 'default' ) => {
		const forms = lookup( text, context, domain );
		return forms && typeof forms[ 0 ] === 'string' && forms[ 0 ] !== '' ? forms[ 0 ] : text;
	};

	const translatePlural = ( single, plural, n, context, domain = 'default' ) => {
		const source = n === 1 ? single : plural;
		const forms = lookup( single, context, domain );
		if ( ! forms ) {
			return source;
		}
		const index = evaluatePlural( entriesFor( domain )?.[ '' ]?.[ 'plural-forms' ], Number( n ) );
		const form = forms[ index ];
		return typeof form === 'string' && form !== '' ? form : source;
	};

	return {
		/**
		 * Loads text domains in a language. `extra` (`{ scripts, path, context }`): the page's
		 * script translations, the core script handles whose JavaScript strings the page uses
		 * (its `scriptTranslations`), asked for with the `default` domain together with the
		 * page's router path and admin context, which WordPress checks them against.
		 */
		async load( names, code, extra = {} ) {
			await Promise.all( [ ...new Set( names ) ].map( ( d ) => loadOne( d, code, extra ) ) );
		},
		__: ( text, domain ) => translate( text, '', domain ),
		_x: ( text, context, domain ) => translate( text, context, domain ),
		_n: ( single, plural, n, domain ) => translatePlural( single, plural, n, '', domain ),
		_nx: ( single, plural, n, context, domain ) => translatePlural( single, plural, n, context, domain ),
		sprintf( format, ...args ) {
			let next = 0;
			return String( format ).replace( /%(?:(\d+)\$)?([sd%])/g, ( whole, position, type ) => {
				if ( type === '%' ) {
					return '%';
				}
				if ( position && Number( position ) < 1 ) {
					return whole;
				}
				const index = position ? Number( position ) - 1 : next++;
				if ( index >= args.length ) {
					return whole;
				}
				return type === 'd' ? String( parseInt( args[ index ], 10 ) || 0 ) : String( args[ index ] );
			} );
		},
		setLocale( { code, dir } ) {
			locale = { code, dir: dir === 'rtl' ? 'rtl' : 'ltr' };
		},
		getLocale: () => ( { ...locale } ),
	};
}
