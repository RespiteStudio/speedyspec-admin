import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InlineMarkup from '../../kit/InlineMarkup.js';
import InertHtml from '../../kit/InertHtml.js';
import Spinner from '../../kit/Spinner.js';
import { safeUrl } from '../../kit/url.js';
import { decodeEntities } from '../../kit/Interpolate.js';
import { failureText } from './list-table-parts/page-chrome.js';

const text = ( value ) => ( typeof value === 'string' ? value : '' );
const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const httpUrl = ( value ) => safeUrl( value ?? '', { protocols: [ 'http:', 'https:' ] } );
const count = ( value ) => ( Number.isInteger( value ) && value > 0 ? Math.min( value, 5 ) : 0 );
// A section name becomes an element id (`section-<name>`): one token only.
const SECTION_NAME = /^[A-Za-z0-9_-]+$/;
// The footer button states that act; the others (`active`, `installed`, `incompatible`) never do.
const ACTING = [ 'install', 'update', 'activate' ];
// The classes wp_get_plugin_action_button() gives each acting state, with the footer's `right`.
const BUTTON_CLASSES = {
	install: [ 'right', 'install-now', 'button', 'button-compact' ],
	update: [ 'right', 'update-now', 'button', 'button-compact', 'aria-button-if-js' ],
	activate: [ 'right', 'button', 'button-compact', 'button-primary', 'activate-now' ],
};
const DISABLED_CLASSES = [ 'right', 'button', 'button-compact', 'button-disabled' ];
const NOTICE_TYPES = [ 'error', 'warning', 'info', 'success' ];

/**
 * Default implementation of core/plugin-information: install_plugin_information()'s markup
 * (`#plugin-information-title` with its banner, `#plugin-information-tabs`, the `.fyi` sidebar,
 * `#section-holder`, `#plugin-information-footer`) in a native modal `<dialog>`.
 *
 * - WordPress.org content: the active section through kit/InertHtml (nothing in it runs), the
 *   author and the notices through kit/InlineMarkup; every other value is text. The banner is
 *   the title's background, only for an http(s) address (the high one on a dense screen).
 * - The tabs switch the section shown; the information is loaded once per slug.
 * - The sidebar's links (the WordPress.org page, the homepage, the donation page), the reviews by
 *   stars and the contributors, as install_plugin_information() prints them (1.1.0): addresses
 *   only http(s), names text.
 * - The footer button calls `act` with its action and WordPress's button (its `request`), one at
 *   a time, only for an acting state that WordPress did not disable.
 * - Escape (and the dialog's own `cancel`) and the close button emit `close`; when the dialog
 *   goes, the focus returns to the element that had it when it opened.
 */
export default {
	name: 'PluginInformation',
	components: { InlineMarkup, InertHtml, Spinner },
	props: {
		slug: { type: String, required: true },
		section: { type: String, default: 'description' },
		load: { type: Function, required: true },
		act: { type: Function, required: true },
	},
	emits: [ 'close' ],
	setup( props, { emit } ) {
		const dialog = ref( null );
		const info = ref( null );
		const failure = ref( '' );
		const loading = ref( false );
		const active = ref( '' );
		const busy = ref( false );
		let opener = null;
		let token = 0;

		const sections = computed( () => list( info.value?.sections )
			.filter( ( section ) => typeof section?.name === 'string' && SECTION_NAME.test( section.name ) && typeof section.title === 'string' ) );

		async function read() {
			const mine = ++token;
			loading.value = true;
			failure.value = '';
			info.value = null;
			try {
				const answer = await props.load( props.slug, props.section );
				if ( mine !== token ) {
					return;
				}
				info.value = answer && typeof answer === 'object' ? answer : {};
				const names = sections.value.map( ( section ) => section.name );
				active.value = names.includes( props.section ) ? props.section : ( names[ 0 ] ?? '' );
			} catch ( error ) {
				if ( mine !== token ) {
					return;
				}
				console.warn( 'Could not load the plugin information:', error );
				failure.value = failureText( error );
			} finally {
				if ( mine === token ) {
					loading.value = false;
				}
			}
		}

		const banner = computed( () => {
			const banners = info.value?.banners ?? {};
			const low = httpUrl( banners.low );
			const high = httpUrl( banners.high );
			return ( globalThis.devicePixelRatio ?? 1 ) >= 1.5 ? high ?? low : low ?? high;
		} );

		const button = computed( () => {
			const data = info.value?.button;
			if ( ! data || typeof data !== 'object' || typeof data.action !== 'string' ) {
				return null;
			}
			const acts = ACTING.includes( data.action ) && data.disabled !== true;
			return {
				action: data.action,
				label: text( data.label ),
				acts,
				id: data.action === 'activate' ? undefined : 'plugin_install_from_iframe',
				classes: acts ? BUTTON_CLASSES[ data.action ] : DISABLED_CLASSES,
			};
		} );

		async function press() {
			const current = button.value;
			if ( ! current?.acts || busy.value ) {
				return;
			}
			busy.value = true;
			try {
				// The button WordPress gave, with its request (1.1.0): the page runs the job it names.
				await props.act( current.action, info.value?.button ?? null );
			} catch ( error ) {
				console.warn( 'The plugin information action failed:', error );
			} finally {
				busy.value = false;
			}
		}

		function close( event ) {
			event?.preventDefault?.();
			emit( 'close' );
		}

		watch( () => props.slug, read );
		onMounted( () => {
			const element = dialog.value;
			const focused = globalThis.document?.activeElement;
			opener = focused && focused !== globalThis.document.body ? focused : null;
			if ( typeof element?.showModal === 'function' && ! element.open ) {
				try {
					element.showModal();
				} catch {
					element.setAttribute( 'open', '' );
				}
			} else {
				element?.setAttribute( 'open', '' );
			}
			nextTick( () => element?.querySelector( '.plugin-information-close' )?.focus?.() );
			read();
		} );
		onBeforeUnmount( () => {
			token++;
			const element = dialog.value;
			if ( typeof element?.close === 'function' && element.open ) {
				element.close();
			}
			opener?.focus?.();
			opener = null;
		} );

		return {
			dialog,
			info,
			failure,
			loading,
			active,
			busy,
			sections,
			banner,
			button,
			bannerStyle: computed( () => ( banner.value ? { backgroundImage: 'url(' + JSON.stringify( banner.value ) + ')' } : undefined ) ),
			name: computed( () => text( info.value?.name ) ),
			activeHtml: computed( () => text( sections.value.find( ( section ) => section.name === active.value )?.html ) ),
			facts: computed( () => {
				const facts = info.value?.facts ?? {};
				return Object.fromEntries( [ 'version', 'author', 'lastUpdated', 'requires', 'tested', 'requiresPhp', 'activeInstalls' ].map( ( key ) => [ key, text( facts[ key ] ) ] ) );
			} ),
			// The sidebar's links (1.1.0): the WordPress.org page, the homepage and the donation page.
			links: computed( () => {
				const facts = info.value?.facts ?? {};
				return { wporgUrl: httpUrl( facts.wporgUrl ), homepage: httpUrl( facts.homepage ), donate: httpUrl( facts.donate ) };
			} ),
			// The reviews by stars (1.1.0), as install_plugin_information() draws their bars.
			breakdown: computed( () => list( info.value?.rating?.breakdown )
				.filter( ( entry ) => Number.isInteger( entry?.stars ) && typeof entry.text === 'string' )
				.map( ( entry ) => ( { stars: entry.stars, text: entry.text, label: text( entry.label ), url: httpUrl( entry.url ), countText: text( entry.countText ), width: Number.isFinite( entry.width ) ? Math.max( 0, Math.min( 92, entry.width ) ) : 0 } ) ) ),
			// The contributors (1.1.0): names are text, the profile and avatar http(s) only.
			contributors: computed( () => list( info.value?.contributors )
				.filter( ( entry ) => typeof entry?.name === 'string' && entry.name !== '' )
				.map( ( entry ) => ( { name: entry.name, url: httpUrl( entry.url ), avatar: httpUrl( entry.avatar ) } ) ) ),
			rating: computed( () => {
				const rating = info.value?.rating;
				if ( ! rating || typeof rating !== 'object' ) {
					return null;
				}
				return { full: count( rating.full ), half: count( rating.half ), empty: count( rating.empty ), label: text( rating.label ), based: text( rating.based ) };
			} ),
			notices: computed( () => list( info.value?.notices )
				.filter( ( notice ) => NOTICE_TYPES.includes( notice?.type ) && typeof notice.message === 'string' ) ),
			select: ( name ) => {
				active.value = name;
			},
			press,
			close,
			decodeEntities,
		};
	},
	template: `
		<dialog ref="dialog" id="plugin-information" class="plugin-information-dialog" aria-labelledby="plugin-information-name" @cancel="close" @keydown.esc="close">
			<button type="button" class="plugin-information-close" @click="close"><span class="screen-reader-text">{{ $__( 'Close dialog', 'default' ) }}</span></button>
			<div id="plugin-information-scrollable">
				<div id="plugin-information-title" :class="{ 'with-banner': banner }" :style="bannerStyle">
					<div class="vignette"></div>
					<h2 id="plugin-information-name">{{ name }}</h2>
				</div>
				<Spinner v-if="loading" />
				<div v-if="failure" class="notice notice-error"><p><InlineMarkup :html="failure" /></p></div>
				<template v-if="info">
					<div id="plugin-information-tabs" :class="{ 'with-banner': banner }">
						<a v-for="section in sections" :key="section.name" :name="section.name" href="#" :class="{ current: section.name === active }" :aria-current="section.name === active ? 'true' : undefined" @click.prevent="select( section.name )">{{ section.title }}</a>
					</div>
					<div id="plugin-information-content" :class="{ 'with-banner': banner }">
						<div class="fyi">
							<ul>
								<li v-if="facts.version"><strong>{{ $__( 'Version:', 'default' ) }}</strong> {{ facts.version }}</li>
								<li v-if="facts.author"><strong>{{ $__( 'Author:', 'default' ) }}</strong> <InlineMarkup :html="facts.author" /></li>
								<li v-if="facts.lastUpdated"><strong>{{ $__( 'Last Updated:', 'default' ) }}</strong> {{ facts.lastUpdated }}</li>
								<li v-if="facts.requires"><strong>{{ $__( 'Requires WordPress Version:', 'default' ) }}</strong> {{ facts.requires }}</li>
								<li v-if="facts.tested"><strong>{{ $__( 'Compatible up to:', 'default' ) }}</strong> {{ facts.tested }}</li>
								<li v-if="facts.requiresPhp"><strong>{{ $__( 'Requires PHP Version:', 'default' ) }}</strong> {{ facts.requiresPhp }}</li>
								<li v-if="facts.activeInstalls"><strong>{{ $__( 'Active Installations:', 'default' ) }}</strong> {{ facts.activeInstalls }}</li>
								<li v-if="links.wporgUrl"><a target="_blank" :href="links.wporgUrl">{{ decodeEntities( $__( 'WordPress.org Plugin Page &#187;', 'default' ) ) }}</a></li>
								<li v-if="links.homepage"><a target="_blank" :href="links.homepage">{{ decodeEntities( $__( 'Plugin Homepage &#187;', 'default' ) ) }}</a></li>
								<li v-if="links.donate && contributors.length === 0"><a target="_blank" :href="links.donate">{{ decodeEntities( $__( 'Donate to this plugin &#187;', 'default' ) ) }}</a></li>
							</ul>
							<template v-if="rating">
								<h3>{{ $__( 'Average Rating', 'default' ) }}</h3>
								<div class="star-rating">
									<span class="screen-reader-text">{{ rating.label }}</span>
									<div v-for="n in rating.full" :key="'full' + n" class="star star-full" aria-hidden="true"></div>
									<div v-for="n in rating.half" :key="'half' + n" class="star star-half" aria-hidden="true"></div>
									<div v-for="n in rating.empty" :key="'empty' + n" class="star star-empty" aria-hidden="true"></div>
								</div>
								<p aria-hidden="true" class="fyi-description">{{ rating.based }}</p>
							</template>
							<template v-if="breakdown.length > 0">
								<h3>{{ $__( 'Reviews', 'default' ) }}</h3>
								<p class="fyi-description">{{ $__( 'Read all reviews on WordPress.org or write your own!', 'default' ) }}</p>
								<div v-for="entry in breakdown" :key="entry.stars" class="counter-container">
									<span class="counter-label"><a v-if="entry.url" :href="entry.url" target="_blank" :aria-label="entry.label || null">{{ entry.text }}</a><template v-else>{{ entry.text }}</template></span>
									<span class="counter-back"><span class="counter-bar" :style="{ width: entry.width + 'px' }"></span></span>
									<span class="counter-count" aria-hidden="true">{{ entry.countText }}</span>
								</div>
							</template>
							<template v-if="contributors.length > 0">
								<h3>{{ $__( 'Contributors', 'default' ) }}</h3>
								<ul class="contributors">
									<li v-for="( contributor, index ) in contributors" :key="index"><a v-if="contributor.url" :href="contributor.url" target="_blank"><img v-if="contributor.avatar" :src="contributor.avatar" width="18" height="18" alt="" />{{ contributor.name }}</a><template v-else><img v-if="contributor.avatar" :src="contributor.avatar" width="18" height="18" alt="" />{{ contributor.name }}</template></li>
								</ul>
								<a v-if="links.donate" target="_blank" :href="links.donate">{{ decodeEntities( $__( 'Donate to this plugin &#187;', 'default' ) ) }}</a>
							</template>
						</div>
						<div id="section-holder">
							<div v-for="( notice, index ) in notices" :key="index" class="notice notice-alt" :class="'notice-' + notice.type"><p><InlineMarkup :html="notice.message" /></p></div>
							<InertHtml v-if="active" :key="active" :id="'section-' + active" class="section" :html="activeHtml" />
						</div>
					</div>
				</template>
			</div>
			<div id="plugin-information-footer">
				<button v-if="button" type="button" :id="button.id" :class="button.classes" :disabled="! button.acts || busy" @click="press">{{ button.label }}</button>
			</div>
		</dialog>
	`,
};
