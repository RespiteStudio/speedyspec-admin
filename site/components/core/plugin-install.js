import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { __, sprintf } from '../../runtime/text.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { adminHref } from './dashboard-parts/links.js';
import { filteredViews } from './list-table-views.js';
import { useListPage } from './list-table-parts/list-page.js';
import { useLiveSearch } from './list-table-parts/live-search.js';
import { DieError, failureText, usePageChrome } from './list-table-parts/page-chrome.js';
import { usePackageQueue } from './package-parts/runner.js';
import { announce } from './package-parts/events.js';
import { useCredentials } from './package-parts/credentials.js';
import { useLeaveWarning } from './package-parts/leave-warning.js';
import { ROUTE, usePackagePage } from './package-parts/page-actions.js';
import { useUploadFlow } from './package-parts/upload-flow.js';
import PluginInstallCards from './plugin-install/cards.js';
import { UploadForm, UploadResult } from './plugin-install/upload.js';
import PluginFavorites, { favoritesPath } from './plugin-install/favorites.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables', 'themes' ];

// updates.js: no live search below two characters (wp.updates.searchMinCharacters), after its
// pause on plugin-install.php (`_.debounce( …, 1000 )`).
const SEARCH_MIN = 2;
const SEARCH_PAUSE = 1000;
// updates.js: "Installed!", "Updated!" and "Activated!" show for a second before the next state.
const DONE_PAUSE = 1000;

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const route = ( path ) => ROUTE + String( path ?? '' ).replace( /^\/+/, '' );
const body = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );
const hasRequest = ( request ) => Boolean( request && typeof request.path === 'string' && request.path !== '' );

/**
 * The address the live search opens: the search tab with the type and the term. Pure.
 *
 * @param {string} term The term typed.
 * @param {string} type The search type (`term`, `author`, `tag`).
 * @return {string} The admin path.
 */
export const searchPath = ( term, type ) => 'plugin-install.php?' + new URLSearchParams( { tab: 'search', type: type || 'term', s: term } ).toString();

/**
 * Default implementation of core/plugin-install: Add Plugins (wp-admin/plugin-install.php) in its
 * classic markup: the Upload Plugin toggle (`a.upload-view-toggle.page-title-action`) and the
 * upload form (plugin-install/upload.js), the text, the tabs and the search form in `.wp-filter`,
 * the Favorites form (plugin-install/favorites.js), the tab's text, what a plugin's tab prints, the
 * cards (plugin-install/cards.js) with their navigation, and the popular tags on Featured. The body
 * has the classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data. The page reproduces plugin-install.js and
 * updates.js:
 *
 * - The toggle shows the upload form in place (on the upload tab it is a link back).
 * - Install Now and Update Now are package jobs, one at a time (package-parts/queue.js), with
 *   updates.js's texts and events; Activate posts `plugins/activate`; each card is replaced by the
 *   answer's `card` a second after "Installed!", "Updated!" or "Activated!". A job that needs
 *   filesystem credentials opens the Connection Information dialog (core/filesystem-credentials):
 *   submitted, the queue resumes with them; cancelled, it is emptied and each job announced once.
 * - More Details and the name open the plugin information dialog (core/plugin-information), whose
 *   footer button runs the same jobs; the information address opens it at once.
 * - The upload posts the package, then shows the result in place of the form: Activate Plugin,
 *   Replace current with uploaded, Cancel and go back (package-parts/upload-flow.js).
 * - A relative admin link in plugin output opens through the router (its document-level rule).
 * - Get Favorites stores the username, then opens the tab for it.
 * - The live search (after a pause, history replaced); changing the type searches again.
 *
 * Leaving the page while a package job runs or waits asks updates.js's question first
 * (package-parts/leave-warning.js). Fresh data for the page shown (a live search, which opens in
 * place; a reload) keeps the queue, the cards' states and the search field; a new visit starts
 * afresh.
 *
 * Answers are dropped when a new visit starts (the generation of the page's writes) or the page
 * unmounts. A failed request is WordPress's message in a page notice, or on the card, as
 * updates.js shows it.
 */
export default {
	name: 'PluginInstall',
	components: { Contracted, LegacyHtml, InlineMarkup, DieError, PluginInstallCards, UploadForm, UploadResult, PluginFavorites },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );

		const { router, speak, where, failed, follow, errorText } = useListPage( props, {
			screenId: () => 'plugin-install',
			pathname: '/wp-admin/plugin-install.php',
			blocked: () => pageFailed.value || Boolean( refusal.value ),
			onAnswer: ( answer ) => emit( 'saved', answer ),
			failureText,
		} );
		const credentials = useCredentials();
		const { navigate, openDetails, details, fatalTarget, announceDropped } = usePackagePage( { router, where, type: 'plugin' } );
		const upload = useUploadFlow( { api, credentials, follow, failed, onAnswer: ( answer ) => emit( 'saved', answer ), type: 'plugin' } );

		const tab = computed( () => text( props.data?.tab ) );
		const onUploadTab = computed( () => tab.value === 'upload' );
		const cardOverrides = shallowRef( {} );
		const states = reactive( {} );
		const uploadShown = ref( false );
		const favoritesBusy = ref( false );
		const type = ref( 'term' );

		const cards = computed( () => list( props.data?.cards ).filter( ( item ) => item && typeof item.slug === 'string' ).map( ( item ) => cardOverrides.value[ item.slug ] ?? item ) );
		const clear = ( map ) => Object.keys( map ).forEach( ( key ) => delete map[ key ] );

		// Timers and answers of this data only ----------------------------------------------------

		let generation = 0;
		const timers = new Set();

		function later( run ) {
			const at = generation;
			const timer = globalThis.setTimeout( () => {
				timers.delete( timer );
				if ( at === generation ) {
					run();
				}
			}, DONE_PAUSE );
			timers.add( timer );
		}

		function stopTimers() {
			for ( const timer of timers ) {
				globalThis.clearTimeout( timer );
			}
			timers.clear();
		}

		/** Shows the fresh card the answer gives (the `plugin-install` part), and ends its job's state. */
		function showCard( slug, answer ) {
			const fresh = answer?.card;
			if ( fresh && typeof fresh === 'object' && typeof fresh.slug === 'string' ) {
				cardOverrides.value = { ...cardOverrides.value, [ fresh.slug ]: fresh };
				delete states[ fresh.slug ];
				if ( fresh.slug !== slug ) {
					delete states[ slug ];
				}
			}
		}

		// The package queue (updates.js `wp.updates.queue`) ----------------------------------------

		// What each queued job is about, by its key: its card's slug, the name, its route and who waits.
		const jobInfo = new Map();

		/**
		 * Queues an install or an update with the request WordPress gave the button, for this screen.
		 * Resolves when the job settles (the dialog's footer button waits for it).
		 */
		function queueJob( kind, slug, name, request ) {
			if ( ! hasRequest( request ) ) {
				return Promise.resolve();
			}
			const key = kind === 'update' ? text( body( request ).plugin ) || slug : slug;
			const jobBody = { ...body( request ), screen: 'plugin-install', query: query.value };
			return new Promise( ( resolve ) => {
				const queued = packages.add( { kind, key, body: jobBody }, () => {
					jobInfo.set( key, { slug, name, path: route( request.path ), done: resolve } );
					states[ slug ] = { phase: kind === 'update' ? 'updating' : 'installing', kind, message: null };
				} );
				if ( ! queued ) {
					resolve();
				}
			} );
		}

		function classicArgs( job ) {
			const info = jobInfo.get( job.key ) ?? {};
			return job.kind === 'update' ? { plugin: job.key, slug: info.slug ?? '' } : { slug: info.slug ?? job.key };
		}

		function begin( job ) {
			if ( job.kind === 'update' ) {
				announce( 'wp-plugin-updating', classicArgs( job ) );
				return;
			}
			speak( __( 'Installing... please wait.', 'default' ) );
			announce( 'wp-plugin-installing', classicArgs( job ) );
		}

		function finish( job ) {
			const info = jobInfo.get( job.key );
			jobInfo.delete( job.key );
			info?.done?.();
		}

		function succeed( job, answer ) {
			const info = jobInfo.get( job.key ) ?? {};
			const slug = info.slug ?? job.key;
			const pluginName = text( answer?.pluginName ?? info.name );
			emit( 'saved', answer );
			if ( job.kind === 'update' ) {
				states[ slug ] = { phase: 'updated', kind: 'update', message: null };
				speak( __( 'Update completed successfully.', 'default' ) );
				announce( 'wp-plugin-update-success', { update: 'plugin', plugin: job.key, slug: text( answer?.slug ?? slug ), pluginName, oldVersion: text( answer?.oldVersion ), newVersion: text( answer?.newVersion ) } );
			} else {
				states[ slug ] = { phase: 'installed', kind: 'install', message: null };
				speak( __( 'Installation completed successfully.', 'default' ) );
				announce( 'wp-plugin-install-success', { install: 'plugin', slug: text( answer?.slug ?? slug ), pluginName, plugin: text( answer?.plugin ), activate: text( answer?.activate ) } );
			}
			later( () => showCard( slug, answer ) );
			finish( job );
		}

		function fail( job, error ) {
			const info = jobInfo.get( job.key ) ?? {};
			const slug = info.slug ?? job.key;
			const message = errorText( error );
			console.warn( job.kind === 'update' ? 'Could not update the plugin:' : 'Could not install the plugin:', error );
			if ( job.kind === 'update' ) {
				const said = sprintf( __( 'Update failed: %s', 'default' ), message );
				states[ slug ] = { phase: 'update-failed', kind: 'update', message: said };
				speak( said, 'assertive' );
				announce( 'wp-plugin-update-error', { update: 'plugin', plugin: job.key, slug, pluginName: info.name ?? '', errorCode: text( error?.code ), errorMessage: message } );
			} else {
				const said = sprintf( __( 'Installation failed: %s', 'default' ), message );
				states[ slug ] = { phase: 'install-failed', kind: 'install', message: said };
				speak( said, 'assertive' );
				announce( 'wp-plugin-install-error', { install: 'plugin', slug, errorCode: text( error?.code ), errorMessage: message } );
			}
			finish( job );
		}

		/** Puts a dropped job's card back as it was (updates.js on `credential-modal-cancel`). */
		function putBack( job ) {
			const slug = jobInfo.get( job.key )?.slug ?? job.key;
			delete states[ slug ];
			finish( job );
		}

		const packages = usePackageQueue( {
			credentials,
			path: ( job ) => jobInfo.get( job.key )?.path,
			begin: ( job ) => begin( job ),
			succeed: ( job, answer ) => succeed( job, answer ),
			fail: ( job, error ) => fail( job, error ),
			dropped: ( dropped ) => {
				announceDropped( dropped, ( job ) => jobInfo.get( job.key )?.slug ?? job.key );
				dropped.forEach( putBack );
				speak( __( 'Update canceled.', 'default' ) );
			},
		} );

		// Leaving while a job runs or waits asks first, as updates.js does.
		useLeaveWarning( packages.busy );

		// Activate (wp_ajax_activate_plugin(), as updates.js answers it on a card) ------------------

		async function activateCard( slug, name, request ) {
			if ( ! hasRequest( request ) || states[ slug ]?.phase === 'activating' ) {
				return;
			}
			const at = generation;
			states[ slug ] = { phase: 'activating', kind: 'activate', message: null };
			speak( __( 'Activating... please wait.', 'default' ) );
			let answer;
			try {
				answer = await api.post( route( request.path ), { ...body( request ), screen: 'plugin-install', query: query.value } );
			} catch ( error ) {
				if ( at !== generation ) {
					return;
				}
				const message = errorText( error );
				console.warn( 'Could not activate the plugin:', error );
				announce( 'wp-plugin-activate-error', { activate: 'plugin', slug, pluginName: name, errorCode: text( error?.code ), errorMessage: message } );
				// A plugin that fatals on activation: the classic error page, as the Plugins list shows it.
				const target = fatalTarget( error );
				if ( target ) {
					await follow( target );
					return;
				}
				states[ slug ] = { phase: 'activate-failed', kind: 'activate', message: null };
				speak( sprintf( __( 'Activation failed: %s', 'default' ), message ), 'assertive' );
				return;
			}
			if ( at !== generation ) {
				return;
			}
			emit( 'saved', answer );
			states[ slug ] = { phase: 'activated', kind: 'activate', message: null };
			speak( __( 'Activation completed successfully.', 'default' ) );
			announce( 'wp-plugin-activate-success', { activate: text( answer?.activate ) || 'plugin', slug: text( answer?.slug ) || slug, pluginName: text( answer?.pluginName ) || name, plugin: text( answer?.plugin ) } );
			later( () => showCard( slug, answer ) );
		}

		/** A card's button: Install Now and Update Now queue a job, Activate posts. */
		function actCard( item ) {
			const button = item?.button;
			const slug = text( item?.slug );
			const name = text( item?.name );
			if ( ! button || ! hasRequest( button.request ) || slug === '' ) {
				return Promise.resolve();
			}
			if ( button.action === 'activate' ) {
				return activateCard( slug, name, button.request );
			}
			return queueJob( button.action === 'update' ? 'update' : 'install', slug, name, button.request );
		}

		function dismiss( item ) {
			const state = states[ item?.slug ];
			if ( state ) {
				states[ item.slug ] = { ...state, message: null };
			}
		}

		// The plugin information dialog ------------------------------------------------------------

		const loadInformation = ( slug, section ) => api.get( ROUTE + 'plugins/information', { slug, section } );

		/** The dialog's footer button: the job its request names; after an install or update the dialog reads again. */
		async function actInformation( action, button ) {
			const shown = details.value;
			const request = button?.request;
			if ( ! shown || ! hasRequest( request ) ) {
				return;
			}
			if ( action === 'activate' ) {
				// updates.js: the footer's Activate goes where the activation leads (the Plugins list).
				details.value = null;
				try {
					const answer = await api.post( route( request.path ), body( request ) );
					emit( 'saved', answer );
					await follow( answer );
				} catch ( error ) {
					const target = fatalTarget( error );
					if ( target ) {
						await follow( target );
						return;
					}
					failed( error, 'Could not activate the plugin:' );
				}
				return;
			}
			if ( action !== 'install' && action !== 'update' ) {
				return;
			}
			const name = text( cards.value.find( ( item ) => item.slug === shown.slug )?.name );
			await queueJob( action, shown.slug, name, request );
			if ( details.value === shown ) {
				openDetails( shown.slug, shown.section );
			}
		}

		// The upload (package-parts/upload-flow.js) --------------------------------------------------

		function toggleUpload( event ) {
			if ( onUploadTab.value ) {
				return;
			}
			event?.preventDefault?.();
			uploadShown.value = ! uploadShown.value;
		}

		// Favorites ---------------------------------------------------------------------------------

		async function saveFavorites( user ) {
			const at = generation;
			favoritesBusy.value = true;
			try {
				const answer = await api.post( ROUTE + 'plugins/favorites-user', { user } );
				if ( at !== generation ) {
					return;
				}
				emit( 'saved', answer );
				await navigate( favoritesPath( user ) );
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

		// The live search (updates.js) ----------------------------------------------------------------

		const search = useLiveSearch( { delay: SEARCH_PAUSE, min: SEARCH_MIN, path: ( value ) => searchPath( value, type.value ), navigate } );

		function onTypeChange( event ) {
			type.value = text( event?.target?.value ) || 'term';
			if ( search.term.value.length > 0 ) {
				search.again();
			}
		}

		// Lifecycle ----------------------------------------------------------------------------------

		/** A network whose admin is on another host: the page loads there. */
		function followLocation() {
			if ( typeof props.data?.location === 'string' && props.data.location !== '' ) {
				follow( { redirect: null, location: props.data.location } );
			}
		}

		/** The data of a new visit: everything the page held goes. */
		function reset() {
			generation++;
			stopTimers();
			packages.reset();
			for ( const info of jobInfo.values() ) {
				info.done?.();
			}
			jobInfo.clear();
			cardOverrides.value = {};
			clear( states );
			uploadShown.value = props.data?.upload?.open === true;
			upload.reset();
			favoritesBusy.value = false;
			credentials.clear();
			search.reset( props.data?.search?.term );
			type.value = text( props.data?.search?.type ) || 'term';
			details.value = null;
			const information = props.data?.information;
			if ( information && typeof information.slug === 'string' ) {
				openDetails( information.slug, information.section );
			}
			followLocation();
		}

		/*
		 * Fresh data for the page shown (a live search in place, a reload of the same address), as
		 * updates.js's Ajax search replaces only the cards: the package queue and the cards' states,
		 * the held credentials, the upload, an open dialog, the search field's text and type stay.
		 */
		watch( () => props.data, ( data, old ) => ( old === undefined ? reset() : followLocation() ), { immediate: true } );
		onBeforeUnmount( () => {
			generation++;
			packages.reset();
			upload.reset();
			stopTimers();
		} );

		return {
			pageFailed, refusal, tab, onUploadTab, cards, states, uploadShown, uploadResult: upload.result, uploadBusy: upload.busy, favoritesBusy, details, term: search.term, type,
			credentialsForm: credentials.form, credentialsOpen: credentials.open, submitCredentials: credentials.submit, cancelCredentials: credentials.cancel,
			headings: computed( () => ( props.data?.headings && typeof props.data.headings === 'object' ? props.data.headings : {} ) ),
			tabs: computed( () => list( props.data?.tabs ).filter( ( item ) => typeof item?.key === 'string' && typeof item.label === 'string' ) ),
			viewsHtml: computed( () => filteredViews( props.data?.viewsHtml ) ),
			searchTypes: computed( () => list( props.data?.search?.types ).filter( ( item ) => typeof item?.value === 'string' ) ),
			dependencyNotices: computed( () => list( props.data?.dependencyNotices ).filter( ( item ) => typeof item === 'string' ) ),
			popularTags: computed( () => list( props.data?.popularTags ).filter( ( item ) => typeof item?.name === 'string' ) ),
			toggleHref: computed( () => adminHref( onUploadTab.value ? 'plugin-install.php' : 'plugin-install.php?tab=upload' ) ),
			href: ( path ) => adminHref( text( path ) ),
			fontSize: ( size ) => ( /^\d+(?:\.\d+)?pt$/.test( text( size ) ) ? { fontSize: size } : undefined ),
			actCard, dismiss, openDetails, loadInformation, actInformation,
			submitUpload: upload.submitUpload, replaceUploaded: upload.replaceUploaded, cancelUploaded: upload.cancelUploaded, activateUploaded: upload.activateUploaded, toggleUpload, saveFavorites,
			onSearchInput: search.onInput, onTypeChange, onSearchSubmit: search.onSubmit,
			retry: () => router?.refresh?.(),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-plugin-install-failed">{{ $__( 'The plugins could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-plugin-install-error" />
		<div v-else :class="[ 'wp-admin-plugin-install', 'plugin-install-tab-' + tab, { 'show-upload-view': uploadShown && ! onUploadTab } ]">
			<a v-if="data.upload" :href="toggleHref" class="upload-view-toggle page-title-action" :role="onUploadTab ? null : 'button'" :aria-expanded="onUploadTab ? null : String( uploadShown )" @click="toggleUpload"><span class="upload">{{ data.upload.label }}</span><span class="browse">{{ data.upload.browseLabel }}</span></a>
			<hr class="wp-header-end">

			<div v-for="( notice, index ) in dependencyNotices" :key="'dependency' + index" class="notice notice-warning"><p><InlineMarkup :html="notice" /></p></div>

			<template v-if="onUploadTab">
				<UploadResult v-if="uploadResult" :result="uploadResult" :busy="uploadBusy" @activate="activateUploaded" @overwrite="replaceUploaded" @cancel="cancelUploaded" />
				<UploadForm v-else-if="data.upload" :upload="data.upload" :busy="uploadBusy" @submit="submitUpload" />
			</template>
			<template v-else>
				<div v-if="data.upload" class="upload-plugin-wrap">
					<UploadResult v-if="uploadResult" :result="uploadResult" :busy="uploadBusy" @activate="activateUploaded" @overwrite="replaceUploaded" @cancel="cancelUploaded" />
					<UploadForm v-else :upload="data.upload" :busy="uploadBusy" @submit="submitUpload" />
				</div>

				<h2 v-if="headings.views" class="screen-reader-text">{{ headings.views }}</h2>
				<p v-if="data.intro"><InlineMarkup :html="data.intro" /></p>
				<div class="wp-filter">
					<ul class="filter-links">
						<template v-if="viewsHtml"><li v-for="view in viewsHtml" :key="view.key" :class="view.key"><LegacyHtml tag="span" :html="view.html" /></li></template>
						<template v-else><li v-for="item in tabs" :key="item.key" :class="'plugin-install-' + item.key"><a :href="href( item.path )" :class="{ current: item.current }" :aria-current="item.current ? 'page' : null">{{ item.label }}</a></li></template>
					</ul>
					<form v-if="data.search" class="search-form search-plugins" method="get" @submit="onSearchSubmit">
						<input type="hidden" name="tab" value="search" />
						<label for="search-plugins">{{ data.search.label }}</label>
						<input type="search" name="s" id="search-plugins" :value="term" class="wp-filter-search" aria-describedby="live-search-desc" @input="onSearchInput" @keyup="onSearchInput" />
						<label class="screen-reader-text" for="typeselector">{{ data.search.typeLabel }}</label>
						<select name="type" id="typeselector" :value="type" @change="onTypeChange">
							<option v-for="option in searchTypes" :key="option.value" :value="option.value">{{ option.label }}</option>
						</select>
						{{ ' ' }}<input type="submit" id="search-submit" class="button hide-if-js" :value="data.search.label" />
					</form>
				</div>

				<PluginFavorites v-if="data.favorites" :favorites="data.favorites" :busy="favoritesBusy" @save="saveFavorites" />
				<p v-if="data.notice"><InlineMarkup :html="data.notice" /></p>

				<form v-if="data.showTable" id="plugin-filter" method="post" @submit.prevent>
					<Contracted v-if="data.pagination" id="core/list-table-nav" which="top" :pagination="data.pagination" :heading="headings.pagination ?? null" :has-items="cards.length > 0" />
					<div class="wp-list-table widefat plugin-install">
						<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
						<PluginInstallCards :cards="cards" :states="states" :no-items="data.noItems ?? ''" :api-error="data.apiError === true" @act="actCard" @details="openDetails" @dismiss="dismiss" @retry="retry" />
					</div>
					<Contracted v-if="data.pagination" id="core/list-table-nav" which="bottom" :pagination="data.pagination" :has-items="cards.length > 0" />
				</form>

				<LegacyHtml v-if="typeof data.tabHtml === 'string'" :html="data.tabHtml" />

				<div v-if="data.popularTags" class="plugins-popular-tags-wrapper">
					<h2>{{ $__( 'Popular tags', 'default' ) }}</h2>
					<p>{{ $__( 'You may also browse based on the most popular tags in the Plugin Directory:', 'default' ) }}</p>
					<p class="popular-tags"><InlineMarkup v-if="data.popularTagsError" :html="data.popularTagsError" /><template v-else v-for="( tag, index ) in popularTags" :key="tag.name"><template v-if="index > 0">{{ ' ' }}</template><a :href="href( tag.path )" :class="[ 'tag-cloud-link', 'tag-link-position-' + ( index + 1 ) ]" :style="fontSize( tag.fontSize )" :aria-label="tag.ariaLabel || null">{{ tag.name }}</a></template></p>
					<br class="clear" />
				</div>
			</template>

			<span class="spinner"></span>

			<Contracted v-if="credentialsOpen" id="core/filesystem-credentials" :form="credentialsForm ?? {}" :open="credentialsOpen" @submit="submitCredentials" @cancel="cancelCredentials" />
			<Contracted v-if="details" :key="details.key" id="core/plugin-information" :slug="details.slug" :section="details.section" :load="loadInformation" :act="actInformation" @close="details = null" />
		</div>
	`,
};
