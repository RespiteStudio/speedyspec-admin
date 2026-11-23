import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';
import { ThemeNotices, around } from './cards.js';
import ThemeAutoUpdate from './auto-updates.js';

/*
 * The theme details, as theme.js's Details view renders tmpl-theme-single into
 * `div.theme-overlay[role="dialog"]`: the header's Previous, Next and Close, the screenshot, the
 * name and version, the author, the compatibility and update notices, the auto-update setting
 * (ThemeAutoUpdate), the description, the parent theme and the tags; then the actions: for the
 * active theme Customize and the current theme's buttons, for another Live Preview and Activate
 * (or their disabled forms), and Delete.
 *
 * As theme.js: Previous and Next are disabled at the ends of the list shown; while the details are
 * open, Escape closes them and Alt (Option) with the left or right arrow key moves to the previous
 * or next theme; a click on the backdrop closes them; the dialog takes the focus when it opens.
 * `keys` false (the Connection Information dialog is open over it) leaves the keys to that dialog.
 * Tab and Shift+Tab stay inside the dialog (theme.js containFocus()): Tab on the last action goes
 * to the first header button that is not disabled, Shift+Tab on that button to the last action.
 *
 * `inline`: the details of the only theme, shown in the page (theme.js render() `single-theme`):
 * no dialog around them, no keys, no focus taken; core's CSS hides their header and backdrop.
 *
 * Props: `card`, `first` and `last` (its place in the list shown), `state` (the card's job:
 * `updating`, `updated`, `update-failed`, `deleting`), `deleteError` (text), `autoState` (see
 * ThemeAutoUpdate), `currentActions` (`{ label, path, current }`) and `keys`. Emits `close`,
 * `previous`, `next`, `activate`, `customize`, `update`, `delete`, `toggle( action )` and
 * `open( path )` (a current theme's button).
 */

/** Renders its content alone: the inline details have no dialog around them. */
const Bare = { name: 'ThemeOverlayBare', inheritAttrs: false, render() {
	return this.$slots.default?.();
} };
export default {
	name: 'ThemeOverlay',
	components: { InlineMarkup, ThemeNotices, ThemeAutoUpdate },
	props: {
		card: { type: Object, required: true },
		first: { type: Boolean, default: false },
		last: { type: Boolean, default: false },
		state: { type: Object, default: null },
		deleteError: { type: String, default: null },
		autoState: { type: Object, default: null },
		currentActions: { type: Array, default: () => [] },
		keys: { type: Boolean, default: true },
		inline: { type: Boolean, default: false },
	},
	emits: [ 'close', 'previous', 'next', 'activate', 'customize', 'update', 'delete', 'toggle', 'open' ],
	setup( props, { emit } ) {
		const root = ref( null );
		const href = ( path ) => adminHref( path ) || null;

		function onKeydown( event ) {
			if ( ! props.keys || props.inline ) {
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

		/** theme.js containFocus(): Tab cycles between the first header button and the last action. */
		function containFocus( event ) {
			const element = root.value;
			if ( event.key !== 'Tab' || props.inline || ! element?.querySelector ) {
				return;
			}
			const first = element.querySelector( '.theme-header button:not(.disabled)' );
			const actions = element.querySelectorAll( '.theme-actions a' );
			const last = actions[ actions.length - 1 ] ?? null;
			if ( event.shiftKey && first && event.target === first ) {
				last?.focus();
				event.preventDefault();
			} else if ( ! event.shiftKey && last && event.target === last ) {
				first?.focus();
				event.preventDefault();
			}
		}

		function act( name, event, ...args ) {
			event?.preventDefault?.();
			emit( name, ...args );
		}

		function step( name, disabled ) {
			if ( ! disabled ) {
				emit( name );
			}
		}

		onMounted( () => {
			if ( props.inline ) {
				return;
			}
			globalThis.document?.addEventListener?.( 'keydown', onKeydown );
			nextTick( () => root.value?.focus?.() );
		} );
		onBeforeUnmount( () => globalThis.document?.removeEventListener?.( 'keydown', onKeydown ) );

		return {
			root, href, act, step, containFocus, Bare,
			deleting: computed( () => props.state?.phase === 'deleting' ),
			by: computed( () => around( __( 'By %s', 'default' ) ) ),
			version: computed( () => around( __( 'Version: %s', 'default' ) ) ),
			child: computed( () => around( __( 'This is a child theme of %s.', 'default' ) ) ),
			activateHref: ( card ) => ( card.actions?.activate?.href ? href( card.actions.activate.href ) : '#' ),
			deleteHref: ( card ) => ( card.actions?.delete?.href ? href( card.actions.delete.href ) : '#' ),
		};
	},
	template: `
		<component :is="inline ? Bare : 'div'" v-bind="inline ? {} : { class: 'theme-overlay', tabindex: '0', role: 'dialog', 'aria-label': $__( 'Theme Details', 'default' ) }" :ref="inline ? undefined : 'root'" @keydown="containFocus">
			<div :class="[ 'theme-overlay', { active: card.active } ]">
				<div class="theme-backdrop" @click="$emit( 'close' )"></div>
				<div class="theme-wrap wp-clearfix" role="document">
					<div class="theme-header">
						<button :class="[ 'left', 'dashicons', 'dashicons-no', { disabled: first } ]" :aria-disabled="first ? 'true' : null" @click="step( 'previous', first )"><span class="screen-reader-text">{{ $_x( 'Previous', 'theme', 'default' ) }}</span></button>
						<button :class="[ 'right', 'dashicons', 'dashicons-no', { disabled: last } ]" :aria-disabled="last ? 'true' : null" @click="step( 'next', last )"><span class="screen-reader-text">{{ $_x( 'Next', 'theme', 'default' ) }}</span></button>
						<button class="close dashicons dashicons-no" @click="$emit( 'close' )"><span class="screen-reader-text">{{ $__( 'Close', 'default' ) }}</span></button>
					</div>
					<div class="theme-about wp-clearfix">
						<div class="theme-screenshots">
							<div v-if="card.screenshot" class="screenshot"><img :src="card.screenshot" alt="" /></div>
							<div v-else class="screenshot blank"></div>
						</div>

						<div class="theme-info">
							<span v-if="card.active" class="current-label">{{ $__( 'Active Theme', 'default' ) }}</span>
							<h2 class="theme-name"><InlineMarkup :html="card.name ?? ''" /><span class="theme-version">{{ version[ 0 ] }}{{ card.version }}{{ version[ 1 ] }}</span></h2>
							<p class="theme-author">{{ by[ 0 ] }}<InlineMarkup :html="card.authorAndUri ?? ''" />{{ by[ 1 ] }}</p>

							<ThemeNotices :card="card" :state="state" where="overlay" @update="$emit( 'update' )" />

							<ThemeAutoUpdate v-if="card.autoUpdate" :auto="card.autoUpdate" :state="autoState" @toggle="( action ) => $emit( 'toggle', action )" />

							<div v-if="deleteError" class="notice update-message notice-error notice-alt"><p>{{ deleteError }}</p></div>
							<p class="theme-description"><InlineMarkup :html="card.description ?? ''" /></p>

							<p v-if="card.parent" class="parent-theme">{{ child[ 0 ] }}<strong><InlineMarkup :html="card.parent" /></strong>{{ child[ 1 ] }}</p>

							<p v-if="card.tags" class="theme-tags"><span>{{ $__( 'Tags:', 'default' ) }}</span> <InlineMarkup :html="card.tags" /></p>
						</div>
					</div>

					<div class="theme-actions">
						<div v-if="card.active" class="active-theme">
							<a v-if="card.actions?.customize?.path" class="button button-compact button-primary customize load-customize hide-if-no-customize" :href="href( card.actions.customize.path )" @click="act( 'customize', $event )">{{ card.actions.customize.label }}</a>
							<template v-for="item in currentActions" :key="item.path">{{ ' ' }}<a :class="[ 'button', 'button-compact', { current: item.current } ]" :href="href( item.path )" @click="act( 'open', $event, item.path )">{{ item.label }}</a></template>
						</div>

						<div v-else class="inactive-theme">
							<template v-if="card.actions?.customize">
								<a v-if="card.actions.customize.disabled || ! card.actions.customize.path" class="button button-compact button-primary hide-if-no-customize disabled" :aria-label="card.ariaLabels?.customize">{{ card.actions.customize.label }}</a>
								<a v-else class="button button-compact button-primary load-customize hide-if-no-customize" :href="href( card.actions.customize.path )" :aria-label="card.ariaLabels?.customize" @click="act( 'customize', $event )">{{ card.actions.customize.label }}</a>
							</template>
							<template v-if="card.actions?.activate">
								{{ ' ' }}<a v-if="card.actions.activate.disabled" class="button button-compact disabled" :aria-label="card.ariaLabels?.activate">{{ card.actions.activate.label }}</a>
								<a v-else class="button button-compact activate" :href="activateHref( card )" :aria-label="card.ariaLabels?.activate" @click="act( 'activate', $event )">{{ card.actions.activate.label }}</a>
							</template>
						</div>

						<a v-if="! card.active && card.actions?.delete" class="button button-compact delete-theme" :href="deleteHref( card )" :aria-label="card.ariaLabels?.delete" @click="act( 'delete', $event )">{{ deleting ? $__( 'Deleting...', 'default' ) : $__( 'Delete', 'default' ) }}</a>
					</div>
				</div>
			</div>
		</component>
	`,
};
