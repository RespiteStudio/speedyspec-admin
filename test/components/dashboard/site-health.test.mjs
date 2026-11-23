/** @jest-environment jsdom */
// Site Health Status (core/dashboard-site-health), and the box around it: the holder saves the box's state with the
// complete lists of closed and hidden boxes.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { BOX, dashboardData, mountDashboard, mountWidget, resetDoubles, settle } from '../../helpers/dashboard.mjs';

const HEALTH = {
	hasResults: true,
	counts: { good: 18, recommended: 5, critical: 0 },
	issues: 5,
	message: 'recommended-many',
	issuesText: 'Take a look at the <strong>5 items</strong> on the <a href="site-health.php">Site Health screen</a>.',
	label: 'good',
	progress: { score: 89, status: 'good', dashOffset: 62.2 },
	url: 'site-health.php',
};

beforeEach( resetDoubles );
afterEach( () => resetContracts() );

const health = async ( data = HEALTH ) => ( await mountWidget( 'site-health', data ) ).wrapper;

test( 'a good score shows the ring at the data\'s offset, the label and the message', async () => {
	const wrapper = await health();
	expect( wrapper.find( '.site-health-progress-wrapper' ).classes() ).toContain( 'green' );
	expect( wrapper.find( '.site-health-progress' ).classes() ).not.toContain( 'hidden' );
	expect( wrapper.find( '#bar' ).attributes( 'style' ) ).toContain( 'stroke-dashoffset: 62.2px' );
	expect( wrapper.find( '.site-health-progress-label' ).text() ).toBe( 'Good' );
	expect( wrapper.find( '.site-health-details' ).text() ).toContain( 'is looking good, but there are still some things you can do' );
	expect( wrapper.find( '.site-health-details a' ).attributes( 'href' ) ).toBe( 'site-health.php' );
	expect( wrapper.find( '.site-health-details strong' ).text() ).toBe( '5 items' );
} );

test( 'a score that is not good shows orange, and no score shows the loading look with the way to the checks', async () => {
	const orange = await health( { ...HEALTH, label: 'improvable', progress: { score: 40, status: 'recommended', dashOffset: 300 } } );
	expect( orange.find( '.site-health-progress-wrapper' ).classes() ).toContain( 'orange' );
	expect( orange.find( '.site-health-progress-label' ).text() ).toBe( 'Should be improved' );

	const none = await health( { hasResults: false, message: 'no-results', label: 'no-information', progress: null, issuesText: null, url: 'site-health.php' } );
	expect( none.find( '.site-health-progress-wrapper' ).classes() ).toContain( 'loading' );
	expect( none.find( '.site-health-progress' ).classes() ).toContain( 'hidden' );
	expect( none.find( '.site-health-progress-label' ).text() ).toBe( 'No information yet…' );
	expect( none.find( '.site-health-details a' ).text() ).toBe( 'visit the Site Health screen' );
	expect( none.find( '.site-health-details a' ).attributes( 'href' ) ).toBe( '/wp-admin/site-health.php' );
} );

test( 'each message of the data shows its text', async () => {
	const texts = {
		'all-clear': 'Great job! Your site currently passes all site health checks.',
		'critical-one': 'Your site has a critical issue',
		'critical-many': 'Your site has critical issues',
		'recommended-one': 'there is still one thing you can do',
	};
	for ( const [ message, text ] of Object.entries( texts ) ) {
		const wrapper = await health( { ...HEALTH, message, issuesText: null } );
		expect( [ message, wrapper.find( '.site-health-details' ).text().includes( text ) ] ).toEqual( [ message, true ] );
	}
} );

test( 'collapsing the box posts the complete lists of closed and hidden boxes to the screen preferences', async () => {
	const data = dashboardData( {
		boxes: [ BOX( 'dashboard_site_health', 'Site Health Status' ), BOX( 'dashboard_activity', 'Activity' ) ],
		widgets: { dashboard_site_health: HEALTH, dashboard_activity: { future: [], published: [], onThisDay: [], empty: true } },
	} );
	const { wrapper } = await mountDashboard( data, { names: [ 'site-health', 'activity' ] } );
	expect( wrapper.find( '#dashboard_site_health' ).isVisible() ).toBe( true );

	await wrapper.find( '#dashboard_site_health .handlediv' ).trigger( 'click' );
	await settle();
	expect( api.calls.at( -1 ) ).toEqual( { method: 'POST', route: 'wp-admin/v1/screen-preferences/dashboard', payload: { closed: [ 'dashboard_site_health' ], hidden: [] } } );
} );
