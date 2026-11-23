import { ref, shallowRef } from 'vue';
import { ROUTE, fatalTarget } from './page-actions.js';

/*
 * The upload of a package page, as update.php's upload step runs it: the package posted, then the
 * result shown in place of the form (the log and the complete actions, or the overwrite
 * comparison), with Replace current with uploaded, Cancel and go back, and Activate. An answer
 * that needs filesystem credentials asks for them (package-parts/credentials.js) and tries the same
 * package again with them; cancelled, the package is deleted and the form shows again.
 *
 * The routes and the form field follow the package type: `plugins/upload` with `pluginzip`, or
 * `themes/upload` with `themezip`, and `…/upload/{package}` for the package kept. Answers that
 * arrive after reset() are dropped.
 */

const FIELDS = Object.freeze( { plugin: 'pluginzip', theme: 'themezip' } );

const body = ( request ) => ( request?.body && typeof request.body === 'object' && ! Array.isArray( request.body ) ? request.body : {} );
const route = ( path ) => ROUTE + String( path ?? '' ).replace( /^\/+/, '' );

/**
 * The upload of a page. Call it in the page's `setup()`.
 *
 * @param {object} options
 * @param {object} options.api         The admin API client (`post`, `del`).
 * @param {object} options.credentials The page's useCredentials().
 * @param {(answer: object) => Promise} options.follow  Follows where an answer leads (useListPage()).
 * @param {(error: object, what: string) => void} options.failed Says a failed request (useListPage()).
 * @param {(answer: object) => void} [options.onAnswer] Called with each answer (the page's `saved`).
 * @param {string} [options.type] The package type: `plugin` (default) or `theme`.
 * @return {{result: import('vue').ShallowRef<object|null>, busy: import('vue').Ref<boolean>, submitUpload: Function, replaceUploaded: Function, cancelUploaded: Function, activateUploaded: Function, reset: Function}}
 *         `result` is the upload's answer shown in place of the form; `busy` is true while a
 *         request runs; `submitUpload( file )`, `replaceUploaded( comparison )`, `cancelUploaded()`
 *         and `activateUploaded( action )` are the form's and the result's actions; `reset()`
 *         drops the answers on their way and empties the result.
 */
export function useUploadFlow( { api, credentials, follow, failed, onAnswer = () => {}, type = 'plugin' } ) {
	const result = shallowRef( null );
	const busy = ref( false );
	const upload = route( type + 's/upload' );
	const packageRoute = ( id ) => upload + '/' + id;
	let generation = 0;

	const keptPackage = () => {
		const id = Number( result.value?.package ?? 0 );
		return Number.isInteger( id ) && id > 0 ? id : null;
	};

	/** An upload's answer or error: the result, or the credentials asked and the same package tried again. */
	async function uploaded( send, overwrite = '' ) {
		const at = generation;
		busy.value = true;
		try {
			const answer = await send();
			if ( at !== generation ) {
				return;
			}
			onAnswer( answer );
			result.value = answer && typeof answer === 'object' ? answer : null;
		} catch ( error ) {
			if ( at !== generation ) {
				return;
			}
			const packageId = Number( error?.data?.package ?? result.value?.package ?? 0 );
			if ( error?.code === 'fs_credentials_required' && Number.isInteger( packageId ) && packageId > 0 ) {
				busy.value = false;
				const values = await credentials.ask( error.data?.form ?? {} );
				if ( at !== generation ) {
					return;
				}
				if ( values ) {
					await uploaded( () => api.post( packageRoute( packageId ), { overwrite, credentials: values } ), overwrite );
					return;
				}
				// Cancelled: the package is not kept for a later try, and the form shows again.
				try {
					await api.del( packageRoute( packageId ) );
				} catch ( reason ) {
					console.warn( 'Could not remove the uploaded package:', reason );
				}
				if ( at === generation ) {
					result.value = null;
				}
				return;
			}
			failed( error, `Could not upload the ${ type }:` );
		} finally {
			if ( at === generation ) {
				busy.value = false;
			}
		}
	}

	function submitUpload( file ) {
		const form = new globalThis.FormData();
		if ( file ) {
			form.append( FIELDS[ type ] ?? FIELDS.plugin, file );
		}
		return uploaded( () => api.post( upload, form ) );
	}

	function replaceUploaded( comparison ) {
		const id = keptPackage();
		if ( id === null || ! comparison?.action ) {
			return Promise.resolve();
		}
		return uploaded( () => api.post( packageRoute( id ), { overwrite: comparison.action } ), comparison.action );
	}

	/**
	 * A result's write that leads somewhere (Cancel and go back, Activate): busy while it runs,
	 * then its answer (`done`) or its error (`onError`).
	 */
	async function resultWrite( send, done, onError ) {
		const at = generation;
		busy.value = true;
		try {
			const answer = await send();
			if ( at !== generation ) {
				return;
			}
			busy.value = false;
			onAnswer( answer );
			await done( answer );
		} catch ( error ) {
			if ( at !== generation ) {
				return;
			}
			busy.value = false;
			await onError( error );
		}
	}

	function cancelUploaded() {
		const id = keptPackage();
		if ( id === null ) {
			return Promise.resolve();
		}
		return resultWrite( () => api.del( packageRoute( id ) ), ( answer ) => {
			result.value = null;
			return follow( answer );
		}, ( error ) => failed( error, 'Could not cancel the upload:' ) );
	}

	/** Activate after an upload: its request, then where the activation leads. */
	function activateUploaded( action ) {
		const request = action?.request;
		if ( ! request || typeof request.route !== 'string' ) {
			return Promise.resolve();
		}
		return resultWrite( () => api.post( route( request.route ), body( request ) ), ( answer ) => follow( answer ), ( error ) => {
			const target = fatalTarget( error, type );
			return target ? follow( target ) : failed( error, `Could not activate the ${ type }:` );
		} );
	}

	function reset() {
		generation++;
		result.value = null;
		busy.value = false;
	}

	return { result, busy, submitUpload, replaceUploaded, cancelUploaded, activateUploaded, reset };
}
