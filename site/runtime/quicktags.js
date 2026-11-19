/**
 * The classic HTML editor (Quicktags) on a native textarea, as wp_editor() starts it in
 * quicktags-only mode (`tinymce => false`), with the settings WordPress sends after the
 * `quicktags_settings` filter (wp_admin_quicktags_settings(): `qtInit`, `{ id, buttons }`, or an
 * empty value when Quicktags is off). No Vue; the document is read when an editor is mounted.
 *
 * mountQuicktagsEditor( host, { id, name, value, settings, onInput, ready, rows } ):
 * - creates `<textarea id="{id}" class="wp-editor-area" name="{name}" rows="20" cols="40"
 *   autocomplete="off">` in `host`, an element that Vue renders empty and never patches, so that
 *   the toolbar Quicktags inserts before the textarea stays;
 * - reports what is typed, and what a Quicktags button inserts (Quicktags fires `change`), to
 *   `onInput( value )`;
 * - once `ready()` settles (the page's screen assets, `SCREEN_ASSETS.ready()`, which load core's
 *   `quicktags` script on the screens that queue it; a failure does not stop it) and when
 *   `globalThis.quicktags` exists and `settings` is an object, calls `quicktags( { ...settings,
 *   id } )` and then `QTags._buttonsInit()`, as the classic editor's footer script does. Without
 *   them the plain textarea stays.
 *
 * Returns `{ setValue( value ), focus(), destroy(), started }`: `destroy()` removes the toolbar
 * (`#qt_{id}_toolbar`), the instance (`QTags.instances[ id ]`) and the textarea, so that the
 * same id can be mounted again later (the next Reply); `started` settles once Quicktags has
 * started, or will not.
 */

const usable = ( settings ) => Boolean( settings ) && typeof settings === 'object' && ! Array.isArray( settings ) && Object.keys( settings ).length > 0;

/**
 * Mounts a textarea with the Quicktags toolbar in `host`.
 *
 * @param {HTMLElement} host    Empty element that holds the editor.
 * @param {object}      options
 * @param {string}      options.id       The textarea's id (Quicktags' editor id).
 * @param {string}      options.name     The textarea's name.
 * @param {string}      [options.value]  Initial text.
 * @param {object}      [options.settings] Quicktags settings (`qtInit`), or none.
 * @param {Function}    [options.onInput]  Called with the text whenever it changes.
 * @param {Function}    [options.ready]    Returns a promise that settles once the screen's assets are loaded.
 * @param {number}      [options.rows]     Rows of the textarea (default 20, as wp_editor()).
 * @return {{setValue: Function, focus: Function, destroy: Function, started: Promise<void>}} The editor.
 */
export function mountQuicktagsEditor( host, { id, name, value = '', settings = null, onInput = null, ready = null, rows = 20 } = {} ) {
	const doc = host?.ownerDocument ?? globalThis.document;
	const textarea = doc.createElement( 'textarea' );
	textarea.setAttribute( 'id', id );
	textarea.setAttribute( 'class', 'wp-editor-area' );
	textarea.setAttribute( 'name', name ?? id );
	textarea.setAttribute( 'rows', String( rows ) );
	textarea.setAttribute( 'cols', '40' );
	textarea.setAttribute( 'autocomplete', 'off' );
	textarea.value = String( value ?? '' );
	host.appendChild( textarea );

	let destroyed = false;
	let instance = null;
	const report = () => {
		if ( ! destroyed ) {
			onInput?.( textarea.value );
		}
	};
	textarea.addEventListener( 'input', report );
	textarea.addEventListener( 'change', report );

	async function start() {
		await Promise.resolve( ready?.() ).catch( () => {} );
		const quicktags = globalThis.quicktags;
		if ( destroyed || typeof quicktags !== 'function' || ! usable( settings ) ) {
			return;
		}
		instance = quicktags( { ...settings, id } );
		globalThis.QTags?._buttonsInit?.();
	}
	const started = start().catch( ( error ) => {
		console.warn( 'Could not start Quicktags:', error );
	} );

	return {
		started,
		setValue( next ) {
			textarea.value = String( next ?? '' );
		},
		focus() {
			textarea.focus();
		},
		destroy() {
			if ( destroyed ) {
				return;
			}
			destroyed = true;
			textarea.removeEventListener( 'input', report );
			textarea.removeEventListener( 'change', report );
			const QTags = globalThis.QTags;
			const toolbar = doc.getElementById?.( 'qt_' + id + '_toolbar' ) ?? instance?.toolbar ?? null;
			toolbar?.remove?.();
			if ( QTags?.instances && Object.hasOwn( QTags.instances, id ) ) {
				delete QTags.instances[ id ];
			}
			textarea.remove();
		},
	};
}
