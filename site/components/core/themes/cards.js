import { computed, ref } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The theme cards of Themes, as themes.php prints them and theme.js's tmpl-theme renders them, and
 * the notices a card and its details share.
 *
 * ThemeCards: `.themes` of `div.theme` (`.active` for the active theme), each with its screenshot,
 * its update and compatibility notices, the Theme Details button, the author, the name (`Active:`
 * before the active theme's) and its actions:
 *
 * - the active theme: Customize, when WordPress gives it;
 * - another theme: Activate (a request, or a link a plugin rewrote) and Live Preview;
 * - a theme that does not work with this WordPress or PHP: Cannot Activate and Live Preview,
 *   both disabled.
 *
 * A click on a card, outside its actions, its update message and its links, opens its details,
 * as theme.js's expand() does; Enter and Space on the card do too. A card with the keyboard focus
 * shows its actions (`.focus`, theme.js addFocus()). WordPress decides every card, label and
 * address; the page acts on the events `details( id )`, `activate( card )`, `customize( card )`
 * and `update( card )` (the update message's Update now).
 *
 * Props: `items` (`{ card, state, displayAuthor }`, in order: the card, its job's state, see
 * ThemeNotices, and whether the search shows its author).
 */

/** The two halves of a text around its `%s`. Pure. */
export const around = ( format ) => {
	const at = String( format ).indexOf( '%s' );
	return at < 0 ? [ String( format ), '' ] : [ String( format ).slice( 0, at ), String( format ).slice( at + 2 ) ];
};

/**
 * The update and compatibility notices of a card (`where: 'card'`, tmpl-theme) or of its details
 * (`where: 'overlay'`, tmpl-theme-single), and what updates.js puts in their place while the
 * card's update job runs. `state` is the job's (`{ phase, message }`: `updating`, `updated`,
 * `update-failed`), or null. Emits `update` for Update now (a click on an update message that has
 * a request, as theme.js's `click .update-message` does).
 */
export const ThemeNotices = {
	name: 'ThemeNotices',
	components: { InlineMarkup },
	props: {
		card: { type: Object, required: true },
		state: { type: Object, default: null },
		where: { type: String, default: 'card' },
	},
	emits: [ 'update' ],
	setup( props, { emit } ) {
		const phase = computed( () => props.state?.phase ?? null );
		const offered = computed( () => ( phase.value === null && props.card.update && typeof props.card.update === 'object' ? props.card.update : null ) );
		const incompatible = computed( () => ( props.card.compatibility?.ok === false && typeof props.card.compatibility.message === 'string' ? props.card.compatibility.message : null ) );

		function onUpdate( event ) {
			if ( ! offered.value?.request ) {
				return;
			}
			event?.preventDefault?.();
			emit( 'update' );
		}

		return { phase, offered, incompatible, onUpdate, updating: () => __( 'Updating...', 'default' ) };
	},
	template: `
		<template v-if="where === 'card'">
			<div v-if="phase === 'updating'" class="update-message notice inline notice-warning notice-alt updating-message"><p>{{ updating() }}</p></div>
			<div v-else-if="phase === 'updated'" class="update-message notice inline notice-alt updated-message notice-success"><p>{{ $_x( 'Updated!', 'theme', 'default' ) }}</p></div>
			<div v-else-if="phase === 'update-failed'" class="update-message notice inline notice-error notice-alt"><p>{{ state.message }}</p></div>
			<div v-else-if="offered" :class="[ 'update-message', 'notice', 'inline', offered.compatible ? 'notice-warning' : 'notice-error', 'notice-alt' ]" @click="onUpdate"><p><InlineMarkup :html="offered.message ?? ''" /></p></div>
			<div v-if="incompatible" class="notice inline notice-error notice-alt"><p><InlineMarkup :html="incompatible" /></p></div>
		</template>
		<template v-else>
			<div v-if="incompatible" class="notice notice-error notice-alt notice-large"><p><InlineMarkup :html="incompatible" /></p></div>
			<div v-if="phase === 'updating'" class="notice notice-warning notice-alt updating-message"><p>{{ updating() }}</p></div>
			<div v-else-if="phase === 'updated'" class="notice updated-message notice-success notice-alt"><p>{{ $_x( 'Updated!', 'theme', 'default' ) }}</p></div>
			<div v-else-if="phase === 'update-failed'" class="update-message notice notice-error notice-alt"><p>{{ state.message }}</p></div>
			<div v-else-if="offered && offered.compatible" class="notice notice-warning notice-alt notice-large" @click="onUpdate">
				<h3 class="notice-title">{{ $__( 'Update Available', 'default' ) }}</h3>
				<p><InlineMarkup :html="offered.message ?? ''" /></p>
			</div>
			<div v-else-if="offered" class="notice notice-error notice-alt notice-large">
				<h3 class="notice-title">{{ $__( 'Update Incompatible', 'default' ) }}</h3>
				<p><InlineMarkup :html="offered.message ?? ''" /></p>
			</div>
		</template>
	`,
};

export default {
	name: 'ThemeCards',
	components: { InlineMarkup, ThemeNotices },
	props: {
		items: { type: Array, required: true },
	},
	emits: [ 'details', 'activate', 'customize', 'update' ],
	setup( props, { emit } ) {
		const focused = ref( null );

		/** theme.js expand(): not from an action, the update message, a link or a dismiss button. */
		function expand( card, event ) {
			if ( event?.target?.closest?.( '.theme-actions a, .update-message, .button-link, .notice-dismiss, .notice a' ) ) {
				return;
			}
			emit( 'details', card.id );
		}

		function onKeydown( card, event ) {
			if ( event.target !== event.currentTarget || ( event.key !== 'Enter' && event.key !== ' ' ) ) {
				return;
			}
			event.preventDefault();
			emit( 'details', card.id );
		}

		function act( name, card, event ) {
			event?.preventDefault?.();
			emit( name, card );
		}

		const href = ( path ) => adminHref( path ) || null;
		// A link a plugin rewrote is shown with its address; a request has none of its own.
		const activateHref = ( card ) => ( card.actions?.activate?.href ? href( card.actions.activate.href ) : '#' );

		return { focused, expand, onKeydown, act, href, activateHref, by: computed( () => around( __( 'By %s', 'default' ) ) ) };
	},
	template: `
		<div class="themes wp-clearfix">
			<div v-for="{ card, state, displayAuthor } in items" :key="card.id" :class="[ 'theme', { active: card.active, 'display-author': displayAuthor, focus: focused === card.id } ]" :data-slug="card.id" tabindex="0" @click="expand( card, $event )" @keydown="onKeydown( card, $event )" @keyup="focused = card.id">
				<div v-if="card.screenshot" class="theme-screenshot"><img :src="card.screenshot" alt="" /></div>
				<div v-else class="theme-screenshot blank"></div>

				<ThemeNotices :card="card" :state="state" where="card" @update="act( 'update', card )" />

				<button type="button" class="more-details" :id="card.id + '-action'" :aria-label="card.ariaLabels?.details">{{ $__( 'Theme Details', 'default' ) }}</button>
				<div class="theme-author">{{ by[ 0 ] }}<InlineMarkup :html="card.author ?? ''" />{{ by[ 1 ] }}</div>

				<div class="theme-id-container">
					<h2 v-if="card.active" class="theme-name" :id="card.id + '-name'"><span>{{ $_x( 'Active:', 'theme', 'default' ) }}</span> <InlineMarkup :html="card.name ?? ''" /></h2>
					<h2 v-else class="theme-name" :id="card.id + '-name'"><InlineMarkup :html="card.name ?? ''" /></h2>

					<div class="theme-actions">
						<template v-if="card.active">
							<a v-if="card.actions?.customize?.path" class="button button-compact button-primary customize load-customize hide-if-no-customize" :href="href( card.actions.customize.path )" :aria-label="card.ariaLabels?.customize" @click="act( 'customize', card, $event )">{{ card.actions.customize.label }}</a>
						</template>
						<template v-else>
							<template v-if="card.actions?.activate">
								<a v-if="card.actions.activate.disabled" class="button button-compact disabled" :aria-label="card.ariaLabels?.activate">{{ card.actions.activate.label }}</a>
								<a v-else class="button button-compact activate" :href="activateHref( card )" :aria-label="card.ariaLabels?.activate" @click="act( 'activate', card, $event )">{{ card.actions.activate.label }}</a>
							</template>
							<template v-if="card.actions?.customize">
								{{ ' ' }}<a v-if="card.actions.customize.disabled || ! card.actions.customize.path" class="button button-compact button-primary hide-if-no-customize disabled" :aria-label="card.ariaLabels?.customize">{{ card.actions.customize.label }}</a>
								<a v-else class="button button-compact button-primary load-customize hide-if-no-customize" :href="href( card.actions.customize.path )" :aria-label="card.ariaLabels?.customize" @click="act( 'customize', card, $event )">{{ card.actions.customize.label }}</a>
							</template>
						</template>
					</div>
				</div>
			</div>
		</div>
	`,
};
