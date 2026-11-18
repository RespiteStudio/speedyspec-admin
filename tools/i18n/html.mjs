/**
 * A small HTML tokenizer for Vue template strings. It is not a validating parser: it
 * splits markup into text, comments, start tags (with their attributes) and end tags,
 * keeping source offsets so that callers can report lines. Vue interpolations
 * (`{{ … }}`) stay inside text nodes, so a `<` in an expression does not start a tag.
 */

export const VOID_ELEMENTS = new Set( [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' ] );

/** Line (1-based) of `offset` in `text`, counting from `firstLine` at offset 0. */
export function lineAt( text, offset, firstLine = 1 ) {
	let line = firstLine;
	for ( let i = 0; i < offset && i < text.length; i++ ) {
		if ( text[ i ] === '\n' ) {
			line++;
		}
	}
	return line;
}

/**
 * Tokens of `html`:
 *   { type: 'text', text, start, end }
 *   { type: 'comment', text, start, end }                 `text` is the inner text
 *   { type: 'open', name, attrs, selfClosing, start, end }
 *   { type: 'close', name, start, end }
 * An attribute is { name, value, start }, `value` being null for a bare attribute and
 * the raw (undecoded) text otherwise.
 */
export function tokenizeHtml( html ) {
	const tokens = [];
	let i = 0;
	let textStart = 0;

	const flushText = ( end ) => {
		if ( end > textStart ) {
			tokens.push( { type: 'text', text: html.slice( textStart, end ), start: textStart, end } );
		}
	};

	while ( i < html.length ) {
		if ( html.startsWith( '{{', i ) ) {
			const close = html.indexOf( '}}', i + 2 );
			i = close < 0 ? html.length : close + 2;
			continue;
		}
		if ( html.startsWith( '<!--', i ) ) {
			flushText( i );
			const close = html.indexOf( '-->', i + 4 );
			const end = close < 0 ? html.length : close + 3;
			tokens.push( { type: 'comment', text: html.slice( i + 4, close < 0 ? html.length : close ), start: i, end } );
			i = textStart = end;
			continue;
		}
		if ( html[ i ] === '<' && /[A-Za-z]/.test( html[ i + 1 ] ?? '' ) ) {
			flushText( i );
			const start = i;
			i++;
			const nameStart = i;
			while ( i < html.length && /[^\s/>]/.test( html[ i ] ) ) {
				i++;
			}
			const name = html.slice( nameStart, i );
			const attrs = [];
			let selfClosing = false;
			for ( ;; ) {
				while ( i < html.length && /\s/.test( html[ i ] ) ) {
					i++;
				}
				if ( i >= html.length ) {
					break;
				}
				if ( html[ i ] === '>' ) {
					i++;
					break;
				}
				if ( html[ i ] === '/' ) {
					if ( html[ i + 1 ] === '>' ) {
						selfClosing = true;
						i += 2;
						break;
					}
					i++;
					continue;
				}
				const attrStart = i;
				while ( i < html.length && /[^\s=>/]/.test( html[ i ] ) ) {
					i++;
				}
				if ( i === attrStart ) {
					i++; // A stray character: skip it.
					continue;
				}
				const attrName = html.slice( attrStart, i );
				let value = null;
				let j = i;
				while ( j < html.length && /\s/.test( html[ j ] ) ) {
					j++;
				}
				if ( html[ j ] === '=' ) {
					j++;
					while ( j < html.length && /\s/.test( html[ j ] ) ) {
						j++;
					}
					const quote = html[ j ];
					if ( quote === '"' || quote === '\'' ) {
						const close = html.indexOf( quote, j + 1 );
						value = html.slice( j + 1, close < 0 ? html.length : close );
						i = close < 0 ? html.length : close + 1;
					} else {
						const valueStart = j;
						while ( j < html.length && /[^\s>]/.test( html[ j ] ) ) {
							j++;
						}
						value = html.slice( valueStart, j );
						i = j;
					}
				}
				attrs.push( { name: attrName, value, start: attrStart } );
			}
			tokens.push( { type: 'open', name, attrs, selfClosing, start, end: i } );
			textStart = i;
			continue;
		}
		if ( html.startsWith( '</', i ) && /[A-Za-z]/.test( html[ i + 2 ] ?? '' ) ) {
			flushText( i );
			const close = html.indexOf( '>', i );
			const end = close < 0 ? html.length : close + 1;
			tokens.push( { type: 'close', name: html.slice( i + 2, close < 0 ? html.length : close ).trim(), start: i, end } );
			i = textStart = end;
			continue;
		}
		i++;
	}
	flushText( html.length );
	return tokens;
}

/** The end offset of the element whose start tag is `tokens[ index ]`. */
export function elementEnd( tokens, index ) {
	const open = tokens[ index ];
	if ( open.type !== 'open' || open.selfClosing || VOID_ELEMENTS.has( open.name.toLowerCase() ) ) {
		return open.end;
	}
	let depth = 0;
	for ( let k = index; k < tokens.length; k++ ) {
		const token = tokens[ k ];
		if ( token.type === 'open' && ! token.selfClosing && ! VOID_ELEMENTS.has( token.name.toLowerCase() ) ) {
			depth++;
		} else if ( token.type === 'close' ) {
			depth--;
			if ( depth === 0 ) {
				return token.end;
			}
		}
	}
	return tokens[ tokens.length - 1 ].end;
}
