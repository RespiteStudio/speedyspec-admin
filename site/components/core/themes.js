import { computed, inject, onBeforeUnmount, reactive, ref, shallowRef, watch, watchEffect, nextTick } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { __, _x, sprintf } from '../../runtime/text.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { adminHref } from './dashboard-parts/links.js';
import { DieError, failureText, usePageActions, usePageChrome } from './list-table-parts/page-chrome.js';
import { usePackageQueue } from './package-parts/runner.js';
import { announce } from './package-parts/events.js';
import { useCredentials } from './package-parts/credentials.js';
import { useLeaveWarning } from './package-parts/leave-warning.js';
import { ROUTE, usePackagePage } from './package-parts/page-actions.js';
import ThemeCards from './themes/cards.js';
import ThemeOverlay from './themes/overlay.js';
import BrokenThemes from './themes/broken.js';
import { matchThemes, showsAuthor } from './themes/search.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'themes' ];

// theme.js: the search runs when typing comes to a rest (`_.debounce( doSearch, 500 )`).
const SEARCH_PAUSE = 500;
// The phases of a card's job while it is queued or running (F12: fresh data keeps those cards).
const PENDING = [ 'updating', 'deleting' ];

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const route = ( request ) => ROUTE + text( request?.route ).replace( /^\/+/, '' );
const body = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );
const hasRequest = ( request ) => Boolean( request && typeof request.route === 'string' && request.route !== '' );
const isCard = ( value ) => Boolean( value && typeof value === 'object' && typeof value.id === 'string' && value.id !== '' );

/** The text of a theme header's inline markup (a name), as a screen reader hears it. */
function plain( markup ) {
	const value = text( markup );
	if ( typeof globalThis.DOMParser === 'function' ) {
		return new globalThis.DOMParser().parseFromString( value, 'text/html' ).body.textContent ?? '';
	}
	return value.replace( /<[^>]*>/g, '' );
}

/** The admin path of the list with a search, or without one. Pure. */
export const searchPath = ( term ) => ( term === '' ? 'themes.php' : 'themes.php?' + new URLSearchParams( { search: term } ).toString() );

/**
 * Default implementation of core/themes: Themes (wp-admin/themes.php) in its classic markup: the
 * count beside the page host's heading, Add Theme, the search form, the messages, the theme cards
 * (themes/cards.js) and their details (themes/overlay.js), the no-themes text and the broken themes
 * (themes/broken.js). The body has the classes WordPress names while it is shown.
 *
 * Everything WordPress decides comes as data. The page reproduces theme.js and updates.js:
 *
 * - Activate posts its request and follows the answer (a link a plugin rewrote is opened as a
 *   link); Customize and Live Preview open the hosted Customizer through the router.
 * - Update now and Delete are package jobs, one at a time (package-parts/queue.js), with
 *   updates.js's texts and events (`wp-theme-*`); the answer's card, count, menu counts and broken
 *   themes replace the page's. A job that needs filesystem credentials opens the Connection
 *   Information dialog (core/filesystem-credentials): submitted, the queue resumes with them;
 *   cancelled, it is emptied and each job announced once.
 * - Theme Details opens the details at `?theme=` in place (a history entry, as theme.js's router
 *   adds); closing goes back to `themes.php`, the focus on the card's details button. Back and
 *   Forward between these addresses open or close the details in the page (pageState's
 *   `onAddress`): no read, no leave question, the jobs go on.
 * - The search (themes/search.js) filters the themes the page was sent, after theme.js's pause,
 *   and keeps `?search=` in the address in place, replacing the history entry.
 * - The auto-update toggle posts its request and shows the answer.
 * - The broken themes' Resume posts and follows; Delete and Install Parent Theme are package jobs.
 *
 * Leaving the page while a package job runs or waits asks updates.js's question first
 * (package-parts/leave-warning.js). Fresh data for the page shown (an in-place navigation) keeps
 * the search, the details, the queue and the cards of the jobs still queued or running; a new
 * visit starts afresh. Answers are dropped when a new visit starts or the page unmounts. A failed
 * request is WordPress's message: in a page notice, or where updates.js shows it.
 */
export default {
	name: 'Themes',
	components: { Contracted, InlineMarkup, DieError, ThemeCards, ThemeOverlay, BrokenThemes },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const { pageFailed } = usePageChrome( props );
		const refusal = computed( () => ( props.data?.refusal && typeof props.data.refusal === 'object' ? props.data.refusal : null ) );
		const { router, speak, where, failed, follow } = usePageActions( { pathname: '/wp-admin/themes.php', failureText, focusFailures: false } );
		const frame = inject( 'frameChannel', null );
		const credentials = useCredentials();
		const { navigate, fatalTarget, announceDropped } = usePackagePage( { router, where, type: 'theme' } );
		const errorText = ( error, fallback ) => failureText( error, fallback );

		/**
		 * Shows another address of this screen (the search, the details) without reading the page
		 * again, as theme.js's router changes only the address: router.js setAddress(). Without it,
		 * an in-place navigation.
		 */
		function address( path, { replace = false } = {} ) {
			if ( router?.setAddress?.( adminHref( path, where() ?? undefined ), { replace } ) ) {
				return;
			}
			navigate( path, { replace, inPlace: true } );
		}

		const labels = computed( () => ( props.data?.labels && typeof props.data.labels === 'object' ? props.data.labels : {} ) );
		const query = computed( () => {
			const params = {};
			if ( typeof props.data?.search === 'string' && props.data.search !== '' ) {
				params.search = props.data.search;
			}
			return params;
		} );

		// The state of the page while it is shown -------------------------------------------------

		const overrides = shallowRef( {} ); // id => the fresh card of an answer.
		const added = shallowRef( [] ); // Cards of themes installed from the page (a parent theme).
		const removed = ref( [] ); // Ids of the themes deleted from the page.
		const countOverride = ref( null );
		const brokenOverride = shallowRef( undefined );
		const jobs = reactive( {} ); // id => { phase, message } of a card's job.
		const deleteErrors = reactive( {} );
		const autoStates = reactive( {} );
		const brokenStates = reactive( {} ); // stylesheet => { phase, error }.
		const dismissed = ref( [] );
		const openId = ref( null );
		const term = ref( '' );
		const searched = ref( '' );
		const clear = ( map ) => Object.keys( map ).forEach( ( key ) => delete map[ key ] );

		const cards = computed( () => {
			const given = list( props.data?.themes ).filter( isCard );
			const ids = new Set( given.map( ( item ) => item.id ) );
			return [ ...given, ...added.value.filter( ( item ) => ! ids.has( item.id ) ) ]
				.filter( ( item ) => ! removed.value.includes( item.id ) )
				.map( ( item ) => overrides.value[ item.id ] ?? item );
		} );
		const visible = computed( () => {
			const ids = new Set( matchThemes( cards.value, searched.value ) );
			return cards.value.filter( ( item ) => ids.has( item.id ) );
		} );
		const items = computed( () => visible.value.map( ( card ) => ( {
			card,
			state: jobs[ card.id ] && jobs[ card.id ].phase !== 'deleting' ? jobs[ card.id ] : null,
			displayAuthor: showsAuthor( card, searched.value ),
		} ) ) );
		const count = computed( () => ( searched.value !== '' ? visible.value.length : countOverride.value ?? props.data?.count ?? cards.value.length ) );
		const noResults = computed( () => searched.value !== '' && visible.value.length === 0 );
		const broken = computed( () => ( brokenOverride.value !== undefined ? brokenOverride.value : props.data?.broken ?? null ) );
		const messages = computed( () => list( props.data?.messages ).map( ( message, index ) => ( { ...message, index } ) ).filter( ( message ) => typeof message?.markup === 'string' && ! dismissed.value.includes( message.index ) ) );
		// theme.js render(): with a single theme, its details show inline, without the search or a dialog.
		const single = computed( () => cards.value.length === 1 );
		const singleCard = computed( () => ( single.value ? cards.value[ 0 ] : null ) );
		const openCard = computed( () => ( single.value ? null : cards.value.find( ( item ) => item.id === openId.value ) ?? null ) );
		const openIndex = computed( () => visible.value.findIndex( ( item ) => item.id === openId.value ) );

		// The classes theme.js gives the body: `modal-open` while the details show, `no-results` when the search finds none.
		watchEffect( () => {
			const classList = globalThis.document?.body?.classList;
			classList?.toggle?.( 'modal-open', openCard.value !== null );
			classList?.toggle?.( 'no-results', noResults.value );
		} );

		// Answers ----------------------------------------------------------------------------------

		let generation = 0;

		/** The `themes` builder part of an answer: the fresh card, the count, the menu counts and the broken themes. */
		function applyPart( answer, { card = true } = {} ) {
			if ( card && isCard( answer?.card ) ) {
				const fresh = answer.card;
				if ( list( props.data?.themes ).some( ( item ) => item.id === fresh.id ) || added.value.some( ( item ) => item.id === fresh.id ) ) {
					overrides.value = { ...overrides.value, [ fresh.id ]: fresh };
				} else {
					added.value = [ ...added.value, fresh ];
				}
			}
			if ( Number.isInteger( answer?.count ) ) {
				countOverride.value = answer.count;
			}
			if ( answer?.menuCounts && typeof answer.menuCounts === 'object' ) {
				frame?.setMenuCounts?.( answer.menuCounts );
			}
			if ( answer && Object.hasOwn( answer, 'broken' ) ) {
				applyBroken( answer.broken );
			}
		}

		/**
		 * The broken themes of an answer. A row whose Install Parent Theme the answer did not decide
		 * (`installParentChecked` false) keeps the one shown; a row whose parent was installed from
		 * the page stays, with its result.
		 */
		function applyBroken( fresh ) {
			const shown = list( broken.value?.rows );
			const rows = list( fresh?.rows ).map( ( row ) => {
				if ( row?.installParentChecked === false ) {
					const before = shown.find( ( item ) => item.stylesheet === row.stylesheet );
					return { ...row, installParent: before?.installParent ?? null };
				}
				return row;
			} );
			const kept = shown.filter( ( row ) => brokenStates[ row.stylesheet ]?.phase === 'installed' && ! rows.some( ( item ) => item.stylesheet === row.stylesheet ) );
			const all = [ ...rows, ...kept ];
			brokenOverride.value = all.length === 0 ? null : { ...( fresh ?? broken.value ), rows: all };
		}

		// The package queue (updates.js `wp.updates.queue`) ------------------------------------------

		// What each queued job is about, by its key: `{ origin: 'card'|'broken', slug, name, path }`.
		const jobInfo = new Map();

		const packages = usePackageQueue( {
			credentials,
			path: ( job ) => jobInfo.get( job.key )?.path,
			begin: ( job ) => begin( job ),
			succeed: ( job, answer ) => succeed( job, answer ),
			fail: ( job, error ) => fail( job, error ),
			dropped: ( dropped ) => {
				announceDropped( dropped, ( job ) => jobInfo.get( job.key )?.slug ?? job.key );
				const updates = dropped.some( ( job ) => job.kind === 'update' );
				dropped.forEach( putBack );
				if ( updates ) {
					speak( __( 'Update canceled.', 'default' ) );
				}
			},
		} );

		// Leaving while a job runs or waits asks first, as updates.js does.
		useLeaveWarning( packages.busy );

		/** Queues a job with the request WordPress gave, for this screen. */
		function queueJob( kind, origin, key, name, request ) {
			if ( ! hasRequest( request ) || key === '' ) {
				return false;
			}
			const slug = text( body( request ).slug ?? body( request ).stylesheet ) || key;
			const jobBody = { ...body( request ), screen: 'themes', query: query.value };
			return packages.add( { kind, key, body: jobBody }, () => {
				jobInfo.set( key, { origin, slug, name, path: route( request ) } );
				if ( origin === 'card' ) {
					jobs[ key ] = { phase: kind === 'update' ? 'updating' : 'deleting', message: null };
					delete deleteErrors[ key ];
				} else {
					brokenStates[ key ] = { phase: kind === 'install' ? 'installing' : 'deleting', error: null };
				}
			} );
		}

		function begin( job ) {
			const slug = jobInfo.get( job.key )?.slug ?? job.key;
			if ( job.kind === 'update' ) {
				speak( __( 'Updating... please wait.', 'default' ) );
				announce( 'wp-theme-updating', { slug }, 'theme' );
			} else if ( job.kind === 'install' ) {
				speak( __( 'Installing... please wait.', 'default' ) );
				announce( 'wp-theme-installing', { slug }, 'theme' );
			} else {
				speak( __( 'Deleting...', 'default' ) );
				announce( 'wp-theme-deleting', { slug }, 'theme' );
			}
		}

		function succeed( job, answer ) {
			const info = jobInfo.get( job.key ) ?? {};
			jobInfo.delete( job.key );
			const slug = text( answer?.slug ) || info.slug || job.key;
			emit( 'saved', answer );
			if ( job.kind === 'update' ) {
				jobs[ job.key ] = { phase: 'updated', message: null };
				applyPart( answer );
				speak( __( 'Update completed successfully.', 'default' ) );
				announce( 'wp-theme-update-success', { update: 'theme', slug, themeName: text( answer?.themeName ?? plain( info.name ) ), oldVersion: text( answer?.oldVersion ), newVersion: text( answer?.newVersion ) }, 'theme' );
				return;
			}
			if ( job.kind === 'install' ) {
				brokenStates[ job.key ] = { phase: 'installed', error: null };
				applyPart( answer );
				speak( __( 'Installation completed successfully.', 'default' ) );
				announce( 'wp-theme-install-success', { install: 'theme', slug, themeName: text( answer?.themeName ) }, 'theme' );
				return;
			}
			if ( info.origin === 'card' ) {
				delete jobs[ job.key ];
				removed.value = [ ...removed.value, job.key ];
				if ( openId.value === job.key ) {
					closeDetails( { focus: false } );
				}
				// theme.js: the search is emptied and every theme shows again.
				term.value = '';
				searched.value = '';
				speak( _x( 'Deleted!', 'theme', 'default' ) );
			} else {
				delete brokenStates[ job.key ];
			}
			applyPart( answer, { card: false } );
			announce( 'wp-theme-delete-success', { delete: 'theme', slug }, 'theme' );
		}

		function fail( job, error ) {
			const info = jobInfo.get( job.key ) ?? {};
			jobInfo.delete( job.key );
			const slug = info.slug ?? job.key;
			const message = errorText( error );
			console.warn( `Could not ${ job.kind } the theme:`, error );
			if ( job.kind === 'update' ) {
				const said = sprintf( __( 'Update failed: %s', 'default' ), message );
				jobs[ job.key ] = { phase: 'update-failed', message: said };
				speak( said, 'assertive' );
				announce( 'wp-theme-update-error', { update: 'theme', slug, errorCode: text( error?.code ), errorMessage: message }, 'theme' );
				return;
			}
			if ( job.kind === 'install' ) {
				const said = sprintf( __( 'Installation failed: %s', 'default' ), message );
				brokenStates[ job.key ] = { phase: null, error: said };
				speak( said, 'assertive' );
				announce( 'wp-theme-install-error', { install: 'theme', slug, errorCode: text( error?.code ), errorMessage: message }, 'theme' );
				return;
			}
			const said = sprintf( __( 'Deletion failed: %s', 'default' ), message );
			if ( info.origin === 'card' ) {
				delete jobs[ job.key ];
				deleteErrors[ job.key ] = said;
			} else {
				brokenStates[ job.key ] = { phase: null, error: said };
			}
			speak( said, 'assertive' );
			announce( 'wp-theme-delete-error', { delete: 'theme', slug, errorCode: text( error?.code ), errorMessage: message }, 'theme' );
		}

		/** Puts a dropped job's card or row back as it was (updates.js on `credential-modal-cancel`). */
		function putBack( job ) {
			const info = jobInfo.get( job.key ) ?? {};
			jobInfo.delete( job.key );
			if ( info.origin === 'broken' ) {
				delete brokenStates[ job.key ];
			} else {
				delete jobs[ job.key ];
			}
		}

		// Card actions -----------------------------------------------------------------------------

		/** A write whose answer leads somewhere (Activate, Resume): a fatal error leads to the classic error page. */
		async function sendAndFollow( request, what ) {
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
				failed( error, what );
				return;
			}
			if ( at !== generation ) {
				return;
			}
			emit( 'saved', answer );
			await follow( answer );
		}

		function activate( card ) {
			const action = card?.actions?.activate;
			if ( ! action || action.disabled ) {
				return;
			}
			if ( typeof action.href === 'string' && action.href !== '' ) {
				navigate( action.href );
				return;
			}
			if ( hasRequest( action.request ) ) {
				sendAndFollow( action.request, 'Could not activate the theme:' );
			}
		}

		function customize( card ) {
			const path = card?.actions?.customize?.path;
			if ( typeof path === 'string' && path !== '' && ! card.actions.customize.disabled ) {
				navigate( path );
			}
		}

		function update( card ) {
			if ( PENDING.includes( jobs[ card?.id ]?.phase ) ) {
				return;
			}
			queueJob( 'update', 'card', text( card?.id ), card?.name, card?.update?.request );
		}

		function remove( card ) {
			const action = card?.actions?.delete;
			if ( ! action || jobs[ card.id ]?.phase === 'deleting' ) {
				return;
			}
			const question = text( action.confirm ) || text( labels.value.confirmDelete );
			if ( ! globalThis.confirm?.( question ) ) {
				return;
			}
			if ( typeof action.href === 'string' && action.href !== '' ) {
				navigate( action.href );
				return;
			}
			queueJob( 'delete', 'card', card.id, card.name, action.request );
		}

		async function toggleAutoUpdates( card, action ) {
			const request = card?.autoUpdate?.request;
			if ( ! hasRequest( request ) || autoStates[ card.id ]?.busy ) {
				return;
			}
			const at = generation;
			autoStates[ card.id ] = { ...( autoStates[ card.id ] ?? {} ), busy: true, error: null };
			try {
				const answer = await api.post( route( request ), { ...body( request ), state: action } );
				if ( at !== generation ) {
					return;
				}
				emit( 'saved', answer );
				autoStates[ card.id ] = { busy: false, error: null, answer };
				speak( answer?.enabled === true ? __( 'Auto-updates enabled', 'default' ) : __( 'Auto-updates disabled', 'default' ) );
			} catch ( error ) {
				if ( at !== generation ) {
					return;
				}
				console.warn( 'Could not change the automatic updates:', error );
				const message = errorText( error, __( 'The request could not be completed.', 'default' ) );
				autoStates[ card.id ] = { ...( autoStates[ card.id ] ?? {} ), busy: false, error: message };
				speak( message, 'assertive' );
			}
		}

		// The details (theme.js's Details view) -----------------------------------------------------

		function openDetails( id, { speakIt = false } = {} ) {
			const card = cards.value.find( ( item ) => item.id === id );
			if ( ! card || single.value ) {
				return;
			}
			openId.value = id;
			address( 'themes.php?theme=' + encodeURIComponent( id ) );
			if ( speakIt ) {
				speak( sprintf( text( labels.value.themeViewed ) || __( 'Theme details: %s', 'default' ), plain( card.name ) ) );
			}
		}

		function closeDetails( { focus = true } = {} ) {
			const id = openId.value;
			if ( id === null ) {
				return;
			}
			openId.value = null;
			address( 'themes.php' );
			if ( focus ) {
				nextTick( () => globalThis.document?.getElementById?.( id + '-action' )?.focus?.() );
			}
		}

		function step( delta ) {
			const next = visible.value[ openIndex.value + delta ];
			if ( next ) {
				openDetails( next.id, { speakIt: true } );
			}
		}

		/**
		 * Back or Forward between this page's own addresses (router.js setAddressHandler()), as
		 * theme.js's router: the page stays, with its jobs; the address's search shows and its
		 * details open, or the details close with the focus back on the card's details button.
		 */
		function fromAddress( url ) {
			const params = new URL( url, 'http://admin.invalid' ).searchParams;
			const search = params.get( 'search' ) ?? '';
			if ( search !== searched.value ) {
				stopTimer();
				term.value = search;
				searched.value = search;
			}
			const id = params.get( 'theme' );
			if ( id !== null && ! single.value && cards.value.some( ( item ) => item.id === id ) ) {
				openId.value = id;
				return;
			}
			const was = openId.value;
			openId.value = null;
			if ( was !== null ) {
				nextTick( () => globalThis.document?.getElementById?.( was + '-action' )?.focus?.() );
			}
		}
		const removeAddressHandler = inject( 'pageState', null )?.onAddress?.( fromAddress ) ?? null;

		// The broken themes ------------------------------------------------------------------------

		function resumeBroken( row ) {
			if ( hasRequest( row?.resume?.request ) ) {
				sendAndFollow( row.resume.request, 'Could not resume the theme:' );
			}
		}

		function deleteBroken( row ) {
			const action = row?.delete;
			if ( ! action || ! globalThis.confirm?.( text( action.confirm ) || text( labels.value.confirmDelete ) ) ) {
				return;
			}
			queueJob( 'delete', 'broken', row.stylesheet, row.name, action.request );
		}

		function installParent( row ) {
			const request = row?.installParent?.request;
			if ( ! hasRequest( request ) ) {
				return;
			}
			queueJob( 'install', 'broken', row.stylesheet, row.name, request );
		}

		// The search (theme.js's Search view) --------------------------------------------------------

		let timer = null;
		const stopTimer = () => {
			if ( timer !== null ) {
				globalThis.clearTimeout( timer );
				timer = null;
			}
		};

		function runSearch() {
			timer = null;
			if ( term.value === searched.value ) {
				return;
			}
			searched.value = term.value;
			const found = visible.value.length;
			if ( searched.value !== '' ) {
				speak( found === 0 ? text( labels.value.noThemesFound ) : sprintf( text( labels.value.themesFound ), found ) );
			}
			address( searchPath( searched.value ), { replace: true } );
		}

		function onSearchInput( event ) {
			term.value = text( event?.target?.value ).replace( /\+/g, ' ' );
			if ( event?.type === 'keyup' && event.key === 'Escape' ) {
				term.value = '';
				if ( event.target ) {
					event.target.value = '';
				}
			}
			stopTimer();
			timer = globalThis.setTimeout( runSearch, SEARCH_PAUSE );
		}

		// Lifecycle ----------------------------------------------------------------------------------

		/** The data of a new visit: everything the page held goes. */
		function reset( data ) {
			generation++;
			stopTimer();
			packages.reset();
			jobInfo.clear();
			credentials.clear();
			overrides.value = {};
			added.value = [];
			removed.value = [];
			countOverride.value = null;
			brokenOverride.value = undefined;
			dismissed.value = [];
			[ jobs, deleteErrors, autoStates, brokenStates ].forEach( clear );
			term.value = text( data?.search );
			searched.value = term.value;
			openId.value = typeof data?.open === 'string' && data.open !== '' && list( data?.themes ).some( ( item ) => item?.id === data.open ) ? data.open : null;
		}

		/**
		 * Fresh data for the page shown (an in-place navigation: the search, the details): the search,
		 * the details, the queue and the job states stay; only the cards of the jobs still queued or
		 * running keep what the page shows (F12), the rest is the data's.
		 */
		function refreshed() {
			overrides.value = Object.fromEntries( Object.entries( overrides.value ).filter( ( [ id ] ) => PENDING.includes( jobs[ id ]?.phase ) ) );
			countOverride.value = null;
			brokenOverride.value = undefined;
			dismissed.value = [];
		}

		watch( () => props.data, ( data, old ) => ( old === undefined ? reset( data ) : refreshed() ), { immediate: true } );
		onBeforeUnmount( () => {
			generation++;
			stopTimer();
			packages.reset();
			removeAddressHandler?.();
			globalThis.document?.body?.classList?.remove?.( 'modal-open', 'no-results' );
		} );

		return {
			pageFailed, refusal, labels, items, count, broken, messages, term,
			single, singleCard, openCard, openIndex, visibleCount: computed( () => visible.value.length ),
			jobs, deleteErrors, autoStates, brokenStates,
			credentialsForm: credentials.form, credentialsOpen: credentials.open, submitCredentials: credentials.submit, cancelCredentials: credentials.cancel,
			currentActions: computed( () => list( props.data?.currentActions ).filter( ( item ) => typeof item?.label === 'string' && typeof item.path === 'string' ) ),
			addNew: computed( () => ( props.data?.heading?.addNew?.path ? props.data.heading.addNew : null ) ),
			href: ( path ) => adminHref( text( path ) ) || null,
			dismiss: ( index ) => {
				dismissed.value = [ ...dismissed.value, index ];
			},
			onSearchInput, onSearchSubmit: ( event ) => event?.preventDefault?.(),
			openDetails, closeDetails, step, activate, customize, update, remove, toggleAutoUpdates, navigate,
			resumeBroken, deleteBroken, installParent,
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-themes-failed">{{ $__( 'The themes could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="refusal" :error="refusal" classes="wp-admin-themes-error" />
		<template v-else>
			<span class="title-count theme-count">{{ count }}</span>
			<a v-if="addNew" :href="href( addNew.path )" class="hide-if-no-js page-title-action">{{ addNew.label }}</a>
			<hr class="wp-header-end">
			<div class="wp-admin-themes">
				<form v-if="! single" class="search-form search-themes" @submit="onSearchSubmit">
					<p class="search-box">
						<label class="screen-reader-text" for="wp-filter-search-input">{{ data.heading?.searchLabel }}</label>
						<input type="search" id="wp-filter-search-input" class="wp-filter-search" aria-describedby="live-search-desc" :placeholder="data.heading?.searchLabel" :value="term" @input="onSearchInput" @keyup="onSearchInput" />
					</p>
				</form>

				<div v-for="message in messages" :key="message.index" :class="[ 'notice', message.type === 'error' ? 'error' : 'updated', { 'is-dismissible': message.dismissible } ]">
					<p><InlineMarkup :html="message.markup" /></p>
					<button v-if="message.dismissible" type="button" class="notice-dismiss" @click="dismiss( message.index )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
				</div>

				<div class="theme-browser rendered">
					<ThemeCards :items="items" :single="single" @details="( id ) => openDetails( id )" @activate="activate" @customize="customize" @update="update">
						<ThemeOverlay
							v-if="singleCard"
							inline
							:card="singleCard"
							:first="true"
							:last="true"
							:state="jobs[ singleCard.id ] ?? null"
							:delete-error="deleteErrors[ singleCard.id ] ?? null"
							:auto-state="autoStates[ singleCard.id ] ?? null"
							:current-actions="currentActions"
							:keys="false"
							@activate="activate( singleCard )"
							@customize="customize( singleCard )"
							@update="update( singleCard )"
							@delete="remove( singleCard )"
							@toggle="( action ) => toggleAutoUpdates( singleCard, action )"
							@open="( path ) => navigate( path )"
						/>
					</ThemeCards>
				</div>

				<ThemeOverlay
					v-if="openCard"
					:key="openCard.id"
					:card="openCard"
					:first="openIndex <= 0"
					:last="openIndex === -1 || openIndex >= visibleCount - 1"
					:state="jobs[ openCard.id ] ?? null"
					:delete-error="deleteErrors[ openCard.id ] ?? null"
					:auto-state="autoStates[ openCard.id ] ?? null"
					:current-actions="currentActions"
					:keys="! credentialsOpen"
					@close="closeDetails()"
					@previous="step( -1 )"
					@next="step( 1 )"
					@activate="activate( openCard )"
					@customize="customize( openCard )"
					@update="update( openCard )"
					@delete="remove( openCard )"
					@toggle="( action ) => toggleAutoUpdates( openCard, action )"
					@open="( path ) => navigate( path )"
				/>

				<p class="no-themes">{{ labels.noThemesFound }}</p>

				<BrokenThemes v-if="broken" :broken="broken" :states="brokenStates" @resume="resumeBroken" @delete="deleteBroken" @install="installParent" />
			</div>

			<Contracted v-if="credentialsOpen" id="core/filesystem-credentials" :form="credentialsForm ?? {}" :open="credentialsOpen" @submit="submitCredentials" @cancel="cancelCredentials" />
		</template>
	`,
};
