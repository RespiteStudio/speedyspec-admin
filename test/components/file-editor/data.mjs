// What wp_admin_get_theme_editor(), wp_admin_get_plugin_editor() and the file editor routes
// answer (wp-includes/admin/file-editor-page.php, class-wp-rest-admin-file-editor-controller.php),
// built for the file editors' component tests, and the page mounted the way the router mounts it.
// A test passes what differs.
import { h, isRef } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { SCREEN_ASSETS } from '../../../site/kit/LegacyHtml.js';

export { settle };

export const LABELS = {
	phpError: 'Your PHP code changes were not applied due to an error on line %1$s of file %2$s. Please fix and try saving again.',
	fileNotWritable: 'You need to make this file writable before you can save your changes. See <a href="https://developer.wordpress.org/advanced-administration/server/file-permissions/">Changing File Permissions</a> for more information.',
	lintErrors: 'Update anyway, even though it might break your site?',
	dismiss: 'Dismiss',
	leave: 'The changes you made will be lost if you navigate away from this page.',
};

/** A file of the tree (_wp_admin_file_editor_tree()). */
export const leaf = ( label, path, over = {} ) => ( { label, detail: null, path, current: false, children: [], ...over } );

/** A folder of the tree. */
export const folder = ( label, children ) => ( { label, detail: null, path: null, current: false, children } );

const themePath = ( file, theme = 'twentytwentyone' ) => 'theme-editor.php?' + new URLSearchParams( { file, theme } ).toString().replace( /\+/g, '%20' );

/** The tree of the default theme data: style.css, functions.php (open), and a folder with two files. */
export const THEME_TREE = () => [
	leaf( 'Stylesheet', themePath( 'style.css' ), { detail: 'style.css' } ),
	leaf( 'Theme Functions', themePath( 'functions.php' ), { detail: 'functions.php', current: true } ),
	folder( 'template-parts', [
		leaf( 'header.php', themePath( 'template-parts/header.php' ) ),
		leaf( 'footer.php', themePath( 'template-parts/footer.php' ) ),
	] ),
];

/** The CodeMirror settings wp_get_code_editor_settings() gives a PHP file (trimmed). */
export const CODE_EDITOR = { codemirror: { mode: 'php', lint: false }, csslint: {}, jshint: {}, htmlhint: {} };

/** The Theme File Editor's data for functions.php of the active theme. `over` replaces any of its keys. */
export const themeEditorData = ( over = {} ) => ( {
	kind: 'theme',
	context: 'site',
	query: { file: 'functions.php' },
	refusal: null,
	title: 'Edit Themes',
	bodyClasses: [ 'theme-editor-php' ],
	menuCurrent: 'theme-editor.php',
	heading: 'Editing <strong>Twenty Twenty-One</strong> (active)',
	fileLabel: 'File: functions.php',
	selector: {
		label: 'Select theme to edit:',
		name: 'theme',
		submit: 'Select',
		options: [
			{ value: 'twentytwentyfive', label: 'Twenty Twenty-Five', selected: false },
			{ value: 'twentytwentyone', label: 'Twenty Twenty-One', selected: true },
		],
	},
	treeLabel: 'Theme Files',
	treeNote: null,
	tree: THEME_TREE(),
	file: { relative: 'functions.php', content: "<?php\n// Functions.\n", writable: true, extension: 'php', missing: false, label: 'Selected file content:' },
	codeEditor: CODE_EDITOR,
	docs: {
		label: 'Documentation:',
		placeholder: 'Function Name…',
		lookup: 'Look Up',
		options: [
			{ name: 'add_action', url: 'https://api.wordpress.org/core/handbook/1.0/?function=add_action&locale=en_US&version=7.3&redirect=true' },
			{ name: 'wp_enqueue_style', url: 'https://api.wordpress.org/core/handbook/1.0/?function=wp_enqueue_style&locale=en_US&version=7.3&redirect=true' },
		],
	},
	notices: [],
	warning: null,
	save: { request: { kind: 'theme', theme: 'twentytwentyone', file: 'functions.php', nonce: 'abc123' }, label: 'Update File' },
	labels: LABELS,
	...over,
} );

/** The Plugin File Editor's data for a folder plugin's main file. */
export const pluginEditorData = ( over = {} ) => themeEditorData( {
	kind: 'plugin',
	query: { plugin: 'akismet/akismet.php' },
	title: 'Edit Plugins',
	bodyClasses: [ 'plugin-editor-php' ],
	menuCurrent: 'plugin-editor.php',
	heading: 'Editing <strong>Akismet</strong> (inactive)',
	fileLabel: 'File: akismet/akismet.php',
	selector: {
		label: 'Select plugin to edit:',
		name: 'plugin',
		submit: 'Select',
		options: [
			{ value: 'akismet/akismet.php', label: 'Akismet', selected: true },
			{ value: 'hello.php', label: 'Hello Dolly', selected: false },
		],
	},
	treeLabel: 'Plugin Files',
	tree: [
		leaf( 'akismet.php', 'plugin-editor.php?file=akismet%2Fakismet.php&plugin=akismet%2Fakismet.php', { current: true } ),
		folder( 'inc', [ leaf( 'a.php', 'plugin-editor.php?file=akismet%2Finc%2Fa.php&plugin=akismet%2Fakismet.php' ) ] ),
	],
	file: { relative: 'akismet/akismet.php', content: "<?php\n/* Plugin Name: Akismet */\n", writable: true, extension: 'php', missing: false, label: 'Selected file content:' },
	save: { request: { kind: 'plugin', plugin: 'akismet/akismet.php', file: 'akismet/akismet.php', nonce: 'def456' }, label: 'Update File' },
	...over,
} );

/** The warning dialog of a theme editor not yet dismissed. */
export const warning = ( over = {} ) => ( {
	heading: 'Heads up!',
	paragraphs: [
		'You appear to be making direct edits to your theme in the WordPress dashboard. It is not recommended! Editing your theme directly could break your site and your changes may be lost in future updates.',
		'If you need to tweak more than your theme’s CSS, you might want to try <a href="https://developer.wordpress.org/themes/advanced-topics/child-themes/">making a child theme</a>.',
	],
	goBack: { label: 'Go back', path: '' },
	dismiss: { label: 'I understand', request: { pointer: 'theme_editor_notice' } },
	...over,
} );

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure', data = null ) => Object.assign( new Error( message ), { status, code, data } );

export const loadContracts = () => fillContracts( [ 'file-editor' ] );

/** A host that records what the page gives it: notices, speech, the router's targets, the leave warning, the frame's titles. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/theme-editor.php', search: '?file=functions.php' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], looked: [], titles: [], dirty: [], leave: [], previous: null, lookupAnswer: null };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message, politeness ) => record.spoken.push( politeness ? [ message, politeness ] : message ),
		router: {
			navigate: async ( url, options ) => record.navigated.push( options ? [ url, options ] : url ),
			follow: async ( answer ) => record.followed.push( answer ),
			previousUrl: () => record.previous,
			lookup: async ( url ) => {
				record.looked.push( url );
				return record.lookupAnswer;
			},
		},
		pageState: {
			setDirty: ( value ) => record.dirty.push( value ),
			isDirty: () => record.dirty.at( -1 ) ?? false,
			setLeaveWarning: ( message ) => record.leave.push( message ),
		},
		frameChannel: { setTitle: ( title ) => record.titles.push( title ) },
		pageLocation: location,
		[ SCREEN_ASSETS ]: { ready: () => Promise.resolve() },
	};
	return record;
}

/**
 * Mounts a file editor (`core/file-editor`) with `data` (or a ref of it); `provide` adds to what it
 * injects.
 */
export async function mountEditor( data = themeEditorData(), record = host(), provide = {} ) {
	const value = isRef( data ) ? data.value : data;
	const path = value.kind === 'plugin' ? 'plugin-editor.php' : 'theme-editor.php';
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/file-editor', data: isRef( data ) ? data.value : data, page: { path, title: value.title } } ) }, {
		provide: { ...record.provide, ...provide },
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/**
 * A stand-in for core's wp.codeEditor (code-editor.js): initialize() gives an instance whose
 * CodeMirror records its options, change handlers and cursor; `lint( errors )` reports errors the
 * way code-editor.js's onUpdateLinting does (onChangeLintingErrors, then onUpdateErrorNotice).
 */
export function fakeCodeEditor() {
	const made = [];
	const codeEditor = {
		defaultSettings: {},
		initialize( textarea, settings ) {
			const handlers = {};
			const options = { readOnly: false, extraKeys: null };
			let value = textarea.value;
			const lineDiv = document.createElement( 'div' );
			const codemirror = {
				options,
				cursor: null,
				focused: false,
				display: { lineDiv },
				on: ( name, fn ) => {
					( handlers[ name ] ??= [] ).push( fn );
				},
				getValue: () => value,
				setValue: ( next ) => {
					value = next;
					( handlers.change ?? [] ).forEach( ( fn ) => fn( codemirror ) );
				},
				setOption: ( name, next ) => {
					options[ name ] = next;
				},
				getOption: ( name ) => options[ name ],
				setCursor: ( line ) => {
					codemirror.cursor = line;
				},
				focus: () => {
					codemirror.focused = true;
				},
				hasFocus: () => codemirror.focused,
				toTextArea: () => {
					codemirror.removed = true;
				},
			};
			const instance = {
				settings,
				codemirror,
				textarea,
				shown: [],
				updateErrorNotice: () => {
					settings.onUpdateErrorNotice?.( instance.errors ?? [], codemirror );
				},
				lint( errors ) {
					instance.errors = errors;
					settings.onChangeLintingErrors?.( errors, errors, errors, codemirror );
					settings.onUpdateErrorNotice?.( errors, codemirror );
				},
			};
			made.push( instance );
			return instance;
		},
	};
	return { codeEditor, made };
}

/** A lint error annotation of CodeMirror on a line. */
export const lintError = ( line = 2 ) => ( { severity: 'error', message: 'Expected RBRACE.', from: { line, ch: 0 }, to: { line, ch: 1 } } );
