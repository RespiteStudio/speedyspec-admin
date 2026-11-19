// A small stand-in for the browser's DOMParser, for tests of code that walks a parsed
// document (kit/InlineMarkup.js): elements with `nodeType`, `localName`, `childNodes`,
// `attributes` and `getAttribute()`, text and comment nodes, as `parseFromString( html,
// 'text/html' ).body` gives them. It handles what the tests feed it: quoted and unquoted
// attributes, void elements, raw-text elements (script, style, iframe …), comments and
// character references. It is not an HTML5 parser; the browser's own is checked end to end.

const VOID = new Set( [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' ] );
const RAW = new Set( [ 'script', 'style', 'iframe', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'noscript' ] );
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t' };

const decode = ( text ) => text.replace( /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, ( match, dec, hex, name ) => {
	if ( name ) {
		return NAMED[ name.toLowerCase() ] ?? match;
	}
	return String.fromCodePoint( dec ? Number( dec ) : parseInt( hex, 16 ) );
} );

function element( name, attributes ) {
	return {
		nodeType: 1,
		localName: name,
		tagName: name.toUpperCase(),
		attributes: attributes.map( ( [ attrName, value ] ) => ( { name: attrName, value } ) ),
		childNodes: [],
		getAttribute( attrName ) {
			const found = this.attributes.find( ( attribute ) => attribute.name === attrName );
			return found ? found.value : null;
		},
		removeAttribute( attrName ) {
			this.attributes = this.attributes.filter( ( attribute ) => attribute.name !== attrName );
		},
		removeChild( child ) {
			const index = this.childNodes.indexOf( child );
			if ( index !== -1 ) {
				this.childNodes.splice( index, 1 );
			}
			return child;
		},
	};
}

const textNode = ( value ) => ( { nodeType: 3, nodeValue: value } );

function parseAttributes( source ) {
	const attributes = [];
	for ( const match of source.matchAll( /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g ) ) {
		const name = match[ 1 ].toLowerCase();
		if ( ! attributes.some( ( [ existing ] ) => existing === name ) ) {
			attributes.push( [ name, decode( match[ 2 ] ?? match[ 3 ] ?? match[ 4 ] ?? '' ) ] );
		}
	}
	return attributes;
}

function parseBody( html ) {
	const body = element( 'body', [] );
	const stack = [ body ];
	const top = () => stack[ stack.length - 1 ];
	const pattern = /<!--([\s\S]*?)(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
	let last = 0;
	let match;
	while ( ( match = pattern.exec( html ) ) ) {
		if ( match.index > last ) {
			top().childNodes.push( textNode( decode( html.slice( last, match.index ) ) ) );
		}
		last = pattern.lastIndex;
		if ( match[ 1 ] !== undefined ) {
			top().childNodes.push( { nodeType: 8, nodeValue: match[ 1 ] } );
			continue;
		}
		const name = match[ 3 ].toLowerCase();
		if ( match[ 2 ] ) {
			const index = stack.map( ( node ) => node.localName ).lastIndexOf( name );
			if ( index > 0 ) {
				stack.length = index;
			}
			continue;
		}
		const node = element( name, parseAttributes( match[ 4 ] ) );
		top().childNodes.push( node );
		if ( RAW.has( name ) ) {
			const end = html.toLowerCase().indexOf( '</' + name, last );
			const stop = end === -1 ? html.length : end;
			if ( stop > last ) {
				node.childNodes.push( textNode( html.slice( last, stop ) ) );
			}
			const close = end === -1 ? html.length : html.indexOf( '>', end );
			last = close === -1 ? html.length : close + 1;
			pattern.lastIndex = last;
		} else if ( ! VOID.has( name ) && ! match[ 4 ].trim().endsWith( '/' ) ) {
			stack.push( node );
		}
	}
	if ( last < html.length ) {
		top().childNodes.push( textNode( decode( html.slice( last ) ) ) );
	}
	return body;
}

export class FakeDOMParser {
	parseFromString( html, type ) {
		if ( type !== 'text/html' ) {
			throw new Error( 'Only text/html is supported.' );
		}
		return { body: parseBody( String( html ) ) };
	}
}

/**
 * A stand-in for a document whose `createElement( 'template' )` parses `innerHTML` into
 * `content` with the parser above (a `<template>`'s content is inert in a browser: nothing in it
 * runs or loads). `created` lists the templates made.
 */
export function fakeTemplateDocument() {
	const created = [];
	return {
		created,
		createElement( tag ) {
			if ( tag !== 'template' ) {
				throw new Error( 'Only template elements are supported.' );
			}
			const template = {
				localName: 'template',
				content: element( '#document-fragment', [] ),
				set innerHTML( html ) {
					this.content = parseBody( String( html ) );
					this.content.localName = '#document-fragment';
				},
			};
			created.push( template );
			return template;
		},
	};
}

const escapeText = ( text ) => text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
const escapeAttribute = ( text ) => text.replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' );

/** The HTML of the children of a parsed node (attributes double-quoted, in source order). */
export function serialize( node ) {
	return node.childNodes.map( ( child ) => {
		if ( child.nodeType === 3 ) {
			return escapeText( child.nodeValue );
		}
		if ( child.nodeType === 8 ) {
			return '<!--' + child.nodeValue + '-->';
		}
		const attributes = child.attributes.map( ( attribute ) => ' ' + attribute.name + '="' + escapeAttribute( attribute.value ) + '"' ).join( '' );
		if ( VOID.has( child.localName ) ) {
			return '<' + child.localName + attributes + '>';
		}
		return '<' + child.localName + attributes + '>' + serialize( child ) + '</' + child.localName + '>';
	} ).join( '' );
}
