// What wp_admin_get_themes() and the theme routes answer (wp-includes/admin/themes-page.php,
// class-wp-rest-admin-themes-controller.php), built for the Themes page's component tests, and the
// page mounted the way the router mounts it. A test passes what differs.
import { h, isRef } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

/** A package request, as the page data gives it (`{ method, route, body }`). */
export const request = ( route, body ) => ( { method: 'POST', route, body } );

export const CONFIRM_DELETE = "Are you sure you want to delete this theme?\n\nClick 'Cancel' to go back, 'OK' to confirm the delete.";

/** A card, as wp_admin_theme_card() builds it. `over` replaces any of its keys. */
export const card = ( id = 'twentytwentyfive', over = {} ) => {
	const name = over.name ?? ( id === 'twentytwentyfive' ? 'Twenty Twenty-Five' : 'Theme ' + id );
	const active = over.active ?? false;
	return {
		id,
		name,
		screenshot: `/wp-content/themes/${ id }/screenshot.png?ver=1.0`,
		version: '1.0',
		author: 'the WordPress team',
		authorAndUri: '<a href="https://wordpress.org/">the WordPress team</a>',
		description: `The ${ name } description.`,
		tags: 'Blog, One column',
		parent: null,
		active,
		blockTheme: false,
		compatibility: { ok: true, message: null },
		update: null,
		autoUpdate: null,
		actions: {
			activate: active ? null : { request: request( 'themes/activate', { stylesheet: id } ), href: null, label: 'Activate', disabled: false },
			customize: { path: `customize.php?theme=${ id }&return=%2Fwp-admin%2Fthemes.php`, label: active ? 'Customize' : 'Live Preview', disabled: false },
			delete: active ? null : { request: request( 'themes/delete', { stylesheet: id } ), href: null, confirm: CONFIRM_DELETE },
		},
		ariaLabels: {
			details: 'View Theme Details for ' + name,
			activate: 'Activate ' + name,
			customize: ( active ? 'Customize ' : 'Live Preview ' ) + name,
			delete: 'Delete ' + name,
		},
		...over,
	};
};

/** A card's update (_wp_admin_theme_card_update()). */
export const update = ( id, over = {} ) => ( {
	message: 'New version available. <a href="#">Update now</a>',
	version: '2.0',
	compatible: true,
	request: request( 'themes/update', { stylesheet: id } ),
	...over,
} );

/** A card's auto-update setting (_wp_admin_theme_card_auto_update()). */
export const autoUpdate = ( id, over = {} ) => ( {
	supported: true,
	enabled: false,
	forced: null,
	text: 'Enable auto-updates',
	request: request( 'themes/auto-updates', { stylesheet: id, state: 'enable' } ),
	nextUpdate: null,
	nextUpdateShown: false,
	templateFiltered: false,
	...over,
} );

export const LABELS = {
	confirmDelete: CONFIRM_DELETE,
	themesFound: 'Number of Themes found: %d',
	noThemesFound: 'No themes found. Try a different search.',
	themeViewed: 'Theme details: %s',
	autoUpdates: { disabled: 'Auto-updates disabled', enabled: 'Auto-updates enabled', disable: 'Disable auto-updates', enable: 'Enable auto-updates' },
};

/** The current theme's buttons (_wp_admin_themes_current_actions()). */
export const CURRENT_ACTIONS = [
	{ label: 'Widgets', path: 'widgets.php', current: false },
	{ label: 'Menus', path: 'nav-menus.php', current: false },
];

/** The three cards of the default data: the active theme first. */
export const THEMES = () => [
	card( 'twentytwentyfive', { active: true } ),
	card( 'alpha', { name: 'Alpha', author: 'Ann Author', tags: 'Portfolio' } ),
	card( 'beta', { name: 'Beta', description: 'A <em>bold</em> theme.' } ),
];

/** The page's data. `over` replaces any of its keys. */
export const themesData = ( over = {} ) => {
	const themes = over.themes ?? THEMES();
	return {
		context: 'site',
		refusal: null,
		title: 'Themes',
		count: themes.length,
		bodyClasses: [ 'themes-php' ],
		heading: { addNew: { label: 'Add Theme', path: 'theme-install.php' }, searchLabel: 'Search installed themes' },
		messages: [],
		currentActions: CURRENT_ACTIONS,
		themes,
		broken: null,
		open: null,
		search: null,
		labels: LABELS,
		...over,
	};
};

/** A broken theme row (_wp_admin_themes_broken()). */
export const brokenRow = ( stylesheet, over = {} ) => ( {
	stylesheet,
	name: stylesheet,
	description: 'Stylesheet is missing.',
	resume: null,
	delete: { request: request( 'themes/delete', { stylesheet } ), confirm: CONFIRM_DELETE, label: 'Delete' },
	installParent: null,
	installParentChecked: true,
	...over,
} );

/** The broken themes block. */
export const broken = ( rows ) => ( {
	heading: 'Broken Themes',
	intro: 'The following themes are installed but incomplete.',
	columns: { name: 'Name', description: 'Description' },
	rows,
} );

/** The answer of `POST themes/update` (with the `themes` part). */
export const updateAnswer = ( id = 'alpha', over = {} ) => ( {
	slug: id,
	themeName: 'Alpha',
	oldVersion: '1.0',
	newVersion: '2.0',
	card: card( id, { name: 'Alpha', version: '2.0' } ),
	count: 3,
	menuCounts: { 'themes.php': 0 },
	broken: null,
	...over,
} );

/** The answer of `POST themes/delete` (with the `themes` part). */
export const deleteAnswer = ( id = 'beta', over = {} ) => ( {
	slug: id,
	themeName: 'Beta',
	card: null,
	count: 2,
	menuCounts: { 'themes.php': 0 },
	broken: null,
	...over,
} );

export const loadContracts = () => fillContracts( [ 'themes', 'filesystem-credentials' ] );

/** A host that records what the page gives it: notices, speech, the router's targets, the frame's titles and menu counts. */
export function host( location = { origin: 'http://localhost', pathname: '/wp-admin/themes.php', search: '' } ) {
	const record = { notices: [], spoken: [], followed: [], navigated: [], refreshed: 0, titles: [], menuCounts: [] };
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
		frameChannel: {
			setTitle: ( title ) => record.titles.push( title ),
			setMenuCounts: ( counts ) => record.menuCounts.push( counts ),
		},
		pageLocation: location,
	};
	return record;
}

/**
 * Mounts Themes (`core/themes`) with `data` (or a ref of it, so that a test can give the mounted
 * page new data); `provide` adds to what it injects.
 */
export async function mountThemes( data = themesData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/themes', data: isRef( data ) ? data.value : data, page: { path: 'themes.php', title: 'Themes' } } ) }, {
		provide: { ...record.provide, ...provide },
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** The card of a theme. */
export const cardOf = ( wrapper, id ) => wrapper.find( `.theme-browser .themes .theme[data-slug="${ id }"]` );

/** The ids of the cards shown, in order. */
export const cardIds = ( wrapper ) => wrapper.findAll( '.theme-browser .themes .theme' ).map( ( found ) => found.attributes( 'data-slug' ) );

/** The open overlay. */
export const overlayOf = ( wrapper ) => wrapper.find( 'div.theme-overlay[role="dialog"]' );

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure', data = null ) => Object.assign( new Error( message ), { status, code, data } );

/** The `fs_credentials_required` error a package route answers without credentials. */
export const credentialsError = () => apiError( 'Filesystem credentials are required.', 400, 'fs_credentials_required', {
	status: 400,
	form: {
		heading: 'Connection Information',
		headingLevel: 2,
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
