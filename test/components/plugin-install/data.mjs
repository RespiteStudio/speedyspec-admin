// What wp_admin_get_plugin_install() and the Add Plugins routes answer
// (wp-includes/admin/plugin-install-page.php, class-wp-rest-admin-plugin-install-controller.php),
// built for the Add Plugins page's component tests, and the page mounted the way the router
// mounts it. A test passes what differs.
import { h, isRef } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

const request = ( path, body ) => ( { method: 'POST', path, body } );

/** A card's button, as _wp_admin_plugin_install_button() reads it. */
export const button = ( action, over = {} ) => {
	const buttons = {
		install: { action: 'install', label: 'Install Now', ariaLabel: 'Install E2E Test Plugin 1.0 now', disabled: false, file: null, request: request( 'plugins/install', { slug: 'e2e-test-plugin' } ) },
		update: { action: 'update', label: 'Update Now', ariaLabel: 'Update E2E Test Plugin 2.0 now', disabled: false, file: 'e2e-test-plugin/e2e-test-plugin.php', request: request( 'plugins/update', { plugin: 'e2e-test-plugin/e2e-test-plugin.php' } ) },
		activate: { action: 'activate', label: 'Activate', ariaLabel: 'Activate E2E Test Plugin', disabled: false, file: 'e2e-test-plugin/e2e-test-plugin.php', request: request( 'plugins/activate', { plugin: 'e2e-test-plugin/e2e-test-plugin.php' } ) },
		active: { action: 'active', label: 'Active', ariaLabel: null, disabled: true, file: null, request: null },
		installed: { action: 'installed', label: 'Installed', ariaLabel: null, disabled: true, file: null, request: null },
		incompatible: { action: 'incompatible', label: 'Install Now', ariaLabel: null, disabled: true, file: null, request: null },
	};
	return { ...buttons[ action ], ...over };
};

/** A card, as wp_admin_plugin_install_card() builds it. `over` replaces any of its keys. */
export const card = ( slug = 'e2e-test-plugin', over = {} ) => ( {
	slug,
	name: slug === 'e2e-test-plugin' ? 'E2E Test Plugin' : 'Plugin ' + slug,
	icon: null,
	description: 'Fixture  description',
	author: 'By <a href="https://example.org/">Fixture Author</a>',
	rating: { value: 4, full: 4, half: 0, empty: 1, label: '4.0 rating based on 5 ratings', count: 5, countText: '5' },
	activeInstalls: '1,000+ Active Installations',
	lastUpdated: '11 months ago',
	compatibility: { wordpress: true, php: true, tested: true, status: 'compatible', text: '<strong>Compatible</strong> with your version of WordPress', notice: null },
	button: button( 'install', slug === 'e2e-test-plugin' ? {} : { ariaLabel: 'Install Plugin ' + slug + ' 1.0 now', request: request( 'plugins/install', { slug } ) } ),
	detailsAction: true,
	dependencies: null,
	detailsSlug: slug,
	group: null,
	actionsHtml: null,
	...over,
} );

const TABS = [ [ 'featured', 'Featured' ], [ 'popular', 'Popular' ], [ 'recommended', 'Recommended' ], [ 'favorites', 'Favorites' ] ];

/** The tabs, with `current` the one shown. */
export const tabs = ( current = 'featured', extra = [] ) => [ ...TABS, ...extra ].map( ( [ key, label ] ) => ( { key, label, path: 'plugin-install.php?tab=' + key, current: key === current } ) );

export const UPLOAD = {
	label: 'Upload Plugin',
	browseLabel: 'Browse Plugins',
	help: 'If you have a plugin in a .zip format, you may install or update it by uploading it here.',
	fileLabel: 'Plugin zip file',
	submitLabel: 'Install Now',
	open: false,
	hooksHtml: null,
};

export const SEARCH = {
	term: '',
	type: 'term',
	types: [ { value: 'term', label: 'Keyword' }, { value: 'author', label: 'Author' }, { value: 'tag', label: 'Tag' } ],
	label: 'Search Plugins',
	typeLabel: 'Search plugins by:',
};

export const INTRO = 'Plugins extend and expand the functionality of WordPress. You may install plugins from the <a href="https://wordpress.org/plugins/">WordPress Plugin Directory</a> right on this page, or upload a plugin in .zip format by clicking the button above.';

/** The popular tags of Featured. */
export const TAGS = [
	{ name: 'fixture-big', path: 'plugin-install.php?tab=search&type=tag&s=fixture-big', count: 10, fontSize: '22pt', ariaLabel: 'fixture-big (10 plugins)' },
	{ name: 'fixture-small', path: 'plugin-install.php?tab=search&type=tag&s=fixture-small', count: 1, fontSize: '8pt', ariaLabel: 'fixture-small (1 plugin)' },
];

export const PAGINATION = { total: 3, totalText: '3 items', perPage: 36, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } };

/** The page's data for a tab. `over` replaces any of its keys. */
export const installData = ( tab = 'featured', over = {} ) => ( {
	context: 'site',
	query: { tab },
	refusal: null,
	title: 'Add Plugins',
	tab,
	information: null,
	headings: { views: 'Filter plugins list', pagination: 'Plugins list navigation', list: 'Plugins list' },
	intro: tab === 'upload' ? null : INTRO,
	upload: { ...UPLOAD, open: tab === 'upload' },
	tabs: tab === 'upload' ? [] : tabs( tab ),
	viewsHtml: null,
	search: tab === 'upload' || tab === 'favorites' ? null : { ...SEARCH },
	favorites: tab === 'favorites' ? { user: '', label: 'Your WordPress.org username:', help: 'If you have marked plugins as favorites on WordPress.org, you can browse them here.', submitLabel: 'Get Favorites' } : null,
	notice: null,
	showTable: tab !== 'upload',
	cards: tab === 'upload' ? [] : [ card( 'e2e-test-plugin' ), card( 'alpha' ) ],
	noItems: 'No plugins found. Try a different search.',
	apiError: false,
	pagination: tab === 'featured' || tab === 'upload' ? null : { ...PAGINATION },
	popularTags: tab === 'featured' ? TAGS : null,
	popularTagsError: null,
	tabHtml: null,
	dependencyNotices: [],
	bodyClasses: [ 'plugin-install-php', 'plugin-install-tab-' + tab ],
	...over,
} );

/** The answer of `POST plugins/install` (with the `plugin-install` part). */
export const installAnswer = ( over = {} ) => ( {
	slug: 'e2e-test-plugin',
	pluginName: 'E2E Test Plugin',
	plugin: 'e2e-test-plugin/e2e-test-plugin.php',
	activate: 'plugin',
	card: card( 'e2e-test-plugin', { button: button( 'activate' ) } ),
	...over,
} );

/** The answer of an upload (`POST plugins/upload`, `POST plugins/upload/{package}`). */
export const uploadAnswer = ( result = 'installed', over = {} ) => ( {
	heading: 'Installing plugin from uploaded file: e2e-test-plugin-1.0.zip',
	log: result === 'installed'
		? [ 'Unpacking the package&#8230;', 'Installing the plugin&#8230;', 'Plugin installed successfully.' ]
		: [ 'Unpacking the package&#8230;', 'Installing the plugin&#8230;' ],
	result,
	overwrite: null,
	actions: result === 'installed' ? [
		{ key: 'activate_plugin', label: 'Activate Plugin', path: null, request: { method: 'POST', route: 'plugins/activate', body: { plugin: 'e2e-test-plugin/e2e-test-plugin.php' } } },
		{ key: 'plugins_page', label: 'Go to Plugin Installer', path: 'plugin-install.php', request: null },
	] : [],
	actionsHtml: null,
	package: 41,
	...over,
} );

/** The overwrite comparison of an upload that `exists`. */
export const comparison = ( over = {} ) => ( {
	heading: 'This plugin is already installed.',
	columns: { current: 'Current', uploaded: 'Uploaded' },
	rows: [
		{ label: 'Plugin name', current: 'E2E Test Plugin', uploaded: 'E2E Test Plugin', differs: false },
		{ label: 'Version', current: '1.0', uploaded: '2.0', differs: false },
		{ label: 'Author', current: 'WordPress', uploaded: 'WordPress', differs: false },
		{ label: 'Required WordPress version', current: '-', uploaded: '-', differs: false },
		{ label: 'Required PHP version', current: '-', uploaded: '7.4', differs: true },
	],
	blocked: false,
	blockedIntro: 'The plugin cannot be updated due to the following:',
	warnings: [ 'You are updating a plugin. Be sure to <a href="https://developer.wordpress.org/advanced-administration/security/backup/">back up your database and files</a> first.' ],
	action: 'update-plugin',
	label: 'Replace current with uploaded',
	cancelLabel: 'Cancel and go back',
	expired: 'The uploaded file has expired. Please go back and upload it again.',
	tableHtml: null,
	actionsHtml: null,
	...over,
} );

export const loadContracts = () => fillContracts( [ 'plugin-install', 'list-table-nav', 'filesystem-credentials', 'plugin-information' ] );

/** A host that records what the page gives it: notices, speech, the router's targets and the frame's titles. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/plugin-install.php', search: '' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], refreshed: 0, titles: [] };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message, politeness ) => record.spoken.push( politeness ? [ message, politeness ] : message ),
		router: {
			navigate: async ( url, options ) => record.navigated.push( options ? [ url, options ] : url ),
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
 * Mounts Add Plugins (`core/plugin-install`) with `data` (or a ref of it, so that a test can give
 * the mounted page new data); `provide` adds to what it injects.
 */
export async function mountInstall( data = installData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/plugin-install', data: isRef( data ) ? data.value : data, page: { path: 'plugin-install.php', title: 'Add Plugins' } } ) }, {
		provide: { ...record.provide, ...provide },
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The card of a slug. */
export const cardOf = ( wrapper, slug ) => wrapper.find( '#the-list .plugin-card.plugin-card-' + slug );

/** The slugs of the cards shown, in order. */
export const cardSlugs = ( wrapper ) => wrapper.findAll( '#the-list .plugin-card' ).map( ( found ) => [ ...found.classes() ].find( ( name ) => name.startsWith( 'plugin-card-' ) && name !== 'plugin-card-update-failed' ).slice( 'plugin-card-'.length ) );

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
