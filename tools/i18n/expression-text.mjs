/**
 * Finds string literals in a JavaScript expression that would be shown to people without
 * being translated: any string or template-literal token that is
 *   - not inside the arguments of a translation call (`__`, `$__`, `_x`, `_n`, `_nx`, …),
 *   - not empty, whitespace or punctuation-only (the `allowed` test),
 *   - not a comparison operand (`x === 'a'`) or a computed key (`obj[ 'a' ]`).
 * So `cond ? 'Yes' : 'No'`, `x && 'Loading'`, `msg || 'Unknown'`, `'Hi' + name`,
 * `( 'Saved' )` and `` `Failed ${ name }` `` are all found. Not detectable: text held in a
 * variable or constant that is later shown (the literal is not in the expression).
 */
import { scan } from './tokenize.mjs';

const TRANSLATION_FUNCTIONS = [ '__', '_x', '_n', '_nx' ];

const isTranslationName = ( value ) => TRANSLATION_FUNCTIONS.includes( value.replace( /^\$/, '' ) );
const isPunct = ( token, value ) => token?.type === 'punct' && ( value === undefined || token.value === value );

/**
 * @param {object[]} tokens   Tokens from `scan` (comments allowed).
 * @param {(text: string) => boolean} allowed Whether a literal is fine (punctuation only).
 * @return {{text: string, line: number}[]} The untranslated literals, in order.
 */
export function literalsIn( tokens, allowed = () => false ) {
	const found = [];
	const walk = ( list ) => {
		const t = list.filter( ( token ) => token.type !== 'comment' );
		for ( let i = 0; i < t.length; i++ ) {
			const token = t[ i ];
			if ( token.type === 'ident' && isTranslationName( token.value ) && isPunct( t[ i + 1 ], '(' ) ) {
				let depth = 0;
				for ( i++; i < t.length; i++ ) {
					if ( isPunct( t[ i ] ) && '([{'.includes( t[ i ].value ) ) {
						depth++;
					} else if ( isPunct( t[ i ] ) && ')]}'.includes( t[ i ].value ) && --depth === 0 ) {
						break;
					}
				}
				continue;
			}
			if ( token.type === 'template' ) {
				for ( const quasi of token.quasis ) {
					if ( quasi.text.trim() !== '' && ! allowed( quasi.text ) ) {
						found.push( { text: quasi.text, line: quasi.line } );
					}
				}
				token.expressions.forEach( walk );
				continue;
			}
			if ( token.type !== 'string' || token.value.trim() === '' || allowed( token.value ) ) {
				continue;
			}
			const prev = t[ i - 1 ];
			const next = t[ i + 1 ];
			const comparison = [ '=', '!', '<', '>' ].some( ( op ) => isPunct( prev, op ) || isPunct( next, op ) );
			const owner = t[ i - 2 ];
			const key = isPunct( prev, '[' ) && isPunct( next, ']' ) && ( owner?.type === 'ident' || isPunct( owner, ')' ) || isPunct( owner, ']' ) );
			if ( ! comparison && ! key ) {
				found.push( { text: token.value, line: token.line } );
			}
		}
	};
	walk( tokens );
	return found;
}

/** Literals of the expression source `expression`; falls back to none when it cannot be read. */
export function literalsInSource( expression, allowed ) {
	try {
		return literalsIn( scan( expression ).tokens, allowed );
	} catch {
		return [];
	}
}
