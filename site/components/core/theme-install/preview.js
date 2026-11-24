import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { __, sprintf } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import InertHtml from '../../../kit/InertHtml.js';
import { ThemeInstallButton, around } from './cards.js';

/*
 * The theme preview of Add Themes, as theme.js's Preview view renders tmpl-theme-preview into
 * `div.theme-install-overlay.wp-full-overlay[role="dialog"]`: the sidebar's header (Close,
 * Previous, Next and the button WordPress gives: Install, Activate or their disabled forms), the
 * name, the author, the screenshot, the rating with its reviews link (or "not rated yet"), the
 * version, the compatibility notice and the description (WordPress.org's markup through
 * kit/InertHtml: it runs nothing); the footer's Collapse; and the frame.
 *
 * The frame (F7): the API's preview address is loaded only when previewFrame() allows it (http(s)
 * on another origin than the admin's), in a frame sandboxed without `allow-same-origin` or
 * `allow-top-navigation` and with no referrer, so that a preview that redirects to the admin's
 * origin still cannot script it. Otherwise the screenshot shows in its place.
 *
 * As theme.js: Previous and Next are disabled at the ends of the cards shown (and hidden with one
 * card, `no-navigation`); Escape closes the preview and Alt (Option) with the left or right arrow
 * key moves to the previous or next theme, unless `keys` is false (the Connection Information
 * dialog is open over it); Collapse toggles the sidebar (`collapsed`/`expanded`, the button's
 * label Collapse Sidebar or Expand Sidebar); the preview takes the focus when it opens.
 *
 * Props: `card`, `first`, `last`, `alone` (the only card), `state` (its install's, see
 * theme-install/cards.js), `labels` and `keys`. Emits `close`, `previous`, `next`, `install` and
 * `activate`.
 */

/**
 * The address the frame may load: the preview address when it is http(s) and its origin is not
 * `adminOrigin`, else null. Pure.
 *
 * @param {string|null} url         The card's `previewUrl`.
 * @param {string}      adminOrigin The admin's origin (`location.origin`).
 * @return {string|null} The address to frame.
 */
export function previewFrame( url, adminOrigin ) {
	if ( typeof url !== 'string' || url === '' ) {
		return null;
	}
	let parsed;
	try {
		parsed = new URL( url );
	} catch {
		return null;
	}
	if ( ( parsed.protocol !== 'http:' && parsed.protocol !== 'https:' ) || parsed.origin === adminOrigin ) {
		return null;
	}
	return parsed.href;
}

/** The stars of a rating out of five, by half (wp_star_rating()'s markup). Pure. */
export function stars( value ) {
	const rating = Math.max( 0, Math.min( 5, Math.round( ( Number( value ) || 0 ) * 2 ) / 2 ) );
	const full = Math.floor( rating );
	const half = rating - full > 0 ? 1 : 0;
	return [ ...Array( full ).fill( 'full' ), ...Array( half ).fill( 'half' ), ...Array( 5 - full - half ).fill( 'empty' ) ];
}

export default {
	name: 'ThemeInstallPreview',
	components: { InlineMarkup, InertHtml, ThemeInstallButton },
	props: {
		card: { type: Object, required: true },
		first: { type: Boolean, default: false },
		last: { type: Boolean, default: false },
		alone: { type: Boolean, default: false },
		state: { type: Object, default: null },
		labels: { type: Object, default: () => ( {} ) },
		keys: { type: Boolean, default: true },
	},
	emits: [ 'close', 'previous', 'next', 'install', 'activate' ],
	setup( props, { emit } ) {
		const root = ref( null );
		const collapsed = ref( false );
		const ready = ref( false );
		const frame = computed( () => previewFrame( props.card.previewUrl, globalThis.location?.origin ?? '' ) );

		watch( () => props.card.slug, () => {
			ready.value = false;
		} );

		function onKeydown( event ) {
			if ( ! props.keys ) {
				return;
			}
			if ( event.key === 'Escape' ) {
				emit( 'close' );
				return;
			}
			// Arrow key navigation requires Alt, so that it never interferes with a screen reader.
			if ( ! event.altKey ) {
				return;
			}
			if ( event.key === 'ArrowRight' ) {
				event.preventDefault();
				emit( 'next' );
			} else if ( event.key === 'ArrowLeft' ) {
				event.preventDefault();
				emit( 'previous' );
			}
		}

		function step( name, disabled, event ) {
			event?.preventDefault?.();
			if ( ! disabled ) {
				emit( name );
			}
		}

		onMounted( () => {
			globalThis.document?.addEventListener?.( 'keydown', onKeydown );
			nextTick( () => root.value?.focus?.() );
		} );
		onBeforeUnmount( () => globalThis.document?.removeEventListener?.( 'keydown', onKeydown ) );

		return {
			root, collapsed, ready, frame, step,
			stars: computed( () => stars( props.card.rating?.value ) ),
			by: computed( () => around( props.labels.by ?? __( 'By %s', 'default' ) ) ),
			version: computed( () => sprintf( props.labels.version ?? __( 'Version: %s', 'default' ), props.card.version ?? '' ) ),
			compatible: computed( () => props.card.compatibility?.wordpress !== false && props.card.compatibility?.php !== false ),
			collapseLabel: computed( () => ( collapsed.value ? props.labels.expandSidebar : props.labels.collapseSidebar ) ),
		};
	},
	template: `
		<div ref="root" :class="[ 'theme-install-overlay', 'wp-full-overlay', collapsed ? 'collapsed' : 'expanded', { 'no-navigation': alone, 'iframe-ready': ready } ]" style="display: block" tabindex="0" role="dialog" :aria-label="labels.overlay">
			<div class="wp-full-overlay-sidebar">
				<div class="wp-full-overlay-header">
					<button type="button" class="close-full-overlay" @click="step( 'close', false, $event )"><span class="screen-reader-text">{{ labels.close }}</span></button>
					<button type="button" :class="[ 'previous-theme', { disabled: first } ]" :aria-disabled="first ? 'true' : null" @click="step( 'previous', first, $event )"><span class="screen-reader-text">{{ labels.previous }}</span></button>
					<button type="button" :class="[ 'next-theme', { disabled: last } ]" :aria-disabled="last ? 'true' : null" @click="step( 'next', last, $event )"><span class="screen-reader-text">{{ labels.next }}</span></button>
					<ThemeInstallButton :card="card" :state="state" @install="$emit( 'install' )" @activate="$emit( 'activate' )" />
				</div>
				<div class="wp-full-overlay-sidebar-content">
					<div class="install-theme-info">
						<h3 class="theme-name">{{ card.name }}</h3>
						<span class="theme-by">{{ by[ 0 ] }}{{ card.author }}{{ by[ 1 ] }}</span>
						<div v-if="card.screenshot" class="theme-screenshot"><img class="theme-screenshot" :src="card.screenshot" alt="" /></div>
						<div class="theme-details">
							<div v-if="card.rating?.rated" class="theme-rating">
								<div class="star-rating"><span class="screen-reader-text">{{ card.rating.label }}</span><div v-for="( star, index ) in stars" :key="index" :class="[ 'star', 'star-' + star ]" aria-hidden="true"></div></div>
								<a class="num-ratings" :href="card.rating.reviewsUrl || null">{{ card.rating.text }}</a>
							</div>
							<span v-else class="no-rating">{{ card.rating?.text }}</span>
							<div class="theme-version">{{ version }}</div>
							<div v-if="! compatible && card.compatibility?.message" class="notice notice-error notice-alt notice-large"><p><InlineMarkup :html="card.compatibility.message" /></p></div>
							<InertHtml class="theme-description" :html="card.description ?? ''" />
						</div>
					</div>
				</div>
				<div class="wp-full-overlay-footer">
					<button type="button" class="collapse-sidebar button" :aria-expanded="String( ! collapsed )" :aria-label="collapseLabel" @click="collapsed = ! collapsed">
						<span class="collapse-sidebar-arrow" aria-hidden="true"></span>
						<span class="collapse-sidebar-label">{{ labels.collapse }}</span>
					</button>
				</div>
			</div>
			<div class="wp-full-overlay-main">
				<iframe v-if="frame" :key="frame" :src="frame" :title="labels.previewFrame" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer" @load="ready = true"></iframe>
				<img v-else-if="card.screenshot" class="theme-screenshot" :src="card.screenshot" alt="" />
			</div>
		</div>
	`,
};
