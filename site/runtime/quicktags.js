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
 *   id } )`. Its buttons are added once, for this editor only: by the constructor's own
 *   `QTags._buttonsInit( id )`, which it defers to jQuery's ready queue, or, without jQuery, by
 *   calling `QTags._buttonsInit( id )`. Without them the plain textarea stays.
 *
 * Returns `{ setValue( value ), focus(), destroy(), started }`: `destroy()` removes the textarea
 * and runs the instance's own `remove()` (core's: the instance, `QTags.instances[ id ]`, and its
 * toolbar), so that the same id can be mounted again later (the next Reply). When the buttons are
 * still to be added (destroyed right after it started), the toolbar goes at once and `remove()`
 * runs after the deferred init, which would otherwise find no instance and throw; an instance of
 * the same id mounted again meanwhile is left alone. `started` settles once Quicktags has started,
 * or will not.
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
		// With jQuery, the constructor's init (deferred to jQuery's ready queue) adds the buttons.
		if ( typeof globalThis.jQuery !== 'function' ) {
			globalThis.QTags?._buttonsInit?.( id );
		}
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
			textarea.remove();
			if ( ! instance ) {
				return;
			}
			const mine = instance;
			const remove = () => {
				const QTags = globalThis.QTags;
				// Only this editor's instance: the same id may have been mounted again meanwhile.
				if ( QTags?.instances?.[ id ] === mine && typeof mine.remove === 'function' ) {
					mine.remove();
				} else if ( QTags?.instances?.[ id ] === mine ) {
					delete QTags.instances[ id ];
				}
				mine.toolbar?.remove?.();
			};
			if ( ! mine.theButtons && typeof globalThis.jQuery === 'function' ) {
				// Its buttons are still to be added: after that init, which reads the instance.
				mine.toolbar?.remove?.();
				globalThis.jQuery( remove );
				return;
			}
			remove();
		},
	};
}
