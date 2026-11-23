// Comparing rendered markup (helpers/dom.mjs) with a classic fixture string (parsed with
// helpers/html-parser.mjs): tag, attributes sorted (classes sorted too), whitespace squashed.
import { FakeDOMParser } from './html-parser.mjs';

const squash = ( text ) => text.replace( /\s+/g, ' ' ).trim();
const TEXT = Symbol( 'text' );
const joinChildren = ( parts ) => {
	const out = [];
	for ( const part of parts ) {
		if ( typeof part === 'object' && part?.[ TEXT ] !== undefined ) {
			if ( typeof out[ out.length - 1 ] === 'object' ) {
				out[ out.length - 1 ][ TEXT ] += part[ TEXT ];
			} else {
				out.push( { [ TEXT ]: part[ TEXT ] } );
			}
		} else if ( part ) {
			out.push( part );
		}
	}
	return out.map( ( part ) => ( typeof part === 'object' ? squash( part[ TEXT ] ) : part ) ).filter( Boolean ).join( '' );
};
const sortedClasses = ( value ) => String( value ).split( /\s+/ ).filter( Boolean ).sort().join( ' ' );

/** A rendered fake element as a comparable string. */
export function fromRendered( node ) {
	if ( node.type === 'text' ) {
		return { [ TEXT ]: node.text };
	}
	if ( node.type !== 'element' ) {
		return '';
	}
	const attributes = Object.entries( node.props )
		.filter( ( [ key, value ] ) => ! /^on[A-Z]/.test( key ) && typeof value !== 'function' && value !== null && value !== undefined && value !== false && key !== 'key' && key !== 'ref' && ! ( node.tag === 'select' && key === 'value' ) )
		.map( ( [ key, value ] ) => [ key, key === 'class' ? sortedClasses( value ) : value === true ? '' : String( value ) ] )
		.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) )
		.filter( ( [ key, value ] ) => ! ( key === 'class' && value === '' ) );
	return '<' + node.tag + attributes.map( ( [ k, v ] ) => ' ' + k + '="' + v + '"' ).join( '' ) + '>' + joinChildren( node.children.map( fromRendered ) ) + '</' + node.tag + '>';
}

function fromParsed( node ) {
	if ( node.nodeType === 3 ) {
		return { [ TEXT ]: node.nodeValue };
	}
	if ( node.nodeType !== 1 ) {
		return '';
	}
	const attributes = node.attributes
		.map( ( { name, value } ) => [ name, name === 'class' ? sortedClasses( value ) : value ] )
		.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) );
	return '<' + node.localName + attributes.map( ( [ k, v ] ) => ' ' + k + '="' + v + '"' ).join( '' ) + '>' + joinChildren( node.childNodes.map( fromParsed ) ) + '</' + node.localName + '>';
}

/** A classic fixture's top-level nodes as one comparable string. */
export const classic = ( html ) => joinChildren( new FakeDOMParser().parseFromString( html, 'text/html' ).body.childNodes.map( fromParsed ) );

/** A rendered element itself (not only its children) as a comparable string. */
export const renderedNode = ( el ) => joinChildren( [ fromRendered( el ) ] );
