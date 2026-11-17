import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { __ } from '@wp-admin/i18n';
import Spinner from '../../kit/Spinner.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { notify } from '../../runtime/notify.js';
import { validateSrc, samePage, layoutFor, syncDecision, frameHeight, outsideLink, pagePathOf, frameToTopUrl, addedHistoryEntry } from '../../runtime/legacy-frame.js';

const LOAD_TIMEOUT = 30000;
// After the frame's document goes away by itself, how long until a document that is not a
// readable admin screen (or none at all) counts as having left the admin.
const WATCHDOG = 4000;
// How long a Back traversal that removes the frame's own history entry may take.
const UNDO_TIMEOUT = 5000;

/**
 * Default implementation of core/legacy: the classic screen at `page.legacy.src`
 * in a same-origin frame filling the content area. WordPress renders it without
 * its own menu and admin bar.
 *
 * - Only a validated admin URL is ever given to the frame (runtime/legacy-frame.js).
 * - When the frame loads another admin screen by itself (a link or a form in the
 *   classic screen), the router is asked which page that is. A legacy page is
 *   adopted: `router.navigate( url, { adopt: true } )` replaces the top history entry,
 *   since the frame's navigation already added one, and the frame is not loaded again.
 *   A converted page takes over: the frame's own entry is first removed with a Back
 *   traversal, then the router pushes the page, so one Back returns to the classic
 *   screen. A slow answer is refused by the router once it has navigated since.
 * - When the top-level page changes (menu, Back/Forward), or the current page is asked
 *   for again while the frame shows another screen, the same frame is sent there with
 *   `location.replace()`, which adds no history entry.
 * - The sign-in screen in the frame means the session has ended: the app's own sign-in
 *   takes over. A frame that is not on a readable admin screen of this origin (another
 *   origin, an unreadable document, a document that never finishes loading) is brought
 *   back to the last admin screen with a notice; when that is not possible, the session
 *   is checked (an ended one shows the sign-in) and a failure message is shown.
 *   A plain click on a link that leaves the admin opens it in a new tab.
 * - The frame is sandboxed without `allow-top-navigation*`: a document of another origin
 *   that lands in it cannot navigate the top window (a same-origin admin screen could lift
 *   the sandbox, but it is WordPress itself).
 * - The frame's height follows its document, except for full-document screens, for
 *   which the frame asks for the full layout through the frame's `frameLayout`.
 */
export default {
	name: 'LegacyPage',
	components: { Spinner, SlotOutlet },
	props: {
		page: { type: Object, required: true },
		data: { type: Object, default: undefined },
	},
	emits: [ 'navigated' ],
	setup( props, { emit } ) {
		const notices = inject( 'notices', null );
		const router = inject( 'router', null );
		const frameLayout = inject( 'frameLayout', null );
		const pageFocus = inject( 'pageFocus', null );

		const frame = ref( null );
		const src = ref( null ); // What the frame element was created with.
		const failed = ref( false );
		const discarded = ref( false ); // Handed over to a native page or to the sign-in.
		const hidden = ref( false ); // Hidden while its own history entry is removed.
		const loading = ref( true );
		const stalled = ref( false );
		const height = ref( null );
		const layout = ref( layoutFor( validateSrc( props.page?.legacy?.src ) ) );

		let current = null; // The URL the frame shows, or is being sent to.
		let lastAdmin = null; // The last admin screen the frame loaded.
		let restoring = false;
		let requested = true; // The next load answers a navigation started here (no history entry of its own).
		let token = 0; // Bumped by every load and every navigation started here.
		let timer = null; // Load timeout of a navigation started here.
		let watchdog = null; // Started when the frame's document goes away by itself.
		let undo = null; // { timer, then } while a Back traversal removes the frame's own entry.
		let watched = null; // The frame window whose pagehide is listened to.
		let observer = null;
		let unmounted = false;

		const origin = () => globalThis.location?.origin ?? '';

		function clearTimer() {
			if ( timer !== null ) {
				globalThis.clearTimeout( timer );
				timer = null;
			}
		}

		function startTimer() {
			clearTimer();
			timer = globalThis.setTimeout( () => {
				timer = null;
				stalled.value = true;
			}, LOAD_TIMEOUT );
		}

		function clearWatchdog() {
			if ( watchdog !== null ) {
				globalThis.clearTimeout( watchdog );
				watchdog = null;
			}
		}

		function cancelUndo() {
			if ( undo ) {
				globalThis.clearTimeout( undo.timer );
				undo = null;
			}
			hidden.value = false;
		}

		function unwatch() {
			clearWatchdog();
			try {
				watched?.removeEventListener?.( 'pagehide', onPageHide );
			} catch {
				// The document is gone.
			}
			watched = null;
		}

		function detach() {
			observer?.disconnect();
			observer = null;
		}

		function discard() {
			discarded.value = true;
			token++;
			clearTimer();
			cancelUndo();
			unwatch();
			detach();
			loading.value = false;
			stalled.value = false;
		}

		function fail() {
			discard();
			failed.value = true;
			notify( notices, __( 'This screen could not be loaded.', 'wp-admin-site' ) );
		}

		/**
		 * Nothing can be shown: the frame is removed at once. An ended session (behind a
		 * sign-in URL that is not wp-login.php, for instance) shows the sign-in; anything
		 * else the failure message.
		 */
		async function giveUp() {
			const probe = lastAdmin ?? current;
			discard();
			const mine = token;
			if ( router && probe ) {
				try {
					await router.lookup( probe );
				} catch ( error ) {
					if ( error?.status === 401 ) {
						router.expire();
						return;
					}
				}
			}
			if ( ! unmounted && mine === token ) {
				fail();
			}
		}

		function focusIfAsked() {
			if ( pageFocus?.legacy ) {
				pageFocus.legacy = false;
				nextTick( () => frame.value?.focus?.() );
			}
		}

		/** Sends the frame to an admin URL without adding a history entry. */
		function sendFrame( url, { forPage = true } = {} ) {
			const target = validateSrc( url );
			if ( ! target ) {
				return;
			}
			token++;
			requested = forPage;
			current = target;
			loading.value = true;
			stalled.value = false;
			cancelUndo();
			clearWatchdog();
			detach();
			startTimer();
			try {
				const win = frame.value?.contentWindow;
				if ( win ) {
					win.location.replace( target );
					return;
				}
			} catch {
				// Fall back to the attribute.
			}
			src.value = target;
		}

		/** Shows a page given by the router. */
		function show( page ) {
			const next = validateSrc( page?.legacy?.src );
			layout.value = layoutFor( next );
			if ( ! next ) {
				fail();
				return;
			}
			if ( failed.value || discarded.value || ! src.value ) {
				failed.value = false;
				discarded.value = false;
				restoring = false;
				requested = true;
				cancelUndo();
				token++;
				current = next;
				src.value = next;
				loading.value = true;
				stalled.value = false;
				height.value = null;
				startTimer();
				return;
			}
			// The frame is already there: it went there by itself and was adopted.
			if ( samePage( next, current ) && ! undo ) {
				return;
			}
			sendFrame( next );
		}

		/**
		 * Runs `then` once the history entry the frame's own navigation added is gone:
		 * a Back traversal takes the frame back to the screen before (hidden meanwhile),
		 * so that the entry is overwritten by the next push.
		 */
		function withoutOwnEntry( added, then ) {
			if ( ! added ) {
				then();
				return;
			}
			hidden.value = true;
			const finish = () => {
				cancelUndo();
				then();
			};
			undo = { timer: globalThis.setTimeout( finish, UNDO_TIMEOUT ), then: finish };
			globalThis.history?.back();
		}

		/** The frame is not on an admin screen: back to the last one, else give up. */
		function restore( added ) {
			if ( restoring || ! lastAdmin ) {
				restoring = false;
				giveUp();
				return;
			}
			restoring = true;
			notify( notices, __( 'A page outside the administration cannot be shown here, so the previous screen is shown again.', 'wp-admin-site' ) );
			if ( ! added ) {
				sendFrame( lastAdmin, { forPage: false } );
				return;
			}
			// The traversal brings the frame back to lastAdmin; if it does not, send it there.
			const target = lastAdmin;
			requested = false;
			undo = { timer: globalThis.setTimeout( () => {
				undo = null;
				sendFrame( target, { forPage: false } );
			}, UNDO_TIMEOUT ), then: null };
			globalThis.history?.back();
		}

		function onPageHide() {
			if ( unmounted || discarded.value || undo || timer !== null ) {
				return; // Gone, or a navigation started here (it has its own timeout).
			}
			clearWatchdog();
			watchdog = globalThis.setTimeout( () => {
				watchdog = null;
				let href = null;
				try {
					href = String( frame.value?.contentWindow?.location.href );
				} catch {
					href = null;
				}
				// An admin screen of this origin that is still loading: its load decides.
				if ( href !== null && ( frameToTopUrl( href, origin() ) || href.startsWith( origin() + '/wp-login.php' ) ) ) {
					return;
				}
				token++;
				loading.value = false;
				detach();
				restore( true );
			}, WATCHDOG );
		}

		function minimumHeight() {
			const top = frame.value?.getBoundingClientRect?.().top ?? 0;
			return ( globalThis.innerHeight ?? 0 ) - ( top + ( globalThis.scrollY ?? 0 ) );
		}

		function observe( win ) {
			detach();
			const doc = win?.document;
			if ( ! doc || layout.value === 'full' ) {
				height.value = null;
				return;
			}
			const content = doc.getElementById?.( 'wpbody-content' ) ?? null;
			const measure = () => {
				const bottom = content ? content.getBoundingClientRect().bottom + ( win.scrollY ?? 0 ) : doc.documentElement?.scrollHeight;
				height.value = frameHeight( { contentBottom: bottom, minimum: minimumHeight() } );
			};
			// An observer of the frame's own window watches the frame's document.
			if ( typeof win.ResizeObserver === 'function' ) {
				observer = new win.ResizeObserver( measure );
				observer.observe( content ?? doc.body ?? doc.documentElement );
			}
			measure();
		}

		function onFrameClick( event ) {
			if ( event.defaultPrevented ) {
				return;
			}
			const anchor = event.target?.closest?.( 'a[href]' );
			if ( ! anchor ) {
				return;
			}
			const url = outsideLink( {
				href: anchor.href,
				origin: origin(),
				button: event.button,
				target: anchor.getAttribute( 'target' ) ?? '',
				modified: Boolean( event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ),
				download: anchor.hasAttribute( 'download' ),
			} );
			if ( url ) {
				event.preventDefault();
				globalThis.open( url, '_blank', 'noopener,noreferrer' );
			}
		}

		function readTitle( win ) {
			try {
				return String( win?.document?.title ?? '' );
			} catch {
				return '';
			}
		}

		function navigationType( win ) {
			try {
				return win.performance?.getEntriesByType?.( 'navigation' )?.[ 0 ]?.type ?? null;
			} catch {
				return null;
			}
		}

		async function onLoad( event ) {
			const win = ( event?.currentTarget ?? frame.value )?.contentWindow ?? null;
			if ( ! win || discarded.value ) {
				return;
			}
			if ( undo?.then ) {
				undo.then();
				return;
			}
			if ( undo ) {
				cancelUndo(); // A restoring traversal arrived; decide on it as on any load.
			}
			let href = null;
			try {
				href = String( win.location.href );
			} catch {
				href = null; // Another origin.
			}
			const before = current;
			const decision = syncDecision( { href, origin: origin(), current: before } );
			if ( decision.action === 'ignore' ) {
				return;
			}
			// Whether this document added a history entry of its own (not one this host replaced).
			const added = addedHistoryEntry( { requested, type: href === null ? null : navigationType( win ) } );
			requested = false;
			const mine = ++token;
			clearTimer();
			unwatch();
			stalled.value = false;
			loading.value = false;
			detach();

			if ( decision.action === 'login' ) {
				withoutOwnEntry( added, () => {
					discard();
					router?.expire();
				} );
				return;
			}
			if ( decision.action === 'restore' ) {
				restore( added );
				return;
			}

			restoring = false;
			lastAdmin = decision.url;
			current = decision.url;
			layout.value = layoutFor( decision.url );
			win.document?.addEventListener?.( 'click', onFrameClick );
			win.addEventListener?.( 'pagehide', onPageHide );
			watched = win;
			observe( win );
			emit( 'navigated', { url: decision.url, path: pagePathOf( decision.url ), title: readTitle( win ) } );
			if ( decision.action === 'stay' || ! router ) {
				return;
			}

			const since = router.navigationCount?.();
			let answer;
			try {
				answer = await router.lookup( decision.url );
			} catch ( error ) {
				answer = error instanceof Error ? error : new Error( String( error ) );
			}
			if ( mine !== token || unmounted ) {
				return;
			}
			const next = syncDecision( { href, origin: origin(), current: before, answer } );
			if ( next.action === 'adopt' ) {
				if ( pageFocus ) {
					pageFocus.adopted = true;
				}
				const accepted = await router.navigate( next.url, { adopt: true, manifest: answer, since } );
				if ( accepted === false && pageFocus ) {
					pageFocus.adopted = false;
				}
			} else if ( next.action === 'native' ) {
				withoutOwnEntry( added, () => {
					discard();
					router.navigate( next.url, added ? { manifest: answer, since } : { replace: true, manifest: answer, since } );
				} );
			}
			// 'keep': the router does not know this screen; it stays as it is.
		}

		function retry() {
			sendFrame( current );
		}

		watch( layout, ( value ) => {
			frameLayout?.set( value );
			if ( value === 'full' ) {
				detach();
				height.value = null;
			}
		}, { immediate: true } );

		watch( () => props.page, ( page ) => {
			show( page );
			focusIfAsked();
		} );
		// The page asked for again (e.g. its menu item) while the frame shows another screen.
		watch( () => router?.state?.visits, () => {
			if ( router.state.status === 'ready' && router.state.page?.path === props.page?.path && ! discarded.value && ! failed.value ) {
				show( props.page );
			}
		} );
		show( props.page );
		onMounted( focusIfAsked );

		onBeforeUnmount( () => {
			unmounted = true;
			token++;
			clearTimer();
			cancelUndo();
			unwatch();
			detach();
			frameLayout?.set( 'default' );
		} );

		// Computed here: the template compiler would need a DOM to read `&&` in an attribute.
		const showFrame = computed( () => Boolean( src.value ) && ! failed.value && ! discarded.value );
		const showSpinner = computed( () => ( loading.value || hidden.value ) && ! stalled.value && showFrame.value );
		const showStalled = computed( () => stalled.value && ! failed.value );
		const frameStyle = computed( () => {
			const style = layout.value === 'default' && height.value ? { blockSize: height.value + 'px' } : {};
			return hidden.value ? { ...style, visibility: 'hidden' } : ( Object.keys( style ).length ? style : null );
		} );

		return { frame, src, failed, stalled, layout, showFrame, showSpinner, showStalled, frameStyle, onLoad, retry };
	},
	template: `
		<div :class="[ 'wp-legacy-host', { 'wp-legacy-host--full': layout === 'full' } ]">
			<SlotOutlet name="before-frame" />
			<p v-if="failed" class="wp-legacy-failure" role="alert">{{ $__( 'This screen could not be displayed.', 'wp-admin-site' ) }}</p>
			<div v-if="showStalled" class="wp-legacy-stalled notice notice-warning" role="alert">
				<p>
					{{ $__( 'This screen is taking a long time to load.', 'wp-admin-site' ) }}
					<button type="button" class="button" @click="retry">{{ $__( 'Retry', 'wp-admin-site' ) }}</button>
				</p>
			</div>
			<div v-if="showSpinner" class="wp-legacy-host__loading">
				<!-- translators: %s: Admin screen name. -->
				<Spinner :label="$sprintf( $__( 'Loading %s…', 'wp-admin-site' ), page.title )" />
			</div>
			<!-- translators: %s: Admin screen name. -->
			<iframe
				v-if="showFrame"
				ref="frame"
				class="wp-legacy"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
				:src="src"
				:title="$sprintf( $__( 'Classic screen: %s', 'wp-admin-site' ), page.title )"
				:style="frameStyle"
				@load="onLoad"
			></iframe>
			<SlotOutlet name="after-frame" />
		</div>
	`,
};
