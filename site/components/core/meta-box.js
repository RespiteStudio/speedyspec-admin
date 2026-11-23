import { computed, onBeforeUnmount, ref } from 'vue';
import InlineMarkup, { sanitizeMarkup } from '../../kit/InlineMarkup.js';
import { SlotOutlet } from '../../runtime/slots.js';

// How long the pointer or focus stays on a button before its tooltip shows, as wp-tooltip.js waits.
const TOOLTIP_DELAY = 300;

const supportsPopover = () => typeof globalThis.HTMLElement === 'function' && Object.hasOwn( globalThis.HTMLElement.prototype, 'popover' );

/** The text of a title's markup (InlineMarkup's tree), for the box's accessible name. */
function textOfMarkup( html ) {
	const text = ( nodes ) => nodes.map( ( node ) => ( typeof node === 'string' ? node : text( node.children ) ) ).join( '' );
	return text( sanitizeMarkup( html ) ).replace( /\s+/g, ' ' ).trim();
}

/**
 * One of the box's header buttons with its tooltip, as wp_get_tooltip() prints it
 * (`.wp-tooltip.wp-is-tooltip`, the button as `.wp-tooltip__toggle` named by `aria-label`, and a
 * `popover="hint"` bubble), shown on hover and focus after a short delay as wp-tooltip.js does.
 * Where the browser has no popovers the bubble is hidden, as wp-tooltip.js hides it.
 */
const HeaderButton = {
	name: 'MetaBoxHeaderButton',
	props: {
		tooltipId: { type: String, required: true },
		label: { type: String, required: true },
		buttonClass: { type: String, required: true },
		indicatorClass: { type: String, required: true },
		describedby: { type: String, required: true },
		disabled: { type: Boolean, default: null },
		expanded: { type: Boolean, default: null },
	},
	emits: [ 'press' ],
	setup() {
		const button = ref( null );
		const bubble = ref( null );
		const popovers = supportsPopover();
		let timer = null;
		const isOpen = () => bubble.value?.matches?.( ':popover-open' ) === true;
		function show() {
			clearTimeout( timer );
			timer = setTimeout( () => {
				if ( ! isOpen() ) {
					bubble.value?.showPopover?.( { source: button.value } );
				}
			}, TOOLTIP_DELAY );
		}
		function hide() {
			clearTimeout( timer );
			if ( isOpen() ) {
				bubble.value?.hidePopover?.();
			}
		}
		onBeforeUnmount( () => clearTimeout( timer ) );
		return { button, bubble, popovers, show, hide };
	},
	template: `
		<span class="wp-tooltip wp-is-tooltip">
			<button
				ref="button"
				type="button"
				:class="[ buttonClass, 'wp-tooltip__toggle' ]"
				:aria-describedby="describedby"
				:aria-disabled="disabled === null ? null : ( disabled ? 'true' : 'false' )"
				:aria-expanded="expanded === null ? null : ( expanded ? 'true' : 'false' )"
				:aria-label="label"
				@click="$emit( 'press' )"
				@mouseenter="show"
				@focus="show"
				@mouseleave="hide"
				@blur="hide"
			><span class="screen-reader-text">{{ label }}</span><span :class="indicatorClass" aria-hidden="true"></span></button>
			<span ref="bubble" popover="hint" :id="tooltipId" :class="[ 'wp-tooltip__bubble', { hidden: ! popovers } ]" role="tooltip"><span :id="tooltipId + '-text'" class="wp-tooltip__text">{{ label }}</span></span>
		</span>
	`,
};

/**
 * Default implementation of core/meta-box: the classic `.postbox` that do_meta_boxes() prints
 * (`.postbox-header` with `h2.hndle`, the move up, move down and "Show or hide panel" buttons
 * with their tooltips in `.handle-actions`, and `.inside`), so that WordPress's admin styles
 * and plugins' styles and scripts apply. A closed box has the class `closed`, a hidden one
 * `hide-if-js` (the holder sets `.js` above it).
 *
 * Clicking the heading or the toggle button asks to close or open the box (`toggle`), except a
 * click on a link in the heading; the toggle button's `aria-expanded` says whether it is open.
 * The move buttons are `aria-disabled` on the first and last position. A pinned box has none of
 * these buttons and its heading does nothing. While reordering is allowed the heading is the
 * box's drag handle (`draggable`); the holder handles the drag.
 */
export default {
	name: 'MetaBox',
	components: { InlineMarkup, SlotOutlet, HeaderButton },
	props: {
		box: { type: Object, required: true },
		index: { type: Number, required: true },
		count: { type: Number, required: true },
		reordering: { type: Boolean, default: true },
	},
	emits: [ 'move', 'toggle' ],
	setup( props, { emit } ) {
		const label = computed( () => textOfMarkup( props.box.title ) );
		const classes = computed( () => ( Array.isArray( props.box.classes ) ? props.box.classes.filter( ( name ) => typeof name === 'string' && name !== '' ) : [] ) );
		const draggable = computed( () => props.reordering && ! props.box.pinned );

		function onHeading( event ) {
			if ( props.box.pinned || event?.target?.closest?.( 'a' ) ) {
				return;
			}
			emit( 'toggle' );
		}

		return { label, classes, draggable, onHeading, move: ( delta ) => emit( 'move', delta ), toggle: () => emit( 'toggle' ) };
	},
	template: `
		<div :id="box.id" :class="[ 'postbox', ...classes, { closed: box.closed, 'hide-if-js': box.hidden } ]" role="region" :aria-label="label">
			<div class="postbox-header">
				<h2 :id="box.id + '-title'" :class="[ 'hndle', { 'is-non-sortable': ! draggable } ]" :draggable="draggable ? 'true' : null" @click="onHeading">
					<template v-if="box.warning"><span aria-hidden="true" class="dashicons dashicons-warning"></span><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Warning:', 'default' ) + ' ' }}</span></template>
					<InlineMarkup :html="box.title" />
				</h2>
				<slot name="header-actions" :box="box" />
				<SlotOutlet name="header-actions" :context="{ box }" />
				<div v-if="! box.pinned" class="handle-actions hide-if-no-js">
					<HeaderButton
						:tooltip-id="box.id + '-handle-order-higher-description'"
						:label="$__( 'Move up', 'default' )"
						button-class="handle-order-higher"
						indicator-class="order-higher-indicator"
						:describedby="box.id + '-title'"
						:disabled="index === 0"
						@press="move( -1 )"
					/>
					<HeaderButton
						:tooltip-id="box.id + '-handle-order-lower-description'"
						:label="$__( 'Move down', 'default' )"
						button-class="handle-order-lower"
						indicator-class="order-lower-indicator"
						:describedby="box.id + '-title'"
						:disabled="index === count - 1"
						@press="move( 1 )"
					/>
					<HeaderButton
						:tooltip-id="box.id + '-handlediv'"
						:label="$__( 'Show or hide panel', 'default' )"
						button-class="handlediv"
						indicator-class="toggle-indicator"
						:describedby="box.id + '-title'"
						:expanded="! box.closed"
						@press="toggle"
					/>
				</div>
			</div>
			<div class="inside">
				<slot />
			</div>
		</div>
	`,
};
