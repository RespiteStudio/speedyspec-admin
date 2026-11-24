import { computed, ref } from 'vue';
import { __, _x, sprintf } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The directory cards of Add Themes, as theme-install.php's tmpl-theme renders them: `.themes` of
 * `div.theme`, each with its screenshot (or the blank one), Installed when the theme is installed,
 * the compatibility notice, Details & Preview (a span when the theme does not work here), By the
 * author, the name and its actions:
 *
 * - the button WordPress gives (`card.button`): Install (`a.theme-install`), Activate
 *   (`a.activate`), Activated, Cannot Install or Cannot Activate (disabled buttons), or none;
 * - then Live Preview or Customize (`card.customize`, a link, or disabled), or else Preview
 *   (`card.preview`, which opens the preview).
 *
 * While an install runs, its button says updates.js's Installing... (`updating-message`), then
 * Installed! (`updated-message`); a failed install says Installation failed. with the error on the
 * card (`theme-install-failed`).
 *
 * A click on a card, outside its actions (but for Preview), opens its preview, as theme.js's
 * preview() does; Enter and Space on the card do too. A card with the keyboard focus shows its
 * actions (`.focus`). WordPress decides every card, label and address; the page acts on the events
 * `preview( slug )`, `install( card )`, `activate( card )` and `customize( card )`.
 *
 * Props: `items` (`{ card, state }`: the card, and its install's state `{ phase: installing|
 * installed|install-failed, message }` or null), `labels` (the page data's).
 */

/** The two halves of a text around its `%s`. Pure. */
export const around = ( format ) => {
	const at = String( format ).indexOf( '%s' );
	return at < 0 ? [ String( format ), '' ] : [ String( format ).slice( 0, at ), String( format ).slice( at + 2 ) ];
};

/** The text and label of an install button in a job's phase (updates.js installTheme()), or null. */
export function installing( state, name ) {
	switch ( state?.phase ) {
		case 'installing':
			/* translators: %s: Theme name and version. */
			return { text: __( 'Installing...', 'default' ), label: sprintf( _x( 'Installing %s...', 'theme', 'default' ), name ), classes: [ 'updating-message' ] };
		case 'installed':
			/* translators: %s: Theme name and version. */
			return { text: _x( 'Installed!', 'theme', 'default' ), label: sprintf( _x( '%s installed!', 'theme', 'default' ), name ), classes: [ 'updated-message', 'disabled' ] };
		case 'install-failed':
			/* translators: %s: Theme name and version. */
			return { text: __( 'Installation failed.', 'default' ), label: sprintf( _x( '%s installation failed', 'theme', 'default' ), name ), classes: [] };
		default:
			return null;
	}
}

/**
 * The button WordPress gives a card or its preview, with its job's state: an Install or Activate
 * link, or a disabled button. Emits `install` or `activate`. `compact` adds `button-compact` (the
 * card). Props: `card`, `state`, `compact`.
 */
export const ThemeInstallButton = {
	name: 'ThemeInstallButton',
	props: {
		card: { type: Object, required: true },
		state: { type: Object, default: null },
		compact: { type: Boolean, default: false },
	},
	emits: [ 'install', 'activate' ],
	setup( props, { emit } ) {
		const button = computed( () => ( props.card.button && typeof props.card.button === 'object' ? props.card.button : null ) );
		const job = computed( () => installing( props.state, props.card.name ) );
		const base = computed( () => [ 'button', 'button-primary', ...( props.compact ? [ 'button-compact' ] : [] ) ] );

		function act( name, event ) {
			event?.preventDefault?.();
			event?.stopPropagation?.();
			if ( ! button.value?.disabled && ! [ 'installing', 'installed' ].includes( props.state?.phase ) ) {
				emit( name );
			}
		}

		return { button, job, base, act };
	},
	template: `
		<a v-if="button && button.action === 'install'" :class="[ ...base, 'theme-install', ...( job?.classes ?? [] ) ]" :data-name="card.name" :data-slug="card.slug" href="#" :aria-label="job ? job.label : button.ariaLabel" @click="act( 'install', $event )">{{ job ? job.text : button.label }}</a>
		<a v-else-if="button && button.action === 'activate'" :class="[ ...base, 'activate' ]" href="#" :aria-label="button.ariaLabel" @click="act( 'activate', $event )">{{ button.label }}</a>
		<button v-else-if="button" type="button" :class="[ ...base, 'disabled' ]" :data-name="button.action === 'incompatible' ? card.name : null" :aria-label="button.ariaLabel || null" aria-disabled="true">{{ button.label }}</button>
	`,
};

export default {
	name: 'ThemeInstallCards',
	components: { InlineMarkup, ThemeInstallButton },
	props: {
		items: { type: Array, required: true },
		labels: { type: Object, default: () => ( {} ) },
	},
	emits: [ 'preview', 'install', 'activate', 'customize' ],
	setup( props, { emit } ) {
		const focused = ref( null );

		/** theme.js preview(): not from an action of the card, but for Preview. */
		function preview( card, event ) {
			const target = event?.target;
			if ( target?.closest?.( '.theme-actions' ) && ! target.closest( '.install-theme-preview' ) ) {
				return;
			}
			if ( target?.closest?.( '.notice a' ) ) {
				return;
			}
			event?.preventDefault?.();
			emit( 'preview', card.slug );
		}

		function onKeydown( card, event ) {
			if ( event.target !== event.currentTarget || ( event.key !== 'Enter' && event.key !== ' ' ) ) {
				return;
			}
			event.preventDefault();
			emit( 'preview', card.slug );
		}

		function customize( card, event ) {
			event?.preventDefault?.();
			event?.stopPropagation?.();
			emit( 'customize', card );
		}

		return {
			focused, preview, onKeydown, customize,
			by: computed( () => around( props.labels.by ?? __( 'By %s', 'default' ) ) ),
			compatible: ( card ) => card.compatibility?.wordpress !== false && card.compatibility?.php !== false,
			href: ( path ) => adminHref( path ) || '#',
		};
	},
	template: `
		<div class="themes wp-clearfix">
			<div v-for="{ card, state } in items" :key="card.slug" :class="[ 'theme', { focus: focused === card.slug, 'theme-install-failed': state?.phase === 'install-failed' } ]" :data-slug="card.slug" tabindex="0" @click="preview( card, $event )" @keydown="onKeydown( card, $event )" @keyup="focused = card.slug">
				<div v-if="card.screenshot" class="theme-screenshot"><img :src="card.screenshot" alt="" /></div>
				<div v-else class="theme-screenshot blank"></div>

				<div v-if="card.installed" class="notice notice-success notice-alt"><p>{{ labels.installed }}</p></div>
				<div v-if="! compatible( card ) && card.compatibility?.message" class="notice notice-error notice-alt"><p><InlineMarkup :html="card.compatibility.message" /></p></div>

				<button v-if="compatible( card )" type="button" class="more-details"><InlineMarkup :html="labels.details ?? ''" /></button>
				<span v-else class="more-details"><InlineMarkup :html="labels.details ?? ''" /></span>
				<div class="theme-author">{{ by[ 0 ] }}{{ card.author }}{{ by[ 1 ] }}</div>

				<div class="theme-id-container">
					<h3 class="theme-name">{{ card.name }}</h3>
					<div class="theme-actions">
						<ThemeInstallButton :card="card" :state="state" compact @install="$emit( 'install', card )" @activate="$emit( 'activate', card )" />
						<template v-if="card.customize">
							<button v-if="card.customize.disabled || ! card.customize.path" type="button" class="button button-compact disabled" aria-disabled="true">{{ card.customize.label }}</button>
							<a v-else class="button button-compact load-customize" :href="href( card.customize.path )" @click="customize( card, $event )">{{ card.customize.label }}</a>
						</template>
						<template v-else-if="card.preview">
							<button v-if="card.preview.disabled" type="button" class="button button-compact disabled" aria-disabled="true">{{ card.preview.label }}</button>
							<button v-else type="button" class="button button-compact preview install-theme-preview">{{ card.preview.label }}</button>
						</template>
					</div>
				</div>

				<div v-if="state?.phase === 'install-failed' && state.message" class="notice update-message notice-error notice-alt"><p>{{ state.message }}</p></div>
			</div>
		</div>
	`,
};
