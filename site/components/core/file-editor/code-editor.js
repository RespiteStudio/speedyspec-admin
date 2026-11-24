/*
 * The code editor of the file editors (Adapter): core's `wp.codeEditor` (code-editor.js, with
 * CodeMirror and the linters the screen queues through wp_enqueue_code_editor()) on the native
 * textarea, as theme-plugin-editor.js initCodeEditor() starts it. No Vue; the document is the
 * textarea's.
 *
 * mountCodeEditor( textarea, settings, options ) gives `{ value(), setReadOnly( bool ),
 * focusError(), updateErrorNotice(), destroy(), started }`:
 *
 * - With `settings` (wp_get_code_editor_settings()' answer, page data) and `wp.codeEditor`, it
 *   calls `wp.codeEditor.initialize( textarea, settings )` once the screen's assets are ready
 *   (`ready()`), with the settings' own `onChangeLintingErrors` and `onUpdateErrorNotice` chained
 *   to the page's (`onLintErrors`, `onLintNotice`), and as theme-plugin-editor.js: Ctrl-S and
 *   Cmd-S save (`onSave`), Tab out of the editor moves to the file list (`onTabPrevious`) or the
 *   next field (`onTabNext`), and the editing area is a multiline textbox labelled by the file's
 *   label and described by the help's keyboard texts. CodeMirror's text is the value.
 * - Without settings (the user turned syntax highlighting off, or there is no CodeMirror for the
 *   file), or without `wp.codeEditor`, it is the plain textarea.
 *
 * `onChange( value )` is told every change of the text.
 */

const HELP_IDS = 'editor-keyboard-trap-help-1 editor-keyboard-trap-help-2 editor-keyboard-trap-help-3 editor-keyboard-trap-help-4';

const usable = ( settings ) => Boolean( settings ) && typeof settings === 'object' && ! Array.isArray( settings );
const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Mounts the code editor on a textarea.
 *
 * @param {HTMLTextAreaElement} textarea The file's textarea (`#newcontent`).
 * @param {object|false}        settings The code editor settings, or false for the plain textarea.
 * @param {object}              [options]
 * @param {object|null}         [options.api]           `wp.codeEditor`. Default the window's.
 * @param {Function}            [options.ready]         Settles once the screen's assets are loaded.
 * @param {Function}            [options.onChange]      Told the text after each change.
 * @param {Function}            [options.onLintErrors]  Told the lint error annotations when they change.
 * @param {Function}            [options.onLintNotice]  Told the error annotations the editor shows.
 * @param {Function}            [options.onSave]        Ctrl-S or Cmd-S in the editor.
 * @param {Function}            [options.onTabPrevious] Tab back out of the editor.
 * @param {Function}            [options.onTabNext]     Tab out of the editor.
 * @return {{value: Function, setReadOnly: Function, focusError: Function, updateErrorNotice: Function, destroy: Function, started: Promise<void>}} The editor.
 */
export function mountCodeEditor( textarea, settings, options = {} ) {
	const { ready = null, onChange = null, onLintErrors = null, onLintNotice = null, onSave = null, onTabPrevious = null, onTabNext = null } = options;
	const api = Object.hasOwn( options, 'api' ) ? options.api : globalThis.wp?.codeEditor;
	let destroyed = false;
	let instance = null;
	let errors = [];

	const report = () => {
		if ( ! destroyed && ! instance ) {
			onChange?.( textarea.value );
		}
	};
	textarea.addEventListener( 'input', report );

	async function start() {
		if ( ! usable( settings ) || ! api || typeof api.initialize !== 'function' ) {
			return;
		}
		await Promise.resolve( ready?.() ).catch( () => {} );
		if ( destroyed ) {
			return;
		}
		const own = settings;
		instance = api.initialize( textarea, {
			...own,
			onTabPrevious: ( ...args ) => {
				own.onTabPrevious?.( ...args );
				onTabPrevious?.();
			},
			onTabNext: ( ...args ) => {
				own.onTabNext?.( ...args );
				onTabNext?.();
			},
			onChangeLintingErrors: ( found, ...args ) => {
				own.onChangeLintingErrors?.( found, ...args );
				errors = list( found );
				onLintErrors?.( errors );
			},
			onUpdateErrorNotice: ( annotations, ...args ) => {
				own.onUpdateErrorNotice?.( annotations, ...args );
				onLintNotice?.( list( annotations ) );
			},
		} );
		const codemirror = instance?.codemirror;
		if ( ! codemirror ) {
			instance = null;
			return;
		}
		codemirror.on( 'change', () => {
			if ( ! destroyed ) {
				onChange?.( codemirror.getValue() );
			}
		} );
		const save = () => onSave?.();
		codemirror.setOption( 'extraKeys', { ...( codemirror.getOption( 'extraKeys' ) || {} ), 'Ctrl-S': save, 'Cmd-S': save } );
		const area = codemirror.display?.lineDiv;
		area?.setAttribute?.( 'role', 'textbox' );
		area?.setAttribute?.( 'aria-multiline', 'true' );
		area?.setAttribute?.( 'aria-labelledby', 'theme-plugin-editor-label' );
		area?.setAttribute?.( 'aria-describedby', HELP_IDS );
	}

	const started = start().catch( ( error ) => {
		instance = null;
		console.warn( 'Could not start the code editor:', error );
	} );

	return {
		started,
		/** The text: CodeMirror's, else the textarea's. */
		value: () => ( instance ? instance.codemirror.getValue() : textarea.value ),
		/** Read-only while a save runs (theme-plugin-editor.js submit()). */
		setReadOnly( readOnly ) {
			textarea.readOnly = Boolean( readOnly );
			instance?.codemirror.setOption( 'readOnly', Boolean( readOnly ) );
		},
		/** The cursor on the first lint error's line, as a save with errors does. */
		focusError() {
			const first = errors[ 0 ];
			if ( ! instance || ! first ) {
				return;
			}
			instance.codemirror.setCursor( first.from?.line ?? 0 );
			instance.codemirror.focus();
		},
		/** Shows the editor's error notice now (code-editor.js updateErrorNotice()), as a save does first. */
		updateErrorNotice() {
			instance?.updateErrorNotice?.();
		},
		/** Whether the focus is in CodeMirror (Ctrl-S there is CodeMirror's own key). */
		hasFocus: () => Boolean( instance?.codemirror.hasFocus?.() ),
		focus() {
			if ( instance ) {
				instance.codemirror.focus();
			} else {
				textarea.focus();
			}
		},
		destroy() {
			if ( destroyed ) {
				return;
			}
			destroyed = true;
			textarea.removeEventListener( 'input', report );
			instance?.codemirror?.toTextArea?.();
			instance = null;
		},
	};
}
