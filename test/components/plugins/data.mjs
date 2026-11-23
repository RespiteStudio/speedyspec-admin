// What wp_admin_get_plugins_list() and the Plugins routes answer (wp-includes/admin/plugins-page.php,
// class-wp-rest-admin-plugins-controller.php), built for the Plugins list's component tests, and the
// page mounted the way the router mounts it. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { column } from '../../helpers/list-table.mjs';

export { column, settle };

const request = ( path, body ) => ( { method: 'POST', path, body } );

/** The core actions of an inactive plugin: Activate and Delete. */
export const inactiveActions = ( file, slug, name, { uninstallable = false } = {} ) => [
	{ action: 'activate', text: 'Activate', ariaLabel: 'Activate ' + name, htmlId: 'activate-' + slug, request: request( 'plugins/activate', { plugin: file } ), disabled: false, reason: null, confirm: null },
	{ action: 'delete', text: 'Delete', ariaLabel: 'Delete ' + name, htmlId: 'delete-' + slug, request: request( 'plugins/delete', { plugin: file } ), disabled: false, reason: null, confirm: uninstallable ? 'Are you sure you want to delete ' + name + ' and its data?' : 'Are you sure you want to delete ' + name + '?' },
];

/** The core action of an active plugin: Deactivate. */
export const activeActions = ( file, slug, name ) => [
	{ action: 'deactivate', text: 'Deactivate', ariaLabel: 'Deactivate ' + name, htmlId: 'deactivate-' + slug, request: request( 'plugins/deactivate', { plugin: file } ), disabled: false, reason: null, confirm: null },
];

/** The auto-updates cell of a plugin that may be auto-updated. */
export const autoUpdate = ( file, enabled = false, over = {} ) => ( {
	enabled,
	forced: false,
	text: enabled ? 'Disable auto-updates' : 'Enable auto-updates',
	request: request( 'plugins/auto-updates', { plugin: file, state: enabled ? 'disable' : 'enable' } ),
	nextUpdate: null,
	nextUpdateShown: false,
	html: null,
	...over,
} );

/** The update row of a plugin with an update to `version`. */
export const update = ( file, slug, name, version = '2.0', over = {} ) => ( {
	message: 'There is a new version of ' + name + ' available. <a href="plugin-install.php?tab=plugin-information&amp;plugin=' + slug + '&amp;section=changelog">View version ' + version + ' details</a> or <a href="#">update now</a>.',
	detailsSlug: slug,
	detailsUrl: null,
	version,
	request: request( 'plugins/update', { plugin: file } ),
	compatible: true,
	extraHtml: null,
	...over,
} );

/** A row of the list. `over` replaces any of its keys. */
export const row = ( slug, { file = slug + '/' + slug + '.php', name = 'Plugin ' + slug, active = false, ...over } = {} ) => ( {
	id: slug,
	file,
	slug,
	classes: [ active ? 'active' : 'inactive' ],
	selectable: true,
	checkboxDisabled: false,
	checkboxLabel: 'Select ' + name,
	rowHeaderLabel: name,
	name,
	description: 'The plugin ' + slug + '.',
	version: '1.0',
	author: { name: 'Author', url: null },
	actions: active ? activeActions( file, slug, name ) : inactiveActions( file, slug, name ),
	actionsHtml: null,
	meta: [
		{ kind: 'version', text: 'Version 1.0', url: null, slug: null, ariaLabel: null },
		{ kind: 'author', text: 'By Author', url: null, slug: null, ariaLabel: null },
	],
	metaHtml: null,
	afterMetaHtml: null,
	dependencies: { requires: null, requiredBy: null, error: null },
	autoUpdate: autoUpdate( file ),
	update: null,
	incompatible: null,
	paused: null,
	afterHtml: null,
	cells: [],
	...over,
} );

/** The views: All, Active, Inactive. */
export const views = ( current = 'all', { all = 3, active = 1, inactive = 2 } = {} ) => [
	{ key: 'all', label: 'All (' + all + ')', labelHtml: 'All <span class="count">(' + all + ')</span>', count: all, url: 'plugins.php?plugin_status=all', current: current === 'all' },
	{ key: 'active', label: 'Active (' + active + ')', labelHtml: 'Active <span class="count">(' + active + ')</span>', count: active, url: 'plugins.php?plugin_status=active', current: current === 'active' },
	{ key: 'inactive', label: 'Inactive (' + inactive + ')', labelHtml: 'Inactive <span class="count">(' + inactive + ')</span>', count: inactive, url: 'plugins.php?plugin_status=inactive', current: current === 'inactive' },
];

export const BULK_ACTIONS = [
	{ value: 'activate-selected', label: 'Activate' },
	{ value: 'deactivate-selected', label: 'Deactivate' },
	{ value: 'update-selected', label: 'Update' },
	{ value: 'delete-selected', label: 'Delete' },
	{ value: 'enable-auto-update-selected', label: 'Enable Auto-updates' },
	{ value: 'disable-auto-update-selected', label: 'Disable Auto-updates' },
];

/** The page's data. `over` replaces any of its keys. */
export const pluginsData = ( over = {} ) => ( {
	context: 'site',
	query: {},
	refusal: null,
	title: 'Plugins',
	headings: { views: 'Filter plugins list', pagination: 'Plugins list navigation', list: 'Plugins list' },
	heading: { addNew: { label: 'Add Plugin', path: 'plugin-install.php' }, search: null },
	messages: [],
	columns: [
		column( 'cb', '' ),
		column( 'name', 'Plugin', { primary: true } ),
		column( 'description', 'Description' ),
		column( 'auto-updates', 'Automatic Updates' ),
	],
	caption: null,
	classes: [ 'widefat', 'plugins' ],
	views: views(),
	viewsHtml: null,
	bulkActions: BULK_ACTIONS,
	search: { shown: true, value: '', label: 'Search installed plugins', inputId: 'plugin-search-input', keep: [] },
	pagination: { total: 3, totalText: '3 items', perPage: 999, page: 1, pages: 1, pagesText: '1', links: { first: null, prev: null, next: null, last: null } },
	screenOptions: null,
	recent: null,
	tablenavNote: null,
	preHtml: null,
	items: [ row( 'alpha', { active: true } ), row( 'beta' ), row( 'gamma' ) ],
	noItems: 'No plugins found.',
	bodyClasses: [ 'plugins-php' ],
	...over,
} );

/** The answer builder part of an update or delete (`plugins`): the fresh row, views and counts. */
export const answerPart = ( over = {} ) => ( {
	row: null,
	views: views( 'all', { all: 2, active: 1, inactive: 1 } ),
	counts: { all: 2, active: 1, inactive: 1 },
	menuCounts: { 'plugins.php': 0 },
	title: 'Plugins',
	...over,
} );

export const loadContracts = () => fillContracts( [ 'plugins', 'list-table-views', 'list-table-nav', 'filesystem-credentials', 'plugin-information' ] );

/** A host that records what the page gives it: notices, speech, the router's targets and the frame's counts. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/plugins.php', search: '' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], refreshed: 0, menuCounts: [], titles: [] };
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
		frameChannel: { setMenuCounts: ( counts ) => record.menuCounts.push( counts ), setTitle: ( title ) => record.titles.push( title ) },
		pageLocation: location,
	};
	return record;
}

/** Mounts the Plugins list page (`core/plugins`) with `data`; `provide` adds to what it injects. */
export async function mountPlugins( data = pluginsData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/plugins', data, page: { path: 'plugins.php', title: 'Plugins' } } ) }, {
		provide: { ...record.provide, ...provide },
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The plugin files of the rows shown, in order. */
export const rowFiles = ( wrapper ) => wrapper.findAll( '#the-list > tr[data-plugin]:not(.plugin-update-tr):not(.plugin-deleted-tr)' ).map( ( tr ) => tr.attributes( 'data-plugin' ) );

/** A plugin's main row. */
export const pluginRow = ( wrapper, file ) => wrapper.find( '#the-list > tr[data-plugin="' + file + '"]:not(.plugin-update-tr):not(.plugin-deleted-tr)' );

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure', data = null ) => Object.assign( new Error( message ), { status, code, data } );

/** The `fs_credentials_required` error a package route answers without credentials. */
export const credentialsError = ( error = null ) => apiError( 'Filesystem credentials are required.', 400, 'fs_credentials_required', {
	status: 400,
	form: {
		heading: 'Connection Information',
		headingLevel: 1,
		description: 'To perform the requested action, WordPress needs to access your web server.',
		error,
		labels: { username: 'FTP Username', password: 'FTP Password' },
		types: [ { value: 'ftp', label: 'FTP' }, { value: 'ftps', label: 'FTPS (SSL)' } ],
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
} );
