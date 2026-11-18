// A small stand-in for the browser's DOMParser, for tests of code that walks a parsed
// document (kit/InlineMarkup.js): elements with `nodeType`, `localName`, `childNodes`,
// `attributes` and `getAttribute()`, text and comment nodes, as `parseFromString( html,
// 'text/html' ).body` gives them. It handles what the tests feed it: quoted and unquoted
// attributes, void elements, raw-text elements (script, style, iframe …), comments and
// character references. It is not an HTML5 parser; the browser's own is checked end to end.

const VOID = new Set( [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' ] );
const RAW = new Set( [ 'script', 'style', 'iframe', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'noscript' ] );
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

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
