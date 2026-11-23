import { computed, inject, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { __, sprintf } from '../../runtime/text.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';
import { bulkCheck } from './list-table-parts/list-form.js';
import { useListPage } from './list-table-parts/list-page.js';
import { DieError, failureText, usePageChrome } from './list-table-parts/page-chrome.js';
import { abandon, emptyQueue, enqueue, needsCredentials, resume, settle, start } from './package-parts/queue.js';
import { announce } from './package-parts/events.js';
import { useCredentials } from './package-parts/credentials.js';
import PluginsTable, { filteredPluginAction, hasRequest } from './plugins/rows.js';
import { planBulk, requestAction, updateRequest } from './plugins/bulk.js';
import { countedLabel } from './plugins/auto-updates.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'list-tables' ];

const ROUTE = 'wp-admin/v1/';
const BULK_ROUTE = ROUTE + 'plugins/bulk';
const JOB_ROUTES = { update: ROUTE + 'plugins/update', delete: ROUTE + 'plugins/delete' };
// updates.js: no live search below two characters (wp.updates.searchMinCharacters), after a pause.
const SEARCH_MIN = 2;
const SEARCH_PAUSE = 500;

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const route = ( request ) => ROUTE + String( request?.path ?? '' ).replace( /^\/+/, '' );
const body = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );

/**
 * The query of `DELETE plugins/recent`: the list's query as `list[key]=value`, the form WordPress
 * reads an object from in a query string. Pure.
 *
 * @param {object} query The list's query.
 * @return {string} The query string, without `?`.
 */
export function listParams( query ) {
	const params = new URLSearchParams();
	for ( const [ key, value ] of Object.entries( query ?? {} ) ) {
		if ( typeof value === 'string' || typeof value === 'number' ) {
			params.append( 'list[' + key + ']', String( value ) );
		}
	}
	return params.toString();
}

/**
 * The address the live search opens, as updates.js writes it: the term and the view. Pure.
 *
 * @param {string} term   The term typed.
 * @param {string} status The current view.
 * @return {string} The admin path.
 */
export const searchPath = ( term, status ) => 'plugins.php?' + new URLSearchParams( { s: term, plugin_status: status || 'all' } ).toString();

/** The admin path of a scrape frame, or null for anything that is not a relative admin path. Pure. */
export const scrapePath = ( scrape ) => {
	const path = text( scrape?.path );
	return /^[a-z0-9-]+\.php(?:\?[^\s]*)?$/i.test( path ) ? adminHref( path ) : null;
};

/**
 * Default implementation of core/plugins: the Plugins list (wp-admin/plugins.php) in its classic
 * markup: Add Plugin, the search subtitle, the messages (the fatal activation error with the classic
 * error output in a frame that runs no script), what plugins print before the views, the views, the
 * search form (`form.search-plugins`, `#plugin-search-input`), then `form#bulk-action-form` with the
 * navigation (Clear List in the Recently Active view, the Must-Use and Drop-ins note), the table
 * (`#the-list`, plugins/rows.js) and the navigation below it. The body has the classes WordPress
 * names while it is shown.
 *
 * Everything WordPress decides comes as data. The page reproduces common.js and updates.js:
 *
 * - Activate, Deactivate and Resume post their request and follow the answer; a fatal activation
 *   follows the classic error page its error gives (`data.redirect`).
 * - Delete asks the action's question; Delete and "update now" are package jobs, one at a time
 *   (package-parts/queue.js), with updates.js's texts and events (package-parts/events.js); the
 *   answer's fresh row, views and menu counts are shown. A job that needs filesystem credentials
 *   opens the Connection Information dialog (core/filesystem-credentials): submitted, the queue
 *   resumes with them; cancelled, it is emptied and each job announced once.
 * - Bulk Update and Delete queue a job per checked row; the other bulk actions post `plugins/bulk`.
 * - The auto-updates toggle, Clear List, "View details" (core/plugin-information) and the live
 *   search (after a pause, with the view kept, history replaced).
 * - Screen Options give the frame the table's columns and the per page, saved for screen `plugins`.
 *
 * Answers are dropped when the data changes or the page unmounts. A failed request is WordPress's
 * message in a page notice.
 */
export default {
	name: 'Plugins',
	components: { Contracted, LegacyHtml, InlineMarkup, Format, DieError, PluginsTable },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const query = computed( () => ( props.data?.query && typeof props.data.query === 'object' && ! Array.isArray( props.data.query ) ? props.data.query : {} ) );

		const { router, speak, answers, failed, follow, sendAndFollow, bulkError, columns, errorText } = useListPage( props, {
			screenId: () => 'plugins',
			pathname: '/wp-admin/plugins.php',
			blocked: () => pageFailed.value || Boolean( refusal.value ),
			onAnswer: ( answer ) => emit( 'saved', answer ),
			failureText,
		} );
		const frame = inject( 'frameChannel', null );
		const credentials = useCredentials();

		// The state of the rows while the page is shown, by plugin file.
		const overrides = shallowRef( {} );
		const viewsOverride = shallowRef( null );
		const jobs = reactive( {} );
		const updates = reactive( {} );
		const deleteErrors = reactive( {} );
		const deleted = reactive( {} );
		const autoStates = reactive( {} );
		const selected = ref( [] );
		const bulkValue = ref( '-1' );
		const dismissed = ref( [] );
		const details = ref( null );
		const term = ref( '' );

		const headings = computed( () => ( props.data?.headings && typeof props.data.headings === 'object' ? props.data.headings : {} ) );
		const items = computed( () => list( props.data?.items ).filter( ( item ) => item && typeof item.file === 'string' ).map( ( item ) => overrides.value[ item.file ] ?? item ) );
		const views = computed( () => viewsOverride.value ?? list( props.data?.views ) );
		const messages = computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) );
		const status = computed( () => text( query.value.plugin_status ) || views.value.find( ( view ) => view?.current )?.key || 'all' );
		const itemOf = ( file ) => items.value.find( ( item ) => item.file === file ) ?? null;
		const clear = ( map ) => Object.keys( map ).forEach( ( key ) => delete map[ key ] );

		// Answers --------------------------------------------------------------------------------

		/** Shows the `plugins` builder part of an answer: the fresh row, the views and the menu counts. */
		function applyPart( file, answer ) {
			if ( answer?.row && typeof answer.row === 'object' && answer.row.file === file ) {
				overrides.value = { ...overrides.value, [ file ]: answer.row };
			}
			if ( Array.isArray( answer?.views ) ) {
				viewsOverride.value = answer.views;
			}
			if ( answer?.menuCounts ) {
				frame?.setMenuCounts?.( answer.menuCounts );
			}
		}

		/** A route whose answer leads somewhere: a fatal activation leads to the classic error page. */
		function sendRequest( request, extra, what ) {
			return answers.ordered( api.post( route( request ), { ...body( request ), ...extra } ), ( answer ) => {
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => {
				if ( error?.code === 'plugin_activation_fatal' && typeof error.data?.redirect === 'string' ) {
					follow( { redirect: error.data.redirect, location: error.data.location ?? null } );
					return;
				}
				failed( error, what );
			} );
		}

		// The package queue (updates.js `wp.updates.queue`) ----------------------------------------

		let queue = emptyQueue();
		let generation = 0;

		const classicArgs = ( job ) => ( { plugin: job.key, slug: jobs[ job.key ]?.slug ?? '' } );

		function queueJob( kind, item ) {
			const jobBody = { plugin: item.file, screen: 'plugins', query: query.value };
			const held = credentials.current();
			if ( held ) {
				jobBody.credentials = held;
			}
			const next = enqueue( queue, { kind, key: item.file, body: jobBody } );
			if ( next === queue ) {
				return;
			}
			queue = next;
			jobs[ item.file ] = { kind, phase: 'queued', slug: text( item.slug ?? item.id ), name: text( item.name ) };
			delete deleteErrors[ item.file ];
			pump();
		}

		function begin( job ) {
			jobs[ job.key ] = { ...jobs[ job.key ], phase: 'running' };
			if ( job.kind === 'update' ) {
				updates[ job.key ] = { phase: 'updating' };
				announce( 'wp-plugin-updating', classicArgs( job ) );
			} else {
				speak( __( 'Deleting...', 'default' ) );
				announce( 'wp-plugin-deleting', classicArgs( job ) );
			}
		}

		function succeed( job, answer ) {
			const info = jobs[ job.key ] ?? {};
			delete jobs[ job.key ];
			emit( 'saved', answer );
			if ( job.kind === 'update' ) {
				updates[ job.key ] = { phase: 'updated', pluginName: text( answer?.pluginName ?? info.name ) };
				applyPart( job.key, answer );
				speak( __( 'Update completed successfully.', 'default' ) );
				announce( 'wp-plugin-update-success', { update: 'plugin', plugin: job.key, slug: text( answer?.slug ?? info.slug ), pluginName: text( answer?.pluginName ?? info.name ), oldVersion: text( answer?.oldVersion ), newVersion: text( answer?.newVersion ) } );
				return;
			}
			deleted[ job.key ] = { name: text( answer?.pluginName ?? info.name ) };
			selected.value = selected.value.filter( ( file ) => file !== job.key );
			applyPart( job.key, { ...answer, row: null } );
			announce( 'wp-plugin-delete-success', { delete: 'plugin', plugin: job.key, slug: text( answer?.slug ?? info.slug ), pluginName: text( answer?.pluginName ?? info.name ) } );
		}

		function fail( job, error ) {
			const info = jobs[ job.key ] ?? {};
			delete jobs[ job.key ];
			const message = errorText( error );
			console.warn( job.kind === 'update' ? 'Could not update the plugin:' : 'Could not delete the plugin:', error );
			if ( job.kind === 'update' ) {
				updates[ job.key ] = { phase: 'failed', message };
				speak( sprintf( __( 'Update failed: %s', 'default' ), message ), 'assertive' );
				announce( 'wp-plugin-update-error', { update: 'plugin', plugin: job.key, slug: info.slug ?? '', pluginName: info.name ?? '', errorCode: text( error?.code ), errorMessage: message } );
				return;
			}
			deleteErrors[ job.key ] = message;
			announce( 'wp-plugin-delete-error', { delete: 'plugin', plugin: job.key, slug: info.slug ?? '', errorCode: text( error?.code ), errorMessage: message } );
		}

		/** Puts a dropped job's row back as it was, and says so for an update that had started. */
		function putBack( job ) {
			const started = updates[ job.key ]?.phase === 'updating';
			delete jobs[ job.key ];
			if ( job.kind === 'update' ) {
				delete updates[ job.key ];
				if ( started ) {
					speak( __( 'Update canceled.', 'default' ) );
				}
			}
		}

		async function askCredentials( error, at ) {
			const values = await credentials.ask( error?.data?.form ?? {} );
			if ( at !== generation ) {
				return;
			}
			if ( values ) {
				// The routes take the form's fields as one `credentials` object.
				queue = resume( queue, { credentials: values } );
				return;
			}
			const { queue: rest, dropped } = abandon( queue );
			queue = rest;
			for ( const job of dropped ) {
				// As updates.js queues it: `{ action, data: { plugin, slug } }` (classicJob()).
				announce( 'credential-modal-cancel', { ...job, body: { ...job.body, slug: jobs[ job.key ]?.slug ?? '' } } );
				putBack( job );
			}
		}

		async function pump() {
			const { queue: next, job } = start( queue );
			if ( ! job ) {
				return;
			}
			queue = next;
			const at = generation;
			begin( job );
			let outcome;
			try {
				outcome = { ok: true, answer: await api.post( JOB_ROUTES[ job.kind ], job.body ) };
			} catch ( error ) {
				outcome = { ok: false, error };
			}
			if ( at !== generation ) {
				return;
			}
			queue = settle( queue, job.key, outcome );
			if ( outcome.ok ) {
				succeed( job, outcome.answer );
			} else if ( needsCredentials( queue ) ) {
				await askCredentials( outcome.error, at );
				if ( at !== generation ) {
					return;
				}
			} else {
				fail( job, outcome.error );
			}
			pump();
		}

		// Actions ----------------------------------------------------------------------------------

		/** A row's core action: Delete asks first and is a package job; the others post and follow. */
		function act( item, action ) {
			if ( ! hasRequest( action ) ) {
				return;
			}
			if ( action.action === 'delete' ) {
				if ( typeof action.confirm === 'string' && action.confirm !== '' && ! globalThis.confirm?.( action.confirm ) ) {
					return;
				}
				queueJob( 'delete', item );
				return;
			}
			sendRequest( action.request, { list: query.value }, 'Could not change the plugin:' );
		}

		/** A click in row actions plugins filtered: a core link (its classic id) runs natively. */
		function onActionsHtml( item, event ) {
			const action = filteredPluginAction( event, item );
			if ( ! action ) {
				return;
			}
			event.preventDefault?.();
			act( item, action );
		}

		function onUpdate( item ) {
			if ( updateRequest( item ) ) {
				queueJob( 'update', item );
			}
		}

		function applyBulk( value ) {
			const action = String( value ?? bulkValue.value );
			const files = [ ...selected.value ];
			const check = bulkCheck( action, files.length );
			if ( check ) {
				bulkError( check );
				return Promise.resolve();
			}
			const plan = planBulk( action, items.value, files );
			if ( plan.kind === 'bulk' ) {
				return sendAndFollow( BULK_ROUTE, { action, plugins: plan.files, list: query.value }, 'Could not run the bulk action:' );
			}
			if ( plan.kind === 'delete' && ! globalThis.confirm?.( __( 'Are you sure you want to delete the selected plugins and their data?', 'default' ) ) ) {
				return Promise.resolve();
			}
			// As updates.js: the checked rows that are not queued are unchecked.
			selected.value = selected.value.filter( ( file ) => plan.files.includes( file ) );
			for ( const file of plan.files ) {
				const item = itemOf( file );
				if ( item ) {
					queueJob( plan.kind, item );
				}
			}
			return Promise.resolve();
		}

		/** Clear List: `DELETE plugins/recent` with the list's query, then the answer. */
		function clearRecent() {
			const qs = listParams( query.value );
			return answers.ordered( api.del( ROUTE + 'plugins/recent' + ( qs ? '?' + qs : '' ) ), ( answer ) => {
				emit( 'saved', answer );
				follow( answer );
			}, ( error ) => failed( error, 'Could not clear the list:' ) );
		}

		// The auto-updates toggle --------------------------------------------------------------------

		function bumpViews( action ) {
			const delta = action === 'enable' ? 1 : -1;
			viewsOverride.value = views.value.map( ( view ) => {
				if ( view?.key === 'auto-update-enabled' || view?.key === 'auto-update-disabled' ) {
					const change = view.key === 'auto-update-enabled' ? delta : -delta;
					const count = Math.max( 0, Number( view.count ?? 0 ) + change );
					return { ...view, count, labelHtml: countedLabel( view.labelHtml, change ), label: text( view.label ).replace( /\(\d+\)/, '(' + count + ')' ) };
				}
				return view;
			} );
		}

		async function toggleAutoUpdates( item, action, { refresh = false } = {} ) {
			const request = item.autoUpdate?.request;
			if ( ! request || autoStates[ item.file ]?.busy ) {
				return;
			}
			const at = generation;
			autoStates[ item.file ] = { ...( autoStates[ item.file ] ?? {} ), busy: true, error: null };
			try {
				const answer = await api.post( route( request ), { ...body( request ), state: action } );
				if ( at !== generation ) {
					return;
				}
				emit( 'saved', answer );
				autoStates[ item.file ] = { busy: false, error: null, answer };
				bumpViews( action );
				speak( action === 'enable' ? __( 'Auto-updates enabled', 'default' ) : __( 'Auto-updates disabled', 'default' ) );
				if ( refresh ) {
					await router?.refresh?.();
				}
			} catch ( error ) {
				if ( at !== generation ) {
					return;
				}
				console.warn( 'Could not change the automatic updates:', error );
				const message = errorText( error, __( 'The request could not be completed.', 'default' ) );
				autoStates[ item.file ] = { ...( autoStates[ item.file ] ?? {} ), busy: false, error: message };
				speak( message, 'assertive' );
			}
		}

		// The plugin information dialog ------------------------------------------------------------

		function openDetails( slug, section = 'description' ) {
			if ( typeof slug === 'string' && slug !== '' ) {
				details.value = { slug, section };
			}
		}

		const loadInformation = ( slug, section ) => api.get( ROUTE + 'plugins/information', { slug, section } );

		/** The dialog's footer button on this list: update or activate the plugin of its row. */
		function actInformation( action ) {
			const slug = details.value?.slug;
			const item = items.value.find( ( row ) => row.id === slug || row.update?.detailsSlug === slug );
			if ( ! item ) {
				return Promise.resolve();
			}
			if ( action === 'update' ) {
				onUpdate( item );
			} else if ( action === 'activate' ) {
				const activate = requestAction( item, 'activate' );
				if ( activate ) {
					details.value = null;
					return sendRequest( activate.request, { list: query.value }, 'Could not activate the plugin:' );
				}
			}
			return Promise.resolve();
		}

		// The live search (updates.js) ----------------------------------------------------------------

		let searchTimer = null;
		let lastSearched = '';
		let previousLength = 0;

		function stopSearchTimer() {
			if ( searchTimer !== null ) {
				globalThis.clearTimeout( searchTimer );
				searchTimer = null;
			}
		}

		function navigate( path, options ) {
			const url = adminHref( path );
			if ( router?.navigate ) {
				return options ? router.navigate( url, options ) : router.navigate( url );
			}
			globalThis.location?.assign?.( url );
			return Promise.resolve();
		}

		function onSearchInput( event ) {
			term.value = text( event?.target?.value );
			if ( event?.type === 'keyup' && event.key === 'Escape' ) {
				term.value = '';
				if ( event.target ) {
					event.target.value = '';
				}
			}
			stopSearchTimer();
			searchTimer = globalThis.setTimeout( () => {
				searchTimer = null;
				const length = term.value.length;
				const should = length >= SEARCH_MIN || previousLength > SEARCH_MIN;
				previousLength = length;
				if ( ! should || term.value === lastSearched ) {
					return;
				}
				lastSearched = term.value;
				navigate( searchPath( term.value, status.value ), { replace: true } );
			}, SEARCH_PAUSE );
		}

		function onSearchSubmit( event ) {
			event?.preventDefault?.();
			stopSearchTimer();
			lastSearched = term.value;
			navigate( searchPath( term.value, status.value ) );
		}

		// Lifecycle ----------------------------------------------------------------------------------

		function reset() {
			generation++;
			queue = emptyQueue();
			overrides.value = {};
			viewsOverride.value = null;
			[ jobs, updates, deleteErrors, deleted, autoStates ].forEach( clear );
			selected.value = [];
			bulkValue.value = '-1';
			dismissed.value = [];
			details.value = null;
			credentials.clear();
			stopSearchTimer();
			term.value = text( props.data?.search?.value );
			lastSearched = term.value;
			previousLength = term.value.length;
		}

		watch( () => props.data, reset, { immediate: true } );
		onBeforeUnmount( () => {
			generation++;
			stopSearchTimer();
		} );

		return {
			pageFailed, refusal, query, headings, items, views, messages, status, selected, bulkValue, columns, dismissed, details, term,
			jobs, updates, deleteErrors, deleted, autoStates,
			credentialsForm: credentials.form, credentialsOpen: credentials.open, submitCredentials: credentials.submit, cancelCredentials: credentials.cancel,
			act, onActionsHtml, onUpdate, applyBulk, clearRecent, openDetails, loadInformation, actInformation, onSearchInput, onSearchSubmit,
			onToggle: ( item, action ) => toggleAutoUpdates( item, action ),
			onFilteredToggle: ( item, action ) => toggleAutoUpdates( item, action, { refresh: true } ),
			scrapePath,
			href: ( path ) => adminHref( path ),
			paged: computed( () => String( props.data?.pagination?.page ?? 1 ) ),
			searchKeep: computed( () => list( props.data?.search?.keep ).filter( ( field ) => typeof field?.name === 'string' && field.name !== '' ) ),
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-plugins-failed">{{ $__( 'The plugins could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-plugins-error" />
		<div v-else class="wp-admin-plugins">
			<a v-if="data.heading?.addNew?.path" :href="href( data.heading.addNew.path )" class="page-title-action">{{ data.heading.addNew.label }}</a>
			<span v-if="data.heading?.search" class="subtitle"><Format :text="$__( 'Search results for: %s', 'default' )"><template #arg1><strong>{{ data.heading.search }}</strong></template></Format></span>
			<hr class="wp-header-end">

			<template v-for="( message, index ) in messages" :key="index">
				<div v-if="message.type === 'warning'" class="notice notice-warning"><p><InlineMarkup :html="message.markup" /></p></div>
				<div v-else-if="! dismissed.includes( index )" id="message" :class="[ 'notice', message.type === 'error' ? 'error' : 'updated', { 'is-dismissible': message.dismissible === true } ]"><p><InlineMarkup :html="message.markup" /><iframe v-if="scrapePath( message.scrape )" :src="scrapePath( message.scrape )" sandbox="" :title="$__( 'Plugin error output', 'wp-admin-site' )" style="border:0" width="100%" height="70px"></iframe></p><button v-if="message.dismissible === true" type="button" class="notice-dismiss" @click="dismissed.push( index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>
			</template>

			<LegacyHtml v-if="typeof data.preHtml === 'string'" :html="data.preHtml" />

			<Contracted id="core/list-table-views" :views="views" :views-html="data.viewsHtml ?? null" :heading="headings.views ?? null" />

			<form class="search-form search-plugins" method="get" @submit="onSearchSubmit">
				<template v-if="data.search?.shown">
					<input v-for="field in searchKeep" :key="field.name" type="hidden" :name="field.name" :value="field.value" />
					<p class="search-box">
						<label :for="data.search.inputId">{{ data.search.label }}</label>
						<input type="search" :id="data.search.inputId" class="wp-filter-search" name="s" :value="term" aria-describedby="live-search-desc" @input="onSearchInput" @keyup="onSearchInput" />
						{{ ' ' }}<input type="submit" id="search-submit" class="button hide-if-js" :value="data.search.label" @click="onSearchSubmit" />
					</p>
				</template>
			</form>

			<form method="post" id="bulk-action-form" @submit.prevent>
				<input type="hidden" name="plugin_status" :value="status" />
				<input type="hidden" name="paged" :value="paged" />

				<Contracted id="core/list-table-nav" which="top" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :heading="headings.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra><div v-if="data.recent || data.tablenavNote" class="alignleft actions"><input v-if="data.recent" type="submit" name="clear-recent-list" id="clear-recent-list" class="button" :value="data.recent.label" @click.prevent="clearRecent" /><p v-else><InlineMarkup :html="data.tablenavNote" /></p></div></template>
				</Contracted>

				<h2 v-if="headings.list" class="screen-reader-text">{{ headings.list }}</h2>
				<PluginsTable :columns="columns" :classes="data.classes ?? []" :caption="data.caption ?? null" :items="items" :select-all="( data.bulkActions ?? [] ).length > 0" :no-items="data.noItems ?? null" v-model:selected="selected" :jobs="jobs" :updates="updates" :delete-errors="deleteErrors" :deleted="deleted" :auto-states="autoStates" @act="act" @actions-html="onActionsHtml" @update="onUpdate" @details="openDetails" @toggle="onToggle" @filtered-toggle="onFilteredToggle" />

				<Contracted id="core/list-table-nav" which="bottom" :bulk-actions="data.bulkActions ?? []" :pagination="data.pagination ?? null" :has-items="items.length > 0" v-model:bulkValue="bulkValue" @bulk="applyBulk">
					<template #extra><div v-if="data.recent || data.tablenavNote" class="alignleft actions"><input v-if="data.recent" type="submit" name="clear-recent-list" id="clear-recent-list" class="button" :value="data.recent.label" @click.prevent="clearRecent" /></div></template>
				</Contracted>
			</form>

			<span class="spinner"></span>

			<Contracted v-if="credentialsOpen" id="core/filesystem-credentials" :form="credentialsForm ?? {}" :open="credentialsOpen" @submit="submitCredentials" @cancel="cancelCredentials" />
			<Contracted v-if="details" id="core/plugin-information" :slug="details.slug" :section="details.section" :load="loadInformation" :act="actInformation" @close="details = null" />
		</div>
	`,
};
