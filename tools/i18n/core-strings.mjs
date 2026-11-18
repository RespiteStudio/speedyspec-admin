/**
 * Reads WordPress core's gettext strings from its PHP sources, so that the admin's
 * `default`-domain strings can be checked against what core's language packs contain.
 *
 * It finds calls of core's translation functions and decodes the PHP string literals
 * that are their arguments (single-quoted: `\\` and `\'`; double-quoted: the usual
 * escapes). Arguments that are not plain literals (variables, concatenation) are
 * skipped, as xgettext skips them too. Strings are compared byte for byte.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Function -> the roles of its leading arguments ('skip' = any expression). */
const FUNCTIONS = {
	__: [ 'text' ],
	_e: [ 'text' ],
	esc_html__: [ 'text' ],
	esc_attr__: [ 'text' ],
	esc_html_e: [ 'text' ],
	esc_attr_e: [ 'text' ],
	_x: [ 'text', 'context' ],
	_ex: [ 'text', 'context' ],
	esc_html_x: [ 'text', 'context' ],
	esc_attr_x: [ 'text', 'context' ],
	_n: [ 'text', 'plural' ],
	_nx: [ 'text', 'plural', 'skip', 'context' ],
	_n_noop: [ 'text', 'plural' ],
	_nx_noop: [ 'text', 'plural', 'context' ],
};
const CALL = new RegExp( '(?<![\\w$>:])(' + Object.keys( FUNCTIONS ).sort( ( a, b ) => b.length - a.length ).join( '|' ) + ')\\s*\\(', 'g' );

const DOUBLE_ESCAPES = { n: '\n', t: '\t', r: '\r', v: '\v', e: '\x1b', f: '\f', '\\': '\\', $: '$', '"': '"' };

/** A PHP string literal at `i` (after whitespace); returns { value, next } or null. */
function literalAt( php, i ) {
	while ( /\s/.test( php[ i ] ?? '' ) ) {
		i++;
	}
	const quote = php[ i ];
	if ( quote !== '\'' && quote !== '"' ) {
		return null;
	}
	let value = '';
	for ( i++; i < php.length; i++ ) {
		const c = php[ i ];
		if ( c === quote ) {
			return { value, next: i + 1 };
		}
		if ( c === '\\' ) {
			const d = php[ i + 1 ];
			if ( quote === '\'' ) {
				if ( d === '\\' || d === '\'' ) {
					value += d;
					i++;
				} else {
					value += c;
				}
			} else if ( Object.hasOwn( DOUBLE_ESCAPES, d ) ) {
				value += DOUBLE_ESCAPES[ d ];
				i++;
			} else if ( /[0-7]/.test( d ) ) {
				const octal = /^[0-7]{1,3}/.exec( php.slice( i + 1, i + 4 ) )[ 0 ];
				value += String.fromCharCode( parseInt( octal, 8 ) & 0xff );
				i += octal.length;
			} else if ( d === 'x' && /^[0-9a-fA-F]{1,2}/.test( php.slice( i + 2, i + 4 ) ) ) {
				const hex = /^[0-9a-fA-F]{1,2}/.exec( php.slice( i + 2, i + 4 ) )[ 0 ];
				value += String.fromCharCode( parseInt( hex, 16 ) );
				i += 1 + hex.length;
			} else if ( d === 'u' && php[ i + 2 ] === '{' ) {
				const close = php.indexOf( '}', i + 3 );
				value += String.fromCodePoint( parseInt( php.slice( i + 3, close ), 16 ) );
				i = close;
			} else {
				value += c;
			}
			continue;
		}
		if ( quote === '"' && c === '$' && /[A-Za-z_{]/.test( php[ i + 1 ] ?? '' ) ) {
			return null; // Interpolated variable: not a literal.
		}
		value += c;
	}
	return null;
}

/** Index of the `,` or `)` that ends the expression starting at `i`, honouring brackets and strings. */
function skipExpression( php, i ) {
	let depth = 0;
	for ( ; i < php.length; i++ ) {
		const c = php[ i ];
		if ( c === '\'' || c === '"' ) {
			const lit = literalAt( php, i );
			if ( lit ) {
				i = lit.next - 1;
				continue;
			}
			// An interpolated string: skip it by hand.
			for ( i++; i < php.length && php[ i ] !== c; i++ ) {
				if ( php[ i ] === '\\' ) {
					i++;
				}
			}
			continue;
		}
		if ( '([{'.includes( c ) ) {
			depth++;
		} else if ( ')]}'.includes( c ) ) {
			if ( depth === 0 ) {
				return i;
			}
			depth--;
		} else if ( c === ',' && depth === 0 ) {
			return i;
		}
	}
	return i;
}

/** The strings of one PHP source: [ { text, plural, context } ]. */
export function stringsOfPhp( php ) {
	const found = [];
	for ( const match of php.matchAll( CALL ) ) {
		let i = match.index + match[ 0 ].length;
		const parts = {};
		let ok = true;
		for ( const [ index, role ] of FUNCTIONS[ match[ 1 ] ].entries() ) {
			if ( index > 0 ) {
				i = skipExpression( php, i );
				if ( php[ i ] !== ',' ) {
					ok = false;
					break;
				}
				i++;
			}
			if ( role === 'skip' ) {
				continue;
			}
			const literal = literalAt( php, i );
			if ( ! literal ) {
				ok = false;
				break;
			}
			let after = literal.next;
			while ( /\s/.test( php[ after ] ?? '' ) ) {
				after++;
			}
			if ( php[ after ] !== ',' && php[ after ] !== ')' ) {
				ok = false; // A concatenation or other expression: not a plain literal.
				break;
			}
			parts[ role ] = literal.value;
			i = literal.next;
		}
		if ( ok ) {
			found.push( { text: parts.text, plural: parts.plural ?? null, context: parts.context ?? '' } );
		}
	}
	return found;
}

const keyOf = ( { text, plural, context } ) => context + '\u0004' + text + '\u0000' + ( plural ?? '' );

/** The index of every gettext string in `src/wp-admin` and `src/wp-includes` below `wpSrc`. */
export function loadCoreStrings( wpSrc ) {
	const keys = new Set();
	const walk = ( directory ) => {
		for ( const item of readdirSync( directory, { withFileTypes: true } ) ) {
			const full = join( directory, item.name );
			if ( item.isDirectory() ) {
				walk( full );
			} else if ( item.name.endsWith( '.php' ) ) {
				for ( const string of stringsOfPhp( readFileSync( full, 'utf8' ) ) ) {
					keys.add( keyOf( string ) );
				}
			}
		}
	};
	for ( const part of [ 'wp-admin', 'wp-includes' ] ) {
		if ( existsSync( join( wpSrc, part ) ) ) {
			walk( join( wpSrc, part ) );
		}
	}
	return { has: ( string ) => keys.has( keyOf( string ) ), size: keys.size };
}
