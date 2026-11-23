import { computed } from 'vue';
import { __, _x, sprintf } from '../../../runtime/text.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { safeUrl } from '../../../kit/url.js';
import { adminHref } from '../dashboard-parts/links.js';

/*
 * The cards of Add Plugins (WP_Plugin_Install_List_Table::display_rows()), from WordPress's data
 * (wp_admin_plugin_install_card()): `#the-list` of `.plugin-card.plugin-card-<slug>`, in their
 * groups, each with its compatibility notice, name and icon, action buttons (the core button,
 * More Details and what `plugin_install_action_links` added), description, author, the
 * dependencies, the rating, the last update, the active installations and the compatibility.
 *
 * A card's name, description and author are WordPress.org content: the name and description are
 * text, the author and the notices go through kit/InlineMarkup, and nothing in them runs. The
 * action links plugins added are plugin output (kit/LegacyHtml).
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );
const count = ( value ) => ( Number.isInteger( value ) && value > 0 ? Math.min( value, 5 ) : 0 );
const SLUG = /^[A-Za-z0-9_-]+$/;
const STATUSES = [ 'untested', 'incompatible', 'compatible' ];

/** The classic address of a plugin's information (the Thickbox link's, without its frame size). Pure. */
export const informationPath = ( slug ) => 'plugin-install.php?tab=plugin-information&plugin=' + encodeURIComponent( slug );

/**
 * The state of a card's button while a job runs, as updates.js draws it: the classes, the text
 * and the label for assistive technology of each step. Pure.
 *
 * @param {object}      button The button WordPress gave (`action`, `label`, `ariaLabel`, `disabled`).
 * @param {object|null} state  The step (`phase`), or null.
 * @param {string}      name   The plugin's name.
 * @return {{tag: string, classes: string[], text: string, ariaLabel: string|null, disabled: boolean, acts: boolean}} The button.
 */
export function cardButton( button, state, name ) {
	const action = text( button?.action );
	const steps = {
		installing: { classes: [ 'install-now', 'button', 'button-compact', 'updating-message' ], text: __( 'Installing...', 'default' ), ariaLabel: sprintf( _x( 'Installing %s...', 'plugin', 'default' ), name ) },
		installed: { classes: [ 'install-now', 'button', 'button-compact', 'updated-message', 'installed', 'button-disabled' ], text: _x( 'Installed!', 'plugin', 'default' ), ariaLabel: sprintf( _x( '%s installed!', 'plugin', 'default' ), name ) },
		'install-failed': { classes: [ 'install-now', 'button', 'button-compact', 'button-disabled' ], text: __( 'Installation failed.', 'default' ), ariaLabel: sprintf( _x( '%s installation failed', 'plugin', 'default' ), name ) },
		updating: { classes: [ 'update-now', 'button', 'button-compact', 'aria-button-if-js', 'updating-message' ], text: __( 'Updating...', 'default' ), ariaLabel: sprintf( _x( 'Updating %s...', 'plugin', 'default' ), name ) },
		updated: { classes: [ 'update-now', 'button', 'button-compact', 'aria-button-if-js', 'button-disabled', 'updated-message' ], text: _x( 'Updated!', 'plugin', 'default' ), ariaLabel: sprintf( _x( '%s updated!', 'plugin', 'default' ), name ) },
		'update-failed': { classes: [ 'update-now', 'button', 'button-compact', 'aria-button-if-js' ], text: __( 'Update failed.', 'default' ), ariaLabel: sprintf( _x( '%s update failed.', 'plugin', 'default' ), name ) },
		activating: { classes: [ 'button', 'button-compact', 'activate-now', 'activating-message' ], text: __( 'Activating...', 'default' ), ariaLabel: sprintf( _x( 'Activating %s', 'plugin', 'default' ), name ) },
		activated: { classes: [ 'button', 'button-compact', 'activate-now', 'activated-message', 'button-disabled' ], text: _x( 'Activated!', 'plugin', 'default' ), ariaLabel: sprintf( __( '%s activated successfully.', 'default' ), name ) },
		'activate-failed': { classes: [ 'button', 'button-compact', 'button-disabled' ], text: __( 'Activation failed.', 'default' ), ariaLabel: sprintf( _x( '%s activation failed', 'plugin', 'default' ), name ) },
	};
	const step = state?.phase ? steps[ state.phase ] : null;
	if ( step ) {
		return { tag: 'a', ...step, disabled: false, acts: false };
	}
	const acts = [ 'install', 'update', 'activate' ].includes( action ) && button?.disabled !== true && Boolean( button?.request );
	if ( ! acts ) {
		return { tag: 'button', classes: [ ...( action === 'install' ? [ 'install-now' ] : [] ), 'button', 'button-compact', 'button-disabled' ], text: text( button?.label ), ariaLabel: null, disabled: true, acts: false };
	}
	const classes = {
		install: [ 'install-now', 'button', 'button-compact' ],
		update: [ 'update-now', 'button', 'button-compact', 'aria-button-if-js' ],
		activate: [ 'button', 'button-compact', 'button-primary', 'activate-now' ],
	};
	return { tag: 'a', classes: classes[ action ], text: text( button.label ), ariaLabel: typeof button.ariaLabel === 'string' ? button.ariaLabel : null, disabled: false, acts: true };
}

/**
 * The cards grouped as display_rows() prints them: consecutive cards of the same group under its
 * heading (`.plugin-group`), cards without a group alone. Pure.
 *
 * @param {object[]} cards The cards.
 * @return {{group: string|null, cards: object[]}[]} The runs.
 */
export function groupCards( cards ) {
	const runs = [];
	for ( const item of cards ) {
		const group = typeof item.group === 'string' && item.group !== '' ? item.group : null;
		const last = runs.at( -1 );
		if ( last && last.group === group && group !== null ) {
			last.cards.push( item );
		} else if ( group === null && last && last.group === null ) {
			last.cards.push( item );
		} else {
			runs.push( { group, cards: [ item ] } );
		}
	}
	return runs;
}

const Card = {
	name: 'PluginInstallCard',
	components: { LegacyHtml, InlineMarkup },
	props: {
		card: { type: Object, required: true },
		state: { type: Object, default: null },
	},
	emits: [ 'act', 'details', 'dismiss' ],
	setup( props, { emit } ) {
		const name = computed( () => text( props.card.name ) );
		const rating = computed( () => {
			const value = props.card.rating;
			return value && typeof value === 'object' ? { full: count( value.full ), half: count( value.half ), empty: count( value.empty ), label: text( value.label ), countText: text( value.countText ) } : null;
		} );
		const compatibility = computed( () => {
			const value = props.card.compatibility ?? {};
			return { status: STATUSES.includes( value.status ) ? value.status : 'compatible', text: text( value.text ), notice: typeof value.notice === 'string' && value.notice !== '' ? value.notice : null };
		} );
		const dependencies = computed( () => {
			const value = props.card.dependencies;
			return value && typeof value === 'object' ? { text: text( value.text ), names: list( value.names ).filter( ( entry ) => typeof entry?.name === 'string' ) } : null;
		} );
		const detailsSlug = computed( () => ( typeof props.card.detailsSlug === 'string' && SLUG.test( props.card.detailsSlug ) ? props.card.detailsSlug : null ) );
		const shown = computed( () => cardButton( props.card.button, props.state, name.value ) );

		function openDetails( slug, event ) {
			if ( ! slug ) {
				return;
			}
			event?.preventDefault?.();
			emit( 'details', slug );
		}

		function press( event ) {
			event?.preventDefault?.();
			if ( shown.value.acts ) {
				emit( 'act', props.card );
			}
		}

		return {
			name, rating, compatibility, dependencies, detailsSlug, shown,
			icon: computed( () => safeUrl( props.card.icon ?? '', { protocols: [ 'http:', 'https:' ] } ) ),
			hasButton: computed( () => Boolean( props.card.button && typeof props.card.button === 'object' ) ),
			failure: computed( () => ( typeof props.state?.message === 'string' && props.state.message !== '' ? props.state : null ) ),
			slugClass: computed( () => 'plugin-card-' + text( props.card.slug ).replace( /[^A-Za-z0-9_-]/g, '' ) ),
			detailsHref: ( slug ) => adminHref( informationPath( slug ) ),
			moreAbout: ( value ) => sprintf( __( 'More information about %s', 'default' ), value ),
			openDetails,
			press,
		};
	},
	template: `
		<div :class="[ 'plugin-card', slugClass, { 'plugin-card-update-failed': failure } ]">
			<div v-if="compatibility.notice" class="notice inline notice-error notice-alt"><p><InlineMarkup :html="compatibility.notice" /></p></div>
			<div class="plugin-card-top">
				<div class="name column-name">
					<h3>
						<a v-if="detailsSlug" :href="detailsHref( detailsSlug )" class="thickbox open-plugin-details-modal" @click="openDetails( detailsSlug, $event )">{{ name }}<img v-if="icon" :src="icon" class="plugin-icon" alt="" /></a>
						<template v-else>{{ name }}<img v-if="icon" :src="icon" class="plugin-icon" alt="" /></template>
					</h3>
				</div>
				<div class="action-links">
					<ul v-if="hasButton || card.detailsAction" class="plugin-action-buttons">
						<li v-if="hasButton">
							<a v-if="shown.tag === 'a'" href="#" role="button" :class="shown.classes" :aria-label="shown.ariaLabel" :data-slug="card.slug" :data-plugin="card.button?.file ?? undefined" :data-name="name" @click="press">{{ shown.text }}</a>
							<button v-else type="button" :class="shown.classes" disabled="disabled">{{ shown.text }}</button>
						</li>
						<li v-if="card.detailsAction && detailsSlug"><a :href="detailsHref( detailsSlug )" class="thickbox open-plugin-details-modal" :aria-label="moreAbout( name )" :data-title="name" @click="openDetails( detailsSlug, $event )">{{ $__( 'More Details', 'default' ) }}</a></li>
					</ul>
					<LegacyHtml v-if="typeof card.actionsHtml === 'string'" tag="ul" class="plugin-action-buttons" :html="card.actionsHtml" />
				</div>
				<div class="desc column-description">
					<p>{{ card.description ?? '' }}</p>
					<p class="authors"><cite v-if="card.author"><InlineMarkup :html="card.author" /></cite></p>
				</div>
			</div>
			<div v-if="dependencies" class="plugin-dependencies notice notice-alt notice-info inline">
				<p class="plugin-dependencies-explainer-text"><strong>{{ dependencies.text }}</strong></p>
				<div v-for="( dependency, index ) in dependencies.names" :key="index" class="plugin-dependency"><span class="plugin-dependency-name">{{ dependency.name }}</span>{{ ' ' }}<a v-if="dependency.detailsSlug" :href="detailsHref( dependency.detailsSlug )" class="more-details-link thickbox open-plugin-details-modal" :aria-label="moreAbout( dependency.name )" :data-title="dependency.name" @click="openDetails( dependency.detailsSlug, $event )">{{ $__( 'More Details', 'default' ) }}</a></div>
			</div>
			<div class="plugin-card-bottom">
				<div class="vers column-rating">
					<div v-if="rating" class="star-rating">
						<span class="screen-reader-text">{{ rating.label }}</span>
						<div v-for="n in rating.full" :key="'full' + n" class="star star-full" aria-hidden="true"></div>
						<div v-for="n in rating.half" :key="'half' + n" class="star star-half" aria-hidden="true"></div>
						<div v-for="n in rating.empty" :key="'empty' + n" class="star star-empty" aria-hidden="true"></div>
					</div>
					<span v-if="rating" class="num-ratings" aria-hidden="true">({{ rating.countText }})</span>
				</div>
				<div class="column-updated"><strong>{{ $__( 'Last Updated:', 'default' ) }}</strong> {{ card.lastUpdated ?? '' }}</div>
				<div class="column-downloaded">{{ card.activeInstalls ?? '' }}</div>
				<div class="column-compatibility"><span :class="'compatibility-' + compatibility.status"><InlineMarkup :html="compatibility.text" /></span></div>
			</div>
			<div v-if="failure" class="notice notice-error notice-alt is-dismissible" :class="{ 'update-message': failure.kind === 'update' }" role="alert"><p>{{ failure.message }}</p><button type="button" class="notice-dismiss" @click="$emit( 'dismiss', card )"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>
		</div>
	`,
};

/**
 * The list of cards: `#the-list` (`data-wp-lists="list:plugin-install"`) with each card, or the
 * text without cards (`noItems`: the API's error as the classic error notice with Try Again when
 * `apiError`). Props: `cards`, `states` (each card's job step by slug: `{ phase, kind, message }`),
 * `noItems`, `apiError`. Emits `act( card )`, `details( slug )`,
 * `dismiss( card )` and `retry`.
 */
export default {
	name: 'PluginInstallCards',
	components: { Card, InlineMarkup },
	props: {
		cards: { type: Array, default: () => [] },
		states: { type: Object, default: () => ( {} ) },
		noItems: { type: String, default: '' },
		apiError: { type: Boolean, default: false },
	},
	emits: [ 'act', 'details', 'dismiss', 'retry' ],
	setup( props ) {
		const runs = computed( () => groupCards( list( props.cards ).filter( ( item ) => item && typeof item.slug === 'string' && item.slug !== '' ) ) );
		return { runs };
	},
	template: `
		<div id="the-list" data-wp-lists="list:plugin-install">
			<template v-if="runs.length > 0">
				<template v-for="( run, index ) in runs" :key="index">
					<div v-if="run.group" class="plugin-group"><h3>{{ run.group }}</h3><div class="plugin-items"><Card v-for="item in run.cards" :key="item.slug" :card="item" :state="states[ item.slug ] ?? null" @act="$emit( 'act', $event )" @details="$emit( 'details', $event )" @dismiss="$emit( 'dismiss', $event )" /></div></div>
					<template v-else><Card v-for="item in run.cards" :key="item.slug" :card="item" :state="states[ item.slug ] ?? null" @act="$emit( 'act', $event )" @details="$emit( 'details', $event )" @dismiss="$emit( 'dismiss', $event )" /></template>
				</template>
			</template>
			<div v-else-if="apiError" class="notice notice-error inline"><p><InlineMarkup :html="noItems" /></p><p class="hide-if-no-js"><button type="button" class="button try-again" @click="$emit( 'retry' )">{{ $__( 'Try Again', 'default' ) }}</button></p></div>
			<div v-else class="no-plugin-results"><InlineMarkup :html="noItems" /></div>
		</div>
	`,
};
