import { h, ref, watch, onMounted, onBeforeUnmount } from 'vue';

/*
 * <LegacyHtml :html="field.html" :scripts="…" :styles="…" @change="…" />
 *
 * Markup that plugins print with the classic Settings API (add_settings_field() and
 * add_settings_section() callbacks), which the admin endpoints capture and send as
 * HTML. This is the one place where HTML from the API is shown. It is trusted,
 * same-origin, capability-gated plugin output: the same trust classic WordPress
 * gives it when it prints it on the screen.
 *
 * - The HTML becomes the content of an element this component owns, by setting its
 *   `innerHTML`. It is never compiled as a Vue template: `{{ }}` and directives in it
 *   are plain text and attributes. Form controls and links in it work as in the classic
 *   screen; `<script>` elements in it do not run (the browser does not run scripts
 *   inserted this way) and this component runs nothing itself.
 * - `scripts` and `styles` (`[{ handle, src }]`, in load order) are loaded once each,
 *   by URL, and only when the URL is http(s) on the admin's own origin. Scripts are
 *   loaded one after another, after the HTML is in the document.
 * - `collect()` (exposed) returns the values of the controls inside, as a submitted form
 *   would send them: `[{ name, value }]` in document order. `change` is emitted when a
 *   control inside is edited.
 */

const CONTROLS = 'input, select, textarea';
const SKIPPED_TYPES = new Set( [ 'submit', 'button', 'reset', 'image', 'file' ] );
const loads = new Map(); // URL => Promise, for the whole visit.

/**
 * The absolute URL of `src` when it is an http(s) URL of `origin`, else null.
 *
 * @param {string} src    Root-relative or absolute URL.
 * @param {string} origin Origin of the admin, e.g. `http://localhost:8890`.
 * @return {string|null} The URL, or null.
 */
export function sameOriginUrl( src, origin ) {
	if ( typeof src !== 'string' || src === '' || typeof origin !== 'string' || origin === '' || origin === 'null' ) {
		return null;
	}
	let url;
	try {
		url = new URL( src, origin );
	} catch {
		return null;
	}
	if ( ( url.protocol !== 'http:' && url.protocol !== 'https:' ) || url.origin !== origin ) {
		return null;
	}
	return url.href;
}

/**
 * The name and value pairs a form would submit for the given controls.
 *
 * @param {Iterable<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>} controls Controls in document order.
 * @return {{name: string, value: string}[]} Pairs.
 */
export function collectControls( controls ) {
	const pairs = [];
	for ( const control of controls ) {
		const name = control.name;
		const type = String( control.type ?? '' ).toLowerCase();
		if ( ! name || control.disabled || SKIPPED_TYPES.has( type ) ) {
			continue;
		}
		if ( type === 'checkbox' || type === 'radio' ) {
			if ( control.checked ) {
				pairs.push( { name, value: String( control.value ) } );
			}
			continue;
		}
		if ( String( control.tagName ).toUpperCase() === 'SELECT' ) {
			for ( const option of control.options ?? [] ) {
				if ( option.selected && ! option.disabled ) {
					pairs.push( { name, value: String( option.value ) } );
					if ( type !== 'select-multiple' ) {
						break;
					}
				}
			}
			continue;
		}
		pairs.push( { name, value: String( control.value ?? '' ) } );
	}
	return pairs;
}

function load( doc, kind, url ) {
	if ( ! loads.has( url ) ) {
		loads.set( url, new Promise( ( resolve ) => {
			const element = doc.createElement( kind === 'script' ? 'script' : 'link' );
			if ( kind === 'script' ) {
				element.src = url;
				element.async = false;
			} else {
				element.rel = 'stylesheet';
				element.href = url;
			}
			// A plugin asset that fails does not stop the screen.
			element.addEventListener( 'load', () => resolve( true ), { once: true } );
			element.addEventListener( 'error', () => resolve( false ), { once: true } );
			doc.head.appendChild( element );
		} ) );
	}
	return loads.get( url );
}

/** Loads the styles, then the scripts in order; URLs that are not of this origin are skipped. */
export async function loadAssets( { scripts = [], styles = [] }, doc = globalThis.document ) {
	const origin = doc?.location?.origin;
	if ( ! doc?.head || ! origin ) {
		return;
	}
	const urls = ( list ) => ( Array.isArray( list ) ? list : [] ).map( ( asset ) => {
		const url = sameOriginUrl( asset?.src, origin );
		if ( url === null && asset?.src ) {
			console.warn( 'Not loading ' + String( asset.handle ?? '' ) + ': not on the admin origin.' );
		}
		return url;
	} ).filter( Boolean );
	await Promise.all( urls( styles ).map( ( url ) => load( doc, 'style', url ) ) );
	for ( const url of urls( scripts ) ) {
		await load( doc, 'script', url );
	}
}

export default {
	name: 'WpAdminLegacyHtml',
	props: {
		html: { type: String, default: '' },
		tag: { type: String, default: 'div' },
		scripts: { type: Array, default: () => [] },
		styles: { type: Array, default: () => [] },
	},
	emits: [ 'change' ],
	setup( props, { emit, expose } ) {
		const container = ref( null );
		const onEdit = () => emit( 'change' );

		function fill() {
			if ( container.value ) {
				container.value.innerHTML = props.html;
			}
		}

		onMounted( () => {
			fill();
			container.value?.addEventListener?.( 'input', onEdit );
			container.value?.addEventListener?.( 'change', onEdit );
			loadAssets( { scripts: props.scripts, styles: props.styles } );
		} );
		onBeforeUnmount( () => {
			container.value?.removeEventListener?.( 'input', onEdit );
			container.value?.removeEventListener?.( 'change', onEdit );
		} );
		watch( () => props.html, fill, { flush: 'post' } );
		watch( () => [ props.scripts, props.styles ], () => loadAssets( { scripts: props.scripts, styles: props.styles } ) );

		expose( {
			collect: () => collectControls( container.value?.querySelectorAll?.( CONTROLS ) ?? [] ),
			element: () => container.value,
		} );

		return () => h( props.tag === 'span' ? 'span' : 'div', { ref: container, class: 'wp-admin-legacy-html' } );
	},
};
