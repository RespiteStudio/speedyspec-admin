import { ref, shallowRef, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { __ } from '@wp-admin/i18n';
import Spinner from '../../kit/Spinner.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { notify } from '../../runtime/notify.js';
import { validateSrc, samePage, layoutFor, syncDecision, frameHeight, outsideLink, pagePathOf, pushedHistoryEntry, parentTargetAction, isAppShell, isClassicScreen, isLongRunning, canRetry, frameToTopUrl } from '../../runtime/legacy-frame.js';

const LOAD_TIMEOUT = 30000;
// While the frame is not confirmed, its location is checked this often (ms)…
const POLL_INTERVAL = 250;
// …and an unreadable one (another origin) is given this long to be a navigation still committing.
const UNREADABLE_GRACE = 1000;
// A navigation the confirmed screen starts that leaves it in place this long (a download, a
// 204 answer, a cancelled navigation) shows it again: after a link, and after a form
// submission, which a slow server may still be answering (showing the form again sooner
// would invite a second submission).
const REVEAL_AFTER = 2000;
const REVEAL_AFTER_FORM = 10000;
// How long a Back step that removes the frame's own history entry may take.
const STEP_TIMEOUT = 5000;

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
 * - The frame's content is never visible unless the host has confirmed it is an admin
 *   screen of this origin: it is hidden (and inert) from the moment a navigation starts,
 *   or the confirmed document goes away, until a readable admin screen has loaded. While
 *   hidden, the frame's location is polled: a document that is not an admin screen of
 *   this origin (another origin, unreadable past a short grace, a blank frame after a
 *   document) is not waited for.
 * - The sign-in screen in the frame means the session has ended: the app's own sign-in
 *   takes over. A frame that is not on an admin screen of this origin is sent back to the
 *   last admin screen with a notice; when that is not possible (or it happens twice in a
 *   row), the session is checked (an ended one shows the sign-in) and a failure message
 *   is shown. The admin app's own shell in the frame is never shown nor retried.
 * - The host steps back in history only when the browser reports that the frame's own
 *   navigation pushed an entry (Navigation API); a step that moves the top document
 *   instead is undone at once.
 * - Plain clicks on links that leave the admin open them in a new tab. The frame is
 *   sandboxed without `allow-top-navigation*`, so a document of another origin in it cannot
 *   navigate the top window; links and GET forms aimed at `_parent`/`_top` therefore open
 *   admin screens in the frame itself and anything else in a new tab, and posts aimed there
 *   stay in the frame. Tabs the classic screen opens itself are not sandboxed.
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

		const frame = shallowRef( null ); // The element itself, never a reactive proxy of it.
		const src = ref( null ); // What the frame element was created with.
		const failed = ref( false );
		const discarded = ref( false ); // Handed over to a native page or to the sign-in.
		const confirmed = ref( false ); // The frame shows a document confirmed to be an admin screen.
		const stalled = ref( false );
		const leavePrompt = shallowRef( null ); // { kind: 'link', url } or { kind: 'page', page, back } while asking.
		const stayButton = shallowRef( null );
		const height = ref( null );
		const layout = ref( layoutFor( validateSrc( props.page?.legacy?.src ) ) );

		let current = null; // The URL the frame shows, or is being sent to.
		let lastAdmin = null; // The last admin screen the frame loaded.
		let restoring = false; // The frame is being sent back to lastAdmin.
		let hostNavigation = true; // The pending document comes from this host (src or location.replace).
		let seenDocument = false; // A document (not the initial about:blank) has been in the frame.
		let wantFocus = false; // Focus the frame once its screen is shown.
		let leaving = null; // The document a navigation started here is leaving (its own load is not the new screen's).
		let token = 0; // Bumped by every load and every navigation started here.
		let timer = null; // Load timeout of a navigation started here.
		let poll = null; // Checks the frame's location while it is not confirmed.
		let misses = 0; // Consecutive polls that could not read the location.
		let stepping = null; // { finish } while a Back step removes the frame's own history entry.
		let watched = null; // The frame window whose pagehide and navigations are listened to.
		let shownDoc = null; // The confirmed document, while hidden for a navigation it started.
		let stillThere = 0; // Polls that found shownDoc still in the frame.
		let revealAfter = REVEAL_AFTER; // How long shownDoc may stay before it is shown again.
		let viaPost = false; // The frame's navigation in progress is a form POST.
		let early = null; // { doc, url, viaPost } of a document shown before its load event.
		let allowLeave = false; // The user chose to leave a running screen.
		let submitting = false; // A form was just submitted in the frame (its navigation follows).
		let postSubmitted = false; // …with POST.
		let observer = null;
		let unmounted = false;

		const origin = () => globalThis.location?.origin ?? '';
		const topUrl = () => {
			const where = globalThis.location;
			return where ? String( where.pathname ) + String( where.search ?? '' ) + String( where.hash ?? '' ) : '';
		};

		function readDocument( win ) {
			try {
				return win?.document ?? null;
			} catch {
				return null;
			}
		}

		function readHref( win ) {
			try {
				return win ? String( win.location.href ) : null;
			} catch {
				return null; // Another origin.
			}
		}

		function clearTimer() {
			if ( timer !== null ) {
				globalThis.clearTimeout( timer );
				timer = null;
			}
		}

		function startTimer() {
			clearTimer();
			timer = globalThis.setTimeout( onTimeout, LOAD_TIMEOUT );
		}

		function stopPoll() {
			if ( poll !== null ) {
				globalThis.clearTimeout( poll );
				poll = null;
			}
		}

		function schedulePoll() {
			stopPoll();
			poll = globalThis.setTimeout( onPoll, POLL_INTERVAL );
		}

		/**
		 * Hides the frame at once, in the same task, before the next document can paint
		 * (the reactive state follows): `revealable` when the confirmed document is still
		 * there (it only started a navigation), so that it can be shown again.
		 */
		function hideNow( { revealable, after = REVEAL_AFTER } ) {
			const el = frame.value;
			try {
				el?.classList?.add( 'wp-legacy--hidden' );
				if ( el ) {
					el.inert = true;
				}
			} catch {
				// The reactive state below hides it on the next render.
			}
			hide();
			shownDoc = revealable ? readDocument( el?.contentWindow ) : null;
			stillThere = 0;
			revealAfter = after;
		}

		/** Hides the frame until a document in it is confirmed to be an admin screen, and watches it. */
		function hide() {
			shownDoc = null;
			early = null;
			// Hidden, it is inert and loses focus: focus comes back with the next screen.
			if ( frame.value && globalThis.document?.activeElement === frame.value ) {
				wantFocus = true;
			}
			confirmed.value = false;
			misses = 0;
			schedulePoll();
		}

		function cancelStep() {
			if ( stepping ) {
				stepping.cancel();
				stepping = null;
			}
		}

		function unwatch() {
			try {
				watched?.removeEventListener?.( 'pagehide', onPageHide );
				watched?.navigation?.removeEventListener?.( 'navigate', onFrameNavigate );
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
			confirmed.value = false;
			token++;
			clearTimer();
			stopPoll();
			cancelStep();
			unwatch();
			detach();
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
				wantFocus = true;
				focusWhenShown();
			}
		}

		function focusWhenShown() {
			if ( wantFocus && confirmed.value ) {
				nextTick( () => {
					// Hidden (inert) meanwhile, e.g. the screen asked for starts loading: with the next one.
					if ( wantFocus && confirmed.value ) {
						wantFocus = false;
						frame.value?.focus?.();
					}
				} );
			}
		}

		/** Sends the frame to an admin URL without adding a history entry. */
		function sendFrame( url ) {
			const target = validateSrc( url );
			if ( ! target ) {
				return;
			}
			token++;
			hostNavigation = true;
			viaPost = false;
			current = target;
			stalled.value = false;
			cancelStep();
			unwatch();
			detach();
			startTimer();
			hide();
			try {
				const win = frame.value?.contentWindow;
				leaving = readDocument( win );
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
				hostNavigation = true;
				seenDocument = false;
				cancelStep();
				token++;
				current = next;
				src.value = next;
				stalled.value = false;
				height.value = null;
				startTimer();
				hide();
				return;
			}
			// The frame is already there: it went there by itself and was adopted.
			if ( samePage( next, current ) && ! stepping ) {
				return;
			}
			sendFrame( next );
		}

		/** The frame is not on an admin screen of this origin: back to the last one, else give up. */
		function restore() {
			if ( restoring || ! lastAdmin ) {
				restoring = false;
				giveUp();
				return;
			}
			restoring = true;
			notify( notices, __( 'A page outside the administration cannot be shown here, so the previous screen is shown again.', 'wp-admin-site' ) );
			sendFrame( lastAdmin );
		}

		/** Decided without a load event (a poll or the load timeout): the frame left the admin. */
		function leave() {
			token++;
			clearTimer();
			stopPoll();
			unwatch();
			detach();
			stalled.value = false;
			restore();
		}

		function onPoll() {
			poll = null;
			if ( unmounted || discarded.value || confirmed.value || stepping ) {
				return;
			}
			const href = readHref( frame.value?.contentWindow );
			if ( href === null ) {
				misses++;
				// An unreadable document: another origin, once its navigation has had time to commit.
				if ( misses * POLL_INTERVAL >= UNREADABLE_GRACE ) {
					leave();
					return;
				}
				schedulePoll();
				return;
			}
			misses = 0;
			// The confirmed screen is still there, its navigation did not replace it: show it again.
			if ( shownDoc && readDocument( frame.value?.contentWindow ) === shownDoc ) {
				stillThere++;
				if ( stillThere * POLL_INTERVAL >= revealAfter ) {
					shownDoc = null;
					confirmed.value = true;
					focusWhenShown();
					return;
				}
				schedulePoll();
				return;
			}
			const decision = syncDecision( { href, origin: origin(), current, blankAllowed: ! seenDocument } );
			if ( decision.action === 'restore' ) {
				leave();
				return;
			}
			if ( decision.action !== 'ignore' ) {
				seenDocument = true;
			}
			// A classic screen of this origin that has started to arrive (it may stream for minutes,
			// e.g. an upgrade): shown now; its load event does the rest.
			if ( ( decision.action === 'stay' || decision.action === 'lookup' ) && showEarly( frame.value?.contentWindow, decision.url ) ) {
				return;
			}
			// Anything else still loading (the sign-in, a document without a body yet): its load decides.
			schedulePoll();
		}

		/** Watches a confirmed document: clicks, form submissions, its navigations and its departure. */
		function attach( win ) {
			win.document?.addEventListener?.( 'click', ( clickEvent ) => onFrameClick( clickEvent, win ) );
			win.document?.addEventListener?.( 'submit', ( submitEvent ) => onFrameSubmit( submitEvent, win ) );
			win.addEventListener?.( 'pagehide', onPageHide );
			try {
				win.navigation?.addEventListener?.( 'navigate', onFrameNavigate );
			} catch {
				// No Navigation API: the frame is hidden when its document goes (pagehide).
			}
			watched = win;
		}

		/**
		 * Shows a document before its load event when it is a classic screen of this origin
		 * (readable, an admin URL, not the sign-in, a body with the classic classes, not the
		 * app's own shell) and not the document a navigation started here is leaving.
		 */
		function showEarly( win, url ) {
			const doc = readDocument( win );
			if ( ! doc?.body || doc === leaving || ! isClassicScreen( doc ) || isAppShell( doc ) ) {
				return false;
			}
			early = { doc, url, viaPost };
			clearTimer();
			stalled.value = false;
			stopPoll();
			attach( win );
			confirmed.value = true;
			focusWhenShown();
			return true;
		}

		/** A screen shown before its load, still loading, that leaving could interrupt. */
		const runningScreen = () => Boolean( early ) && ! allowLeave && isLongRunning( { url: early.url, viaPost: early.viaPost } );

		function onTimeout() {
			timer = null;
			const href = readHref( frame.value?.contentWindow );
			const decision = href === null ? { action: 'restore' } : syncDecision( { href, origin: origin(), current, blankAllowed: ! seenDocument } );
			if ( decision.action === 'restore' ) {
				leave();
				return;
			}
			stalled.value = true;
		}

		/**
		 * Runs `then( stepped )` once the history entry that the frame's own navigation pushed
		 * is gone: a Back step takes the frame back to the screen before (hidden meanwhile),
		 * so that the next push overwrites the entry. Only when the browser reported a push;
		 * otherwise, and when the step turns out to move the top document instead (a popstate
		 * with another URL: it is undone at once), `then( false )`.
		 */
		function withoutOwnEntry( pushed, then ) {
			if ( ! pushed || typeof globalThis.history?.back !== 'function' ) {
				then( false );
				return;
			}
			confirmed.value = false;
			stopPoll();
			const before = topUrl();
			let stepTimer = null;
			// The step moved the top document instead (or the user went back meanwhile): the
			// router is already showing where that led, so the hand-over is abandoned.
			const onPop = () => {
				if ( topUrl() !== before ) {
					cleanup();
				}
			};
			const cleanup = () => {
				globalThis.clearTimeout( stepTimer );
				globalThis.removeEventListener?.( 'popstate', onPop );
				stepping = null;
			};
			function finish( stepped ) {
				cleanup();
				then( stepped );
			}
			stepping = { finish, cancel: cleanup };
			globalThis.addEventListener?.( 'popstate', onPop );
			// Not seen to finish: whether the step happened is unknown, so nothing is pushed.
			stepTimer = globalThis.setTimeout( () => finish( false ), STEP_TIMEOUT );
			globalThis.history.back();
		}

		function onPageHide() {
			if ( unmounted || discarded.value || stepping ) {
				return;
			}
			// The confirmed document goes away: hidden until the next one is confirmed.
			// (Without the Navigation API, a POST submitted just before is known from the submit.)
			if ( submitting ) {
				viaPost = postSubmitted;
				submitting = false;
				postSubmitted = false;
			}
			unwatch();
			hideNow( { revealable: false } );
		}

		/** The confirmed screen starts a navigation to another document: hidden from now on. */
		function onFrameNavigate( event ) {
			if ( unmounted || discarded.value || stepping || ! confirmed.value ) {
				return;
			}
			if ( event?.destination?.sameDocument || typeof event?.downloadRequest === 'string' ) {
				return;
			}
			// A form submission carries its data (POST); a submit seen just before counts too.
			const form = Boolean( event?.formData ) || submitting;
			submitting = false;
			viaPost = Boolean( event?.formData ) || postSubmitted;
			postSubmitted = false;
			hideNow( { revealable: true, after: form ? REVEAL_AFTER_FORM : REVEAL_AFTER } );
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

		const openOutside = ( url ) => globalThis.open( url, '_blank', 'noopener,noreferrer' );

		function onFrameClick( event, win ) {
			if ( event.defaultPrevented ) {
				return;
			}
			const anchor = event.target?.closest?.( 'a[href]' );
			if ( ! anchor ) {
				return;
			}
			const target = anchor.getAttribute( 'target' ) ?? '';
			const modified = Boolean( event.metaKey || event.ctrlKey || event.shiftKey || event.altKey );
			// The sandbox keeps the frame from navigating its parent: such links stay in the frame.
			const parent = event.button === 0 && ! modified ? parentTargetAction( { href: anchor.href, origin: origin(), target } ) : null;
			if ( parent ) {
				event.preventDefault();
				if ( parent.action === 'frame' ) {
					win.location.assign( parent.url );
				} else {
					openOutside( parent.url );
				}
				return;
			}
			const url = outsideLink( {
				href: anchor.href,
				origin: origin(),
				button: event.button,
				target,
				modified,
				download: anchor.hasAttribute( 'download' ),
			} );
			if ( url ) {
				event.preventDefault();
				openOutside( url );
			}
		}

		function onFrameSubmit( event, win ) {
			if ( event.defaultPrevented ) {
				return;
			}
			const form = event.target;
			const submitter = event.submitter ?? null;
			const attr = ( el, name ) => el?.getAttribute?.( name ) ?? null;
			submitting = true;
			postSubmitted = String( attr( submitter, 'formmethod' ) || attr( form, 'method' ) || 'get' ).toLowerCase() === 'post';
			const target = attr( submitter, 'formtarget' ) || attr( form, 'target' ) || '';
			if ( target !== '_parent' && target !== '_top' ) {
				return;
			}
			const stayInFrame = () => {
				form.setAttribute( 'target', '_self' );
				if ( submitter?.hasAttribute?.( 'formtarget' ) ) {
					submitter.setAttribute( 'formtarget', '_self' );
				}
			};
			const method = String( attr( submitter, 'formmethod' ) || attr( form, 'method' ) || 'get' ).toLowerCase();
			if ( method !== 'get' ) {
				stayInFrame(); // A post stays in the frame, wherever it goes.
				return;
			}
			let url;
			try {
				url = new URL( attr( submitter, 'formaction' ) || form.action || win.location.href, win.location.href );
				url.search = new URLSearchParams( new win.FormData( form, submitter ?? undefined ) ).toString();
			} catch {
				return;
			}
			const parent = parentTargetAction( { href: url.href, origin: origin(), target } );
			if ( parent?.action === 'frame' ) {
				stayInFrame();
			} else if ( parent ) {
				event.preventDefault();
				openOutside( parent.url );
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
				return win.navigation?.activation?.navigationType ?? null;
			} catch {
				return null;
			}
		}

		async function onLoad( event ) {
			const win = ( event?.currentTarget ?? frame.value )?.contentWindow ?? null;
			if ( ! win || discarded.value ) {
				return;
			}
			if ( stepping ) {
				stepping.finish( true );
				return;
			}
			// The document a navigation started here is leaving finished loading late: not the new screen.
			const doc = readDocument( win );
			if ( leaving && doc === leaving ) {
				return;
			}
			leaving = null;
			// Shown before its load: listeners already there, never hidden again by its own load.
			const wasEarly = Boolean( early ) && early.doc === doc;
			early = null;
			const href = readHref( win );
			const decision = syncDecision( { href, origin: origin(), current, blankAllowed: ! seenDocument } );
			if ( decision.action === 'ignore' ) {
				return;
			}
			seenDocument = true;
			const pushed = pushedHistoryEntry( { hostNavigation, navigationType: href === null ? null : navigationType( win ) } );
			hostNavigation = false;
			const mine = ++token;
			clearTimer();
			stopPoll();
			if ( ! wasEarly || ( decision.action !== 'stay' && decision.action !== 'lookup' ) ) {
				unwatch();
			}
			stalled.value = false;
			detach();
			settleLeave();

			if ( decision.action === 'login' ) {
				withoutOwnEntry( pushed, () => {
					discard();
					router?.expire();
				} );
				return;
			}
			if ( decision.action === 'restore' ) {
				restore();
				return;
			}
			// The admin app itself, served in place of a classic screen: never shown, never retried.
			if ( isAppShell( win.document ) ) {
				restoring = false;
				giveUp();
				return;
			}

			restoring = false;
			const previous = current;
			lastAdmin = decision.url;
			current = decision.url;
			layout.value = layoutFor( decision.url );
			if ( ! wasEarly ) {
				attach( win );
			}
			viaPost = false;
			observe( win );
			confirmed.value = true;
			focusWhenShown();
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
			const next = syncDecision( { href, origin: origin(), current: previous, answer } );
			if ( next.action === 'adopt' ) {
				if ( pageFocus ) {
					pageFocus.adopted = true;
				}
				await router.navigate( next.url, { adopt: true, manifest: answer, since } );
				// Consumed by the page host if the page changed; never left for a later one.
				await nextTick();
				if ( pageFocus ) {
					pageFocus.adopted = false;
				}
			} else if ( next.action === 'native' ) {
				withoutOwnEntry( pushed, ( stepped ) => {
					discard();
					// After a Back step the page is pushed over the frame's old entry. When the step
					// was undone, the router has navigated meanwhile, so `since` no longer applies.
					router.navigate( next.url, stepped ? { manifest: answer, since } : { replace: true, manifest: answer, since: pushed ? undefined : since } );
				} );
			}
			// 'keep': the router does not know this screen; it stays as it is.
		}

		function retry() {
			sendFrame( current );
		}

		// Retry only where loading the screen again is harmless (not an action or nonce URL).
		const retryable = ref( true );
		function updateRetryable() {
			retryable.value = canRetry( readHref( frame.value?.contentWindow ) ?? current ?? '' ) && canRetry( current ?? '' );
		}
		watch( stalled, ( value ) => {
			if ( value ) {
				updateRetryable();
			}
		} );

		function ask( prompt ) {
			leavePrompt.value = prompt;
			nextTick( () => stayButton.value?.focus?.() );
		}

		/** The running screen has finished (or gone): a pending question is answered by itself. */
		function settleLeave() {
			const prompt = leavePrompt.value;
			if ( ! prompt ) {
				return;
			}
			leavePrompt.value = null;
			proceed( prompt );
		}

		function proceed( prompt ) {
			if ( prompt.kind === 'link' ) {
				router?.navigate( prompt.url );
			} else {
				show( prompt.page );
				focusIfAsked();
			}
		}

		function stay() {
			const prompt = leavePrompt.value;
			leavePrompt.value = null;
			// Back (or another navigation made elsewhere) already moved the top URL: put the running screen's page back.
			if ( prompt?.kind === 'page' && prompt.back ) {
				router?.navigate( prompt.back, { replace: true } );
			}
			nextTick( () => frame.value?.focus?.() );
		}

		function leaveAnyway() {
			const prompt = leavePrompt.value;
			leavePrompt.value = null;
			if ( prompt ) {
				allowLeave = true;
				proceed( prompt );
			}
		}

		/** A link of the top document (menu, toolbar) clicked while a running screen loads: ask first. */
		function onTopClick( event ) {
			if ( ! runningScreen() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ) {
				return;
			}
			const anchor = event.target?.closest?.( 'a[href]' );
			if ( ! anchor || ( anchor.getAttribute( 'target' ) ?? '' ) !== '' || anchor.hasAttribute( 'download' ) ) {
				return;
			}
			const url = frameToTopUrl( anchor.href, origin() );
			if ( ! url ) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			ask( { kind: 'link', url } );
		}
		globalThis.document?.addEventListener?.( 'click', onTopClick, true );

		watch( layout, ( value ) => {
			frameLayout?.set( value );
			if ( value === 'full' ) {
				detach();
				height.value = null;
			}
		}, { immediate: true } );

		watch( () => props.page, ( page, old ) => {
			// The top URL moved (Back, a navigation made elsewhere) while a running screen loads: ask first.
			if ( runningScreen() && ! samePage( validateSrc( page?.legacy?.src ), current ) ) {
				ask( { kind: 'page', page, back: validateSrc( old?.legacy?.src ) } );
				return;
			}
			allowLeave = false;
			show( page );
			focusIfAsked();
		} );
		// Asked by the page host after a navigation made here, before or after the page changed.
		watch( () => pageFocus?.legacy, ( asked ) => {
			if ( asked ) {
				focusIfAsked();
			}
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
			globalThis.document?.removeEventListener?.( 'click', onTopClick, true );
			unmounted = true;
			token++;
			clearTimer();
			stopPoll();
			cancelStep();
			unwatch();
			detach();
			frameLayout?.set( 'default' );
		} );

		// Computed here: the template compiler would need a DOM to read `&&` in an attribute.
		const showFrame = computed( () => Boolean( src.value ) && ! failed.value && ! discarded.value );
		const showSpinner = computed( () => ! confirmed.value && ! stalled.value && showFrame.value );
		const showStalled = computed( () => stalled.value && ! failed.value );
		const frameClass = computed( () => ( confirmed.value ? 'wp-legacy' : 'wp-legacy wp-legacy--hidden' ) );
		const frameStyle = computed( () => ( layout.value === 'default' && height.value ? { blockSize: height.value + 'px' } : null ) );
		const frameInert = computed( () => ( confirmed.value ? null : true ) );

		return { frame, src, failed, stalled, retryable, leavePrompt, stayButton, layout, showFrame, showSpinner, showStalled, frameClass, frameStyle, frameInert, onLoad, retry, stay, leaveAnyway };
	},
	template: `
		<div :class="[ 'wp-legacy-host', { 'wp-legacy-host--full': layout === 'full' } ]">
			<SlotOutlet name="before-frame" />
			<p v-if="failed" class="wp-legacy-failure" role="alert">{{ $__( 'This screen could not be displayed.', 'wp-admin-site' ) }}</p>
			<div v-if="leavePrompt" class="wp-legacy-leave notice notice-warning" role="alertdialog" aria-labelledby="wp-legacy-leave-text">
				<p id="wp-legacy-leave-text">{{ $__( 'This screen is still working. Leaving now may interrupt it.', 'wp-admin-site' ) }}</p>
				<p>
					<button ref="stayButton" type="button" class="button button-primary" @click="stay">{{ $__( 'Stay', 'wp-admin-site' ) }}</button>
					<button type="button" class="button" @click="leaveAnyway">{{ $__( 'Leave anyway', 'wp-admin-site' ) }}</button>
				</p>
			</div>
			<div v-if="showStalled" class="wp-legacy-stalled notice notice-warning" role="alert">
				<p v-if="retryable">
					{{ $__( 'This screen is taking a long time to load.', 'wp-admin-site' ) }}
					<button type="button" class="button" @click="retry">{{ $__( 'Retry', 'wp-admin-site' ) }}</button>
				</p>
				<p v-else>{{ $__( 'This screen is taking a long time to load. It may still be working: loading it again could repeat what it does.', 'wp-admin-site' ) }}</p>
			</div>
			<div v-if="showSpinner" class="wp-legacy-host__loading">
				<!-- translators: %s: Admin screen name. -->
				<Spinner :label="$sprintf( $__( 'Loading %s…', 'wp-admin-site' ), page.title )" />
			</div>
			<!-- translators: %s: Admin screen name. -->
			<iframe
				v-if="showFrame"
				ref="frame"
				:class="frameClass"
				:inert="frameInert"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
				:src="src"
				:title="$sprintf( $__( 'Classic screen: %s', 'wp-admin-site' ), page.title )"
				:style="frameStyle"
				@load="onLoad"
			></iframe>
			<SlotOutlet name="after-frame" />
		</div>
	`,
};
