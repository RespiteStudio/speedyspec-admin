/**
 * Finds user-visible text in scripts that no translation call covers, as far as it can
 * be told mechanically. Findings:
 *   property    `message`, `label`, `title`, `text`, `placeholder`, `alt`, `error`,
 *               `aria-label` or `aria-description` set, in an object literal, to an
 *               expression holding an untranslated string
 *   assignment  the same for `document.title`, `.title`, `.alt`, `.placeholder`,
 *               `.textContent` and `.innerText` assignments
 *   attribute   `setAttribute( 'title' | 'aria-label' | … , <expression> )`
 *   child       an `h()` argument after the props (the children)
 *   notify      the message of `notify( notices, … )`
 *   dialog      the message of `alert(`, `confirm(` or `prompt(`
 *   error       the message of `new Error( … )` in pages, components and the kit: these
 *               files are shown to people; see the note below.
 * "An expression holding an untranslated string" means any string or template-literal
 * token in it (also in a ternary, `&&`, `||`, a concatenation or `${}` template) that is
 * not inside a translation call, comparison operand or punctuation (expression-text.mjs).
 *
 * Not findings: `console.*` output (developer output, never shown) and the errors of
 * `site/runtime/`. Runtime errors are protocol and developer errors (`Module not found`,
 * `Contract forbidden`, an `ApiError` code); the screens never show their `message`:
 * ErrorScreen and Login map the error's code and status to translated sentences. Pages,
 * components and the kit render what they are given, so an error created there could
 * be shown, and its message must be translated.
 *
 * NOT DETECTED (a mechanical check cannot see these; review them by hand):
 *   - text held in a variable or constant and shown later (`const msg = 'Oops'; notify( n, msg )`)
 *   - text in an object whose key is not one of the keys above (`{ save: 'Save changes' }`)
 *   - text returned from a function or put in an array that is rendered elsewhere
 *   - a literal assigned to a property or passed to a function the checker does not know
 *   - strings in `site/runtime/` errors that are later shown (assumed internal)
 *   - text assembled in a loop or from data (it is the data's job to be translated)
 */
import { scan } from './tokenize.mjs';
import { literalsIn } from './expression-text.mjs';

const USER_TEXT_KEYS = [ 'message', 'label', 'title', 'text', 'placeholder', 'alt', 'error', 'aria-label', 'aria-description' ];
const USER_TEXT_MEMBERS = [ 'title', 'alt', 'placeholder', 'textContent', 'innerText' ];
const USER_TEXT_ATTRIBUTES = [ 'title', 'aria-label', 'aria-description', 'alt', 'placeholder' ];
const DIALOGS = [ 'alert', 'confirm', 'prompt' ];

/** Paths (prefixes) whose `new Error( 'literal' )` messages could be shown to people. */
export const USER_FACING_ERROR_PATHS = [ 'site/pages/', 'site/components/', 'site/kit/' ];

/** Strings that are only whitespace, punctuation or symbols are not text. */
const symbolsOnly = ( text ) => /^[\s\p{P}\p{S}]*$/u.test( text );
const literalsOf = ( tokens ) => literalsIn( tokens, symbolsOnly );
const isPunct = ( token, value ) => token?.type === 'punct' && token.value === value;

/** The tokens of the expression that starts at `t[ from ]`, up to a `,` `;` or closing bracket outside nesting. */
function expressionFrom( t, from ) {
	const out = [];
	let depth = 0;
	for ( let k = from; k < t.length; k++ ) {
		const token = t[ k ];
		if ( token.type === 'punct' && '([{'.includes( token.value ) ) {
			depth++;
		} else if ( token.type === 'punct' && ')]}'.includes( token.value ) ) {
			if ( --depth < 0 ) {
				break;
			}
		} else if ( depth === 0 && token.type === 'punct' && ( token.value === ',' || token.value === ';' ) ) {
			break;
		}
		out.push( token );
	}
	return out;
}

/** The arguments of the call whose `(` is `tokens[ open ]`, as token arrays. */
function argumentsAt( tokens, open ) {
	const args = [ [] ];
	let depth = 0;
	for ( let k = open; k < tokens.length; k++ ) {
		const t = tokens[ k ];
		if ( t.type === 'punct' && '([{'.includes( t.value ) ) {
			if ( ++depth === 1 ) {
				continue;
			}
		} else if ( t.type === 'punct' && ')]}'.includes( t.value ) ) {
			if ( --depth === 0 ) {
				break;
			}
		} else if ( depth === 1 && isPunct( t, ',' ) ) {
			args.push( [] );
			continue;
		}
		args[ args.length - 1 ].push( t );
	}
	return args;
}

/**
 * @param {string} path   Site-relative path with `/`.
 * @param {string} source Script text.
 * @return {{kind: string, text: string, line: number, message: string}[]}
 */
export function checkScript( path, source ) {
	const findings = [];
	const report = ( kind, literals, message ) => literals.forEach( ( literal ) => findings.push( { kind, text: literal.text, line: literal.line, message: message + ' holds the untranslated string ' + JSON.stringify( literal.text ) } ) );
	const userFacing = USER_FACING_ERROR_PATHS.some( ( prefix ) => path.startsWith( prefix ) );

	const walk = ( tokens ) => {
		const t = tokens.filter( ( token ) => token.type !== 'comment' );
		t.forEach( ( token, index ) => {
			if ( token.type === 'template' ) {
				token.expressions.forEach( walk );
				return;
			}
			const prev = t[ index - 1 ];
			const next = t[ index + 1 ];

			// { message: 'text' }, { 'aria-label': cond ? 'a' : 'b' }
			if ( ( token.type === 'ident' || token.type === 'string' ) && isPunct( next, ':' ) && ( ! prev || isPunct( prev, '{' ) || isPunct( prev, ',' ) ) ) {
				const key = token.type === 'string' ? token.value : token.value;
				// A nested object is walked on its own: its keys are checked there.
				if ( USER_TEXT_KEYS.includes( key ) && ! isPunct( t[ index + 2 ], '{' ) ) {
					report( 'property', literalsOf( expressionFrom( t, index + 2 ) ), key + ':' );
				}
			}

			// document.title = 'text', el.textContent = cond ? 'a' : 'b'
			if ( token.type === 'ident' && USER_TEXT_MEMBERS.includes( token.value ) && isPunct( prev, '.' ) && isPunct( next, '=' ) && ! isPunct( t[ index + 2 ], '=' ) ) {
				report( 'assignment', literalsOf( expressionFrom( t, index + 2 ) ), '.' + token.value + ' =' );
			}

			if ( token.type === 'ident' && isPunct( next, '(' ) ) {
				const args = argumentsAt( t, index + 1 );
				const method = isPunct( prev, '.' );
				const first = args[ 0 ]?.length === 1 && args[ 0 ][ 0 ].type === 'string' ? args[ 0 ][ 0 ].value : null;

				if ( token.value === 'setAttribute' && method && USER_TEXT_ATTRIBUTES.includes( first ) ) {
					report( 'attribute', literalsOf( args[ 1 ] ?? [] ), 'setAttribute( ' + JSON.stringify( first ) + ' )' );
				}
				if ( token.value === 'h' && ! method ) {
					for ( let i = 1; i < args.length; i++ ) {
						// A props object is covered by the property rule.
						if ( ! isPunct( args[ i ][ 0 ], '{' ) ) {
							report( 'child', literalsOf( args[ i ] ), 'h() child' );
						}
					}
				}
				if ( token.value === 'notify' && ! method ) {
					report( 'notify', literalsOf( args[ 1 ] ?? [] ), 'notify() message' );
				}
				if ( DIALOGS.includes( token.value ) ) {
					report( 'dialog', literalsOf( args[ 0 ] ?? [] ), token.value + '() message' );
				}
				if ( userFacing && token.value === 'Error' && prev?.value === 'new' ) {
					report( 'error', literalsOf( args[ 0 ] ?? [] ), 'new Error() in a user-facing file' );
				}
			}
		} );
	};
	walk( scan( source ).tokens );
	return findings;
}
