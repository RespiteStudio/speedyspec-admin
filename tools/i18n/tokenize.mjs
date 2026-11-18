/**
 * A small JavaScript tokenizer, just good enough to find translation calls without a
 * parser dependency. It understands string literals, template literals (with nested
 * substitutions), comments and regex literals, so that quotes inside comments and
 * regular expressions never confuse the scan. It does not build a syntax tree.
 *
 * Tokens: { type, start, end, line, endLine, ... } with `type` one of
 *   string   { value }                 cooked string literal
 *   template { quasis, expressions }   quasis: [{ text, offset, line }] (cooked text of
 *                                      each static part), expressions: token arrays,
 *                                      one per `${ }`; `cooked` is the whole text when
 *                                      there are no substitutions, otherwise null
 *   ident    { value }                 identifiers and keywords (`$` and `_` allowed)
 *   number   { value }
 *   regex    { value }
 *   punct    { value }                 one operator or bracket character (or `=>`)
 *   comment  { value, kind }           kind: 'block' | 'line'; `value` is the raw text
 */

const KEYWORDS_BEFORE_REGEX = new Set( [ 'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await' ] );
const IDENT_START = /[A-Za-z_$\u0080-￿]/;
const IDENT_PART = /[A-Za-z0-9_$\u0080-￿]/;

export class TokenizeError extends Error {
	constructor( message, line ) {
		super( message + ' (line ' + line + ')' );
		this.line = line;
	}
}

/** The value of the backslash escape starting at `source[ i ]` (the backslash); returns [ text, nextIndex ]. */
function unescape( source, i, line ) {
	const c = source[ i + 1 ];
	switch ( c ) {
		case 'n': return [ '\n', i + 2 ];
		case 't': return [ '\t', i + 2 ];
		case 'r': return [ '\r', i + 2 ];
		case 'b': return [ '\b', i + 2 ];
		case 'f': return [ '\f', i + 2 ];
		case 'v': return [ '\v', i + 2 ];
		case '0': return [ '\0', i + 2 ];
		case 'x': {
			const hex = source.slice( i + 2, i + 4 );
			if ( ! /^[0-9a-fA-F]{2}$/.test( hex ) ) {
				throw new TokenizeError( 'Invalid \\x escape', line );
			}
			return [ String.fromCharCode( parseInt( hex, 16 ) ), i + 4 ];
		}
		case 'u': {
			if ( source[ i + 2 ] === '{' ) {
				const close = source.indexOf( '}', i + 3 );
				const hex = close < 0 ? '' : source.slice( i + 3, close );
				if ( ! /^[0-9a-fA-F]{1,6}$/.test( hex ) ) {
					throw new TokenizeError( 'Invalid \\u{} escape', line );
				}
				return [ String.fromCodePoint( parseInt( hex, 16 ) ), close + 1 ];
			}
			const hex = source.slice( i + 2, i + 6 );
			if ( ! /^[0-9a-fA-F]{4}$/.test( hex ) ) {
				throw new TokenizeError( 'Invalid \\u escape', line );
			}
			return [ String.fromCharCode( parseInt( hex, 16 ) ), i + 6 ];
		}
		case '\r':
			return [ '', source[ i + 2 ] === '\n' ? i + 3 : i + 2 ];
		case '\n':
			return [ '', i + 2 ];
		case undefined:
			throw new TokenizeError( 'Dangling backslash', line );
		default:
			return [ c, i + 2 ];
	}
}

const countNewlines = ( text ) => ( text.match( /\n/g ) ?? [] ).length;

/**
 * Tokenize `source` from `pos`.
 *
 * @param {string} source
 * @param {{pos?: number, line?: number, stop?: 'brace'|'paren'}} [options]
 *        `stop: 'brace'` ends at the `}` that closes a `${` (the scan starts after the
 *        `${`); `stop: 'paren'` ends after the `)` that closes the `(` at `pos`.
 * @return {{tokens: object[], pos: number, line: number}} The tokens (comments included).
 */
export function scan( source, { pos = 0, line = 1, stop } = {} ) {
	const tokens = [];
	let i = pos;
	let depth = 0; // Bracket depth for `stop`.
	const lastSignificant = () => {
		for ( let k = tokens.length - 1; k >= 0; k-- ) {
			if ( tokens[ k ].type !== 'comment' ) {
				return tokens[ k ];
			}
		}
		return null;
	};
	const push = ( token ) => tokens.push( token );

	while ( i < source.length ) {
		const c = source[ i ];

		if ( c === '\n' ) {
			line++;
			i++;
			continue;
		}
		if ( /\s/.test( c ) ) {
			i++;
			continue;
		}

		// Comments.
		if ( c === '/' && source[ i + 1 ] === '/' ) {
			let end = source.indexOf( '\n', i );
			if ( end < 0 ) {
				end = source.length;
			}
			push( { type: 'comment', kind: 'line', value: source.slice( i, end ), start: i, end, line, endLine: line } );
			i = end;
			continue;
		}
		if ( c === '/' && source[ i + 1 ] === '*' ) {
			const close = source.indexOf( '*/', i + 2 );
			if ( close < 0 ) {
				throw new TokenizeError( 'Unterminated comment', line );
			}
			const value = source.slice( i, close + 2 );
			push( { type: 'comment', kind: 'block', value, start: i, end: close + 2, line, endLine: line + countNewlines( value ) } );
			line += countNewlines( value );
			i = close + 2;
			continue;
		}

		// Strings.
		if ( c === '"' || c === '\'' ) {
			const start = i;
			const startLine = line;
			let value = '';
			i++;
			for ( ;; ) {
				if ( i >= source.length || source[ i ] === '\n' ) {
					throw new TokenizeError( 'Unterminated string', startLine );
				}
				if ( source[ i ] === c ) {
					i++;
					break;
				}
				if ( source[ i ] === '\\' ) {
					const [ text, next ] = unescape( source, i, line );
					if ( source[ i + 1 ] === '\n' ) {
						line++;
					}
					value += text;
					i = next;
					continue;
				}
				value += source[ i++ ];
			}
			push( { type: 'string', value, start, end: i, line: startLine, endLine: line } );
			continue;
		}

		// Template literals.
		if ( c === '`' ) {
			const start = i;
			const startLine = line;
			const quasis = [];
			const expressions = [];
			let text = '';
			let quasiOffset = i + 1;
			let quasiLine = line;
			i++;
			for ( ;; ) {
				if ( i >= source.length ) {
					throw new TokenizeError( 'Unterminated template literal', startLine );
				}
				const d = source[ i ];
				if ( d === '`' ) {
					quasis.push( { text, offset: quasiOffset, line: quasiLine } );
					i++;
					break;
				}
				if ( d === '\\' ) {
					const [ cooked, next ] = unescape( source, i, line );
					line += countNewlines( source.slice( i, next ) );
					text += cooked;
					i = next;
					continue;
				}
				if ( d === '$' && source[ i + 1 ] === '{' ) {
					quasis.push( { text, offset: quasiOffset, line: quasiLine } );
					const inner = scan( source, { pos: i + 2, line, stop: 'brace' } );
					expressions.push( inner.tokens );
					i = inner.pos;
					line = inner.line;
					text = '';
					quasiOffset = i;
					quasiLine = line;
					continue;
				}
				if ( d === '\n' ) {
					line++;
				}
				text += d;
				i++;
			}
			push( {
				type: 'template',
				quasis,
				expressions,
				cooked: expressions.length === 0 ? quasis[ 0 ].text : null,
				start,
				end: i,
				line: startLine,
				endLine: line,
			} );
			continue;
		}

		// Numbers.
		if ( /[0-9]/.test( c ) || ( c === '.' && /[0-9]/.test( source[ i + 1 ] ?? '' ) ) ) {
			const m = /^(?:0[xXbBoO][0-9a-fA-F_]+|[0-9][0-9_]*\.?[0-9_]*(?:[eE][+-]?[0-9]+)?n?|\.[0-9][0-9_]*(?:[eE][+-]?[0-9]+)?)/.exec( source.slice( i, i + 80 ) );
			const value = m ? m[ 0 ] : c;
			push( { type: 'number', value, start: i, end: i + value.length, line, endLine: line } );
			i += value.length;
			continue;
		}

		// Identifiers and keywords.
		if ( IDENT_START.test( c ) ) {
			let j = i + 1;
			while ( j < source.length && IDENT_PART.test( source[ j ] ) ) {
				j++;
			}
			push( { type: 'ident', value: source.slice( i, j ), start: i, end: j, line, endLine: line } );
			i = j;
			continue;
		}

		// Regular expression literals.
		if ( c === '/' ) {
			const prev = lastSignificant();
			const regexAllowed = ! prev
				|| ( prev.type === 'punct' && ! [ ')', ']', '}' ].includes( prev.value ) )
				|| ( prev.type === 'ident' && KEYWORDS_BEFORE_REGEX.has( prev.value ) );
			if ( regexAllowed ) {
				const start = i;
				let j = i + 1;
				let inClass = false;
				for ( ;; ) {
					if ( j >= source.length || source[ j ] === '\n' ) {
						throw new TokenizeError( 'Unterminated regular expression', line );
					}
					const d = source[ j ];
					if ( d === '\\' ) {
						j += 2;
						continue;
					}
					if ( d === '[' ) {
						inClass = true;
					} else if ( d === ']' ) {
						inClass = false;
					} else if ( d === '/' && ! inClass ) {
						j++;
						break;
					}
					j++;
				}
				while ( j < source.length && /[a-z]/.test( source[ j ] ) ) {
					j++;
				}
				push( { type: 'regex', value: source.slice( start, j ), start, end: j, line, endLine: line } );
				i = j;
				continue;
			}
		}

		// Punctuation.
		if ( c === '=' && source[ i + 1 ] === '>' ) {
			push( { type: 'punct', value: '=>', start: i, end: i + 2, line, endLine: line } );
			i += 2;
			continue;
		}
		if ( stop === 'brace' ) {
			if ( c === '{' ) {
				depth++;
			} else if ( c === '}' ) {
				if ( depth === 0 ) {
					return { tokens, pos: i + 1, line };
				}
				depth--;
			}
		} else if ( stop === 'paren' ) {
			if ( c === '(' ) {
				depth++;
			} else if ( c === ')' ) {
				depth--;
			}
		}
		push( { type: 'punct', value: c, start: i, end: i + 1, line, endLine: line } );
		i++;
		if ( stop === 'paren' && depth === 0 ) {
			return { tokens, pos: i, line };
		}
	}

	if ( stop === 'brace' ) {
		throw new TokenizeError( 'Unterminated template substitution', line );
	}
	return { tokens, pos: i, line };
}

/** All tokens of a JavaScript source text (comments included). */
export function tokenize( source ) {
	return scan( source ).tokens;
}
