/**
 * Finds user-visible text in scripts that no translation call covers, as far as it can
 * be told mechanically. Findings:
 *   property    `message`, `label`, `title`, `text`, `placeholder`, `alt`, `aria-label` or
 *               `aria-description` set to a string literal in an object literal (notices,
 *               kit component props, `h()` props)
 *   assignment  a string literal assigned to `document.title`, `.title`, `.alt`,
 *               `.placeholder`, `.textContent` or `.innerText`
 *   attribute   `setAttribute( 'title' | 'aria-label' | … , 'literal' )`
 *   child       a string literal passed as a child (or sole argument after the tag) to `h()`
 *   notify      a string literal as the message of `notify( notices, … )`
 *   dialog      `alert(`, `confirm(` or `prompt(` with a string literal
 *   error       `new Error( 'literal' )` in pages, components and the kit: these files are
 *               shown to people; see the note below.
 *
 * Not findings: `console.*` output (developer output, never shown) and the errors of
 * `site/runtime/`. Runtime errors are protocol and developer errors (`Module not found`,
 * `Contract forbidden`, an `ApiError` code); the screens never show their `message`:
 * ErrorScreen and Login map the error's code and status to translated sentences. Pages,
 * components and the kit render what they are given, so an error created there could
 * be shown, and its message must be translated.
 */
import { scan } from './tokenize.mjs';

const USER_TEXT_KEYS = [ 'message', 'label', 'title', 'text', 'placeholder', 'alt', 'aria-label', 'aria-description' ];
const USER_TEXT_MEMBERS = [ 'title', 'alt', 'placeholder', 'textContent', 'innerText' ];
const USER_TEXT_ATTRIBUTES = [ 'title', 'aria-label', 'aria-description', 'alt', 'placeholder' ];
const DIALOGS = [ 'alert', 'confirm', 'prompt' ];

/** Paths (prefixes) whose `new Error( 'literal' )` messages could be shown to people. */
export const USER_FACING_ERROR_PATHS = [ 'site/pages/', 'site/components/', 'site/kit/' ];

const literalOf = ( token ) => {
	if ( token?.type === 'string' ) {
		return token.value;
	}
	return token?.type === 'template' && token.cooked !== null ? token.cooked : null;
};
const isPunct = ( token, value ) => token?.type === 'punct' && token.value === value;

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
	const add = ( kind, text, line, message ) => findings.push( { kind, text, line, message } );
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

			// { message: 'text' }, { 'aria-label': 'text' }
			if ( ( token.type === 'ident' || token.type === 'string' ) && isPunct( next, ':' ) && ( ! prev || isPunct( prev, '{' ) || isPunct( prev, ',' ) ) ) {
				const key = token.type === 'string' ? token.value : token.value;
				const literal = literalOf( t[ index + 2 ] );
				if ( USER_TEXT_KEYS.includes( key ) && literal !== null && literal.trim() !== '' ) {
					add( 'property', literal, token.line, key + ': ' + JSON.stringify( literal ) + ' is an untranslated literal' );
				}
			}

			// document.title = 'text', el.textContent = 'text'
			if ( token.type === 'ident' && USER_TEXT_MEMBERS.includes( token.value ) && isPunct( prev, '.' ) && isPunct( next, '=' ) && ! isPunct( t[ index + 2 ], '=' ) ) {
				const literal = literalOf( t[ index + 2 ] );
				if ( literal !== null && literal.trim() !== '' ) {
					add( 'assignment', literal, token.line, '.' + token.value + ' = ' + JSON.stringify( literal ) + ' is an untranslated literal' );
				}
			}

			if ( token.type === 'ident' && isPunct( next, '(' ) ) {
				const args = argumentsAt( t, index + 1 );
				const literalArg = ( i ) => ( args[ i ]?.length === 1 ? literalOf( args[ i ][ 0 ] ) : null );
				const method = isPunct( prev, '.' );

				if ( token.value === 'setAttribute' && method && USER_TEXT_ATTRIBUTES.includes( literalArg( 0 ) ) && ( literalArg( 1 ) ?? '' ).trim() !== '' ) {
					add( 'attribute', literalArg( 1 ), token.line, 'setAttribute( ' + JSON.stringify( literalArg( 0 ) ) + ', ' + JSON.stringify( literalArg( 1 ) ) + ' ) is an untranslated literal' );
				}
				if ( token.value === 'h' && ! method ) {
					for ( let i = 1; i < args.length; i++ ) {
						if ( ( literalArg( i ) ?? '' ).trim() !== '' ) {
							add( 'child', literalArg( i ), token.line, 'h() child ' + JSON.stringify( literalArg( i ) ) + ' is an untranslated literal' );
						}
					}
				}
				if ( token.value === 'notify' && ! method && ( literalArg( 1 ) ?? '' ).trim() !== '' ) {
					add( 'notify', literalArg( 1 ), token.line, 'notify() message ' + JSON.stringify( literalArg( 1 ) ) + ' is an untranslated literal' );
				}
				if ( DIALOGS.includes( token.value ) && ( literalArg( 0 ) ?? '' ).trim() !== '' ) {
					add( 'dialog', literalArg( 0 ), token.line, token.value + '() message ' + JSON.stringify( literalArg( 0 ) ) + ' is an untranslated literal' );
				}
				if ( userFacing && token.value === 'Error' && isPunct( prev, '' ) === false && prev?.value === 'new' && ( literalArg( 0 ) ?? '' ).trim() !== '' ) {
					add( 'error', literalArg( 0 ), token.line, 'new Error( ' + JSON.stringify( literalArg( 0 ) ) + ' ) in a user-facing file; translate it or keep it out of the screens' );
				}
			}
		} );
	};
	walk( scan( source ).tokens );
	return findings;
}
