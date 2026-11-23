import { computed, inject, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { __ } from '../../../runtime/text.js';
import { redirectTarget } from '../../../runtime/router.js';
import { noticeElementId } from '../../../runtime/notices.js';
import { isCurrentAddress } from './list-form.js';

/*
 * What the native pages of a classic screen share around their own content (the Taxonomies, Link
 * Manager, and Users and Profile pages):
 *
 * - one failure text: that WordPress cannot be reached, else WordPress's message, else the
 *   generic one (failureText(), isUnreachable()), and the errors a refused form write carries
 *   (formErrorsOf());
 * - one follow of an answer's target, which reads the page again when the target is the address
 *   shown (followAnswer()): the router does not load an address it already shows;
 * - the page actions: what the page is given (router, notices, speech, the location shown), the
 *   failure said in a page notice that takes the focus, and the follow (usePageActions());
 * - the classic refusal shown in place of the page (DieError);
 * - the page's title in the frame and the body's classes while it is shown (usePageChrome()).
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
// The upstream errors the API gives when WordPress does not answer (runtime/api.js, the proxy).
const UNREACHABLE = [ 'admin_upstream_unreachable', 'admin_upstream_timeout' ];
// A body class is one token: classList.add() throws on a name with a space, so an entry that is
// not one token is dropped, never split into several.
const TOKEN = /^[A-Za-z0-9_-]+$/;

/** The generic text of a failed request, as the classic screens' Ajax says it. */
export const brokenText = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );

/** Whether a failed request never reached WordPress (or WordPress did not answer in time). Pure. */
export const isUnreachable = ( error ) => error?.status === 0 || UNREACHABLE.includes( error?.code );

/**
 * What a failed request says: that WordPress cannot be reached, else WordPress's message (text,
 * shown as it is), else `fallback`.
 *
 * @param {object|null} error    The API's error.
 * @param {string}      fallback Optional. The text without a message. Default the generic one.
 * @return {string} The text.
 */
export function failureText( error, fallback = brokenText() ) {
	if ( isUnreachable( error ) ) {
		return __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' );
	}
	return typeof error?.message === 'string' && error.message !== '' ? error.message : fallback;
}

/**
 * The errors of a refused form write (`data.errors` of the API's error: Add User, the profile
 * save), each with its message as a string, or []. Pure.
 *
 * @param {object|null} error The API's error.
 * @return {Array<{message: string}>} The errors.
 */
export const formErrorsOf = ( error ) => list( error?.data?.errors ).filter( ( item ) => typeof item?.message === 'string' && item.message !== '' );

/**
 * Opens where an answer leads (`{ redirect, location }`): through the router, then the page is
 * read again when the target is the address shown (the router keeps an address it already
 * shows); without a router, as a full-page load.
 *
 * @param {object}  host
 * @param {object}  [host.router] The router (`follow`, `refresh`).
 * @param {object}  host.where    The location shown (`origin`, `pathname`, `search`).
 * @param {object}  answer        The answer.
 * @param {object}  [options]     The router's follow() options (`replace`).
 * @return {Promise<void>}
 */
export async function followAnswer( { router, where }, answer, options = undefined ) {
	const target = redirectTarget( answer ?? {}, where );
	if ( ! target ) {
		return;
	}
	if ( ! router?.follow ) {
		globalThis.location?.assign?.( target.url );
		return;
	}
	const same = target.kind === 'admin' && isCurrentAddress( target.url, where );
	await ( options === undefined ? router.follow( answer ) : router.follow( answer, options ) );
	if ( same ) {
		await router.refresh?.();
	}
}

/**
 * The page actions every native page with writes shares. Call it in the page's `setup()`: it
 * injects what the page is given (`router`, `notices`, `speak`, `pageLocation`).
 *
 * - `where()`: the location shown (`pageLocation` when provided: tests), else the document's,
 *   else `pathname` on localhost.
 * - `say( message, { focus } )`: an error in a page notice, spoken; the notice takes the focus
 *   (unless `focus` is false), so a screen-reader user lands on it as on the spoken text.
 * - `failed( reason, what, { focus } )`: a failed request, logged with `what` and said through
 *   say() with the page's failure text.
 * - `follow( answer, options )`: followAnswer() from the location shown.
 *
 * @param {object}  options
 * @param {string}  options.pathname          The page's address when no location is known.
 * @param {(error: object) => string} [options.failureText] What a failed request says (Strategy).
 *        Default this module's failureText().
 * @param {boolean} [options.focusFailures]   Whether a failure's notice takes the focus by
 *        default. Default true.
 * @return {{router: object|null, notices: object|null, speak: Function, where: Function, say: Function, failed: Function, follow: Function}} The actions.
 */
export function usePageActions( { pathname, failureText: textOf = failureText, focusFailures = true } ) {
	const router = inject( 'router', null );
	const notices = inject( 'notices', null );
	const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
	const givenLocation = inject( 'pageLocation', null );
	const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname, search: '' };

	async function say( message, { focus = focusFailures } = {} ) {
		const id = notices?.add?.( { type: 'error', message, dismissible: true, scope: 'page' } );
		speak( message );
		if ( focus && typeof id === 'string' ) {
			await nextTick();
			globalThis.document?.getElementById?.( noticeElementId( id ) )?.focus?.();
		}
	}

	function failed( reason, what, options = {} ) {
		console.warn( what, reason );
		return say( textOf( reason ), options );
	}

	const follow = ( answer, options = undefined ) => followAnswer( { router, where: where() }, answer, options );

	return { router, notices, speak, where, say, failed, follow };
}

/**
 * The classic screen's refusal (`data.error`: `{ heading, message }`), shown in place of the
 * page: its heading when it has one, then its message, both as text.
 */
export const DieError = {
	name: 'DieError',
	props: {
		error: { type: Object, required: true },
		classes: { type: String, default: '' },
	},
	template: `
		<div :class="classes">
			<h2 v-if="error.heading">{{ error.heading }}</h2>
			<p>{{ error.message }}</p>
		</div>
	`,
};

/**
 * The page chrome of a native page: whether its data failed (`data.failed`) or is a classic
 * refusal (`data.error`), the frame's title (`data.title`, none when empty) and the body's
 * classes (`data.bodyClasses`, each one token) while it is shown. Both are set when the page
 * mounts and again on new data, then `onShown( data )` runs; the classes go on unmount. Call it
 * in the page's `setup()`; it injects `frameChannel`.
 *
 * @param {object} props                 The page's props (`data`).
 * @param {object} [options]
 * @param {(data: object) => void} [options.onShown] Called after each showing (focus, …).
 * @return {{pageFailed: object, dieError: object, blocked: object}} Computed refs.
 */
export function usePageChrome( props, { onShown = () => {} } = {} ) {
	const frameChannel = inject( 'frameChannel', null );
	const pageFailed = computed( () => props.data?.failed === true );
	const dieError = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
	const blocked = computed( () => pageFailed.value || Boolean( dieError.value ) );

	let shownClasses = [];
	function setBodyClasses( names ) {
		const classList = globalThis.document?.body?.classList;
		if ( shownClasses.length > 0 ) {
			classList?.remove?.( ...shownClasses );
		}
		shownClasses = list( names ).filter( ( name ) => typeof name === 'string' && TOKEN.test( name ) );
		if ( shownClasses.length > 0 ) {
			classList?.add?.( ...shownClasses );
		}
	}

	function show( data ) {
		setBodyClasses( data?.bodyClasses );
		frameChannel?.setTitle?.( typeof data?.title === 'string' && data.title !== '' ? data.title : null );
		onShown( data );
	}

	watch( () => props.data, ( data ) => show( data ) );
	onMounted( () => show( props.data ) );
	onBeforeUnmount( () => setBodyClasses( [] ) );

	return { pageFailed, dieError, blocked };
}
