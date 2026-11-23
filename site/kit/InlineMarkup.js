import { h } from 'vue';
import { safeUrl } from './url.js';

/*
 * <InlineMarkup :html="notice.markup" />
 *
 * A short message that WordPress sends as HTML because it has a link or code in it (a
 * notice's `markup`, which the endpoints pass through wp_kses() for these tags), shown
 * without ever inserting HTML. The string is parsed with the browser's DOMParser, whose
 * documents are inert (no script runs, nothing loads), and the tree is rebuilt as Vue
 * elements, keeping only:
 *
 * - `a`, with its `href` when it passes safeUrl() (http, https or mailto, see kit/url.js),
 *   and `rel="noopener"` when it leads to another origin than the admin's; a link without
 *   a safe `href` becomes its text;
 * - `code`, `strong` and `em`, without attributes;
 * - with `spans` (kit 1.7.0), `span`, with only its `class`, `title` and `aria-hidden` (an
 *   icon such as the Posts `comments` column header's comment bubble, `labelHtml` of a list
 *   column, which the endpoint passes through wp_kses() for these attributes);
 * - text.
 *
 * Every other element is dropped and its text kept; script, style, iframe and the other
 * elements whose content is not text a reader sees are dropped with their content; comments
 * are dropped. Attributes other than `href` are never copied. `innerHTML` is never set.
 * Without a DOMParser (outside a browser) the string is shown as text.
 */

const KEPT = new Set( [ 'a', 'code', 'strong', 'em' ] );
const SPAN_ATTRIBUTES = [ 'class', 'title', 'aria-hidden' ];
const DROPPED_WITH_CONTENT = new Set( [ 'script', 'style', 'iframe', 'noscript', 'template', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'object', 'svg', 'math' ] );

const ELEMENT = 1;
const TEXT = 3;

/** The attributes kept on a link: a safe `href`, and `rel` for another origin. Null when it has no safe href. */
function linkAttributes( element, base ) {
	const href = safeUrl( element.getAttribute( 'href' ) ?? '', { base } );
	if ( href === null ) {
		return null;
	}
	const attributes = { href };
	try {
		const url = new URL( href, base );
		if ( ( url.protocol === 'http:' || url.protocol === 'https:' ) && url.origin !== new URL( base ).origin ) {
			attributes.rel = 'noopener';
		}
	} catch {
		// safeUrl() parsed it already.
	}
	return attributes;
}

/** The attributes kept on a span: `class`, `title` and `aria-hidden`, as text. */
function spanAttributes( element ) {
	const attributes = {};
	for ( const name of SPAN_ATTRIBUTES ) {
		const value = element.getAttribute( name );
		if ( value !== null && value !== undefined ) {
			attributes[ name ] = String( value );
		}
	}
	return attributes;
}

function convert( nodes, base, out, spans = false ) {
	const pushText = ( value ) => {
		if ( value === '' ) {
			return;
		}
		if ( typeof out[ out.length - 1 ] === 'string' ) {
			out[ out.length - 1 ] += value;
		} else {
			out.push( value );
		}
	};
	for ( const node of nodes ) {
		if ( node.nodeType === TEXT ) {
			pushText( String( node.nodeValue ?? '' ) );
			continue;
		}
		if ( node.nodeType !== ELEMENT ) {
			continue;
		}
		const name = String( node.localName ?? '' ).toLowerCase();
		if ( DROPPED_WITH_CONTENT.has( name ) ) {
			continue;
		}
		if ( spans && name === 'span' ) {
			out.push( { tag: name, attributes: spanAttributes( node ), children: convert( node.childNodes ?? [], base, [], spans ) } );
			continue;
		}
		const attributes = name === 'a' ? linkAttributes( node, base ) : {};
		if ( KEPT.has( name ) && attributes !== null ) {
			out.push( { tag: name, attributes, children: convert( node.childNodes ?? [], base, [], spans ) } );
			continue;
		}
		for ( const child of convert( node.childNodes ?? [], base, [], spans ) ) {
			if ( typeof child === 'string' ) {
				pushText( child );
			} else {
				out.push( child );
			}
		}
	}
	return out;
}

/**
 * Parses an HTML string into a tree of the elements InlineMarkup keeps.
 *
 * @param {string} html Markup.
 * @param {{Parser?: Function, base?: string, spans?: boolean}} options DOMParser constructor
 *        (default the document's), the base URL links are resolved against (default the
 *        document's), and whether `span` is kept (default false).
 * @return {Array<string|{tag: string, attributes: object, children: Array}>} Nodes; the markup as one text node without a parser.
 */
export function sanitizeMarkup( html, { Parser = globalThis.DOMParser, base = globalThis.document?.baseURI ?? 'http://localhost/', spans = false } = {} ) {
	const source = String( html ?? '' );
	if ( source === '' ) {
		return [];
	}
	if ( typeof Parser !== 'function' ) {
		return [ source ];
	}
	const body = new Parser().parseFromString( source, 'text/html' )?.body;
	return convert( body?.childNodes ?? [], base, [], spans === true );
}

const toVNodes = ( nodes ) => nodes.map( ( node ) => ( typeof node === 'string' ? node : h( node.tag, node.attributes, toVNodes( node.children ) ) ) );

export default {
	name: 'WpAdminInlineMarkup',
	props: {
		html: { type: String, required: true },
		// 1.7.0: keep `span` with `class`, `title` and `aria-hidden`.
		spans: { type: Boolean, default: false },
	},
	setup( props ) {
		return () => toVNodes( sanitizeMarkup( props.html, { spans: props.spans } ) );
	},
};
