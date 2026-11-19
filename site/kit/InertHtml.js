import { h, onMounted, ref, watch } from 'vue';

/*
 * <InertHtml :html="comment.contentHtml" tag="div" />
 *
 * HTML that WordPress sends to be shown as it is (a comment's text as the classic screen prints
 * it), shown without running anything in it. Unlike LegacyHtml, it is not plugin code the screen
 * trusts to run. It is an allowlist sanitiser:
 *
 * - The HTML is parsed through a `<template>` element, whose content belongs to an inert document
 *   (nothing runs or loads while it is parsed).
 * - The parsed tree is read only through the DOM's own prototype getters (`Node.prototype`'s
 *   `nodeType`, `nodeValue` and `childNodes`, `Element.prototype`'s `localName`,
 *   `getAttributeNames()` and `getAttribute()`), fetched once, never through properties of the
 *   nodes, which markup can shadow (DOM clobbering: `<form><input name="childNodes">`).
 * - The output is a new fragment built from the allowed nodes only; nothing of the parsed tree is
 *   inserted. Text is copied as text. Allowed elements (ALLOWED below: the formatting
 *   wp_kses_allowed_html( 'post' ) allows in comment text, without anything that can navigate the
 *   page, load or submit) are created anew with their allowed attributes. Elements whose content
 *   is not text a reader sees (DROPPED: script, style, template, noscript, svg, math, iframe,
 *   object, base, meta, link …) are dropped with their content; any other element (form, button,
 *   input, unknown tags) is unwrapped: its allowed content is kept, it is not. Comments are dropped.
 * - Attributes: `title`, `lang` and `dir` on any allowed element, and per element `href`
 *   and `rel` on `a`; `src`, `alt`, `width` and `height` on `img`; `cite` on `blockquote`, `q`,
 *   `del` and `ins`; `datetime` on `del`, `ins` and `time`; `colspan` and `rowspan` on cells. Never
 *   `on*`, `style`, `srcset`, `class`, `id` or `name` (no clobbering of the page, and nothing that
 *   dresses a comment as the admin's own UI).
 * - Addresses (`href`, `src`, `cite`) are kept only when the browser's URL parser, against the
 *   page's base URL, reads them as `http:` or `https:` (and `mailto:` for links); relative
 *   addresses resolve to those.
 * - Markup too large or too deep to parse cheaply (deeply nested `<b>`, which kses lets any visitor
 *   post, makes the browser's parser take seconds) is not parsed: a linear pre-scan of the string
 *   (markupCost()) counts its tag openings and estimates its nesting, and above MAX_TAGS or
 *   MAX_DEPTH the whole string is shown as plain text (a text node, as textContent would).
 * - The fragment becomes the content of the element this component owns (`tag`, default `div`,
 *   class `wp-admin-inert-html`) when it mounts and whenever `html` changes.
 */

const ELEMENT = 1;
const TEXT = 3;

// No `class`: a comment must not look like the admin's own UI (`notice notice-error`).
const GLOBAL_ATTRIBUTES = [ 'title', 'lang', 'dir' ];

/** Above this many tag openings, the markup is shown as text and not parsed. */
export const MAX_TAGS = 2000;
/** Above this estimated nesting depth, the markup is shown as text and not parsed. */
export const MAX_DEPTH = 100;

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/g;
const VOID = new Set( [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' ] );

/**
 * A linear estimate of what parsing `html` costs: the number of tag openings and the deepest
 * nesting (each start tag of a non-void element opens a level, each end tag closes one). Pure.
 *
 * @param {string} html Markup.
 * @return {{tags: number, depth: number}} The estimate.
 */
export function markupCost( html ) {
	let tags = 0;
	let depth = 0;
	let deepest = 0;
	for ( const match of String( html ?? '' ).matchAll( TAG ) ) {
		tags++;
		if ( match[ 1 ] ) {
			depth = Math.max( 0, depth - 1 );
		} else if ( ! VOID.has( match[ 2 ].toLowerCase() ) ) {
			depth++;
			deepest = Math.max( deepest, depth );
		}
	}
	return { tags, depth: deepest };
}

/** Whether markup is beyond MAX_TAGS or MAX_DEPTH (then shown as text). Pure. */
export function tooComplex( html ) {
	const { tags, depth } = markupCost( html );
	return tags > MAX_TAGS || depth > MAX_DEPTH;
}
const ALLOWED = {
	a: [ 'href', 'rel' ],
	abbr: [],
	acronym: [],
	b: [],
	bdo: [],
	big: [],
	blockquote: [ 'cite' ],
	br: [],
	caption: [],
	cite: [],
	code: [],
	col: [],
	colgroup: [],
	dd: [],
	del: [ 'cite', 'datetime' ],
	dfn: [],
	div: [],
	dl: [],
	dt: [],
	em: [],
	figcaption: [],
	figure: [],
	h1: [],
	h2: [],
	h3: [],
	h4: [],
	h5: [],
	h6: [],
	hr: [],
	i: [],
	img: [ 'src', 'alt', 'width', 'height' ],
	ins: [ 'cite', 'datetime' ],
	kbd: [],
	li: [],
	mark: [],
	ol: [],
	p: [],
	pre: [],
	q: [ 'cite' ],
	s: [],
	samp: [],
	small: [],
	span: [],
	strike: [],
	strong: [],
	sub: [],
	sup: [],
	table: [],
	tbody: [],
	td: [ 'colspan', 'rowspan' ],
	tfoot: [],
	th: [ 'colspan', 'rowspan' ],
	thead: [],
	time: [ 'datetime' ],
	tr: [],
	tt: [],
	u: [],
	ul: [],
	var: [],
};
const DROPPED = new Set( [
	'script', 'style', 'template', 'noscript', 'svg', 'math', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'param',
	'base', 'meta', 'link', 'head', 'title', 'textarea', 'select', 'option', 'xmp', 'noembed', 'noframes', 'plaintext',
	'audio', 'video', 'source', 'track', 'picture', 'canvas', 'map', 'area', 'portal', 'dialog',
] );
const URL_ATTRIBUTES = new Set( [ 'href', 'src', 'cite' ] );
const NUMBER = /^\d{1,5}%?$/;

/** The DOM's own getters and methods, fetched once (clobber-safe), or the fake DOM's in tests. */
function accessors( Node = globalThis.Node, Element = globalThis.Element ) {
	const getter = ( proto, name ) => Object.getOwnPropertyDescriptor( proto, name )?.get;
	const nodeType = getter( Node.prototype, 'nodeType' );
	const nodeValue = getter( Node.prototype, 'nodeValue' );
	const childNodes = getter( Node.prototype, 'childNodes' );
	const localName = getter( Element.prototype, 'localName' );
	const { getAttributeNames, getAttribute } = Element.prototype;
	return {
		type: ( node ) => nodeType.call( node ),
		value: ( node ) => nodeValue.call( node ),
		// A copy: the live NodeList is read through its own prototype by Array.from().
		children: ( node ) => Array.from( childNodes.call( node ) ),
		name: ( node ) => String( localName.call( node ) ?? '' ).toLowerCase(),
		attributeNames: ( node ) => Array.from( getAttributeNames.call( node ) ),
		attribute: ( node, name ) => getAttribute.call( node, name ),
	};
}

/** Whether an address, read by the URL parser against `base`, uses an allowed scheme. */
function safeAddress( value, base, schemes ) {
	try {
		return schemes.includes( new URL( String( value ), base ).protocol );
	} catch {
		return false;
	}
}

/** The allowed attributes of `node`, as `[ name, value ]`. */
function allowedAttributes( dom, node, tag, base ) {
	const allowed = new Set( [ ...GLOBAL_ATTRIBUTES, ...ALLOWED[ tag ] ] );
	const kept = [];
	for ( const raw of dom.attributeNames( node ) ) {
		const name = String( raw ).toLowerCase();
		if ( ! allowed.has( name ) ) {
			continue;
		}
		const value = dom.attribute( node, raw );
		if ( typeof value !== 'string' ) {
			continue;
		}
		if ( URL_ATTRIBUTES.has( name ) && ! safeAddress( value, base, name === 'href' ? [ 'http:', 'https:', 'mailto:' ] : [ 'http:', 'https:' ] ) ) {
			continue;
		}
		if ( ( name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' ) && ! NUMBER.test( value.trim() ) ) {
			continue;
		}
		kept.push( [ name, value ] );
	}
	return kept;
}

/** Appends to `out` the allowed copy of each child of `node`. */
function copyChildren( dom, node, out, doc, base ) {
	for ( const child of dom.children( node ) ) {
		const type = dom.type( child );
		if ( type === TEXT ) {
			out.appendChild( doc.createTextNode( String( dom.value( child ) ?? '' ) ) );
			continue;
		}
		if ( type !== ELEMENT ) {
			continue; // Comments, processing instructions.
		}
		const tag = dom.name( child );
		if ( DROPPED.has( tag ) ) {
			continue;
		}
		if ( ! Object.hasOwn( ALLOWED, tag ) ) {
			copyChildren( dom, child, out, doc, base ); // Unwrapped.
			continue;
		}
		const copy = doc.createElement( tag );
		for ( const [ name, value ] of allowedAttributes( dom, child, tag, base ) ) {
			copy.setAttribute( name, value );
		}
		copyChildren( dom, child, copy, doc, base );
		out.appendChild( copy );
	}
	return out;
}

/**
 * Parses HTML in an inert template and returns a new fragment of its allowed nodes only (see the
 * comment at the top).
 *
 * @param {string}   html HTML.
 * @param {Document} doc  Document that parses and builds.
 * @param {object}   [dom] `{ Node, Element }` whose prototypes are read (default the window's).
 * @return {DocumentFragment} The fragment.
 */
export function toInertFragment( html, doc = globalThis.document, dom = {} ) {
	if ( tooComplex( html ) ) {
		const fragment = doc.createDocumentFragment();
		fragment.appendChild( doc.createTextNode( String( html ) ) );
		return fragment;
	}
	const read = accessors( dom.Node, dom.Element );
	const template = doc.createElement( 'template' );
	template.innerHTML = String( html ?? '' );
	const base = doc.baseURI ?? globalThis.location?.href ?? 'http://localhost/';
	return copyChildren( read, template.content, doc.createDocumentFragment(), doc, base );
}

export default {
	name: 'WpAdminInertHtml',
	props: {
		html: { type: String, default: '' },
		tag: { type: String, default: 'div' },
	},
	setup( props ) {
		const container = ref( null );
		function fill() {
			const element = container.value;
			const doc = globalThis.document;
			if ( ! element || ! doc ) {
				return;
			}
			element.replaceChildren( toInertFragment( props.html, doc ) );
		}
		onMounted( fill );
		watch( () => props.html, fill, { flush: 'post' } );
		return () => h( props.tag, { ref: container, class: 'wp-admin-inert-html' } );
	},
};
