import { inject, onBeforeUnmount, onMounted, watch } from 'vue';
import { __ } from '../../../runtime/text.js';

/*
 * The warning updates.js gives while its queue runs (`wp.updates.ajaxLocked`): leaving the page
 * asks "Updates may not complete if you navigate away from this page.". The browser asks it on
 * `beforeunload` (a reload, a closed tab, a link out of the admin), as updates.js's handler does;
 * the router asks it before it leaves the page in the app (the page host's `pageState`
 * setLeaveWarning(), see runtime/router.js navigate()). Meanwhile the page is dirty
 * (`pageState.setDirty()`), so that a live update never swaps it for another page.
 */

/** The classic text. */
export const leaveText = () => __( 'Updates may not complete if you navigate away from this page.', 'default' );

/**
 * The leave warning of a page with a package queue. Call it in the page's `setup()`.
 *
 * @param {import('vue').Ref<boolean>} busy Whether a job runs or waits (runner.js `busy`).
 */
export function useLeaveWarning( busy ) {
	const pageState = inject( 'pageState', null );

	function onBeforeUnload( event ) {
		if ( ! busy.value ) {
			return undefined;
		}
		const message = leaveText();
		event.preventDefault();
		event.returnValue = message;
		return message;
	}

	watch( busy, ( value ) => {
		pageState?.setDirty?.( value );
		pageState?.setLeaveWarning?.( value ? leaveText() : null );
	}, { immediate: true } );
	onMounted( () => globalThis.window?.addEventListener?.( 'beforeunload', onBeforeUnload ) );
	onBeforeUnmount( () => {
		globalThis.window?.removeEventListener?.( 'beforeunload', onBeforeUnload );
		if ( busy.value ) {
			pageState?.setDirty?.( false );
			pageState?.setLeaveWarning?.( null );
		}
	} );
}
