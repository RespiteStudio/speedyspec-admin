import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../../runtime/text.js';
import { redirectTarget } from '../../../runtime/router.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';
import { preferencesRoute } from '../meta-box-holder.js';
import { ANSWER_TIMEOUT, orderedAnswers } from './ordered-answers.js';
import { hiddenColumns } from './list-form.js';
import { followAnswer } from './page-chrome.js';

/*
 * What the classic list pages (Comments, Posts, Media) share around their table: how a failure
 * is said, where an answer leads, the bulk check's notice, the Screen Options of the table, the
 * hidden columns, the body classes and the messages above the list.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The keys of the columns WordPress marks hidden. Pure. */
export const hiddenKeysOf = ( data ) => list( data?.columns ).filter( ( column ) => column?.hidden ).map( ( column ) => column.key );

/**
 * The shared state and behaviour of a list page. Call it in the page's `setup()`, first: it
 * injects what the page is given (`router`, `notices`, `speak`, `screenOptions`, `pageLocation`),
 * and its own data watcher runs before the page's.
 *
 * On each new data it drops the answers still on their way, reads the hidden columns again and
 * offers the frame the table's Screen Options again; while the page is shown the body has
 * `bodyClasses()`; on unmount the answers are dropped, the classes removed and Screen Options
 * withdrawn.
 *
 * @param {object} props                   The page's props (`data`).
 * @param {object} options
 * @param {() => string}   options.screenId     The screen whose preferences Screen Options save.
 * @param {string}         options.pathname     The page's address when no location is known.
 * @param {() => string[]} [options.bodyClasses] The body's classes while the page is shown.
 * @param {() => boolean}  [options.blocked]    Whether the page shows no list (no Screen Options).
 * @param {(answer: object) => void} [options.onAnswer] Called with each answer sendAndFollow() follows.
 * @param {(error: object, fallback: string) => string} [options.failureText] What a failed request
 *        says (Strategy). Default: WordPress's message, else the fallback. The Taxonomies and Link
 *        Manager pages give page-chrome.js's failureText(), which also says when WordPress cannot
 *        be reached.
 * @return {object} See the returned names.
 */
export function useListPage( props, { screenId, pathname, bodyClasses = () => [], blocked = () => false, onAnswer = () => {}, failureText = null } ) {
	const router = inject( 'router', null );
	const notices = inject( 'notices', null );
	const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
	const screenOptions = inject( 'screenOptions', null );
	// The location shown (`pageLocation` may be provided: tests).
	const givenLocation = inject( 'pageLocation', null );
	const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname, search: '' };

	const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
	// The API's message is text: shown as it is, never decoded again.
	const errorText = ( error, fallback = broken() ) => ( failureText ? failureText( error, fallback ) : ( typeof error?.message === 'string' && error.message !== '' ? error.message : fallback ) );

	/*
	 * Answers are applied in the order their requests were sent, whatever order they arrive in
	 * (ordered-answers.js). A request sent before the data changed (a navigation, a refresh) or
	 * before the page unmounted is dropped: its answer is about a list no longer shown.
	 */
	const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT, timeoutError: () => new Error( broken() ) } );

	/** A failed request is said in a page notice and spoken, never only logged. */
	function failed( error, what ) {
		console.warn( what, error );
		const message = errorText( error );
		notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
		speak( message );
	}

	/** Opens where an answer leads; the list is read again when it is the address shown. */
	const follow = ( answer, options = undefined ) => followAnswer( { router, where: where() }, answer, options );

	/** Posts a route whose answer leads somewhere (row actions, bulk actions, Empty Trash, Undo). */
	function sendAndFollow( route, body, what, { fail = null } = {} ) {
		return answers.ordered( api.post( route, body ), ( answer ) => {
			onAnswer( answer );
			follow( answer );
		}, ( error ) => {
			fail?.();
			failed( error, what );
		} );
	}

	/** Opens an admin path through the router. */
	function navigate( path ) {
		const url = adminHref( path );
		if ( router?.navigate ) {
			router.navigate( url );
		} else {
			globalThis.location?.assign?.( url );
		}
	}

	/** What common.js says when a bulk action cannot run (list-form.js bulkCheck()). */
	function bulkError( check ) {
		const message = check.kind === 'action' ? __( 'Please select a bulk action to perform.', 'default' ) : __( 'Please select at least one item to perform this action on.', 'default' );
		notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
		globalThis.scrollTo?.( 0, 0 );
		speak( message );
	}

	// Columns and Screen Options ---------------------------------------------------------------

	const hiddenKeys = ref( hiddenKeysOf( props.data ) );
	const columns = computed( () => list( props.data?.columns ).map( ( column ) => ( { ...column, hidden: column.key !== 'cb' && hiddenKeys.value.includes( column.key ) } ) ) );

	let withdrawOptions = () => {};
	function offerScreenOptions() {
		withdrawOptions();
		const options = props.data?.screenOptions;
		if ( ! screenOptions?.set || ! options || blocked() ) {
			withdrawOptions = () => {};
			return;
		}
		withdrawOptions = screenOptions.set( {
			tableColumns: list( options.tableColumns ).map( ( column ) => ( { ...column, hidden: hiddenKeys.value.includes( column.key ) } ) ),
			pagination: options.perPage ?? null,
			viewMode: options.viewMode ?? null,
			settingsHtml: typeof options.settingsHtml === 'string' ? options.settingsHtml : null,
			tableColumnsLegend: typeof options.legend === 'string' ? options.legend : null,
			onChange: onScreenOption,
			onApply: onScreenOptionsApply,
		} ) ?? ( () => {} );
	}

	/** A column checkbox: the column's cells hide at once, and the hidden columns are saved. */
	async function onScreenOption( id, value ) {
		if ( id !== 'hide-column' || typeof value?.key !== 'string' ) {
			return;
		}
		hiddenKeys.value = hiddenColumns( hiddenKeys.value, value.key, value.hidden === true );
		offerScreenOptions();
		try {
			await api.post( preferencesRoute( screenId() ), { columnsHidden: [ ...hiddenKeys.value ] } );
		} catch ( error ) {
			failed( error, 'Could not save the hidden columns:' );
		}
	}

	/**
	 * Apply: saves the items per page and the view mode with the page's path as `referer`, then
	 * goes where WordPress answers (set_screen_options()'s redirect, in place of the address
	 * shown), or reads the list again when it answers no target.
	 */
	async function onScreenOptionsApply( { perPage = null, mode = null } = {} ) {
		const body = {};
		if ( Number.isInteger( perPage ) ) {
			body.perPage = perPage;
		}
		if ( typeof mode === 'string' && mode !== '' ) {
			body.mode = mode;
		}
		body.referer = String( props.page?.path ?? '' );
		let answer;
		try {
			answer = await api.post( preferencesRoute( screenId() ), body );
		} catch ( error ) {
			// Not saved: the list is not read again with the old values.
			failed( error, 'Could not save the screen options:' );
			return;
		}
		if ( redirectTarget( answer ?? {}, where() ) ) {
			await follow( answer, { replace: true } );
		} else {
			await router?.refresh?.();
		}
	}

	// Lifecycle --------------------------------------------------------------------------------

	let shownClasses = [];
	function setBodyClasses( names ) {
		const classList = globalThis.document?.body?.classList;
		if ( shownClasses.length > 0 ) {
			classList?.remove?.( ...shownClasses );
		}
		shownClasses = list( names );
		if ( shownClasses.length > 0 ) {
			classList?.add?.( ...shownClasses );
		}
	}

	watch( () => props.data, ( data ) => {
		answers.reset();
		hiddenKeys.value = hiddenKeysOf( data );
		offerScreenOptions();
	} );
	watch( bodyClasses, ( names ) => setBodyClasses( names ) );

	onMounted( () => {
		setBodyClasses( bodyClasses() );
		offerScreenOptions();
	} );
	onBeforeUnmount( () => {
		answers.reset();
		setBodyClasses( [] );
		withdrawOptions();
	} );

	return {
		router, notices, speak, where, answers, broken, errorText, failed, follow, sendAndFollow, navigate, bulkError,
		hiddenKeys, columns, offerScreenOptions,
		messages: computed( () => list( props.data?.messages ).filter( ( message ) => typeof message?.markup === 'string' ) ),
	};
}

/** The text common.js's showNotice.warn() asks before a permanent delete. */
export const warnText = () => __( 'You are about to permanently delete these items from your site.\nThis action cannot be undone.\n\'Cancel\' to stop, \'OK\' to delete.', 'default' );

/**
 * common.js's showNotice, which plugin row actions call (`onclick="return showNotice.warn();"`):
 * warn() asks classic's question and returns the answer, note() alerts.
 *
 * @param {(message: string) => boolean} ask Asks a question (confirm).
 * @return {{warn: () => boolean, note: (text: string) => void}} The shim.
 */
export const showNoticeShim = ( ask ) => ( {
	warn: () => ask( warnText() ),
	note: ( text ) => globalThis.alert?.( text ),
} );

/**
 * Installs classic globals (name => object) while the page is shown: on mount each replaces what
 * was there, and on unmount the previous value comes back, unless something replaced the shim
 * since (then that stays). Call it in `setup()`.
 *
 * @param {Record<string, object>} shims The globals.
 */
export function useClassicGlobals( shims ) {
	const shadowed = {};
	onMounted( () => {
		for ( const [ name, shim ] of Object.entries( shims ) ) {
			shadowed[ name ] = Object.hasOwn( globalThis, name ) ? { value: globalThis[ name ] } : null;
			globalThis[ name ] = shim;
		}
	} );
	onBeforeUnmount( () => {
		for ( const name of Object.keys( shims ) ) {
			if ( globalThis[ name ] !== shims[ name ] ) {
				continue;
			}
			if ( shadowed[ name ] ) {
				globalThis[ name ] = shadowed[ name ].value;
			} else {
				delete globalThis[ name ];
			}
		}
	} );
}

/**
 * The messages above a list (`#message` on Posts and Media, `#moderated` on Comments): each
 * message's markup, with its Undo link when it has one; the dismiss button hides them until the
 * data changes.
 *
 * Props: `messages` (`{ markup, undo }`), `id`, `classes`, `separator` (`space` between
 * messages, or `br`), `undoRole` (the Undo link's `role`, or null). Emits `undo( message )`.
 */
export const ListMessages = {
	name: 'ListMessages',
	components: { InlineMarkup },
	props: {
		messages: { type: Array, required: true },
		id: { type: String, required: true },
		classes: { type: String, required: true },
		separator: { type: String, default: 'space' },
		undoRole: { type: String, default: null },
	},
	emits: [ 'undo' ],
	setup( props ) {
		const shown = ref( true );
		watch( () => props.messages, () => {
			shown.value = true;
		} );
		return { shown };
	},
	template: `
		<div v-if="shown ? messages.length > 0 : false" :id="id" :class="classes">
			<p v-if="separator === 'br'"><template v-for="( message, index ) in messages" :key="index"><InlineMarkup :html="message.markup" /><template v-if="message.undo">{{ ' ' }}<a href="#" :role="undoRole" @click.prevent="$emit( 'undo', message )">{{ $__( 'Undo', 'default' ) }}</a></template><br v-if="index < messages.length - 1" /></template></p>
			<p v-else><template v-for="( message, index ) in messages" :key="index"><template v-if="index > 0">{{ ' ' }}</template><InlineMarkup :html="message.markup" /><template v-if="message.undo">{{ ' ' }}<a href="#" :role="undoRole" @click.prevent="$emit( 'undo', message )">{{ $__( 'Undo', 'default' ) }}</a></template></template></p>
			<button type="button" class="notice-dismiss" @click="shown = false"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button>
		</div>
	`,
};
