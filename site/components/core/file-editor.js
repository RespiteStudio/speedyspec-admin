import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import { adminRelative, redirectTarget } from '../../runtime/router.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { SCREEN_ASSETS } from '../../kit/LegacyHtml.js';
import { adminHref } from './dashboard-parts/links.js';
import { DieError, failureText, usePageActions, usePageChrome } from './list-table-parts/page-chrome.js';
import { mountCodeEditor } from './file-editor/code-editor.js';
import { canSave, dismissed, edited, editorState, failed, linted, lintShown, saved, saving, updateAnyway } from './file-editor/state.js';
import FileEditorTree from './file-editor/tree.js';
import FileEditorWarning from './file-editor/warning.js';
import { FileEditorNotice, SaveNotice } from './file-editor/notices.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'code-editor' ];

const SAVE_ROUTE = 'wp-admin/v1/file-editor/save';
const WARNING_ROUTE = 'wp-admin/v1/file-editor/warning';
// The classic referer field (wp_referer_field()), which WordPress reads through wp_get_referer().
const REFERER_FIELD = '_wp_http_referer';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const isObject = ( value ) => Boolean( value ) && typeof value === 'object' && ! Array.isArray( value );

/** theme-plugin-editor.js's text for a save that failed without a message. */
const saveFallback = () => __( 'An error occurred while saving your changes. Please try again. If the problem persists, you may need to manually update the file via FTP.', 'default' );

/** Where a Go back path leads, as wp_admin_redirect_target() gives it: an admin path, or an absolute URL. Pure. */
export const backTarget = ( path ) => ( typeof path === 'string' && /^https?:\/\//i.test( path ) ? { location: path } : { redirect: typeof path === 'string' ? path : '' } );

/**
 * Default implementation of core/file-editor: the Theme File Editor (wp-admin/theme-editor.php)
 * and the Plugin File Editor (wp-admin/plugin-editor.php) in their classic markup: the notices,
 * the heading with the file and the selector (`.fileedit-sub`), the file list
 * (file-editor/tree.js), the form with the file's textarea, the documentation list, the editor's
 * notices and Update File, and the warning dialog (file-editor/warning.js). The body has the
 * classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data. The page reproduces theme-plugin-editor.js:
 *
 * - The textarea holds the file's text (a value, never markup); with code editor settings, core's
 *   wp.codeEditor runs on it once the screen's assets are loaded (file-editor/code-editor.js).
 * - Update File posts the page's save request with the text (`POST file-editor/save`); while it
 *   runs the text is read-only and the spinner shows; the answer's message, or WordPress's error
 *   notice, shows in the editor's notices. Lint errors stop the save until "Update anyway" is
 *   checked (file-editor/state.js). Ctrl+S or Cmd+S saves.
 * - While the text has unsaved changes, leaving the page asks `labels.leave`.
 * - Select opens the chosen theme or plugin, a file of the list opens it, and Look Up opens the
 *   chosen function's handbook address in a new tab.
 * - The warning shows on load when WordPress gives one: Go back returns to the page the editor was
 *   opened from, which WordPress decides from the referer field the page sends with the router's
 *   page (the router's previous page), else to `goBack.path`; I understand posts the dismissal
 *   (`POST file-editor/warning`) and closes it.
 */
export default {
	name: 'FileEditor',
	components: { DieError, InlineMarkup, FileEditorTree, FileEditorWarning, FileEditorNotice, SaveNotice },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const kind = computed( () => ( props.data?.kind === 'plugin' ? 'plugin' : 'theme' ) );
		const screen = computed( () => ( kind.value === 'plugin' ? 'plugin-editor.php' : 'theme-editor.php' ) );
		const { router, speak, where, say, follow } = usePageActions( { pathname: '/wp-admin/' + screen.value } );
		const pageState = inject( 'pageState', null );
		const screenAssets = inject( SCREEN_ASSETS, null );
		// `wp.codeEditor`, which tests provide; undefined is the window's.
		const givenCodeEditor = inject( 'codeEditorApi', undefined );

		const refusal = computed( () => ( isObject( props.data?.refusal ) ? props.data.refusal : null ) );
		const labels = computed( () => ( isObject( props.data?.labels ) ? props.data.labels : {} ) );
		const file = computed( () => ( isObject( props.data?.file ) ? props.data.file : null ) );
		const missing = computed( () => file.value?.missing === true );
		const shownContent = computed( () => typeof file.value?.content === 'string' );
		const save = computed( () => ( isObject( props.data?.save ) && isObject( props.data.save.request ) ? props.data.save : null ) );
		const selector = computed( () => ( isObject( props.data?.selector ) ? props.data.selector : null ) );
		const docs = computed( () => ( isObject( props.data?.docs ) && list( props.data.docs.options ).length > 0 ? props.data.docs : null ) );
		const dismissedNotices = ref( [] );
		const notices = computed( () => list( props.data?.notices ).filter( ( notice ) => isObject( notice ) && ! dismissedNotices.value.includes( notice.id ) ) );
		const topNotices = computed( () => notices.value.filter( ( notice ) => notice.place !== 'editor' ) );
		const editorNotices = computed( () => notices.value.filter( ( notice ) => notice.place === 'editor' && notice.type !== 'none' ) );
		const plainNotices = computed( () => notices.value.filter( ( notice ) => notice.place === 'editor' && notice.type === 'none' ) );
		const href = ( path ) => adminHref( path ?? '', where() );
		const open = ( path ) => {
			const url = href( path );
			if ( url !== '' ) {
				router?.navigate?.( url );
			}
		};

		// The form ----------------------------------------------------------------------------------

		const state = shallowRef( editorState( { content: file.value?.content ?? '' } ) );
		const textarea = ref( null );
		let editor = null;

		function update( next ) {
			state.value = next;
		}

		watch( () => state.value.dirty, ( dirty ) => {
			pageState?.setDirty?.( dirty );
			pageState?.setLeaveWarning?.( dirty ? labels.value.leave ?? null : null );
		} );

		function onBeforeUnload( event ) {
			if ( ! state.value.dirty ) {
				return undefined;
			}
			const message = labels.value.leave ?? '';
			event.preventDefault();
			event.returnValue = message;
			return message;
		}

		function startEditor() {
			if ( ! textarea.value ) {
				return;
			}
			textarea.value.value = file.value?.content ?? '';
			editor = mountCodeEditor( textarea.value, props.data?.codeEditor ?? false, {
				...( givenCodeEditor === undefined ? {} : { api: givenCodeEditor } ),
				ready: () => screenAssets?.ready?.(),
				onChange: ( value ) => update( edited( state.value, value ) ),
				onLintErrors: ( errors ) => update( linted( state.value, errors ) ),
				onLintNotice: ( annotations ) => update( lintShown( state.value, annotations ) ),
				onSave: () => submit(),
				onTabPrevious: () => {
					const tabbables = globalThis.document?.querySelectorAll?.( '#templateside [tabindex="0"], #templateside a[href]' ) ?? [];
					tabbables[ tabbables.length - 1 ]?.focus?.();
				},
				onTabNext: () => globalThis.document?.querySelector?.( '#template #docs-list, #template #submit' )?.focus?.(),
			} );
		}

		async function submit() {
			if ( ! save.value || ! editor || state.value.saving ) {
				return;
			}
			editor.updateErrorNotice();
			if ( ! canSave( state.value ) ) {
				editor.focusError();
				return;
			}
			const newcontent = editor.value();
			update( saving( state.value ) );
			editor.setReadOnly( true );
			try {
				const answer = await api.post( SAVE_ROUTE, { ...save.value.request, newcontent } );
				update( saved( { ...state.value, content: newcontent }, answer ) );
				speak( state.value.notice?.text ?? '' );
				emit( 'saved', answer );
			} catch ( error ) {
				console.warn( 'The file could not be saved.', error );
				update( failed( state.value, error, failureText( error, saveFallback() ) ) );
				const notice = state.value.notice;
				speak( notice?.text ?? plainText( notice?.markup ) );
			} finally {
				editor?.setReadOnly( false );
			}
		}

		/** The text of inline markup, as a screen reader hears it. */
		function plainText( markup ) {
			const value = typeof markup === 'string' ? markup : '';
			if ( typeof globalThis.DOMParser === 'function' ) {
				return new globalThis.DOMParser().parseFromString( value, 'text/html' ).body.textContent ?? '';
			}
			return value.replace( /<[^>]*>/g, '' );
		}

		// theme-plugin-editor.js: Ctrl+S or Cmd+S outside CodeMirror saves (CodeMirror has its own keys).
		function onKeydown( event ) {
			if ( ( event.ctrlKey || event.metaKey ) && typeof event.key === 'string' && event.key.toLowerCase() === 's' && ! editor?.hasFocus?.() && save.value ) {
				event.preventDefault();
				submit();
			}
		}

		// The selector and the documentation --------------------------------------------------------

		const chosen = ref( '' );
		watch( selector, ( value ) => {
			chosen.value = list( value?.options ).find( ( option ) => option?.selected === true )?.value ?? list( value?.options )[ 0 ]?.value ?? '';
		}, { immediate: true } );

		function select() {
			const name = selector.value?.name === 'plugin' ? 'plugin' : 'theme';
			open( screen.value + '?' + new URLSearchParams( { [ name ]: chosen.value } ).toString() );
		}

		const docChoice = ref( '' );
		function lookUp() {
			const option = list( docs.value?.options ).find( ( item ) => item?.name === docChoice.value );
			if ( option && typeof option.url === 'string' && /^https:\/\//i.test( option.url ) ) {
				globalThis.window?.open?.( option.url, '_blank', 'noopener' );
			}
		}

		// The warning -------------------------------------------------------------------------------

		const warning = ref( isObject( props.data?.warning ) ? props.data.warning : null );
		const backPath = ref( typeof warning.value?.goBack?.path === 'string' ? warning.value.goBack.path : '' );
		const backHref = computed( () => {
			const target = redirectTarget( backTarget( backPath.value ), where() );
			return target?.url ?? '';
		} );
		let backDecided = Promise.resolve();

		/**
		 * Asks WordPress where Go back leads from the page the editor was opened from (the router's
		 * previous page, sent as the referer field), as classic reads the browser's referer.
		 */
		async function decideBack() {
			const previous = router?.previousUrl?.() ?? null;
			const relative = typeof previous === 'string' ? adminRelative( previous ) : '';
			if ( relative === '' || typeof router?.lookup !== 'function' ) {
				return;
			}
			const shown = where();
			const params = new URLSearchParams( String( shown.search ?? '' ).replace( /^\?/, '' ) );
			params.set( REFERER_FIELD, relative );
			try {
				const manifest = await router.lookup( shown.pathname + '?' + params.toString() );
				const path = manifest?.page?.data?.warning?.goBack?.path;
				if ( typeof path === 'string' ) {
					backPath.value = path;
				}
			} catch ( error ) {
				console.warn( 'Where Go back leads could not be read.', error );
			}
		}

		async function goBack() {
			await backDecided;
			await follow( backTarget( backPath.value ) );
		}

		async function dismissWarning() {
			const request = warning.value?.dismiss?.request;
			warning.value = null;
			if ( ! isObject( request ) ) {
				return;
			}
			try {
				await api.post( WARNING_ROUTE, request );
			} catch ( error ) {
				console.warn( 'The warning could not be dismissed.', error );
				await say( failureText( error ), { focus: false } );
			}
		}

		// Showing -----------------------------------------------------------------------------------

		onMounted( async () => {
			globalThis.window?.addEventListener?.( 'beforeunload', onBeforeUnload );
			globalThis.window?.addEventListener?.( 'keydown', onKeydown );
			if ( typeof props.data?.location === 'string' && props.data.location !== '' ) {
				await follow( { location: props.data.location } );
				return;
			}
			await nextTick();
			startEditor();
			if ( warning.value ) {
				backDecided = decideBack();
			}
		} );
		onBeforeUnmount( () => {
			globalThis.window?.removeEventListener?.( 'beforeunload', onBeforeUnload );
			globalThis.window?.removeEventListener?.( 'keydown', onKeydown );
			editor?.destroy();
			editor = null;
			if ( state.value.dirty ) {
				pageState?.setDirty?.( false );
				pageState?.setLeaveWarning?.( null );
			}
		} );

		const dismissNotice = ( id ) => {
			dismissedNotices.value = [ ...dismissedNotices.value, id ];
		};

		return {
			pageFailed,
			refusal,
			kind,
			labels,
			file,
			missing,
			shownContent,
			save,
			selector,
			chosen,
			select,
			docs,
			docChoice,
			lookUp,
			topNotices,
			editorNotices,
			plainNotices,
			dismissNotice,
			href,
			open,
			state,
			textarea,
			submit,
			updateAnyway: () => update( updateAnyway( state.value ) ),
			dismissSaveNotice: () => update( dismissed( state.value ) ),
			warning,
			backHref,
			goBack,
			dismissWarning,
			speak,
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-file-editor-failed">{{ $__( 'The file editor could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-file-editor-error" />
		<div v-else-if="file" class="wp-admin-file-editor">
			<FileEditorNotice v-for="notice in topNotices" :key="notice.id" :notice="notice" :dismiss-label="labels.dismiss ?? ''" @dismiss="dismissNotice( notice.id )" />

			<div class="fileedit-sub">
				<div class="alignleft">
					<h2><InlineMarkup :html="data.heading ?? ''" /></h2>
					{{ ' ' }}<span><strong>{{ data.fileLabel }}</strong></span>
				</div>
				<div v-if="selector" class="alignright">
					<form :action="kind === 'plugin' ? 'plugin-editor.php' : 'theme-editor.php'" method="get" @submit.prevent="select">
						<label :for="kind" id="theme-plugin-editor-selector">{{ selector.label }} </label>
						<select :name="kind" :id="kind" v-model="chosen">
							<option v-for="option in selector.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
						</select>
						{{ ' ' }}<input type="submit" name="Submit" id="Submit" class="button" :value="selector.submit">
					</form>
				</div>
				<br class="clear" />
			</div>

			<FileEditorTree :kind="kind" :label="data.treeLabel ?? ''" :note="data.treeNote ?? null" :tree="data.tree ?? []" :href="href" @open="open" />

			<template v-if="missing">
				<FileEditorNotice v-for="notice in editorNotices" :key="notice.id" :notice="notice" :dismiss-label="labels.dismiss ?? ''" @dismiss="dismissNotice( notice.id )" />
			</template>
			<form v-else name="template" id="template" :action="kind === 'plugin' ? 'plugin-editor.php' : 'theme-editor.php'" method="post" @submit.prevent="submit">
				<div>
					<label for="newcontent" id="theme-plugin-editor-label">{{ file.label }}</label>
					<textarea v-if="shownContent" ref="textarea" cols="70" :rows="kind === 'plugin' ? 25 : 30" name="newcontent" id="newcontent" aria-describedby="editor-keyboard-trap-help-1 editor-keyboard-trap-help-2 editor-keyboard-trap-help-3 editor-keyboard-trap-help-4"></textarea>
				</div>

				<div v-if="docs" id="documentation" class="hide-if-no-js">
					<label for="docs-list">{{ docs.label }}</label>
					{{ ' ' }}<select name="docs-list" id="docs-list" v-model="docChoice">
						<option value="">{{ docs.placeholder }}</option>
						<option v-for="option in docs.options" :key="option.name" :value="option.name">{{ option.name }}()</option>
					</select>
					{{ ' ' }}<input :disabled="docChoice === ''" id="docs-lookup" type="button" class="button" :value="docs.lookup" @click="lookUp">
				</div>

				<div>
					<div class="editor-notices">
						<FileEditorNotice v-for="notice in editorNotices" :key="notice.id" :notice="notice" inline :dismiss-label="labels.dismiss ?? ''" @dismiss="dismissNotice( notice.id )" />
						<SaveNotice v-if="state.lintNotice > 0" :lint-count="state.lintNotice" :labels="labels" @update-anyway="updateAnyway" />
						<SaveNotice v-if="state.notice" :notice="state.notice" :labels="labels" @dismiss="dismissSaveNotice" />
					</div>
					<FileEditorNotice v-for="notice in plainNotices" :key="notice.id" :notice="notice" />
					<p v-if="save && shownContent" class="submit">
						<input type="submit" name="submit" id="submit" :class="[ 'button', 'button-primary', { disabled: state.buttonDisabled } ]" :value="save.label">
						{{ ' ' }}<span :class="[ 'spinner', { 'is-active': state.saving } ]"></span>
					</p>
				</div>
			</form>
			<br class="clear" />

			<FileEditorWarning v-if="warning" :warning="warning" :href="backHref" :speak="speak" @back="goBack" @dismiss="dismissWarning" />
		</div>
	`,
};
