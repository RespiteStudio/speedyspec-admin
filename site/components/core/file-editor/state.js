/*
 * The state of a file editor's form, as theme-plugin-editor.js keeps it on its `component`
 * (`dirty`, `lintErrors`, `isSaving`, the notices it adds and removes): a functional core under
 * the page's imperative shell (core/file-editor). No Vue, no document: every function takes a
 * state and gives a new one.
 *
 * - editorState( { content } ): the file as the page read it, clean.
 * - edited( state, value ): the text changed (`onChange`): dirty, and the saved notice goes.
 * - linted( state, errors ): the linter's errors changed (`onChangeLintingErrors`); none left
 *   lifts the button's `disabled` class.
 * - lintShown( state, annotations ): the code editor shows its error notice
 *   (`onUpdateErrorNotice`): the count of errors to tell, and the button's `disabled` class.
 * - updateAnyway( state ): the notice's "Update anyway" checkbox: the errors are ignored.
 * - canSave( state ): no lint errors and no save running.
 * - saving( state ), saved( state, answer ), failed( state, error, text ): the save's notice.
 * - dismissed( state ): the save's notice is dismissed.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( typeof value === 'string' ? value : '' );

// The code of the notice a save leaves (theme-plugin-editor.js `lastSaveNoticeCode`).
export const SAVED = 'file_saved';

/**
 * The state of a file just read.
 *
 * @param {{content?: string}} file The file's content.
 * @return {object} The state.
 */
export function editorState( { content = '' } = {} ) {
	return {
		content: text( content ),
		dirty: false,
		lintErrors: [],
		lintNotice: 0,
		buttonDisabled: false,
		saving: false,
		notice: null,
	};
}

/** The text changed: dirty, and the saved notice goes (theme-plugin-editor.js onChange()). */
export function edited( state, value ) {
	return { ...state, content: text( value ), dirty: true, notice: state.notice?.code === SAVED ? null : state.notice };
}

/** The linter's error annotations changed; with none, Update File is enabled again. */
export function linted( state, errors ) {
	const found = list( errors );
	return { ...state, lintErrors: found, buttonDisabled: found.length === 0 ? false : state.buttonDisabled };
}

/** The code editor shows its error notice: how many errors it tells, and Update File's `disabled` class. */
export function lintShown( state, annotations ) {
	const count = list( annotations ).length;
	return { ...state, lintNotice: count, buttonDisabled: count > 0 };
}

/** "Update anyway, even though it might break your site?": the errors no longer stop a save. */
export function updateAnyway( state ) {
	return { ...state, lintErrors: [], lintNotice: 0, buttonDisabled: false };
}

/** Whether Update File saves: no lint error is left, and no save runs. */
export const canSave = ( state ) => ! state.saving && state.lintErrors.length === 0;

/** A save starts: the previous save's notice goes. */
export function saving( state ) {
	return { ...state, saving: true, notice: null };
}

/** The save's answer: its message, dismissible, and the file is clean. */
export function saved( state, answer ) {
	return {
		...state,
		saving: false,
		dirty: false,
		notice: { code: SAVED, type: 'success', dismissible: true, markup: null, message: null, text: text( answer?.message ) },
	};
}

/**
 * The save failed: WordPress's notice (`data.notice`: the markup, and the PHP error's message
 * shown as text), else `fallback`, the text the page says for an error without one. The file
 * stays dirty.
 *
 * @param {object} state    The state.
 * @param {object} error    The API's error (`code`, `data.notice`).
 * @param {string} fallback The text without WordPress's notice.
 * @return {object} The state.
 */
export function failed( state, error, fallback ) {
	const notice = error?.data?.notice && typeof error.data.notice === 'object' ? error.data.notice : null;
	const markup = typeof notice?.markup === 'string' && notice.markup !== '' ? notice.markup : null;
	return {
		...state,
		saving: false,
		notice: {
			code: typeof error?.code === 'string' && error.code !== '' ? error.code : 'save_error',
			type: 'error',
			dismissible: true,
			markup,
			message: markup !== null && typeof notice?.message === 'string' && notice.message !== '' ? notice.message : null,
			text: markup === null ? text( fallback ) : null,
		},
	};
}

/** The save's notice is dismissed. */
export function dismissed( state ) {
	return { ...state, notice: null };
}
