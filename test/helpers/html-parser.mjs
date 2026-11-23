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

// As in the DOM, what a node is lives on prototypes: `Node.prototype` (nodeType, nodeValue,
// childNodes) and `Element.prototype` (localName, attributes, getAttribute(), getAttributeNames()),
// so that a test can shadow them on one node (DOM clobbering: a form whose input is named
// `childNodes`) and code that reads them through the prototypes is not fooled.
export const FakeNode = { prototype: {} };
export const FakeElement = { prototype: Object.create( FakeNode.prototype ) };
Object.defineProperties( FakeNode.prototype, {
	nodeType: { get() {
		return this._nodeType;
	}, configurable: true },
	nodeValue: { get() {
		return this._nodeValue ?? null;
	}, configurable: true },
	childNodes: { get() {
		return this._childNodes ?? [];
	}, configurable: true },
} );
Object.defineProperties( FakeElement.prototype, {
	localName: { get() {
		return this._localName;
	}, configurable: true },
	tagName: { get() {
		return String( this._localName ).toUpperCase();
	}, configurable: true },
	attributes: { get() {
		return this._attributes;
	}, configurable: true },
} );
Object.assign( FakeElement.prototype, {
	getAttribute( attrName ) {
		const found = this._attributes.find( ( attribute ) => attribute.name === attrName );
		return found ? found.value : null;
	},
	getAttributeNames() {
		return this._attributes.map( ( attribute ) => attribute.name );
	},
	setAttribute( attrName, value ) {
		this.removeAttribute( attrName );
		this._attributes.push( { name: attrName, value: String( value ) } );
	},
	removeAttribute( attrName ) {
		this._attributes = this._attributes.filter( ( attribute ) => attribute.name !== attrName );
	},
	appendChild( child ) {
		this._childNodes.push( child );
		return child;
	},
	removeChild( child ) {
		const index = this._childNodes.indexOf( child );
		if ( index !== -1 ) {
			this._childNodes.splice( index, 1 );
		}
		return child;
	},
} );

function element( name, attributes ) {
	return Object.assign( Object.create( FakeElement.prototype ), {
		_nodeType: 1,
		_localName: name,
		_attributes: attributes.map( ( [ attrName, value ] ) => ( { name: attrName, value } ) ),
		_childNodes: [],
	} );
}

const textNode = ( value ) => Object.assign( Object.create( FakeNode.prototype ), { _nodeType: 3, _nodeValue: value } );
const commentNode = ( value ) => Object.assign( Object.create( FakeNode.prototype ), { _nodeType: 8, _nodeValue: value } );

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
			top().childNodes.push( commentNode( match[ 1 ] ) );
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
		baseURI: 'http://admin.test/wp-admin/edit-comments.php',
		createDocumentFragment: () => element( '#document-fragment', [] ),
		createTextNode: ( value ) => textNode( String( value ) ),
		createElement( tag ) {
			if ( tag !== 'template' ) {
				return element( String( tag ).toLowerCase(), [] );
			}
			const template = {
				localName: 'template',
				content: element( '#document-fragment', [] ),
				set innerHTML( html ) {
					this.content = parseBody( String( html ) );
					this.content._localName = '#document-fragment';
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
