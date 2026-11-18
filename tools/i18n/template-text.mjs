/**
 * Finds text in component templates that no translation call covers.
 *
 * A template is the `template` property of a component (a template literal). Walking
 * its markup, these are findings:
 *   text       a text node with anything but whitespace, `{{ … }}` interpolations, comments
 *              and punctuation-only text (the set below)
 *   attribute  a literal (non-bound) value of placeholder, title, aria-label,
 *              aria-description, alt or label, or of `value` on a button-like control
 *   literal    a bound attribute (`:title="'Close'"`) or an interpolation (`{{ 'Text' }}`)
 *              whose expression is a bare string literal
 * Interpolations and bound attributes whose expression calls a translation helper
 * (`$__( … )`) are fine: they are not bare literals.
 */
import { scan } from './tokenize.mjs';
import { tokenizeHtml, lineAt } from './html.mjs';

/** Attributes whose value is read by people (an empty value is fine: `alt=""`). */
export const VISIBLE_ATTRIBUTES = [ 'placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'label' ];

/** `<input type="…">` types whose `value` is the visible caption. */
const BUTTON_INPUT_TYPES = [ 'submit', 'button', 'reset' ];

/**
 * Punctuation a text node may consist of without being translatable text: separators
 * and brackets between interpolations (for example `{{ a }} | {{ b }}`). Narrow on
 * purpose: letters, digits and sentence punctuation (`! ? ; "`) are not in it.
 */
export const ALLOWED_PUNCTUATION = [ '|', '/', '-', '–', '—', '·', '•', ':', ',', '.', '(', ')', '[', ']', '«', '»', '‹', '›', '…' ];

/** Entities that stand for whitespace or a character of the set above. */
export const ALLOWED_ENTITIES = [ '&nbsp;', '&#160;', '&mdash;', '&ndash;', '&middot;', '&bull;', '&hellip;', '&raquo;', '&laquo;' ];

const isPunctuationOnly = ( text ) => {
	let rest = text;
	for ( const entity of ALLOWED_ENTITIES ) {
		rest = rest.split( entity ).join( '' );
	}
	return [ ...rest.replace( /\s+/g, '' ) ].every( ( c ) => ALLOWED_PUNCTUATION.includes( c ) );
};

const BARE_LITERAL = /^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\$])*`)$/;
const bareLiteralOf = ( expression ) => {
	const trimmed = expression.trim();
	return BARE_LITERAL.test( trimmed ) ? trimmed.slice( 1, -1 ) : null;
};

/**
 * The component templates of a script: [ { text, line } ] for each `template: \`…\``
 * (or string) property, at any depth, with the line of the template's first character.
 */
export function templatesOf( source ) {
	const found = [];
	const walk = ( tokens ) => {
		const significant = tokens.filter( ( t ) => t.type !== 'comment' );
		significant.forEach( ( token, index ) => {
			if ( token.type === 'template' ) {
				token.expressions.forEach( walk );
			}
			const value = significant[ index + 2 ];
			if ( token.type === 'ident' && token.value === 'template' && significant[ index + 1 ]?.value === ':' && value ) {
				if ( value.type === 'template' && value.cooked !== null ) {
					found.push( { text: value.cooked, line: value.line } );
				} else if ( value.type === 'string' ) {
					found.push( { text: value.value, line: value.line } );
				}
			}
		} );
	};
	walk( scan( source ).tokens );
	return found;
}

/**
 * Findings in one template.
 *
 * @param {string} html Template markup.
 * @param {{firstLine?: number}} [options] Line of the template's first character.
 * @return {{kind: 'text'|'attribute'|'literal', text: string, line: number, message: string}[]}
 */
export function checkTemplate( html, { firstLine = 1 } = {} ) {
	const findings = [];
	const add = ( kind, text, offset, message ) => findings.push( { kind, text, line: lineAt( html, offset, firstLine ), message } );

	for ( const token of tokenizeHtml( html ) ) {
		if ( token.type === 'text' ) {
			let rest = '';
			let position = 0;
			for ( const match of token.text.matchAll( /\{\{([\s\S]*?)\}\}/g ) ) {
				rest += token.text.slice( position, match.index ) + ' ';
				position = match.index + match[ 0 ].length;
				const literal = bareLiteralOf( match[ 1 ] );
				if ( literal !== null && ! isPunctuationOnly( literal ) ) {
					add( 'literal', literal, token.start + match.index, 'the interpolation {{ ' + match[ 1 ].trim() + ' }} is a bare string; wrap it in $__( \'…\', \'wp-admin-site\' )' );
				}
			}
			rest += token.text.slice( position );
			if ( ! isPunctuationOnly( rest ) ) {
				add( 'text', rest.replace( /\s+/g, ' ' ).trim(), token.start + token.text.search( /\S/ ), 'untranslated text between tags: ' + JSON.stringify( rest.replace( /\s+/g, ' ' ).trim() ) );
			}
		} else if ( token.type === 'open' ) {
			const staticValue = ( name ) => token.attrs.find( ( a ) => a.name.toLowerCase() === name )?.value ?? null;
			const buttonLike = token.name.toLowerCase() === 'button'
				|| ( token.name.toLowerCase() === 'input' && BUTTON_INPUT_TYPES.includes( String( staticValue( 'type' ) ).toLowerCase() ) );
			for ( const attr of token.attrs ) {
				const bound = /^(?::|v-bind:)(.+)$/.exec( attr.name );
				const name = ( bound ? bound[ 1 ] : attr.name ).toLowerCase();
				const visible = VISIBLE_ATTRIBUTES.includes( name ) || ( name === 'value' && buttonLike );
				if ( bound && visible && attr.value !== null ) {
					const literal = bareLiteralOf( attr.value );
					if ( literal !== null && literal.trim() !== '' ) {
						add( 'literal', literal, token.start + attr.start, '<' + token.name + ' ' + attr.name + '="' + attr.value + '"> is a bare string; wrap it in $__( \'…\', \'wp-admin-site\' )' );
					}
				} else if ( ! bound && attr.name.toLowerCase() === 'v-text' && attr.value !== null && bareLiteralOf( attr.value ) !== null ) {
					add( 'literal', bareLiteralOf( attr.value ), token.start + attr.start, '<' + token.name + ' v-text> is a bare string' );
				} else if ( ! bound && visible && attr.value !== null && attr.value.trim() !== '' ) {
					add( 'attribute', attr.value, token.start + attr.start, '<' + token.name + ' ' + attr.name + '="' + attr.value + '"> has an untranslated literal; bind it to a translation call' );
				}
			}
		}
	}
	return findings;
}
