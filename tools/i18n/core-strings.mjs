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
import { tokenize } from './tokenize.mjs';

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
/** Index of the text domain argument of each function. */
const DOMAIN_INDEX = {
	__: 1, _e: 1, esc_html__: 1, esc_attr__: 1, esc_html_e: 1, esc_attr_e: 1,
	_x: 2, _ex: 2, esc_html_x: 2, esc_attr_x: 2,
	_n: 3, _nx: 4, _n_noop: 2, _nx_noop: 3,
};
const CALL = new RegExp( '(?<![\\w$>:])(' + Object.keys( FUNCTIONS ).sort( ( a, b ) => b.length - a.length ).join( '|' ) + ')\\s*\\(', 'g' );

const DOUBLE_ESCAPES = { n: '\n', t: '\t', r: '\r', v: '\v', e: '\x1b', f: '\f', '\\': '\\', $: '$', '"': '"' };


/**
 * Marks which characters of a PHP file are code: not inline HTML/JS outside `<?php … ?>`,
 * not comments (`//`, `#`, block and docblock), not heredoc/nowdoc bodies and not the
 * inside of string literals. A call counts only when its name starts in code.
 */
export function codeMask( php ) {
	const mask = new Uint8Array( php.length );
	let i = 0;
	let inPhp = false;
	while ( i < php.length ) {
		if ( ! inPhp ) {
			const open = /<\?(?:php\b|=)?/g;
			open.lastIndex = i;
			const m = open.exec( php );
			if ( ! m ) {
				break;
			}
			i = m.index + m[ 0 ].length;
			inPhp = true;
			continue;
		}
		const c = php[ i ];
		const two = php.slice( i, i + 2 );
		if ( two === '?>' ) {
			inPhp = false;
			i += 2;
		} else if ( c === '\'' || c === '"' ) {
			i++;
			while ( i < php.length && php[ i ] !== c ) {
				i += php[ i ] === '\\' ? 2 : 1;
			}
			i++;
		} else if ( two === '//' || ( c === '#' && php[ i + 1 ] !== '[' ) ) {
			while ( i < php.length && php[ i ] !== '\n' && php.slice( i, i + 2 ) !== '?>' ) {
				i++;
			}
		} else if ( two === '/*' ) {
			const close = php.indexOf( '*/', i + 2 );
			i = close < 0 ? php.length : close + 2;
		} else if ( php.startsWith( '<<<', i ) ) {
			const heredoc = /^<<<[ \t]*(['"]?)([A-Za-z_]\w*)\1\r?\n/.exec( php.slice( i, i + 200 ) );
			if ( ! heredoc ) {
				i += 3;
				continue;
			}
			const end = new RegExp( '^[ \\t]*' + heredoc[ 2 ] + '\\b', 'm' );
			const rest = php.slice( i + heredoc[ 0 ].length );
			const found = end.exec( rest );
			i = found ? i + heredoc[ 0 ].length + found.index + found[ 0 ].length : php.length;
		} else {
			mask[ i ] = 1;
			i++;
		}
	}
	return mask;
}

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

/** The strings of one PHP source: [ { text, plural, context } ]. Only `default`-domain calls count. */
export function stringsOfPhp( php ) {
	const mask = codeMask( php );
	const found = [];
	for ( const match of php.matchAll( CALL ) ) {
		if ( ! mask[ match.index ] ) {
			continue;
		}
		const fn = match[ 1 ];
		const roles = FUNCTIONS[ fn ];
		const domainIndex = DOMAIN_INDEX[ fn ];
		let i = match.index + match[ 0 ].length;
		const parts = {};
		let ok = true;
		for ( let index = 0; index <= domainIndex && ok; index++ ) {
			if ( index > 0 ) {
				i = skipExpression( php, i );
				if ( php[ i ] !== ',' ) {
					ok = index > roles.length - 1 && php[ i ] === ')'; // The domain is absent: core's.
					break;
				}
				i++;
				while ( /\s/.test( php[ i ] ?? '' ) ) {
					i++;
				}
				if ( php[ i ] === ')' ) {
					ok = index > roles.length - 1;
					break;
				}
			}
			const role = roles[ index ];
			if ( role === 'skip' || ( role === undefined && index < domainIndex ) ) {
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
			if ( index === domainIndex ) {
				ok = literal.value === 'default';
				break;
			}
			parts[ role ] = literal.value;
			i = literal.next;
		}
		if ( ok && parts.text !== undefined ) {
			found.push( { text: parts.text, plural: parts.plural ?? null, context: parts.context ?? '' } );
		}
	}
	return found;
}

/** Argument roles of the wp.i18n functions core's scripts call; the domain follows them. */
const SCRIPT_FUNCTIONS = {
	__: [ 'text' ],
	_x: [ 'text', 'context' ],
	_n: [ 'text', 'plural', 'skip' ],
	_nx: [ 'text', 'plural', 'skip', 'context' ],
};

/**
 * The strings of one of core's scripts (src/js/_enqueues), as wp.i18n calls them:
 * [ { text, plural, context } ]. A call without a domain, or with `'default'`, is core's; the
 * text, plural and context must be plain string literals. Core's language packs translate these
 * for the script (its JSON translations), in the `default` domain.
 */
export function stringsOfScript( source ) {
	let tokens;
	try {
		tokens = tokenize( source ).filter( ( token ) => token.type !== 'comment' );
	} catch {
		return [];
	}
	const found = [];
	for ( let k = 0; k < tokens.length - 1; k++ ) {
		const token = tokens[ k ];
		const previous = tokens[ k - 1 ];
		if ( token.type !== 'ident' || ! Object.hasOwn( SCRIPT_FUNCTIONS, token.value ) || tokens[ k + 1 ].type !== 'punct' || tokens[ k + 1 ].value !== '(' ) {
			continue;
		}
		// `wp.i18n.__(` and `__(` count; `function __(` and `obj.__ =` do not.
		if ( previous?.type === 'ident' && previous.value === 'function' ) {
			continue;
		}
		const args = [ [] ];
		let depth = 0;
		let end = -1;
		for ( let j = k + 1; j < tokens.length; j++ ) {
			const t = tokens[ j ];
			if ( t.type === 'punct' && '([{'.includes( t.value ) ) {
				depth++;
				if ( depth === 1 ) {
					continue;
				}
			} else if ( t.type === 'punct' && ')]}'.includes( t.value ) ) {
				depth--;
				if ( depth === 0 ) {
					end = j;
					break;
				}
			} else if ( depth === 1 && t.type === 'punct' && t.value === ',' ) {
				args.push( [] );
				continue;
			}
			args[ args.length - 1 ].push( t );
		}
		if ( end === -1 ) {
			continue;
		}
		const literal = ( arg ) => ( arg?.length === 1 && arg[ 0 ].type === 'string' ? arg[ 0 ].value : arg?.length === 1 && arg[ 0 ].type === 'template' && arg[ 0 ].cooked !== null ? arg[ 0 ].cooked : null );
		const roles = SCRIPT_FUNCTIONS[ token.value ];
		const parts = {};
		let ok = true;
		roles.forEach( ( role, index ) => {
			if ( role === 'skip' ) {
				return;
			}
			const value = literal( args[ index ] );
			if ( value === null ) {
				ok = false;
			}
			parts[ role ] = value;
		} );
		const domain = args[ roles.length ];
		if ( domain !== undefined && domain.length > 0 && literal( domain ) !== 'default' ) {
			ok = false;
		}
		if ( ok ) {
			found.push( { text: parts.text, plural: parts.plural ?? null, context: parts.context ?? '' } );
		}
		k = end;
	}
	return found;
}

const keyOf = ( { text, plural, context } ) => context + '\u0004' + text + '\u0000' + ( plural ?? '' );

/**
 * The index of every gettext string in `src/wp-admin` and `src/wp-includes` below `wpSrc`, and
 * of every wp.i18n string in core's scripts (`src/js/_enqueues`).
 */
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
	// Core's own scripts (postbox.js, …), whose strings core's language packs translate as JSON.
	const walkScripts = ( directory ) => {
		for ( const item of readdirSync( directory, { withFileTypes: true } ) ) {
			const full = join( directory, item.name );
			if ( item.isDirectory() ) {
				walkScripts( full );
			} else if ( item.name.endsWith( '.js' ) ) {
				for ( const string of stringsOfScript( readFileSync( full, 'utf8' ) ) ) {
					keys.add( keyOf( string ) );
				}
			}
		}
	};
	if ( existsSync( join( wpSrc, 'js', '_enqueues' ) ) ) {
		walkScripts( join( wpSrc, 'js', '_enqueues' ) );
	}
	return { has: ( string ) => keys.has( keyOf( string ) ), size: keys.size };
}
