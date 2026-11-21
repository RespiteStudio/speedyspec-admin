/** @jest-environment jsdom */
// WordPress Events and News (core/dashboard-events-news): the events and the news come from their routes, a search
// posts the city, and the location form opens and closes.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const DATA = { eventsRoute: 'wp-admin/v1/dashboard/events', newsRoute: 'wp-admin/v1/dashboard/news' };

const EVENT = { type: 'meetup', typeLabel: 'Meetup', title: 'Fixtureville WordPress Meetup', url: 'https://example.org/meetup', city: 'Fixtureville, ZZ', date: 'Friday, Dec 31, 2099', time: '6:00 pm', timeZone: { abbreviation: 'UTC', offset: '+0' } };
const view = ( extra = {} ) => ( { initiatedBy: 'app', location: 'Paris', message: 'near-city', results: 'list', events: [ EVENT ], moreEvents: false, unknownCity: null, error: false, formOpen: false, ...extra } );
const NEWS = { feeds: [ { type: 'news', items: [ { title: 'A news item', url: 'https://example.org/news/1' } ] }, { type: 'planet', error: 'Feed broke' } ] };

beforeEach( () => {
	resetDoubles();
	api.respondWith( async ( method, route ) => ( route === DATA.newsRoute ? NEWS : view() ) );
} );
afterEach( () => resetContracts() );

const events = ( data = DATA ) => mountWidget( 'events-news', data );
const form = ( wrapper ) => wrapper.find( 'form.community-events-form' );
const toggle = ( wrapper ) => wrapper.find( 'button.community-events-toggle-location' );
const search = async ( wrapper, city ) => {
	await wrapper.find( '#community-events-location' ).setValue( city );
	await form( wrapper ).trigger( 'submit' );
	await settle();
};

test( 'it asks for the events and the news of the site when it mounts, with the browser\'s time zone', async () => {
	const { wrapper } = await events();
	const [ eventsCall, newsCall ] = api.calls;

	expect( eventsCall ).toMatchObject( { method: 'GET', route: DATA.eventsRoute } );
	expect( typeof eventsCall.payload.timezone ).toBe( 'string' );
	expect( newsCall ).toMatchObject( { method: 'GET', route: DATA.newsRoute } );
	expect( wrapper.find( '#community-events' ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( wrapper.find( '.event-title' ).text() ).toBe( 'Fixtureville WordPress Meetup' );
	expect( wrapper.find( '.event-city' ).text() ).toBe( 'Fixtureville, ZZ' );
	expect( wrapper.find( '.event-time' ).text() ).toBe( '6:00 pm UTC' );
	expect( wrapper.find( '#community-events-location-message' ).text() ).toBe( 'Attend an upcoming event near Paris.' );
	expect( wrapper.find( '.rsswidget' ).text() ).toBe( 'A news item' );
	expect( wrapper.find( '.wordpress-news .rss-widget p' ).text() ).toContain( 'Feed broke' );
} );

test( 'a widget of another admin asks for its context', async () => {
	await mountWidget( 'events-news', DATA, { context: 'network' } );
	expect( api.calls.map( ( call ) => call.payload.context ) ).toEqual( [ 'network', 'network' ] );
} );

test( 'the location form is closed, opens with the button, and Cancel closes it and returns the focus', async () => {
	const { wrapper } = await events();
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'true' );
	expect( toggle( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'false' );

	await toggle( wrapper ).trigger( 'click' );
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( toggle( wrapper ).attributes( 'aria-expanded' ) ).toBe( 'true' );

	await wrapper.find( '.community-events-cancel' ).trigger( 'click' );
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'true' );
	expect( document.activeElement ).toBe( toggle( wrapper ).element );
} );

test( 'a search posts the city and the time zone, shows what comes back and announces it', async () => {
	const { wrapper, spoken } = await events();
	api.respondWith( async () => view( { initiatedBy: 'user', location: 'Fixtureville', formOpen: false } ) );
	await toggle( wrapper ).trigger( 'click' );
	await search( wrapper, '  Fixtureville ' );

	const post = api.calls.at( -1 );
	expect( post ).toMatchObject( { method: 'POST', route: DATA.eventsRoute } );
	expect( post.payload.location ).toBe( 'Fixtureville' );
	expect( typeof post.payload.timezone ).toBe( 'string' );
	expect( wrapper.find( '#community-events-location-message' ).text() ).toBe( 'Attend an upcoming event near Fixtureville.' );
	expect( spoken ).toEqual( [ 'City updated. Listing events near Fixtureville.' ] );
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'true' );
	expect( document.activeElement ).toBe( toggle( wrapper ).element );
} );

test( 'an empty city is not searched', async () => {
	const { wrapper } = await events();
	const before = api.calls.length;
	await toggle( wrapper ).trigger( 'click' );
	await search( wrapper, '   ' );
	expect( api.calls ).toHaveLength( before );
} );

test( 'a city that is not found says so in the form and keeps it open', async () => {
	const { wrapper, spoken } = await events();
	api.respondWith( async () => view( { initiatedBy: 'user', location: null, message: null, results: null, events: [], unknownCity: 'Nowhereville', formOpen: true } ) );
	await toggle( wrapper ).trigger( 'click' );
	await search( wrapper, 'Nowhereville' );

	expect( wrapper.find( '.community-events-could-not-locate' ).text() ).toBe( 'Nowhereville could not be located. Please try another nearby city. For example: Kansas City; Springfield; Portland.' );
	expect( wrapper.find( '.community-events-could-not-locate' ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( spoken[ 0 ] ).toContain( 'We couldn’t locate Nowhereville.' );
} );

test( 'a search that fails shows the error and announces it', async () => {
	const { wrapper, spoken } = await events();
	api.respondWith( async () => {
		throw Object.assign( new Error( 'down' ), { status: 500 } );
	} );
	await toggle( wrapper ).trigger( 'click' );
	await search( wrapper, 'Paris' );

	expect( wrapper.find( '.community-events-error-occurred' ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( wrapper.find( '.community-events-errors' ).attributes( 'aria-hidden' ) ).toBe( 'false' );
	expect( spoken ).toEqual( [ 'An error occurred. Please try again.' ] );
	expect( form( wrapper ).attributes( 'aria-hidden' ) ).toBe( 'false' );
} );

test( 'no events says so, with the city searched when there is one', async () => {
	api.respondWith( async ( method, route ) => ( route === DATA.newsRoute ? NEWS : view( { results: 'none', events: [], message: 'near-you', location: null } ) ) );
	const near = await events();
	expect( near.wrapper.find( '.event-none' ).text() ).toContain( 'There are no events scheduled near you at the moment.' );

	api.respondWith( async ( method, route ) => ( route === DATA.newsRoute ? NEWS : view( { results: 'none', events: [], location: 'Paris' } ) ) );
	const city = await events();
	expect( city.wrapper.find( '.event-none' ).text() ).toContain( 'There are no events scheduled near Paris at the moment.' );
} );

test( 'the news show Loading… until they come, and the footer links are always there', async () => {
	api.respondWith( () => new Promise( () => {} ) );
	const { wrapper } = await events();
	expect( wrapper.find( '.wordpress-news .widget-loading' ).text() ).toBe( 'Loading…' );
	expect( wrapper.findAll( '.community-events-footer a' ).map( ( link ) => link.text().replace( /\s+/g, ' ' ).trim() ) ).toEqual( [
		'Meetups (opens in a new tab)',
		'WordCamps (opens in a new tab)',
		'News (opens in a new tab)',
	] );
} );
