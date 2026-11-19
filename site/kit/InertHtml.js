import { h, onMounted, ref, watch } from 'vue';

/*
 * <InertHtml :html="comment.contentHtml" tag="div" />
 *
 * HTML that WordPress sends to be shown as it is (a comment's text as the classic screen prints
 * it, on the comment moderation screens), inserted without running anything in it. Unlike
 * LegacyHtml, it is not plugin code that the screen trusts to run: no script in it runs, no
 * event handler in it is kept, and its assets are not loaded.
 *
 * - The HTML is parsed through a `<template>` element (toInertFragment()): a template's content
 *   belongs to an inert document, so nothing runs and nothing loads while it is parsed.
 * - From the parsed tree are removed: `script` elements (HTML and SVG); every `on*` attribute;
 *   `javascript:` addresses in `href`, `xlink:href`, `src`, `action`, `formaction` and `data`
 *   (written in any case, with spaces or control characters in them, as a browser reads them);
 *   `srcdoc` (a document of its own, whose scripts would run); and the `javascript:` values of
 *   SVG animation elements, which could set an address. Nested templates are cleaned as well.
 *   Every other element, attribute and text stays as it was.
 * - The cleaned fragment becomes the content of the element this component owns (`tag`,
 *   default `div`, with the class `wp-admin-inert-html`), when it mounts and whenever `html`
 *   changes. It is never compiled as a Vue template.
 */

const ELEMENT = 1;
const URL_ATTRIBUTES = new Set( [ 'href', 'xlink:href', 'src', 'action', 'formaction', 'data' ] );
const ANIMATION_ELEMENTS = new Set( [ 'animate', 'set' ] );
const ANIMATION_VALUES = new Set( [ 'values', 'to', 'from', 'by' ] );
// What a browser ignores when it reads a URL's scheme: spaces around it, tabs and newlines anywhere.
const IGNORED = /[\u0000- \u007f]/g;

/** Whether a value, read as a browser reads an address, is a `javascript:` URL (or holds one). */
const isScript = ( value, anywhere = false ) => {
	const read = String( value ?? '' ).replace( IGNORED, '' ).toLowerCase();
	return anywhere ? read.includes( 'javascript:' ) : read.startsWith( 'javascript:' );
};

/** Removes, in place, what could run from a parsed tree (see the comment at the top). */
function clean( node ) {
	for ( const child of [ ...( node?.childNodes ?? [] ) ] ) {
		if ( child.nodeType !== ELEMENT ) {
			continue;
		}
		const name = String( child.localName ?? '' ).toLowerCase();
		if ( name === 'script' ) {
			node.removeChild( child );
			continue;
		}
		for ( const attribute of [ ...( child.attributes ?? [] ) ] ) {
			const key = String( attribute.name ).toLowerCase();
			if (
				key.startsWith( 'on' ) ||
				key === 'srcdoc' ||
				( URL_ATTRIBUTES.has( key ) && isScript( attribute.value ) ) ||
				( ANIMATION_ELEMENTS.has( name ) && ANIMATION_VALUES.has( key ) && isScript( attribute.value, true ) )
			) {
				child.removeAttribute( attribute.name );
			}
		}
		if ( name === 'template' && child.content ) {
			clean( child.content );
		}
		clean( child );
	}
	return node;
}

/**
 * Parses HTML into a fragment from which every script, event handler and `javascript:` address
 * has been removed; the rest of the markup is kept unchanged. Pure, but for the document.
 *
 * @param {string}   html HTML.
 * @param {Document} doc  Document that makes the `<template>`.
 * @return {DocumentFragment} The template's cleaned content.
 */
export function toInertFragment( html, doc = globalThis.document ) {
	const template = doc.createElement( 'template' );
	template.innerHTML = String( html ?? '' );
	return clean( template.content );
}
// The cleaning alone, for a tree parsed elsewhere.
toInertFragment.clean = clean;

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
