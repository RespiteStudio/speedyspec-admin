import { h, onBeforeUnmount, onMounted, ref } from 'vue';
import LegacyHtml, { FILLED_EVENT } from '../../kit/LegacyHtml.js';
import { noticeElementId } from '../../runtime/notices.js';
import { __ } from '../../runtime/text.js';

/**
 * Adds the classic dismiss button to every `.notice.is-dismissible` under `container` that has
 * none, as WordPress's common.js does on a classic screen: a `button.notice-dismiss` holding the
 * screen reader text "Dismiss this notice.". A click removes that notice once the click has
 * finished bubbling, so that a plugin's own handler for it (often a delegated jQuery handler that
 * sends its dismissal through admin-ajax.php, which the proxy forwards) still finds the notice in
 * the document; `onEmpty` is called when no `.notice` is left in the container. No Vue.
 *
 * @param {Element}  container Element whose HTML holds the notices.
 * @param {object}   options
 * @param {string}   options.label   Screen reader text of the button.
 * @param {Function} options.onEmpty Called once the container's last notice is removed.
 * @param {Document} options.doc     Document. Default the global one.
 * @param {Function} options.later   Runs a function after the current event. Default setTimeout().
 * @return {number} How many buttons were added.
 */
export function makeNoticesDismissible( container, { label, onEmpty, doc = globalThis.document, later = ( run ) => setTimeout( run, 0 ) } = {} ) {
	if ( ! container?.querySelectorAll || ! doc?.createElement ) {
		return 0;
	}
	let added = 0;
	for ( const notice of [ ...container.querySelectorAll( '.notice.is-dismissible' ) ] ) {
		if ( notice.querySelector?.( '.notice-dismiss' ) ) {
			continue;
		}
		const button = doc.createElement( 'button' );
		button.setAttribute( 'type', 'button' );
		button.className = 'notice-dismiss';
		const text = doc.createElement( 'span' );
		text.className = 'screen-reader-text';
		text.textContent = label;
		button.appendChild( text );
		button.addEventListener( 'click', ( event ) => {
			event?.preventDefault?.();
			later( () => {
				notice.remove();
				if ( ! container.querySelector( '.notice' ) ) {
					onEmpty?.();
				}
			} );
		} );
		notice.appendChild( button );
		added++;
	}
	return added;
}

/**
 * One notice a classic `admin_notices` callback printed (`notice.html`, with `notice.assets`),
 * shown as it is through the kit's LegacyHtml, which loads its scripts and styles and runs its
 * inline scripts. Once they ran, its `.notice.is-dismissible` elements get the classic dismiss
 * button (makeNoticesDismissible()); `dismiss` (the notice id) is emitted when the user has
 * dismissed every notice in it. Its element has the id noticeElementId() gives.
 * Presentational part of core/notices.
 */
export default {
	name: 'CapturedNotice',
	props: {
		notice: { type: Object, required: true },
	},
	emits: [ 'dismiss' ],
	setup( props, { emit } ) {
		const root = ref( null );
		const enhance = () => makeNoticesDismissible( root.value, {
			label: __( 'Dismiss this notice.', 'wp-admin-site' ),
			onEmpty: () => emit( 'dismiss', props.notice.id ),
		} );
		onMounted( () => root.value?.addEventListener?.( FILLED_EVENT, enhance ) );
		onBeforeUnmount( () => root.value?.removeEventListener?.( FILLED_EVENT, enhance ) );

		return () => h( 'div', { ref: root, id: noticeElementId( props.notice.id ), class: 'wp-admin-notices__captured-item', tabindex: '-1' }, [
			h( LegacyHtml, { html: props.notice.html, assets: props.notice.assets ?? {} } ),
		] );
	},
};
