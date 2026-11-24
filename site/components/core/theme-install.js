import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, watchEffect } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { __, sprintf } from '../../runtime/text.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { adminHref } from './dashboard-parts/links.js';
import { DieError, failureText, usePageActions, usePageChrome } from './list-table-parts/page-chrome.js';
import { usePackageQueue } from './package-parts/runner.js';
import { announce } from './package-parts/events.js';
import { useCredentials } from './package-parts/credentials.js';
import { useLeaveWarning } from './package-parts/leave-warning.js';
import { ROUTE, usePackagePage } from './package-parts/page-actions.js';
import { useUploadFlow } from './package-parts/upload-flow.js';
import ThemeInstallCards from './theme-install/cards.js';
import ThemeInstallPreview from './theme-install/preview.js';
import ThemeInstallFilters from './theme-install/filters.js';
import ThemeInstallFavorites from './theme-install/favorites.js';
import { ThemeUploadForm, ThemeUploadResult } from './theme-install/upload.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'themes' ];

const DIRECTORY = ROUTE + 'themes/directory';
// theme.js: the installer's search runs when typing comes to a rest (`_.debounce( doSearch, 500 )`).
const SEARCH_PAUSE = 500;
// updates.js: "Installed!" shows for a second before the card offers Activate.
const DONE_PAUSE = 1000;
// The keys of a write's `theme-install` part (the card's local decisions) the page merges.
const PART_KEYS = [ 'installed', 'active', 'blockTheme', 'button', 'customize', 'preview' ];

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const route = ( request ) => ROUTE + text( request?.route ).replace( /^\/+/, '' );
const body = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );
const hasRequest = ( request ) => Boolean( request && typeof request.route === 'string' && request.route !== '' );
// How long focusShown() waits for an element to be focusable, in ms (theme.js's fade-out is 200 ms).
const FOCUS_WAIT = 500;

const isCard = ( value ) => Boolean( value && typeof value === 'object' && typeof value.slug === 'string' && value.slug !== '' );

/**
 * Focuses an element, or, while it cannot take the focus yet, tries again on each frame for a
 * moment: the body leaves `full-overlay-active` (visibility hidden) when the preview closes, and a
 * transition on `visibility` (the frame's reduced-motion rule gives every element one) keeps it
 * hidden for a few frames. theme.js focuses after its 200 ms fade-out. It stops when the focus
 * went somewhere else meanwhile.
 *
 * @param {HTMLElement|null|undefined} element The element.
 * @param {number} [until] Until when to try (performance.now()).
 */
function focusShown( element, until = globalThis.performance.now() + FOCUS_WAIT ) {
	element?.focus?.();
	const active = globalThis.document?.activeElement;
	if ( ! element || active === element || ( active && active !== globalThis.document.body ) || globalThis.performance.now() > until || typeof globalThis.requestAnimationFrame !== 'function' ) {
		return;
	}
	globalThis.requestAnimationFrame( () => {
		if ( element.isConnected ) {
			focusShown( element, until );
		}
	} );
}

/**
 * The directory request of a search, as theme.js's InstallerSearch builds it: `author:` and `tag:`
 * read the author or the tag instead of the term. Pure.
 *
 * @param {string} value The search field's value.
 * @return {object} The request.
 */
export function searchRequest( value ) {
	const term = text( value );
	if ( term.startsWith( 'author:' ) ) {
		return { search: '', author: term.slice( 7 ) };
	}
	if ( term.startsWith( 'tag:' ) ) {
		return { search: '', tag: [ term.slice( 4 ) ] };
	}
	return { search: term };
}

/** The directory request of a browse tab, as theme.js's browse(): Block Themes reads its tag. Pure. */
export const browseRequest = ( sort ) => ( sort === 'block-themes' ? { tag: [ 'full-site-editing' ] } : { browse: sort } );

/**
 * The query of `GET themes/directory` for a request and a page: the tags as one comma-separated
 * list (the route's array), no empty value, and the page when it is not the first. Pure.
 *
 * @param {object} request The request.
 * @param {number} page    The page.
 * @return {object} The query.
 */
export function directoryParams( request, page = 1 ) {
	const params = {};
	for ( const [ name, value ] of Object.entries( request ?? {} ) ) {
		const sent = Array.isArray( value ) ? value.map( text ).filter( ( item ) => item !== '' ).join( ',' ) : text( value );
		if ( sent !== '' ) {
			params[ name ] = sent;
		}
	}
	if ( page > 1 ) {
		params.page = page;
	}
	return params;
}

/**
 * A card with a write's `theme-install` part merged in (its local decisions over the card shown),
 * keeping a Cannot Install the card shows: WordPress.org's requirements decided it, which the
 * local part cannot know. Pure.
 *
 * @param {object} shown The card shown.
 * @param {object} part  The answer's `card`.
 * @return {object} The card.
 */
export function mergeCard( shown, part ) {
	if ( ! part || typeof part !== 'object' ) {
		return shown;
	}
	const merged = { ...shown, ...Object.fromEntries( PART_KEYS.filter( ( key ) => Object.hasOwn( part, key ) ).map( ( key ) => [ key, part[ key ] ] ) ) };
	if ( shown?.button?.action === 'incompatible' && ! merged.installed ) {
		merged.button = shown.button;
		merged.preview = shown.preview;
	}
	return merged;
}

/** The admin path of a query of the screen, or of the screen. Pure. */
export const installPath = ( params = {} ) => {
	const query = new URLSearchParams( params ).toString();
	return 'theme-install.php' + ( query === '' ? '' : '?' + query );
};

/**
 * Default implementation of core/theme-install: Add Themes (wp-admin/theme-install.php) in its
 * classic markup: the Upload Theme toggle and the upload form (theme-install/upload.js), the
 * `.wp-filter` with the count, the browse tabs, Feature Filter, the search, the Favorites form
 * (theme-install/favorites.js) and the feature filter drawer (theme-install/filters.js), the theme
 * cards (theme-install/cards.js), their preview (theme-install/preview.js), the no-themes text, the
 * spinner and what a plugin's tab prints. The body has the classes WordPress names, and the ones
 * theme.js gives it, while it is shown.
 *
 * Everything WordPress decides comes as data. The page reproduces theme.js and updates.js:
 *
 * - The tabs, the search (after theme.js's pause), the feature filter and Favorites read `GET
 *   themes/directory` (a newer read drops an older one's answer); the address follows classic
 *   with router.js setAddress() (no page-data read): `?browse=` pushed, `?search=` replaced, the
 *   filter's `theme-install.php` pushed. When the answer has more pages, the next one loads as the
 *   last card comes into view (an IntersectionObserver, theme.js's scroller).
 * - Install is a package job, one at a time (package-parts/queue.js), with updates.js's texts and
 *   events (`wp-theme-*`); a second after "Installed!" the answer's `card` is merged into the card
 *   (mergeCard()). A job that needs filesystem credentials opens the Connection Information dialog
 *   (core/filesystem-credentials): submitted, the queue resumes with them; cancelled, it is
 *   emptied and each job announced once.
 * - Activate posts its request and follows the answer; Live Preview and Customize open their path.
 * - A card opens its preview at `?theme=` (pushed); closing goes back to the tab shown.
 * - The upload runs through package-parts/upload-flow.js (`themes/upload`, `themezip`).
 * - Get Favorites stores the username, then reads the favorites of it.
 *
 * Leaving the page while a package job runs or waits asks updates.js's question first
 * (package-parts/leave-warning.js). Answers are dropped when a new visit starts or the page
 * unmounts. A failed write is WordPress's message: in a page notice, or on the card, as updates.js
 * shows it; a failed read shows the classic error with Try Again.
 */
export default {
	name: 'ThemeInstall',
	components: { Contracted, LegacyHtml, InlineMarkup, DieError, ThemeInstallCards, ThemeInstallPreview, ThemeInstallFilters, ThemeInstallFavorites, ThemeUploadForm, ThemeUploadResult },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const elsewhere = computed( () => typeof props.data?.location === 'string' && props.data.location !== '' );
		const { router, speak, where, failed, follow } = usePageActions( { pathname: '/wp-admin/theme-install.php', failureText, focusFailures: false } );
		const credentials = useCredentials();
		const { navigate, fatalTarget, announceDropped } = usePackagePage( { router, where, type: 'theme' } );
		const upload = useUploadFlow( { api, credentials, follow, failed, onAnswer: ( answer ) => emit( 'saved', answer ), type: 'theme' } );
		const errorText = ( error ) => failureText( error );

		const labels = computed( () => ( props.data?.labels && typeof props.data.labels === 'object' ? props.data.labels : {} ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );
		const features = computed( () => list( props.data?.features ) );

		/** Shows another address of this screen without reading the page again (router.js setAddress()). */
		function address( path, { replace = false } = {} ) {
			router?.setAddress?.( adminHref( path, where() ?? undefined ), { replace } );
		}

		// The state of the page while it is shown -------------------------------------------------

		const root = ref( null );
		const sort = ref( null ); // The browse tab shown, or null (a search, the filter, a preview's read).
		const term = ref( '' ); // The search field.
		let searched = ''; // The last value searched (theme.js's `terms`).
		const drawer = ref( false ); // `show-filters`.
		const applied = ref( false ); // `filters-applied`.
		const checked = ref( [] );
		const appliedNames = ref( [] );
		const uploadShown = ref( false );
		const favoritesBusy = ref( false );
		const cards = shallowRef( [] );
		const info = ref( null );
		const loading = ref( false );
		const loadingMore = ref( false );
		const loadError = ref( false );
		const overrides = shallowRef( {} ); // slug => the card with a write's part merged in.
		const jobs = reactive( {} ); // slug => { phase, message } of its install.
		const openSlug = ref( null );
		let pendingOpen = null; // The address's `?theme=`, opened once its read answers.
		let current = { request: {}, page: 1 };

		const shown = computed( () => cards.value.map( ( item ) => overrides.value[ item.slug ] ?? item ) );
		const items = computed( () => shown.value.map( ( card ) => ( { card, state: jobs[ card.slug ] ?? null } ) ) );
		const count = computed( () => ( info.value === null ? '' : String( info.value.results ?? cards.value.length ) ) );
		const noResults = computed( () => info.value !== null && ! loading.value && ! loadError.value && cards.value.length === 0 );
		const openIndex = computed( () => shown.value.findIndex( ( item ) => item.slug === openSlug.value ) );
		const openCard = computed( () => ( openIndex.value < 0 ? null : shown.value[ openIndex.value ] ) );

		// The classes theme.js gives the body.
		const BODY = [ 'show-upload-view', 'show-filters', 'filters-applied', 'show-favorites-form', 'loading-content', 'no-results', 'theme-installer-active', 'full-overlay-active' ];
		watchEffect( () => {
			const classList = globalThis.document?.body?.classList;
			const on = {
				'show-upload-view': uploadShown.value && Boolean( props.data?.upload ),
				'show-filters': drawer.value,
				'filters-applied': applied.value,
				'show-favorites-form': sort.value === 'favorites',
				'loading-content': loading.value,
				'no-results': noResults.value,
				'theme-installer-active': openCard.value !== null,
				'full-overlay-active': openCard.value !== null,
			};
			BODY.forEach( ( name ) => classList?.toggle?.( name, on[ name ] ) );
		} );

		// Timers and answers of this visit only ---------------------------------------------------

		let generation = 0;
		let readAt = 0;
		const timers = new Set();

		function later( run, delay = DONE_PAUSE ) {
			const at = generation;
			const timer = globalThis.setTimeout( () => {
				timers.delete( timer );
				if ( at === generation ) {
					run();
				}
			}, delay );
			timers.add( timer );
			return timer;
		}

		function stopTimers() {
			for ( const timer of timers ) {
				globalThis.clearTimeout( timer );
			}
			timers.clear();
		}

		// The directory (theme.js's collection query) ----------------------------------------------

		/** Reads a page of the directory: the first page replaces the cards, a later one adds to them. */
		async function read( request, page = 1 ) {
			const at = ++readAt;
			if ( page === 1 ) {
				current = { request, page: 1 };
				loading.value = true;
				loadError.value = false;
				loadingMore.value = false;
			} else {
				loadingMore.value = true;
			}
			let answer;
			try {
				answer = await api.get( DIRECTORY, directoryParams( request, page ) );
			} catch ( error ) {
				if ( at !== readAt ) {
					return;
				}
				console.warn( 'Could not read the theme directory:', error );
				loading.value = false;
				loadingMore.value = false;
				loadError.value = true;
				return;
			}
			if ( at !== readAt ) {
				return;
			}
			const themes = list( answer?.themes ).filter( isCard );
			const answered = answer?.info && typeof answer.info === 'object' ? answer.info : {};
			if ( page === 1 ) {
				cards.value = themes;
				info.value = { page: Number( answered.page ) || 1, pages: Number( answered.pages ) || 0, results: Number.isInteger( answered.results ) ? answered.results : themes.length };
				const found = info.value.results;
				speak( found === 0 ? text( labels.value.noThemesFound ) : sprintf( text( labels.value.themesFound ), found ) );
			} else {
				const known = new Set( cards.value.map( ( item ) => item.slug ) );
				cards.value = [ ...cards.value, ...themes.filter( ( item ) => ! known.has( item.slug ) ) ];
				info.value = { ...info.value, page: Number( answered.page ) || page, pages: Number( answered.pages ) || info.value.pages };
			}
			current.page = info.value.page;
			loading.value = false;
			loadingMore.value = false;
			if ( pendingOpen !== null ) {
				const slug = pendingOpen;
				pendingOpen = null;
				if ( shown.value.some( ( item ) => item.slug === slug ) ) {
					openSlug.value = slug;
				}
			}
		}

		const retry = () => read( current.request, 1 );

		// Infinite scroll (theme.js's scroller): the last card in view loads the next page.
		let observer = null;
		const stopWatching = () => {
			observer?.disconnect?.();
			observer = null;
		};
		watch( [ cards, info, loadingMore ], () => {
			stopWatching();
			const Observer = globalThis.IntersectionObserver;
			if ( typeof Observer !== 'function' || ! info.value || info.value.page >= info.value.pages || loadingMore.value ) {
				return;
			}
			const last = [ ...( root.value?.querySelectorAll?.( '.theme-browser .themes > .theme' ) ?? [] ) ].at( -1 );
			if ( ! last ) {
				return;
			}
			observer = new Observer( ( entries ) => {
				if ( entries.some( ( entry ) => entry.isIntersecting ) ) {
					stopWatching();
					read( current.request, current.page + 1 );
				}
			} );
			observer.observe( last );
		}, { flush: 'post' } );

		// The tabs (theme.js's onSort()) ------------------------------------------------------------

		function onSort( key, event ) {
			event?.preventDefault?.();
			drawer.value = false;
			applied.value = false;
			if ( sort.value === key ) {
				return;
			}
			term.value = '';
			searched = '';
			sort.value = key;
			read( browseRequest( key ) );
			address( installPath( { browse: key } ) );
		}

		// The search (theme.js's InstallerSearch) ----------------------------------------------------

		let searchTimer = null;
		const stopSearch = () => {
			if ( searchTimer !== null ) {
				globalThis.clearTimeout( searchTimer );
				timers.delete( searchTimer );
				searchTimer = null;
			}
		};

		function runSearch( value ) {
			searchTimer = null;
			if ( value === searched ) {
				return;
			}
			searched = value;
			sort.value = null;
			drawer.value = false;
			applied.value = false;
			read( searchRequest( value ) );
			address( 'theme-install.php?search=' + encodeURIComponent( value ), { replace: true } );
		}

		function onSearchInput( event ) {
			// Tabbing or reverse tabbing into the field searches nothing.
			if ( event?.type === 'keyup' && ( event.key === 'Tab' || event.key === 'Shift' ) ) {
				return;
			}
			if ( event?.type === 'keyup' && event.key === 'Escape' && event.target ) {
				event.target.value = '';
			}
			const value = text( event?.target?.value );
			term.value = value;
			stopSearch();
			searchTimer = later( () => runSearch( value ), SEARCH_PAUSE );
		}

		// The feature filter -------------------------------------------------------------------------

		function toggleDrawer( event ) {
			event?.preventDefault?.();
			if ( applied.value ) {
				applied.value = false;
				return;
			}
			term.value = '';
			address( 'theme-install.php' );
			drawer.value = ! drawer.value;
		}

		function toggleFeature( value, on ) {
			checked.value = on ? [ ...new Set( [ ...checked.value, value ] ) ] : checked.value.filter( ( item ) => item !== value );
			if ( checked.value.length === 0 ) {
				applied.value = false;
			}
		}

		function applyFilters() {
			const tags = checked.value;
			if ( tags.length === 0 ) {
				speak( text( labels.value.selectFeatureFilter ) );
				return;
			}
			const names = new Map( features.value.flatMap( ( group ) => list( group?.features ) ).map( ( item ) => [ item.value, item.label ] ) );
			applied.value = true;
			sort.value = null;
			appliedNames.value = tags.map( ( tag ) => text( names.get( tag ) ?? tag ) );
			read( { tag: [ ...tags ] } );
		}

		function clearFilters() {
			checked.value = [];
			applied.value = false;
		}

		// The package queue (updates.js `wp.updates.queue`) ------------------------------------------

		// What each queued job is about, by its key (the slug): its name and route.
		const jobInfo = new Map();

		const packages = usePackageQueue( {
			credentials,
			path: ( job ) => jobInfo.get( job.key )?.path,
			begin: ( job ) => {
				speak( __( 'Installing... please wait.', 'default' ) );
				announce( 'wp-theme-installing', { slug: job.key }, 'theme' );
			},
			succeed: ( job, answer ) => succeed( job, answer ),
			fail: ( job, error ) => fail( job, error ),
			dropped: ( dropped ) => {
				announceDropped( dropped );
				dropped.forEach( ( job ) => {
					jobInfo.delete( job.key );
					delete jobs[ job.key ];
				} );
			},
		} );

		// Leaving while a job runs or waits asks first, as updates.js does.
		useLeaveWarning( packages.busy );

		function install( card ) {
			const request = card?.button?.request;
			const slug = text( card?.slug );
			if ( card?.button?.action !== 'install' || ! hasRequest( request ) || slug === '' || [ 'installing', 'installed' ].includes( jobs[ slug ]?.phase ) ) {
				return;
			}
			packages.add( { kind: 'install', key: slug, body: { ...body( request ), screen: 'theme-install', query: query.value } }, () => {
				jobInfo.set( slug, { name: text( card.name ), path: route( request ) } );
				jobs[ slug ] = { phase: 'installing', message: null };
			} );
		}

		function succeed( job, answer ) {
			const name = jobInfo.get( job.key )?.name ?? '';
			jobInfo.delete( job.key );
			emit( 'saved', answer );
			jobs[ job.key ] = { phase: 'installed', message: null };
			speak( __( 'Installation completed successfully.', 'default' ) );
			announce( 'wp-theme-install-success', { install: 'theme', slug: text( answer?.slug ) || job.key, themeName: text( answer?.themeName ) || name }, 'theme' );
			later( () => {
				const base = shown.value.find( ( item ) => item.slug === job.key );
				if ( base ) {
					overrides.value = { ...overrides.value, [ job.key ]: mergeCard( base, answer?.card ) };
				}
				delete jobs[ job.key ];
			} );
		}

		function fail( job, error ) {
			jobInfo.delete( job.key );
			const message = errorText( error );
			const said = sprintf( __( 'Installation failed: %s', 'default' ), message );
			console.warn( 'Could not install the theme:', error );
			jobs[ job.key ] = { phase: 'install-failed', message: said };
			speak( said, 'assertive' );
			announce( 'wp-theme-install-error', { install: 'theme', slug: job.key, errorCode: text( error?.code ), errorMessage: message }, 'theme' );
		}

		// Activate, Live Preview and Customize -------------------------------------------------------

		async function activate( card ) {
			const request = card?.button?.request;
			if ( card?.button?.action !== 'activate' || ! hasRequest( request ) ) {
				return;
			}
			const at = generation;
			let answer;
			try {
				answer = await api.post( route( request ), body( request ) );
			} catch ( error ) {
				if ( at !== generation ) {
					return;
				}
				const target = fatalTarget( error );
				if ( target ) {
					await follow( target );
					return;
				}
				failed( error, 'Could not activate the theme:' );
				return;
			}
			if ( at !== generation ) {
				return;
			}
			emit( 'saved', answer );
			await follow( answer );
		}

		function customize( card ) {
			const path = card?.customize?.path;
			if ( typeof path === 'string' && path !== '' && ! card.customize.disabled ) {
				navigate( path );
			}
		}

		// The preview (theme.js's Preview view) -------------------------------------------------------

		function openPreview( slug, { speakIt = false } = {} ) {
			const card = shown.value.find( ( item ) => item.slug === slug );
			if ( ! card ) {
				return;
			}
			openSlug.value = slug;
			address( installPath( { theme: slug } ) );
			if ( speakIt ) {
				speak( sprintf( text( labels.value.themeViewed ), card.name ) );
			}
		}

		function closePreview() {
			const slug = openSlug.value;
			if ( slug === null ) {
				return;
			}
			openSlug.value = null;
			address( sort.value ? installPath( { browse: sort.value } ) : 'theme-install.php' );
			nextTick( () => {
				const card = [ ...( root.value?.querySelectorAll?.( '.theme-browser .themes > .theme' ) ?? [] ) ].find( ( element ) => element.dataset.slug === slug );
				focusShown( card?.querySelector?.( '.more-details' ) );
			} );
		}

		function step( delta ) {
			const next = shown.value[ openIndex.value + delta ];
			if ( next ) {
				openPreview( next.slug, { speakIt: true } );
			}
		}

		// Favorites (theme.js's saveUsername()) ------------------------------------------------------

		async function saveFavorites( user ) {
			const at = generation;
			favoritesBusy.value = true;
			try {
				const answer = await api.post( ROUTE + 'themes/favorites-user', { user } );
				if ( at !== generation ) {
					return;
				}
				emit( 'saved', answer );
				read( { browse: 'favorites', user } );
			} catch ( error ) {
				if ( at === generation ) {
					failed( error, 'Could not save the WordPress.org username:' );
				}
			} finally {
				if ( at === generation ) {
					favoritesBusy.value = false;
				}
			}
		}

		// Lifecycle ----------------------------------------------------------------------------------

		/** A network whose admin is on another host: the page loads there. */
		function followLocation() {
			if ( elsewhere.value ) {
				follow( { redirect: null, location: props.data.location } );
			}
		}

		let replaceAddress = false;

		/** The data of a new visit: everything the page held goes, and the directory is read. */
		function reset( data ) {
			generation++;
			readAt++;
			stopTimers();
			stopWatching();
			searchTimer = null;
			packages.reset();
			jobInfo.clear();
			credentials.clear();
			Object.keys( jobs ).forEach( ( key ) => delete jobs[ key ] );
			overrides.value = {};
			cards.value = [];
			info.value = null;
			loading.value = false;
			loadError.value = false;
			checked.value = [];
			appliedNames.value = [];
			applied.value = false;
			drawer.value = false;
			uploadShown.value = data?.upload?.open === true;
			upload.reset();
			favoritesBusy.value = false;
			openSlug.value = null;
			pendingOpen = null;
			term.value = text( data?.search?.term );
			searched = term.value;
			sort.value = null;
			if ( elsewhere.value || pageFailed.value || refusal.value ) {
				followLocation();
				return;
			}
			if ( typeof data?.open === 'string' && data.open !== '' ) {
				pendingOpen = data.open;
				read( { theme: data.open } );
			} else if ( term.value !== '' ) {
				read( searchRequest( term.value ) );
			} else {
				sort.value = list( data?.tabs ).some( ( item ) => item?.key === data?.browse ) ? data.browse : 'popular';
				read( browseRequest( sort.value ) );
				// theme.js's router: the bare address shows `?browse=popular`, replaced.
				const asked = data?.query && typeof data.query === 'object' ? data.query : {};
				replaceAddress = ! [ 'browse', 'search', 'theme', 'upload', 'tab' ].some( ( key ) => Object.hasOwn( asked, key ) );
			}
		}

		watch( () => props.data, ( data, old ) => ( old === undefined ? reset( data ) : followLocation() ), { immediate: true } );
		onMounted( () => {
			if ( replaceAddress ) {
				replaceAddress = false;
				address( installPath( { browse: sort.value } ), { replace: true } );
			}
		} );
		onBeforeUnmount( () => {
			generation++;
			readAt++;
			stopTimers();
			stopWatching();
			packages.reset();
			upload.reset();
			BODY.forEach( ( name ) => globalThis.document?.body?.classList?.remove?.( name ) );
		} );

		return {
			root, pageFailed, refusal, elsewhere, labels, features, items, count, sort, term, drawer, checked, appliedNames, loadError,
			uploadShown, uploadResult: upload.result, uploadBusy: upload.busy, favoritesBusy,
			openCard, openIndex, shownCount: computed( () => shown.value.length ), jobs,
			credentialsForm: credentials.form, credentialsOpen: credentials.open, submitCredentials: credentials.submit, cancelCredentials: credentials.cancel,
			tabs: computed( () => list( props.data?.tabs ).filter( ( item ) => typeof item?.key === 'string' && typeof item.label === 'string' ) ),
			toggleUpload: () => {
				uploadShown.value = ! uploadShown.value;
			},
			submitUpload: upload.submitUpload, replaceUploaded: upload.replaceUploaded, cancelUploaded: upload.cancelUploaded, activateUploaded: upload.activateUploaded,
			onSort, onSearchInput, toggleDrawer, toggleFeature, applyFilters, clearFilters, editFilters: () => {
				applied.value = false;
			},
			install, activate, customize, openPreview, closePreview, step, saveFavorites, retry, navigate,
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-theme-install-failed">{{ $__( 'The themes could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-theme-install-error" />
		<div v-else-if="! elsewhere" ref="root" class="wp-admin-theme-install">
			<button v-if="data.upload" type="button" class="upload-view-toggle page-title-action hide-if-no-js" :aria-expanded="String( uploadShown )" @click="toggleUpload">{{ data.upload.label }}</button>
			<hr class="wp-header-end">

			<div v-if="data.upload" class="upload-theme">
				<ThemeUploadResult v-if="uploadResult" :result="uploadResult" :busy="uploadBusy" @activate="activateUploaded" @overwrite="replaceUploaded" @cancel="cancelUploaded" @open="navigate" />
				<ThemeUploadForm v-else :upload="data.upload" :busy="uploadBusy" @submit="submitUpload" />
			</div>

			<h2 class="screen-reader-text hide-if-no-js">{{ labels.filterHeading }}</h2>
			<div class="wp-filter hide-if-no-js">
				<div class="filter-count"><span class="count theme-count">{{ count }}</span></div>
				<ul class="filter-links">
					<li v-for="item in tabs" :key="item.key"><a href="#" :data-sort="item.key" :class="{ current: sort === item.key }" :aria-current="sort === item.key ? 'page' : null" @click="onSort( item.key, $event )">{{ item.label }}</a></li>
				</ul>
				<button type="button" class="button drawer-toggle" :aria-expanded="String( drawer )" @click="toggleDrawer">{{ labels.featureFilter }}</button>
				<form class="search-form" @submit.prevent><p class="search-box">
					<label for="wp-filter-search-input">{{ data.search?.label }}</label>
					<input type="search" id="wp-filter-search-input" class="wp-filter-search" aria-describedby="live-search-desc" :value="term" @input="onSearchInput" @keyup="onSearchInput" />
				</p></form>
				<ThemeInstallFavorites v-if="data.favorites" :favorites="data.favorites" :busy="favoritesBusy" @save="saveFavorites" />
				<ThemeInstallFilters :features="features" :checked="checked" :applied="appliedNames" :labels="labels" @toggle="toggleFeature" @apply="applyFilters" @clear="clearFilters" @edit="editFilters" />
			</div>

			<h2 class="screen-reader-text hide-if-no-js">{{ labels.listHeading }}</h2>
			<div class="theme-browser content-filterable rendered">
				<div v-if="loadError" class="notice notice-error">
					<p><InlineMarkup :html="labels.error ?? ''" /></p>
					<p><button type="button" class="button try-again" @click="retry">{{ labels.tryAgain }}</button></p>
				</div>
				<ThemeInstallCards :items="items" :labels="labels" @preview="( slug ) => openPreview( slug )" @install="install" @activate="activate" @customize="customize" />
			</div>

			<ThemeInstallPreview
				v-if="openCard"
				:card="openCard"
				:first="openIndex <= 0"
				:last="openIndex >= shownCount - 1"
				:alone="shownCount === 1"
				:state="jobs[ openCard.slug ] ?? null"
				:labels="labels"
				:keys="! credentialsOpen"
				@close="closePreview"
				@previous="step( -1 )"
				@next="step( 1 )"
				@install="install( openCard )"
				@activate="activate( openCard )"
			/>

			<p class="no-themes">{{ labels.noThemesFound }}</p>
			<span class="spinner"></span>

			<LegacyHtml v-if="typeof data.tabHtml === 'string'" :html="data.tabHtml" />

			<Contracted v-if="credentialsOpen" id="core/filesystem-credentials" :form="credentialsForm ?? {}" :open="credentialsOpen" @submit="submitCredentials" @cancel="cancelCredentials" />
		</div>
	`,
};
