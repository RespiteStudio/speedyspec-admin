import { h, inject, ref, watch, onMounted, onBeforeUnmount } from 'vue';

/*
 * <LegacyHtml :html="field.html" :assets="legacySections" @change="…" />
 *
 * Markup that plugins print with the classic Settings API (add_settings_field() and
 * add_settings_section() callbacks), which the admin endpoints capture and send as HTML,
 * with the scripts and styles the callbacks enqueued. This is the one place where HTML and
 * code from the API are used. It is trusted, same-origin, capability-gated plugin output:
 * the same trust classic WordPress gives it when it prints it on the screen, and the same
 * trust as loading the plugin's own script files.
 *
 * - The HTML becomes the content of an element this component owns, by setting its
 *   `innerHTML`, when it mounts and whenever `html` changes; never on other re-renders, so
 *   what the user typed survives them. It is never compiled as a Vue template: `{{ }}` and
 *   directives in it are plain text and attributes.
 * - `assets` (`{ scripts, styles, ajaxurl }` as the endpoint returns them) is set up the way
 *   the classic screen has it, once per visit for each item: `window.ajaxurl` when it is not
 *   defined; for each style, its file (for its `media`) and then its inline CSS, which apply while
 *   the component is there (see releaseAssets()); for each script, in load order,
 *   its localized data, its translations and its `before` code, then its file, then its
 *   `after` code. Files are loaded only when they are http(s) URLs of the admin's own origin
 *   (`sameOrigin`). Inline code runs by appending a `<script>` element whose text it is
 *   (never eval).
 * - Inside a page, the screen assets the page host loads for the page (what its classic screen
 *   queues on `admin_enqueue_scripts`, provided as `SCREEN_ASSETS`: `{ ready() }`) are set up
 *   first: each fill waits for them before it sets up its own assets and runs its scripts.
 * - After each fill, once the assets are ready, the `<script>` elements in the inserted HTML
 *   run in document order (each is replaced by a new element with the same attributes and
 *   text; an external `src` among them loads only from the admin's origin, and only classic
 *   scripts run). Then a bubbling `wp-admin:legacy-html` event (`detail: { container }`) is
 *   dispatched on the element: scripts that initialise controls only on document ready do
 *   so for the first fill, and must listen to this event to enhance later fills.
 * - `collect()` (exposed) returns the values of the controls inside, as a submitted form
 *   would send them: `[{ name, value }]` in document order. `change` is emitted when a
 *   control inside is edited.
 */

const CONTROLS = 'input, select, textarea';
const SKIPPED_TYPES = new Set( [ 'submit', 'button', 'reset', 'image', 'file' ] );
const CLASSIC_TYPES = new Set( [ '', 'text/javascript', 'application/javascript' ] );
export const FILLED_EVENT = 'wp-admin:legacy-html';
// Injection key of the page's screen assets: `{ ready(): Promise }` (runtime/PageHost.js).
export const SCREEN_ASSETS = 'wpAdminScreenAssets';
const once = new Map(); // Key => Promise, for the whole visit.

/**
 * The absolute URL of `src` when it is an http(s) URL of `origin`, else null.
 *
 * @param {string} src    Root-relative or absolute URL.
 * @param {string} origin Origin of the admin, e.g. `http://localhost:8890`.
 * @return {string|null} The URL, or null.
 */
export function sameOriginUrl( src, origin ) {
	if ( typeof src !== 'string' || src === '' || /[\u0000-\u001f\u007f]/.test( src ) || typeof origin !== 'string' || origin === '' || origin === 'null' ) {
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

const isDisabled = ( control ) => Boolean( control.disabled ) || Boolean( control.matches?.( ':disabled' ) );

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
		if ( ! name || isDisabled( control ) || SKIPPED_TYPES.has( type ) ) {
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

/**
 * The names of the controls a form would consider, checked or not (an unchecked
 * checkbox is a control of the form that submits nothing).
 */
export function controlNames( controls ) {
	const names = [];
	for ( const control of controls ) {
		const type = String( control.type ?? '' ).toLowerCase();
		if ( control.name && ! isDisabled( control ) && ! SKIPPED_TYPES.has( type ) && ! names.includes( control.name ) ) {
			names.push( control.name );
		}
	}
	return names;
}

const legacyControls = ( root ) => root?.querySelectorAll?.( '.wp-admin-legacy-html input, .wp-admin-legacy-html select, .wp-admin-legacy-html textarea' ) ?? [];

/**
 * The values of the controls inside every LegacyHtml element under `root`, in document order.
 *
 * @param {Element} root Element that contains LegacyHtml elements, e.g. a form.
 * @return {{name: string, value: string}[]} Pairs.
 */
export const collectLegacy = ( root ) => collectControls( legacyControls( root ) );

/** The names of the controls inside every LegacyHtml element under `root`. */
export const legacyNames = ( root ) => controlNames( legacyControls( root ) );

const memo = ( key, run ) => {
	if ( ! once.has( key ) ) {
		once.set( key, run() );
	}
	return once.get( key );
};

/** Runs code by appending a script element whose text it is. */
function runInline( doc, code ) {
	if ( typeof code !== 'string' || code === '' ) {
		return;
	}
	const element = doc.createElement( 'script' );
	element.textContent = code;
	doc.head.appendChild( element );
	element.remove?.();
}

/**
 * Loads a file (script or stylesheet, for `media`); resolves when it loaded or failed.
 * `onElement` is given the element before it is added.
 */
function loadFile( doc, kind, url, media = '', onElement = () => {} ) {
	return new Promise( ( resolve ) => {
		const element = doc.createElement( kind === 'script' ? 'script' : 'link' );
		if ( kind === 'script' ) {
			element.async = false;
			element.src = url;
		} else {
			element.rel = 'stylesheet';
			if ( typeof media === 'string' && media !== '' && media !== 'all' ) {
				element.media = media;
			}
			element.href = url;
		}
		// A plugin asset that fails does not stop the screen.
		element.addEventListener( 'load', () => resolve( true ), { once: true } );
		element.addEventListener( 'error', () => resolve( false ), { once: true } );
		onElement( element );
		doc.head.appendChild( element );
	} );
}

const warned = new Set();

function fileUrl( doc, asset ) {
	if ( ! asset?.src ) {
		return null;
	}
	const url = asset.sameOrigin === false ? null : sameOriginUrl( asset.src, doc.location?.origin );
	if ( url === null && ! warned.has( asset.src ) ) {
		warned.add( asset.src );
		console.warn( 'Not loading ' + String( asset.handle ?? '' ) + ': not on the admin origin.' );
	}
	return url;
}

/*
 * The stylesheets and inline CSS loadAssets() added, by key: `{ elements: [ [ element, media ] ],
 * owners: Set, pinned, ready }`. An entry applies while an owner holds it (or for good when it was
 * loaded without one); otherwise its elements are switched off (`media` "not all"), and switched
 * on again when an owner takes it back: the file is never loaded twice.
 */
const styleEntries = new Map();

function applyStyle( entry ) {
	const on = entry.pinned || entry.owners.size > 0;
	if ( on === entry.on ) {
		return;
	}
	entry.on = on;
	for ( const [ element, media ] of entry.elements ) {
		element.media = on ? media : 'not all';
	}
}

function holdStyle( key, owner, create ) {
	let entry = styleEntries.get( key );
	if ( ! entry ) {
		entry = { elements: [], owners: new Set(), pinned: false, on: true, ready: null };
		styleEntries.set( key, entry );
		entry.ready = create( ( element ) => entry.elements.push( [ element, typeof element.media === 'string' ? element.media : '' ] ) );
	}
	if ( owner ) {
		entry.owners.add( owner );
	} else {
		entry.pinned = true;
	}
	applyStyle( entry );
	return entry.ready;
}

/**
 * Lets go of the styles loadAssets() set up for `owner`: those no other owner holds stop applying
 * (their elements stay, switched off, so that taking them again does not load them again).
 * Scripts cannot be undone and are not affected.
 *
 * @param {object} owner The owner given to loadAssets().
 */
export function releaseAssets( owner ) {
	if ( ! owner ) {
		return;
	}
	for ( const entry of styleEntries.values() ) {
		if ( entry.owners.delete( owner ) ) {
			applyStyle( entry );
		}
	}
}

/**
 * Sets up the scripts and styles plugins' fields need, as the classic screen has them.
 * Each item runs once per visit; calling again waits for the same work.
 *
 * Styles belong to `owner` (any object: a page visit, a component instance) until
 * releaseAssets( owner ): a style no owner holds any more stops applying, so that a stylesheet a
 * plugin loads for one screen does not style the next one, and applies again when an owner loads
 * it again. Styles loaded without an owner apply for the whole visit.
 *
 * @param {{scripts?: object[], styles?: object[], ajaxurl?: string}} assets As the endpoint returns them.
 * @param {Document} doc   Document.
 * @param {object}   win   Global object (`window`).
 * @param {object}   owner Optional. What the styles belong to.
 * @return {Promise<void>} Resolves when every asset is set up.
 */
export async function loadAssets( { scripts = [], styles = [], ajaxurl = '' } = {}, doc = globalThis.document, win = globalThis.window, owner = null ) {
	if ( ! doc?.head ) {
		return;
	}
	if ( win && typeof ajaxurl === 'string' && ajaxurl !== '' && win.ajaxurl === undefined && sameOriginUrl( ajaxurl, doc.location?.origin ) ) {
		win.ajaxurl = ajaxurl;
	}
	const list = ( value ) => ( Array.isArray( value ) ? value : [] );

	// The file by its URL, its inline CSS by the handle and the CSS: CSS added later to a style is
	// applied, while its file is only ever loaded once.
	await Promise.all( list( styles ).map( async ( style ) => {
		const url = fileUrl( doc, style );
		if ( url ) {
			await holdStyle( 'file:' + url, owner, ( onElement ) => loadFile( doc, 'style', url, style.media, onElement ) );
		}
		if ( typeof style.after === 'string' && style.after !== '' ) {
			await holdStyle( 'css:' + style.handle + '\u0000' + style.after, owner, ( onElement ) => {
				const element = doc.createElement( 'style' );
				element.textContent = style.after;
				onElement( element );
				doc.head.appendChild( element );
			} );
		}
	} ) );

	for ( const script of list( scripts ) ) {
		// Keyed by the handle and its inline code: localized data that changed (a new nonce, say) is
		// applied again, while the file itself is only ever loaded once.
		const inline = [ script.data, script.translations, script.before, script.after ].map( ( code ) => ( typeof code === 'string' ? code : '' ) );
		await memo( 'script:' + script.handle + '\u0000' + inline.join( '\u0000' ), async () => {
			runInline( doc, script.data );
			runInline( doc, script.translations );
			runInline( doc, script.before );
			const url = fileUrl( doc, script );
			if ( url ) {
				await memo( 'file:' + url, () => loadFile( doc, 'script', url ) );
			}
			runInline( doc, script.after );
		} );
	}
}

/**
 * Runs the scripts inside freshly inserted HTML, in document order (a script file has loaded, or
 * failed, before the next script runs), and announces the fill.
 *
 * @param {Element}  container The element whose HTML was set.
 * @param {Document} doc       Document.
 * @return {Promise<void>} Resolves when every script has run.
 */
export async function activate( container, doc = globalThis.document ) {
	if ( ! container || ! doc ) {
		return;
	}
	for ( const old of [ ...( container.querySelectorAll?.( 'script' ) ?? [] ) ] ) {
		const type = String( old.getAttribute?.( 'type' ) ?? '' ).trim().toLowerCase();
		if ( ! CLASSIC_TYPES.has( type ) ) {
			continue; // Data blocks (JSON, templates) stay as they are.
		}
		const fresh = doc.createElement( 'script' );
		for ( const attribute of [ ...( old.attributes ?? [] ) ] ) {
			if ( attribute.name !== 'src' ) {
				fresh.setAttribute( attribute.name, attribute.value );
			}
		}
		const src = old.getAttribute?.( 'src' );
		if ( src ) {
			const url = sameOriginUrl( src, doc.location?.origin );
			if ( url === null ) {
				console.warn( 'Not loading a script of another origin from a settings field.' );
				old.remove?.();
				continue;
			}
			fresh.async = false;
			const done = new Promise( ( resolve ) => {
				fresh.addEventListener( 'load', resolve, { once: true } );
				fresh.addEventListener( 'error', resolve, { once: true } );
			} );
			fresh.src = url;
			old.replaceWith( fresh );
			await done;
		} else {
			fresh.textContent = old.textContent;
			old.replaceWith( fresh );
		}
	}
	const Event = globalThis.CustomEvent;
	if ( Event && container.dispatchEvent ) {
		container.dispatchEvent( new Event( FILLED_EVENT, { bubbles: true, detail: { container } } ) );
	}
}

export default {
	name: 'WpAdminLegacyHtml',
	props: {
		html: { type: String, default: '' },
		tag: { type: String, default: 'div' },
		assets: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'change' ],
	setup( props, { emit, expose } ) {
		const container = ref( null );
		const screenAssets = inject( SCREEN_ASSETS, null );
		// The styles of its assets are this instance's: they stop applying when it goes.
		const owner = {};
		const onEdit = () => emit( 'change' );
		let fills = 0;

		async function fill() {
			const element = container.value;
			if ( ! element ) {
				return;
			}
			const mine = ++fills;
			element.innerHTML = props.html;
			// The screen's own assets come first, as on the classic screen; a failure does not stop the fill.
			await Promise.resolve( screenAssets?.ready?.() ).catch( () => {} );
			if ( mine !== fills || container.value !== element ) {
				return;
			}
			await loadAssets( props.assets, globalThis.document, globalThis.window, owner );
			if ( mine === fills && container.value === element ) {
				await activate( element );
			}
		}

		onMounted( () => {
			container.value?.addEventListener?.( 'input', onEdit );
			container.value?.addEventListener?.( 'change', onEdit );
			fill();
		} );
		onBeforeUnmount( () => {
			fills++;
			container.value?.removeEventListener?.( 'input', onEdit );
			container.value?.removeEventListener?.( 'change', onEdit );
			releaseAssets( owner );
		} );
		watch( () => props.html, fill, { flush: 'post' } );

		expose( {
			collect: () => collectControls( container.value?.querySelectorAll?.( CONTROLS ) ?? [] ),
			element: () => container.value,
		} );

		return () => h( props.tag === 'span' ? 'span' : 'div', { ref: container, class: 'wp-admin-legacy-html' } );
	},
};
