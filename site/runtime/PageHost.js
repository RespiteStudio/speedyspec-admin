import { computed, inject, onBeforeUnmount, provide, reactive, ref, shallowRef, watch, watchEffect, nextTick } from 'vue';
import api from '@wp-admin/api';
import { loadAssets, releaseAssets, SCREEN_ASSETS } from '../kit/LegacyHtml.js';
import { toPagePath } from './router.js';
import { applyScreenGlobals, loadScreenAssets, markRan, ranBefore, ranKey } from './screen-assets.js';
import { pageStylesheets, syncPageStylesheets } from './stylesheets.js';
import i18n from './i18n-instance.js';
import { __, sprintf, localeVersion } from './text.js';
import Contracted from './Contracted.js';
import ErrorScreen from '../pages/ErrorScreen.js';
import InlineMarkup from '../kit/InlineMarkup.js';

/** Document title of a page: "Page ‹ Site — WordPress" (translatable), or the page title alone without a site name. */
export function documentTitle( title, siteName ) {
	if ( ! siteName ) {
		return title;
	}
	/* translators: Admin screen title. 1: Admin screen name, 2: Site name. */
	return sprintf( __( '%1$s ‹ %2$s — WordPress', 'wp-admin-site' ), title, siteName );
}

// Classic screens shown in a frame (components/core/legacy.js).
const LEGACY = 'core/legacy';

/**
 * Renders the current page through its contract: a core contract's static
 * implementation, or for a plugin page the module's default export. Each path
 * gets a fresh instance. After a navigation, focus moves to the page heading
 * so that screen reader users start at the new content.
 *
 * Consecutive legacy pages share one instance (keyed `core/legacy`), so that a
 * classic screen that navigates by itself keeps its frame. Its `navigated` event
 * ({ path, title }) gives the document title of that page. After a navigation made
 * here, the legacy page moves focus to its frame (`pageFocus.legacy`); a navigation
 * the frame made by itself, which the legacy page marks `pageFocus.adopted` before
 * the router shows it, leaves focus where the user is, inside the frame.
 *
 * Provides `pageState` ({ setDirty( boolean ), isDirty(), setLeaveWarning( message ) }) to the
 * page: a page that holds unsaved changes calls `setDirty( true )`, and `setDirty( false )` once
 * they are saved or discarded. While it is dirty, a live update (runtime/live.js) never swaps the
 * page for another one or leaves it; it warns instead. A page whose work a navigation would lose
 * (a package queue still running) also sets a leave warning, which the router asks before it
 * leaves the page (router.js setLeaveWarning()). Both are cleared when the page changes or goes.
 * A hosted classic screen is not known to be dirty.
 *
 * A navigation in place (router.js navigate()'s `inPlace`, `state.inPlace`: a live search) to
 * another query of the screen shown, with the same component, keeps the page: the same instance
 * gets the new page and data, focus stays where it is (the search field), and nothing that
 * belongs to a visit (the page notices, the dirty state and leave warning, the help, the screen
 * assets) is redone. Every other path change is a new visit.
 *
 * Tells the frame the help the page's module exports (`pageHelp`, provided by core/frame:
 * `set( help )` and `hide( boolean )`): the `help` export of the implementation the page is
 * shown with, none for a hosted classic screen, and hidden while the forbidden screen shows.
 *
 * Withdraws the notices the page raised with `scope: 'page'` (runtime/notices.js) when the
 * path changes and when the host goes, so that "Settings saved." does not follow the user to
 * another screen. The same page answered again (same path) keeps them.
 *
 * Each time it shows a native page at a new path, asks WordPress once for the scripts and styles
 * the page's classic screen queues on `admin_enqueue_scripts` (runtime/screen-assets.js) and,
 * when there are any, sets the screen's globals (`pagenow`… as admin-header.php sets them; put
 * back when the page goes) and loads them with LegacyHtml's asset loader, which sets each up once per
 * visit, after the frame has shown the page's captured notices (`pageNotices`, when the frame
 * provides it), as a classic screen prints its notices before its footer scripts run. LegacyHtml
 * islands inside the page wait for them (`SCREEN_ASSETS`, `{ ready() }`)
 * before they set up their own assets and run their scripts. Nothing is asked for a hosted
 * classic screen, which loads its own, nor again when the router answers the same path; an
 * answer for a page the user has left is not loaded. The answer starts with the classic
 * baseline scripts (jQuery…) WordPress decides; when the request fails, the baseline of the
 * frame's notices answer (`pageNotices.baseline()`) is loaded instead. The styles belong to the
 * visit: once the next page's are in place, those only this page needed stop applying.
 *
 * A page whose plugin scripts (`pluginScripts`) already ran in this document (same context and
 * path, see ranKey()) is loaded in a new document (`location.reload()`; the router has already
 * put its address in the history), as classic loads every screen: a script that binds to the
 * screen's elements when it loads binds again. That is decided before the page component
 * renders, so that nothing can be typed into a page that is about to go. The visit is recorded
 * before the scripts load (see ranBefore()).
 *
 * Loads the WordPress admin stylesheets the page's module exports as `stylesheets` (core handles
 * such as `dashboard`; runtime/stylesheets.js) before the page is shown, in the direction of the
 * user's language (again when it changes), and drops those of the page before. A hosted classic
 * screen, which loads its own, and a page that cannot be shown get none.
 *
 * The top-level heading is the page's title, or the classic screen's own heading when the page's
 * data gives one as text (`heading.title`, core/frame 1.3.0).
 *
 * The document title is the page's title, or the one its answers gave the frame
 * (`frameTitle`, from frameChannel.setTitle()) until the path changes.
 *
 * A page the user may not open shows the router's forbidden screen in place of the page,
 * inside the frame: when the proxy refuses the page's files (the contract raises `forbidden`),
 * and while the router refuses a page asked for after this one was shown.
 */
export default {
	name: 'PageHost',
	components: { Contracted, ErrorScreen },
	props: {
		page: { type: Object, required: true },
		siteName: { type: String, default: '' },
		busy: { type: Boolean, default: false },
	},
	setup( props ) {
		const heading = ref( null );
		const isLegacy = computed( () => props.page.component === LEGACY );
		const reported = shallowRef( null ); // { path, title } of the frame's last screen.
		// Reactive: the legacy page reacts to `legacy` whichever watcher runs first.
		const pageFocus = reactive( { legacy: false, adopted: false } );
		provide( 'pageFocus', pageFocus );
		const router = inject( 'router', null );
		// What the forbidden screen is given: only its retry (never shown for `forbidden`) uses the router.
		const errorRouter = router ?? { state: {}, refresh() {} };
		const refused = ref( false ); // The proxy refused this page's files.
		const forbidden = computed( () => refused.value || router?.state?.status === 'forbidden' );
		// The router's access-denied message, when the router (not the proxy) refused the page.
		const forbiddenMarkup = computed( () => ( router?.state?.status === 'forbidden' ? router.state.forbiddenMarkup ?? null : null ) );
		const pageState = {
			setDirty: ( value ) => router?.setDirty?.( value ),
			isDirty: () => router?.isDirty?.() ?? false,
			setLeaveWarning: ( message ) => router?.setLeaveWarning?.( message ),
		};
		provide( 'pageState', pageState );
		const clearPageState = () => {
			pageState.setDirty( false );
			pageState.setLeaveWarning( null );
		};
		onBeforeUnmount( clearPageState );

		// The path the page was entered at: a navigation in place to another query of the same
		// screen and component keeps it (the same page instance), any other path change is a visit.
		const screenOf = ( path ) => String( path ?? '' ).split( '?' )[ 0 ];
		const visit = ref( props.page.path );
		let visitComponent = props.page.component;
		watch( () => props.page.path, ( path ) => {
			const inPlace = router?.state?.inPlace === true && props.page.component === visitComponent && props.page.component !== LEGACY && screenOf( path ) === screenOf( visit.value );
			if ( ! inPlace ) {
				visit.value = path;
				visitComponent = props.page.component;
			}
		}, { flush: 'sync' } );

		// The screen assets of the page: asked for alongside the frame's notices request, loaded once
		// the page's notices are in the document, and before the page's LegacyHtml islands run.
		const pageNotices = inject( 'pageNotices', null );
		// Loads the current address in a new document; `reloadDocument` may be provided (tests).
		const reloadDocument = inject( 'reloadDocument', () => globalThis.location?.reload?.() );
		// How long the screen assets request may take before it is given up (ms).
		const requestTimeout = inject( 'screenAssetsRequestTimeout', 30000 );
		let screenReady = Promise.resolve();
		let screenTicket = 0;
		let withdrawGlobals = () => {};
		let owner = null; // What the current visit's styles belong to (LegacyHtml's releaseAssets()).
		provide( SCREEN_ASSETS, { ready: () => screenReady } );
		const reloading = ref( false ); // This page's plugin scripts ran in this document: it is about to be loaded anew.
		// The router updates the history before it shows a page, so the location is the page's.
		const pageWhere = () => toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } );
		async function loadScreen( page, mine, styles, where ) {
			const assets = await loadScreenAssets( api, page, where.context, { timeout: requestTimeout } );
			await pageNotices?.ready?.();
			if ( mine !== screenTicket ) {
				return;
			}
			if ( ! assets ) {
				// No screen assets (the request failed): the classic baseline the notices answer gave
				// (jQuery…), so that the page's islands' scripts still find what every classic screen has.
				const baseline = page.component === LEGACY ? null : pageNotices?.baseline?.();
				if ( baseline ) {
					await loadAssets( baseline, globalThis.document, globalThis.window, styles );
				}
				return;
			}
			// The screen's globals (pagenow…) are set before its scripts run, as admin-header.php does.
			withdrawGlobals = applyScreenGlobals( assets.globals );
			// Before the files load, so that leaving mid-load still counts the visit.
			markRan( assets, ranKey( page, where.context ) );
			await loadAssets( assets, globalThis.document, globalThis.window, styles );
		}
		watch( visit, () => {
			withdrawGlobals();
			withdrawGlobals = () => {};
			const where = pageWhere();
			reloading.value = ranBefore( ranKey( props.page, where.context ) );
			if ( reloading.value ) {
				// Its plugin scripts already ran in this document: a new document, as classic loads
				// every screen. The page is not rendered; its islands never ask for assets.
				screenReady = new Promise( () => {} );
				reloadDocument();
				return;
			}
			// The styles of the page before stop applying once this page's are in place, so that a
			// style both need is not switched off in between.
			const before = owner;
			owner = {};
			screenReady = loadScreen( props.page, ++screenTicket, owner, where ).catch( () => {} ).finally( () => releaseAssets( before ) );
		}, { immediate: true } );
		onBeforeUnmount( () => {
			screenTicket++;
			withdrawGlobals();
			releaseAssets( owner );
		} );

		// The page's own notices go with it (before the next page raises its own).
		const notices = inject( 'notices', null );
		const withdrawPageNotices = () => notices?.dismissScope?.( 'page' );
		watch( visit, withdrawPageNotices );
		onBeforeUnmount( withdrawPageNotices );

		function onNavigated( payload ) {
			reported.value = payload && typeof payload === 'object' ? { path: String( payload.path ?? '' ), title: typeof payload.title === 'string' ? payload.title : '' } : null;
		}

		// A core contract that does not exist yet (screens not converted) is not a failure.
		const unresolvedMessage = computed( () => ( String( props.page.component ).startsWith( 'core/' ) ? __( 'This screen is not available yet.', 'wp-admin-site' ) : undefined ) );

		// An adopted navigation that did not change the path leaves no flag behind.
		watch( () => props.page, ( page, old ) => {
			if ( page?.path === old?.path ) {
				pageFocus.adopted = false;
			}
		} );

		watch( visit, async () => {
			refused.value = false;
			clearPageState();
			const adopted = pageFocus.adopted;
			pageFocus.adopted = false;
			if ( isLegacy.value ) {
				pageFocus.legacy = ! adopted;
				return;
			}
			reported.value = null;
			pageFocus.legacy = false;
			await nextTick();
			heading.value?.focus();
		} );

		// The title the page's answers gave the frame (frameChannel.setTitle()), until the path changes.
		const frameTitle = inject( 'frameTitle', null );
		// After the app's own title effect (which runs before rendering).
		watchEffect( () => {
			const frame = isLegacy.value && reported.value?.path === props.page.path ? reported.value.title : '';
			const given = typeof frameTitle?.value === 'string' && frameTitle.value !== '' ? frameTitle.value : props.page.title;
			const title = forbidden.value ? documentTitle( __( 'Error', 'wp-admin-site' ), props.siteName ) : frame || documentTitle( given, props.siteName );
			if ( globalThis.document ) {
				globalThis.document.title = title;
			}
		}, { flush: 'post' } );

		const onForbidden = () => {
			refused.value = true;
		};

		// The page's own core stylesheets, loaded before its implementation shows.
		let styleHandles = [];
		const syncStyles = () => syncPageStylesheets( globalThis.document, pageStylesheets( styleHandles, i18n.getLocale().dir ) );
		const prepare = ( result ) => {
			styleHandles = isLegacy.value ? [] : result?.stylesheets ?? [];
			return syncStyles();
		};
		const onFailed = () => {
			styleHandles = [];
			syncStyles();
		};
		watch( localeVersion, syncStyles );
		watch( forbidden, ( value ) => value && onFailed() );
		onBeforeUnmount( onFailed );

		// The help the page's module exports, for the frame's Help panel: cleared when the page
		// changes, set once its implementation is resolved.
		const pageHelp = inject( 'pageHelp', null );
		watch( visit, () => pageHelp?.set( null ) );
		const onResolved = ( result ) => pageHelp?.set( isLegacy.value ? null : result?.help ?? null );
		watch( forbidden, ( value ) => pageHelp?.hide( value ), { immediate: true } );
		onBeforeUnmount( () => {
			pageHelp?.set( null );
			pageHelp?.hide( false );
		} );

		// The heading: the classic screen's own `h1` when the page's data gives it (`heading.title`,
		// text, as Edit User's "Edit User <name>"), else the page's title.
		const headingText = computed( () => {
			const title = props.page.data?.heading?.title;
			return typeof title === 'string' && title !== '' ? title : props.page.title;
		} );

		return { visit, headingText, reloading, heading, isLegacy, unresolvedMessage, onNavigated, forbidden, onForbidden, onResolved, errorRouter, forbiddenMarkup, InlineMarkup, prepare, onFailed };
	},
	template: `
		<ErrorScreen v-if="forbidden" id="wp-admin-page" kind="forbidden" :router="errorRouter" :markup="forbiddenMarkup" :markup-component="InlineMarkup" :data-path="page.path" />
		<main v-else id="wp-admin-page" :class="[ 'wrap', 'wp-admin-page', { 'wp-admin-page--legacy': isLegacy } ]" :data-path="page.path" :data-component="page.component" :aria-busy="busy ? 'true' : null">
			<h1 ref="heading" class="wp-heading-inline" tabindex="-1">{{ headingText }}</h1>
			<Contracted
				v-if="! reloading"
				:key="isLegacy ? 'core/legacy' : visit"
				:id="page.component"
				:module="page.module"
				:data="page.data"
				:page="page"
				:unresolved-message="unresolvedMessage"
				:prepare="prepare"
				@navigated="onNavigated"
				@failed="onFailed"
				@forbidden="onForbidden"
				@resolved="onResolved"
			/>
		</main>
	`,
};
