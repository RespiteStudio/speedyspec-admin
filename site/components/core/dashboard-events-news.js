import { computed, inject, nextTick, onMounted, ref, shallowRef } from 'vue';
import api from '@wp-admin/api';
import { __, _x, sprintf } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate, { decodeEntities } from '../../kit/Interpolate.js';
import Format from './dashboard-parts/format.js';
import { adminHref } from './dashboard-parts/links.js';

/** The browser's time zone, as dashboard.js reads it, else ''. */
export function browserTimeZone() {
	try {
		return globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? '';
	} catch {
		return '';
	}
}

/**
 * What the widget shows when WordPress could not be asked for the events, as dashboard.js
 * renders a failed request: the error after a search, else the invitation to enter a city.
 * Pure.
 *
 * @param {string} initiatedBy `app` (on load) or `user` (a search).
 * @return {object} An events view, as `wp-admin/v1/dashboard/events` answers.
 */
// The location message inviting the user to enter a city (a key of the events view, not text).
const ENTER_CITY = 'enter-city';

export function failedView( initiatedBy ) {
	return {
		initiatedBy,
		location: null,
		message: initiatedBy === 'user' ? null : ENTER_CITY,
		results: null,
		events: [],
		moreEvents: false,
		unknownCity: null,
		error: initiatedBy === 'user',
		formOpen: true,
	};
}

/**
 * The time zone after an event's time: its short name, or "GMT" (translated, from core's
 * dashboard.js) followed by the offset when it has none.
 *
 * @param {{abbreviation: string|null, offset: string}|null} timeZone The event's `timeZone`.
 * @param {string} prefix The translated "GMT".
 * @return {string} The name.
 */
export function timeZoneName( timeZone, prefix ) {
	if ( typeof timeZone?.abbreviation === 'string' && timeZone.abbreviation !== '' ) {
		return timeZone.abbreviation;
	}
	return prefix + String( timeZone?.offset ?? '' );
}

/**
 * Default implementation of core/dashboard-events-news: the WordPress Events and News widget,
 * in the markup wp_dashboard_events_news() prints (the events part of
 * wp_print_community_events_markup(), the news feeds, the Meetups, WordCamps and News links),
 * with the event templates of wp_print_community_events_templates() as Vue templates.
 *
 * The events come from `wp-admin/v1/dashboard/events`, asked for with the browser's time zone on
 * load and with a city when the user searches; WordPress decides what shows (the location
 * message, the list or "There are no events…", the city not found, the error, whether the
 * location form is open, "Want more events?") and formats the dates and times. As dashboard.js
 * does, the elements that do not apply are `aria-hidden` (the classic styles hide them), a
 * search announces its result (`speak()`), and after a search that found a location the
 * location button takes focus. The news come from `wp-admin/v1/dashboard/news`; "Loading…" shows
 * until they do.
 */
export default {
	name: 'DashboardEventsNews',
	components: { SlotOutlet, Interpolate, Format },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const view = shallowRef( null );
		const news = shallowRef( null );
		const formOpen = ref( false );
		const city = ref( '' );
		const loading = ref( false );
		const toggleButton = ref( null );

		const params = ( extra = {} ) => ( props.context === 'site' ? { ...extra } : { ...extra, context: props.context } );

		function show( next ) {
			view.value = next;
			formOpen.value = Boolean( next.formOpen );
		}

		function announce( next ) {
			if ( next.message === 'near-city' && next.initiatedBy === 'user' ) {
				/* translators: %s: The name of a city. */
				speak( sprintf( __( 'City updated. Listing events near %s.', 'default' ), next.location ?? '' ) );
			} else if ( next.unknownCity ) {
				/* translators: %s: The name of a city. */
				speak( sprintf( __( 'We couldn’t locate %s. Please try another nearby city. For example: Kansas City; Springfield; Portland.', 'default' ), next.unknownCity ) );
			} else if ( next.error && next.initiatedBy === 'user' ) {
				speak( __( 'An error occurred. Please try again.', 'default' ) );
			}
		}

		async function getEvents( location = '' ) {
			const initiatedBy = location ? 'user' : 'app';
			const timezone = browserTimeZone();
			loading.value = true;
			let next;
			try {
				next = location
					? await api.post( props.data.eventsRoute, params( { location, timezone } ) )
					: await api.get( props.data.eventsRoute, params( { timezone } ) );
			} catch {
				next = failedView( initiatedBy );
			} finally {
				loading.value = false;
			}
			show( next );
			announce( next );
			if ( initiatedBy === 'user' && ! next.formOpen ) {
				await nextTick();
				toggleButton.value?.focus?.();
			}
		}

		async function getNews() {
			try {
				news.value = await api.get( props.data.newsRoute, params() );
			} catch {
				// As the classic widget, it keeps saying "Loading…".
			}
		}

		function toggleForm() {
			formOpen.value = ! formOpen.value;
		}
		function cancel() {
			formOpen.value = false;
			toggleButton.value?.focus?.();
		}
		function search() {
			const location = city.value.trim();
			// As dashboard.js: an empty city is not looked up.
			if ( location ) {
				getEvents( location );
			}
		}

		onMounted( () => {
			if ( props.data.eventsRoute ) {
				getEvents();
			}
			if ( props.data.newsRoute ) {
				getNews();
			}
		} );

		const events = computed( () => ( Array.isArray( view.value?.events ) ? view.value.events : [] ) );
		const showMessage = computed( () => Boolean( view.value?.message ) );
		const showErrors = computed( () => Boolean( view.value?.unknownCity || view.value?.error ) );
		const hidden = ( shown ) => ( shown ? 'false' : 'true' );

		// Strings with markup or character references are kept out of the template.
		const text = {
			/* translators: %s: The name of a city. */
			nearCity: computed( () => __( 'Attend an upcoming event near %s.', 'default' ) ),
			/* translators: %s is the name of the city we couldn't locate. Replace the examples with cities in your locale, but test that they match the expected location before including them. Use endonyms (native locale names) whenever possible. */
			couldNotLocate: computed( () => __( '%s could not be located. Please try another nearby city. For example: Kansas City; Springfield; Portland.', 'default' ) ),
			/* translators: %s: Localized meetup organization documentation URL. */
			moreEvents: computed( () => __( 'Want more events? <a href="%s">Help organize the next one</a>!', 'default' ) ),
			organizeUrl: computed( () => __( 'https://make.wordpress.org/community/organize-event-landing-page/', 'default' ) ),
			/* translators: 1: The city the user searched for, 2: Meetup organization documentation URL. */
			noEventsNear: computed( () => __( 'There are no events scheduled near %1$s at the moment. Would you like to <a href="%2$s">organize a WordPress event</a>?', 'default' ) ),
			/* translators: %s: Meetup organization documentation URL. */
			noEvents: computed( () => __( 'There are no events scheduled near you at the moment. Would you like to <a href="%s">organize a WordPress event</a>?', 'default' ) ),
			meetupUrl: computed( () => __( 'https://make.wordpress.org/community/handbook/meetup-organizer/welcome/', 'default' ) ),
			loading: computed( () => decodeEntities( __( 'Loading&hellip;', 'default' ) ) ),
			/* translators: If a Rosetta site exists (e.g. https://es.wordpress.org/news/), then use that. Otherwise, leave untranslated. */
			newsUrl: computed( () => _x( 'https://wordpress.org/news/', 'Events and News dashboard widget', 'default' ) ),
			/* translators: Used as part of a string like `GMT+5` in the Events Widget. */
			gmt: computed( () => _x( 'GMT', 'Events widget offset prefix', 'default' ) ),
		};
		const link = ( [ url ] ) => ( { href: url } );

		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return {
			view, news, formOpen, city, loading, toggleButton, events, showMessage, showErrors, hidden, text, link,
			toggleForm, cancel, search, slotContext, timeZoneName, href: ( path ) => adminHref( path ),
		};
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<div class="notice notice-error inline community-events-errors" :aria-hidden="hidden( showErrors )">
			<p class="hide-if-js">{{ $__( 'The WordPress Events and News feeds require JavaScript.', 'default' ) }}</p>
			<p class="community-events-error-occurred" :aria-hidden="hidden( view?.error )">{{ $__( 'An error occurred. Please try again.', 'default' ) }}</p>
			<p class="community-events-could-not-locate" :aria-hidden="hidden( view?.unknownCity )"><Format v-if="view?.unknownCity" :text="text.couldNotLocate.value"><template #arg1><em>{{ view.unknownCity }}</em></template></Format></p>
		</div>

		<div id="community-events" class="community-events" :aria-hidden="hidden( view )">
			<div class="activity-block">
				<p>
					<span id="community-events-location-message" :aria-hidden="hidden( showMessage )">
						<template v-if="view?.message === 'near-you'">{{ $__( 'Attend an upcoming event near you.', 'default' ) }}</template>
						<Format v-else-if="view?.message === 'near-city'" :text="text.nearCity.value"><template #arg1><strong>{{ view.location }}</strong></template></Format>
						<template v-else-if="view?.message === 'enter-city'">{{ $__( 'Enter your closest city to find nearby events.', 'default' ) }}</template>
					</span>

					<button ref="toggleButton" type="button" class="button-link community-events-toggle-location" :aria-expanded="formOpen ? 'true' : 'false'" :aria-hidden="hidden( showMessage )" @click="toggleForm">
						<span class="dashicons dashicons-location" aria-hidden="true"></span>
						<span class="community-events-location-edit">{{ $__( 'Select location', 'default' ) }}</span>
					</button>
				</p>

				<form class="community-events-form" :aria-hidden="hidden( formOpen )" :action="href( 'admin-ajax.php' )" method="post" @submit.prevent="search">
					<label for="community-events-location">
						{{ $__( 'City:', 'default' ) }}
					</label>
					<!-- translators: Replace with a city related to your locale. Test that it matches the expected location and has upcoming events before including it. If no cities related to your locale have events, then use a city related to your locale that would be recognizable to most users. Use only the city name itself, without any region or country. Use the endonym (native locale name) instead of the English name if possible. -->
					<input id="community-events-location" class="regular-text" type="text" name="community-events-location" :placeholder="$__( 'Cincinnati', 'default' )" :value="city" @input="city = $event.target.value">

					<input type="submit" name="community-events-submit" id="community-events-submit" class="button" :value="$__( 'Submit', 'default' )">

					<button class="community-events-cancel button-link" type="button" :aria-expanded="formOpen ? 'true' : 'false'" @click="cancel">
						{{ $__( 'Cancel', 'default' ) }}
					</button>

					<span :class="[ 'spinner', { 'is-active': loading } ]"></span>
				</form>
			</div>

			<ul class="community-events-results activity-block last" :aria-hidden="hidden( view?.results )">
				<template v-if="view?.results === 'list'">
					<li v-for="( event, index ) in events" :key="index" :class="[ 'event', 'event-' + event.type, 'wp-clearfix' ]">
						<div class="event-info">
							<div class="dashicons event-icon" aria-hidden="true"></div>
							<div class="event-info-inner">
								<a class="event-title" :href="event.url">{{ event.title }}</a>{{ ' ' }}<template v-if="event.type">{{ event.typeLabel + ' ' }}<span class="ce-separator" aria-hidden="true"></span>{{ ' ' }}</template><span class="event-city">{{ event.city }}</span>
							</div>
						</div>

						<div class="event-date-time">
							<span class="event-date">{{ event.date }}</span>
							<span v-if="typeof event.time === 'string'" class="event-time">
								{{ event.time }} {{ timeZoneName( event.timeZone, text.gmt.value ) }}
							</span>
						</div>
					</li>
					<li v-if="view.moreEvents" class="event-none">
						<Interpolate :text="text.moreEvents.value" :args="[ text.organizeUrl.value ]" :tags="{ a: link }" />
					</li>
				</template>
				<li v-else-if="view?.results === 'none'" class="event-none">
					<Interpolate v-if="view.location" :text="text.noEventsNear.value" :args="[ view.location, text.meetupUrl.value ]" :tags="{ a: link }" />
					<Interpolate v-else :text="text.noEvents.value" :args="[ text.meetupUrl.value ]" :tags="{ a: link }" />
				</li>
			</ul>
		</div>

		<div class="wordpress-news hide-if-no-js">
			<p v-if="! news" class="widget-loading hide-if-no-js">{{ text.loading.value }}</p>
			<template v-else>
				<div v-for="feed in news.feeds ?? []" :key="feed.type" class="rss-widget">
					<p v-if="feed.error"><strong>{{ $__( 'RSS Error:', 'default' ) }}</strong> {{ feed.error }}</p>
					<ul v-else-if="feed.empty"><li>{{ $__( 'An error has occurred, which probably means the feed is down. Try again later.', 'default' ) }}</li></ul>
					<ul v-else><li v-for="( item, index ) in feed.items ?? []" :key="index"><a class="rsswidget" :href="item.url">{{ item.title }}</a></li></ul>
				</div>
			</template>
		</div>

		<p class="community-events-footer">
			<a href="https://make.wordpress.org/community/meetups-landing-page" target="_blank">{{ $__( 'Meetups', 'default' ) }} <span class="screen-reader-text">{{ ' ' + $__( '(opens in a new tab)', 'default' ) }}</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a>

			|

			<a href="https://central.wordcamp.org/schedule/" target="_blank">{{ $__( 'WordCamps', 'default' ) }} <span class="screen-reader-text">{{ ' ' + $__( '(opens in a new tab)', 'default' ) }}</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a>

			|

			<a :href="text.newsUrl.value" target="_blank">{{ $__( 'News', 'default' ) }} <span class="screen-reader-text">{{ ' ' + $__( '(opens in a new tab)', 'default' ) }}</span><span aria-hidden="true" class="dashicons dashicons-external"></span></a>
		</p>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
