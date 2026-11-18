import { h } from 'vue';
import { safeUrl } from './url.js';

/*
 * Translated sentences that contain markup, without HTML.
 *
 * Core's PHP prints some sentences with markup inside the translation:
 *   __( 'Enter the same address here unless you <a href="%s">want …</a>.' )
 * The same source string must be used here so that existing translations apply,
 * but a translation is never inserted as HTML. As core's JavaScript does with
 * createInterpolateElement(), the string is read as text in which only the tags
 * the template names become elements:
 *
 *   <Interpolate
 *       :text="$__( 'Enter the same address here unless you <a href=&quot;%s&quot;>want …</a>.', 'default' )"
 *       :tags="{ a: { href: url } }" />
 *
 * - A tag becomes an element only if it is in the allow list below AND in `tags`.
 *   Its attributes are those of `tags`, filtered by an allow list (a link target must
 *   parse to http(s) or mailto, see kit/url.js; otherwise the link has no `href` and is
 *   plain text); attributes written in the string are ignored.
 *   Any other markup, and a closing tag that closes nothing, is shown as text.
 * - `%s`, `%1$s` … are replaced by `args`: a string is text; `{ tag, text }` is a fixed
 *   element (e.g. `{ tag: 'code', text: time }`) with that text. A placeholder inside a
 *   tag's attributes takes its argument, as sprintf() would, which is then not shown.
 * - When one string has several links to different places, as in
 *   `'… <a href="%1$s">Update Services</a> … <a href="%2$s">visibility settings</a>.'`, a
 *   tag's entry in `tags` may be a function: it gets the arguments the placeholders inside
 *   that tag took (`[ args[ 0 ] ]` for the first link, `[ args[ 1 ] ]` for the second,
 *   whatever order a translation puts them in) and returns the attributes, which are
 *   filtered as above.
 *   `%%` is a percent sign.
 * - Character references in the text (`&#8220;`, `&amp;`) are decoded, since source
 *   strings keep them as written.
 */

const ALLOWED_TAGS = new Set( [ 'a', 'abbr', 'b', 'code', 'em', 'i', 'kbd', 'span', 'strong' ] );
const ALLOWED_ATTRIBUTES = new Set( [ 'class', 'dir', 'href', 'id', 'lang', 'rel', 'target', 'title' ] );
const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>|%%|%(?:(\d+)\$)?s/g;
const PLACEHOLDER = /%%|%(?:(\d+)\$)?s/g;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™' };

/** Decodes numeric and common named character references; anything else is left as it is. */
export function decodeEntities( text ) {
	return String( text ).replace( /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, ( match, dec, hex, name ) => {
		if ( name ) {
			return Object.hasOwn( NAMED, name ) ? NAMED[ name ] : match;
		}
		const code = dec ? Number( dec ) : parseInt( hex, 16 );
		return code > 0 && code <= 0x10ffff && ! ( code >= 0xd800 && code <= 0xdfff ) ? String.fromCodePoint( code ) : match;
	} );
}

function attributesOf( given ) {
	const attributes = {};
	for ( const [ key, value ] of Object.entries( given && typeof given === 'object' ? given : {} ) ) {
		if ( ! ALLOWED_ATTRIBUTES.has( key ) || value === null || value === undefined || value === false ) {
			continue;
		}
		if ( key === 'href' ) {
			// Checked on the parsed protocol: only http(s) and mailto links (see kit/url.js).
			const href = safeUrl( String( value ) );
			if ( href !== null ) {
				attributes.href = href;
			}
			continue;
		}
		attributes[ key ] = String( value );
	}
	return attributes;
}

/**
 * Parses a translated string into a tree: strings (text) and `{ tag, attributes, children }`.
 *
 * @param {string} text  Translated string.
 * @param {Array}  args  Placeholder arguments.
 * @param {object} tags  Tag name => attributes, or a function of the arguments the tag's
 *                       placeholders took returning them, for the tags that may become elements.
 * @return {Array} Nodes.
 */
export function interpolate( text, args = [], tags = {} ) {
	const allowed = ( name ) => ALLOWED_TAGS.has( name ) && Object.hasOwn( tags ?? {}, name );
	const root = { children: [] };
	const stack = [ root ];
	let next = 0; // Index of the next unnumbered placeholder.
	let last = 0;
	const source = String( text ?? '' );

	const top = () => stack[ stack.length - 1 ];
	const pushText = ( value ) => {
		if ( value === '' ) {
			return;
		}
		const children = top().children;
		if ( typeof children[ children.length - 1 ] === 'string' ) {
			children[ children.length - 1 ] += value;
		} else {
			children.push( value );
		}
	};
	const argument = ( number ) => {
		const index = number ? Number( number ) - 1 : next++;
		return args[ index ];
	};

	for ( const match of source.matchAll( TOKEN ) ) {
		pushText( decodeEntities( source.slice( last, match.index ) ) );
		last = match.index + match[ 0 ].length;
		const [ token, closing, rawName, number ] = match;

		if ( rawName === undefined ) {
			if ( token === '%%' ) {
				pushText( '%' );
				continue;
			}
			const value = argument( number );
			if ( value && typeof value === 'object' && ALLOWED_TAGS.has( value.tag ) ) {
				top().children.push( { tag: value.tag, attributes: attributesOf( value.attributes ), children: [ String( value.text ?? '' ) ] } );
			} else if ( value !== undefined && value !== null ) {
				pushText( String( value ) );
			}
			continue;
		}

		const name = rawName.toLowerCase();
		// Placeholders inside the tag (e.g. href="%s") take their arguments, which are not shown.
		const taken = [];
		for ( const inner of token.matchAll( PLACEHOLDER ) ) {
			if ( inner[ 0 ] !== '%%' ) {
				taken.push( argument( inner[ 1 ] ) );
			}
		}

		if ( ! closing && allowed( name ) ) {
			const given = typeof tags[ name ] === 'function' ? tags[ name ]( taken ) : tags[ name ];
			const element = { tag: name, attributes: attributesOf( given ), children: [] };
			top().children.push( element );
			stack.push( element );
		} else if ( closing && stack.length > 1 && top().tag === name ) {
			stack.pop();
		} else {
			pushText( token );
		}
	}
	pushText( decodeEntities( source.slice( last ) ) );

	return root.children;
}

const toVNodes = ( nodes ) => nodes.map( ( node ) => ( typeof node === 'string' ? node : h( node.tag, node.attributes, toVNodes( node.children ) ) ) );

export default {
	name: 'WpAdminInterpolate',
	props: {
		text: { type: String, required: true },
		args: { type: Array, default: () => [] },
		tags: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		return () => toVNodes( interpolate( props.text, props.args, props.tags ) );
	},
};
