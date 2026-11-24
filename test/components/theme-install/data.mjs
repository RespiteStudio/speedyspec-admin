// What wp_admin_get_theme_install() and the Add Themes routes answer
// (wp-includes/admin/theme-install-page.php, class-wp-rest-admin-theme-install-controller.php),
// built for the Add Themes page's component tests, and the page mounted the way the router mounts
// it. A test passes what differs.
import { afterEach } from '@jest/globals';
import { h, isRef } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

export const DIRECTORY = 'wp-admin/v1/themes/directory';
export const INSTALL = 'wp-admin/v1/themes/install';
export const UPLOAD = 'wp-admin/v1/themes/upload';

/** A package request, as the cards give it (`{ method, route, body }`). */
export const request = ( route, body ) => ( { method: 'POST', route, body } );

/** A card's button, as _wp_admin_theme_directory_button() gives it. */
export const button = ( action, slug = 'e2e-test-theme', name = 'E2E Test Theme' ) => ( {
	install: { action, label: 'Install', ariaLabel: 'Install ' + name, disabled: false, request: request( 'themes/install', { slug } ) },
	incompatible: { action, label: 'Cannot Install', ariaLabel: 'Cannot Install ' + name, disabled: true, request: null },
	activate: { action, label: 'Activate', ariaLabel: 'Activate ' + name, disabled: false, request: request( 'themes/activate', { stylesheet: slug } ) },
	active: { action, label: 'Activated', ariaLabel: null, disabled: true, request: null },
	'cannot-activate': { action, label: 'Cannot Activate', ariaLabel: 'Cannot Activate ' + name, disabled: true, request: null },
}[ action ] );

/** A card, as wp_admin_theme_directory_card() builds it. `over` replaces any of its keys. */
export const card = ( slug = 'e2e-test-theme', over = {} ) => {
	const name = over.name ?? ( slug === 'e2e-test-theme' ? 'E2E Test Theme' : 'Theme ' + slug );
	return {
		slug,
		name,
		author: 'Fixture Author',
		version: '1.0',
		screenshot: `https://wp-themes.invalid/${ slug }/screenshot.png?ver=1.0`,
		description: 'Fixture  description',
		rating: { value: 4, label: '4.0 rating based on 5 ratings', count: 5, text: '(5 ratings)', rated: true, reviewsUrl: `https://wordpress.org/support/theme/${ slug }/reviews/` },
		previewUrl: `https://wp-themes.invalid/${ slug }/`,
		compatibility: { wordpress: true, php: true, message: null },
		installed: false,
		active: false,
		blockTheme: false,
		button: button( 'install', slug, name ),
		customize: null,
		preview: { label: 'Preview', disabled: false },
		...over,
	};
};

/** The cards of page 1 of the canned directory. */
export const CARDS = () => [
	card( 'e2e-test-theme' ),
	card( 'detached-needs-php', {
		name: 'Detached Needs PHP',
		compatibility: { wordpress: true, php: false, message: 'This theme does not work with your version of PHP. <a href="https://wordpress.org/support/update-php/">Learn more about updating PHP</a>.' },
		button: button( 'incompatible', 'detached-needs-php', 'Detached Needs PHP' ),
		preview: { label: 'Preview', disabled: true },
	} ),
	card( 'detached-block', { name: 'Detached Block', blockTheme: true } ),
];

/** A directory answer. */
export const directory = ( themes = CARDS(), info = {} ) => ( { info: { page: 1, pages: 1, results: themes.length, ...info }, themes } );

export const LABELS = {
	addNew: 'Add Theme',
	search: 'Search Themes',
	upload: 'Upload Theme',
	back: 'Back',
	error: 'An unexpected error occurred. Something may be wrong with WordPress.org or this server&#8217;s configuration. If you continue to have problems, please try the <a href="https://wordpress.org/support/forums/">support forums</a>.',
	tryAgain: 'Try Again',
	themesFound: 'Number of Themes found: %d',
	noThemesFound: 'No themes found. Try a different search.',
	themeViewed: 'Theme details: %s',
	collapseSidebar: 'Collapse Sidebar',
	expandSidebar: 'Expand Sidebar',
	selectFeatureFilter: 'Select one or more Theme features to filter by',
	noJs: 'The Theme Installer screen requires JavaScript.',
	filterHeading: 'Filter themes list',
	listHeading: 'Themes list',
	featureFilter: 'Feature Filter',
	applyFilters: 'Apply Filters',
	clear: 'Clear',
	clearFilters: 'Clear current filters',
	filteringBy: 'Filtering by:',
	editFilters: 'Edit Filters',
	overlay: 'Browse Themes',
	installed: 'Installed',
	details: 'Details &amp; Preview',
	by: 'By %s',
	close: 'Close',
	previous: 'Previous',
	next: 'Next',
	version: 'Version: %s',
	collapse: 'Collapse',
	previewFrame: 'Preview',
};

export const UPLOAD_FORM = {
	label: 'Upload Theme',
	help: 'If you have a theme in a .zip format, you may install or update it by uploading it here.',
	browseLabel: 'Browse Themes',
	fileLabel: 'Theme zip file',
	submitLabel: 'Install Now',
	open: false,
};

export const FEATURES = [
	{ group: 'Layout', features: [ { value: 'grid-layout', label: 'Grid Layout' }, { value: 'one-column', label: 'One Column' } ] },
	{ group: 'Features', features: [ { value: 'custom-colors', label: 'Custom Colors' }, { value: 'blog', label: 'Blog' } ] },
];

export const TABS = [
	{ key: 'popular', label: 'Popular' },
	{ key: 'new', label: 'Latest' },
	{ key: 'block-themes', label: 'Block Themes' },
	{ key: 'favorites', label: 'Favorites' },
];

/** The page's data. `over` replaces any of its keys. */
export const installData = ( over = {} ) => ( {
	context: 'site',
	query: { browse: 'popular' },
	refusal: null,
	title: 'Add Themes',
	bodyClasses: [ 'theme-install-php' ],
	upload: UPLOAD_FORM,
	tabs: TABS,
	browse: 'popular',
	search: { term: '', label: 'Search Themes', typeLabel: 'The search results will be updated as you type.' },
	features: FEATURES,
	favorites: { user: '', help: 'If you have marked themes as favorites on WordPress.org, you can browse them here.', label: 'Your WordPress.org username:', button: 'Get Favorites' },
	labels: LABELS,
	open: null,
	tabHtml: null,
	...over,
} );

/** The answer of `POST themes/install` (with the `theme-install` part, the card's local decisions). */
export const installAnswer = ( slug = 'e2e-test-theme', over = {} ) => ( {
	slug,
	themeName: 'E2E Test Theme',
	activate: { request: request( 'themes/activate', { stylesheet: slug } ) },
	customize: { path: `customize.php?theme=${ slug }&return=%2Fwp-admin%2Ftheme-install.php` },
	blockTheme: false,
	card: {
		installed: true,
		active: false,
		blockTheme: false,
		button: button( 'activate', slug ),
		customize: { path: `customize.php?theme=${ slug }&return=%2Fwp-admin%2Ftheme-install.php`, label: 'Live Preview', disabled: false },
		preview: { label: 'Preview', disabled: false },
	},
	...over,
} );

/** The answer of an upload (`POST themes/upload`), as Task 4's upload step gives it. */
export const uploadAnswer = ( result = 'installed', over = {} ) => ( {
	heading: 'Installing theme from uploaded file: e2e-test-theme.zip',
	log: [ 'Unpacking the package&#8230;', 'Installing the theme&#8230;', 'Theme installed successfully.' ],
	result,
	overwrite: null,
	actions: result === 'installed' ? [
		{ key: 'preview', label: 'Live Preview', path: 'customize.php?theme=e2e-test-theme', request: null },
		{ key: 'activate', label: 'Activate', path: null, request: { method: 'POST', route: 'themes/activate', body: { stylesheet: 'e2e-test-theme' } } },
		{ key: 'themes_page', label: 'Go to Themes page', path: 'themes.php', request: null },
	] : [],
	actionsHtml: null,
	package: result === 'exists' ? 41 : null,
	...over,
} );

/** The overwrite comparison of an upload that found its theme installed. */
export const comparison = ( over = {} ) => ( {
	heading: 'This theme is already installed.',
	columns: { current: 'Installed', uploaded: 'Uploaded' },
	rows: [
		{ label: 'Theme name', current: 'E2E Test Theme', uploaded: 'E2E Test Theme', differs: false },
		{ label: 'Version', current: '1.0', uploaded: '2.0', differs: false },
		{ label: 'Author', current: 'WordPress', uploaded: 'WordPress', differs: false },
		{ label: 'Required WordPress version', current: '-', uploaded: '-', differs: false },
		{ label: 'Required PHP version', current: '-', uploaded: '99.0', differs: true },
		{ label: 'Parent theme', current: '-', uploaded: '-', differs: false },
	],
	blocked: false,
	blockedIntro: 'The theme cannot be updated due to the following:',
	warnings: [ 'You are updating a theme. Be sure to <a href="https://developer.wordpress.org/advanced-administration/security/backup/">back up your database and files</a> first.' ],
	action: 'update-theme',
	label: 'Replace installed with uploaded',
	cancelLabel: 'Cancel and go back',
	expired: 'The uploaded file has expired. Please go back and upload it again.',
	tableHtml: null,
	actionsHtml: null,
	...over,
} );

export const loadContracts = () => fillContracts( [ 'theme-install', 'filesystem-credentials' ] );

/** A host that records what the page gives it: notices, speech, the router's targets and addresses. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/theme-install.php', search: '' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], addressed: [], refreshed: 0, titles: [] };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message, politeness ) => record.spoken.push( politeness ? [ message, politeness ] : message ),
		router: {
			navigate: async ( url, options ) => record.navigated.push( options ? [ url, options ] : url ),
			// The address of the page shown changed without a router read (router.js setAddress()).
			setAddress: ( url, options ) => record.addressed.push( [ url, options ] ) > 0,
			follow: async ( answer ) => record.followed.push( answer ),
			refresh: async () => {
				record.refreshed++;
			},
		},
		frameChannel: { setTitle: ( title ) => record.titles.push( title ) },
		pageLocation: location,
	};
	return record;
}

/**
 * Mounts Add Themes (`core/theme-install`) with `data` (or a ref of it, so that a test can give
 * the mounted page new data); `provide` adds to what it injects.
 */
export async function mountInstall( data = installData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/theme-install', data: isRef( data ) ? data.value : data, page: { path: 'theme-install.php', title: 'Add Themes' } } ) }, {
		provide: { ...record.provide, ...provide },
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The card of a slug. */
export const cardOf = ( wrapper, slug ) => wrapper.find( `.theme-browser .themes .theme[data-slug="${ slug }"]` );

/** The slugs of the cards shown, in order. */
export const cardSlugs = ( wrapper ) => wrapper.findAll( '.theme-browser .themes .theme' ).map( ( found ) => found.attributes( 'data-slug' ) );

/** The open preview. */
export const previewOf = ( wrapper ) => wrapper.find( 'div.theme-install-overlay[role="dialog"]' );

/** The directory reads made, as their query. */
export const reads = ( calls ) => calls.filter( ( call ) => call.route === DIRECTORY ).map( ( call ) => call.payload );

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure', data = null ) => Object.assign( new Error( message ), { status, code, data } );

/** The `fs_credentials_required` error a package route answers without credentials. */
export const credentialsError = ( extra = {} ) => apiError( 'Filesystem credentials are required.', 400, 'fs_credentials_required', {
	status: 400,
	form: {
		heading: 'Connection Information',
		headingLevel: 1,
		description: 'To perform the requested action, WordPress needs to access your web server.',
		error: null,
		labels: { username: 'FTP Username', password: 'FTP Password' },
		types: [ { value: 'ftp', label: 'FTP' } ],
		connectionType: 'ftp',
		hostname: '',
		username: '',
		publicKey: '',
		privateKey: '',
		hostnameLocked: false,
		usernameLocked: false,
		passwordLocked: false,
		connectionTypeLocked: false,
		publicKeyLocked: false,
		privateKeyLocked: false,
	},
	...extra,
} );

/** Stubs window.jQuery, recording each document trigger as `[ name, detail ]`. */
export function stubJQuery() {
	const triggers = [];
	window.jQuery = ( target ) => ( {
		trigger: ( name, detail ) => {
			if ( target === document ) {
				triggers.push( [ name, detail ] );
			}
		},
	} );
	return triggers;
}

/**
 * Stubs IntersectionObserver: each observer is recorded with what it observes; `fire( observer )`
 * tells it its target came into view. Restored after each test.
 */
export function stubObserver() {
	const observers = [];
	window.IntersectionObserver = class {
		constructor( callback ) {
			this.callback = callback;
			this.targets = [];
			this.disconnected = false;
			observers.push( this );
		}

		observe( target ) {
			this.targets.push( target );
		}

		disconnect() {
			this.disconnected = true;
			this.targets = [];
		}
	};
	const fire = ( observer ) => observer.callback( observer.targets.map( ( target ) => ( { target, isIntersecting: true } ) ) );
	return { observers, live: () => observers.filter( ( item ) => ! item.disconnected && item.targets.length > 0 ), fire };
}

const savedObserver = globalThis.window?.IntersectionObserver;
afterEach( () => {
	if ( globalThis.window ) {
		if ( savedObserver === undefined ) {
			delete window.IntersectionObserver;
		} else {
			window.IntersectionObserver = savedObserver;
		}
	}
} );
