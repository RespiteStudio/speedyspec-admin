import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { __ } from '@wp-admin/i18n';
import Spinner from '../../kit/Spinner.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { notify } from '../../runtime/notify.js';
import { validateSrc, samePage, layoutFor, syncDecision, frameHeight, outsideLink, pagePathOf } from '../../runtime/legacy-frame.js';

const LOAD_TIMEOUT = 30000;

/**
 * Default implementation of core/legacy: the classic screen at `page.legacy.src`
 * in a same-origin frame filling the content area. WordPress renders it without
 * its own menu and admin bar.
 *
 * - Only a validated admin URL is ever given to the frame (runtime/legacy-frame.js).
 * - When the frame loads another admin screen by itself (a link or a form in the
 *   classic screen), the router is asked which page that is: a legacy page is
 *   adopted (`router.navigate( url, { adopt: true } )`: the top URL follows with a
 *   replaced history entry, since the frame's navigation already added one, and the
 *   frame is not loaded again); a converted page takes over and the frame is dropped.
 * - When the top-level page changes (menu, Back/Forward), the same frame is sent to
 *   the new screen with `location.replace()`, which adds no history entry.
 * - The sign-in screen in the frame means the session has ended: the app's own
 *   sign-in takes over. A frame that leaves the admin is sent back to the last
 *   admin screen with a notice; a plain click on such a link opens it in a new tab.
 * - The frame's height follows its document, except for full-document screens,
 *   for which the frame asks for the full layout through the frame's `frameLayout`.
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
		const loading = ref( true );
		const stalled = ref( false );
		const height = ref( null );
		const layout = ref( layoutFor( validateSrc( props.page?.legacy?.src ) ) );

		let current = null; // The URL the frame shows, or is being sent to.
		let lastAdmin = null; // The last admin screen the frame loaded.
		let restoring = false;
		let requested = true; // The next load answers a navigation started here for a page (not a restore).
		let token = 0; // Bumped by every load and every navigation started here.
		let timer = null;
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

		function detach() {
			observer?.disconnect();
			observer = null;
		}

		function discard() {
			discarded.value = true;
			token++;
			clearTimer();
			detach();
			loading.value = false;
			stalled.value = false;
		}

		function fail() {
			discard();
			failed.value = true;
			notify( notices, __( 'This screen could not be loaded.', 'wp-admin-site' ) );
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
			if ( samePage( next, current ) ) {
				return;
			}
			sendFrame( next );
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

		async function onLoad( event ) {
			const win = ( event?.currentTarget ?? frame.value )?.contentWindow ?? null;
			if ( ! win || discarded.value ) {
				return;
			}
			let href = null;
			try {
				href = String( win.location.href );
			} catch {
				href = null; // Another origin.
			}
			const before = current;
			const decision = syncDecision( { href, origin: origin(), current: before, requested } );
			if ( decision.action === 'ignore' ) {
				return;
			}
			requested = false;
			const mine = ++token;
			clearTimer();
			stalled.value = false;
			loading.value = false;
			detach();

			if ( decision.action === 'login' ) {
				discard();
				router?.expire();
				return;
			}
			if ( decision.action === 'opaque' ) {
				// A screen this page asked for, which WordPress isolates from its parent
				// (Document-Isolation-Policy on the block editor and the Media Library):
				// shown as it is, without following its title, height or links.
				restoring = false;
				return;
			}
			if ( decision.action === 'restore' ) {
				if ( restoring || ! lastAdmin ) {
					restoring = false;
					fail();
					return;
				}
				restoring = true;
				notify( notices, __( 'A page outside the administration cannot be shown here, so the previous screen is shown again.', 'wp-admin-site' ) );
				sendFrame( lastAdmin, { forPage: false } );
				return;
			}

			restoring = false;
			lastAdmin = decision.url;
			current = decision.url;
			layout.value = layoutFor( decision.url );
			win.document?.addEventListener?.( 'click', onFrameClick );
			observe( win );
			emit( 'navigated', { url: decision.url, path: pagePathOf( decision.url ), title: readTitle( win ) } );
			if ( decision.action === 'stay' ) {
				return;
			}

			let answer;
			try {
				answer = router ? await router.lookup( decision.url ) : new Error( 'No router' );
			} catch ( error ) {
				answer = error instanceof Error ? error : new Error( String( error ) );
			}
			if ( mine !== token || unmounted ) {
				return;
			}
			const next = syncDecision( { href, origin: origin(), current: before, answer } );
			if ( next.action === 'adopt' ) {
				router.navigate( next.url, { adopt: true, manifest: answer } );
			} else if ( next.action === 'native' ) {
				discard();
				router.navigate( next.url );
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
		show( props.page );
		onMounted( focusIfAsked );

		onBeforeUnmount( () => {
			unmounted = true;
			token++;
			clearTimer();
			detach();
			frameLayout?.set( 'default' );
		} );

		// Computed here: the template compiler would need a DOM to read `&&` in an attribute.
		const showFrame = computed( () => Boolean( src.value ) && ! failed.value && ! discarded.value );
		const showSpinner = computed( () => loading.value && ! stalled.value && showFrame.value );
		const showStalled = computed( () => stalled.value && ! failed.value );
		const frameStyle = computed( () => ( layout.value === 'default' && height.value ? { blockSize: height.value + 'px' } : null ) );

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
				:src="src"
				:title="$sprintf( $__( 'Classic screen: %s', 'wp-admin-site' ), page.title )"
				:style="frameStyle"
				@load="onLoad"
			></iframe>
			<SlotOutlet name="after-frame" />
		</div>
	`,
};
