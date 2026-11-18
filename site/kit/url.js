/**
 * URL checks for values that come from data or translations (a translated
 * documentation URL, an image source). No Vue, no document access at import time.
 */

// C0 controls, DEL: the browser's URL parser drops tab and newlines anywhere and
// controls at the start, so "java\tscript:" would become "javascript:".
const CONTROLS = /[\u0000-\u001f\u007f]/;

/**
 * The value when it is a URL with an allowed protocol, else null.
 *
 * The value must not contain control characters or start or end with whitespace; it is
 * parsed against `base` (default: the document's base URL) and its parsed protocol must
 * be one of `protocols`. A relative or protocol-relative value resolves to http(s).
 *
 * @param {string} value URL as given.
 * @param {{base?: string, protocols?: string[]}} options Base URL and allowed protocols
 *        (default `http:`, `https:`, `mailto:`).
 * @return {string|null} The value as given, or null.
 */
export function safeUrl( value, { base = globalThis.document?.baseURI ?? 'http://localhost/', protocols = [ 'http:', 'https:', 'mailto:' ] } = {} ) {
	if ( typeof value !== 'string' || value === '' || CONTROLS.test( value ) || /^\s|\s$/.test( value ) ) {
		return null;
	}
	let url;
	try {
		url = new URL( value, base );
	} catch {
		return null;
	}
	return protocols.includes( url.protocol ) ? value : null;
}
