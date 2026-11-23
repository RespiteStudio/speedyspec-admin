/** @jest-environment jsdom */
// The user Dashboard (`/wp-admin/user/`, `data.context` = `user`; the throwaway e2e project's
// `detached-multisite` drives it on a network). Which boxes it has is WordPress's decision: Site
// Health is a box only when the data lists it (wp_dashboard_setup() adds it for a user who may
// view the checks). The page renders the boxes of the data and nothing else.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const BOX = ( id, title ) => ( { id, title, basename: title, classes: [], closed: false, hidden: false, pinned: false, warning: false } );
const HEALTH = { hasResults: true, counts: { good: 18, recommended: 5, critical: 0 }, issues: 5, message: 'recommended-many', issuesText: 'Take a look at the <strong>5 items</strong> on the <a href="site-health.php">Site Health screen</a>.', label: 'good', progress: { score: 89, status: 'good', dashOffset: 62.2 }, url: 'site-health.php' };

/** The user Dashboard's data, as wp_admin_get_dashboard( 'user' ) gives it, with or without Site Health. */
function userData( { siteHealth } ) {
	const boxes = { acme_user_widget: BOX( 'acme_user_widget', 'Acme user widget' ) };
	const normal = [ 'acme_user_widget' ];
	const widgets = {};
	if ( siteHealth ) {
		boxes.dashboard_site_health = BOX( 'dashboard_site_health', 'Site Health Status' );
		normal.unshift( 'dashboard_site_health' );
		widgets.dashboard_site_health = HEALTH;
	}
	return {
		context: 'user',
		screen: 'dashboard-user',
		layout: { contexts: { normal } },
		boxes,
		reordering: true,
		columns: 0,
		columnChoices: [],
		screenOptions: { sections: [], reordering: true, columns: null },
		widgets,
		pluginWidgets: { acme_user_widget: { html: '<p class="acme-user">Acme</p>', error: false, configurable: false } },
		assets: { scripts: [], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' },
		welcome: null,
		help: {},
		remindLater: null,
	};
}

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'dashboard', 'meta-box-holder', 'meta-box', 'dashboard-site-health' ] );
} );

afterEach( () => resetContracts() );

async function userDashboard( data ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/dashboard', data, page: { path: 'index.php', title: 'Dashboard' } } ) }, {
		provide: {
			notices: { add: () => 'n1' },
			speak: () => {},
			screenOptions: { set: () => () => {} },
			pageState: { setDirty: () => {}, isDirty: () => false },
		},
	} );
	for ( let i = 0; i < 6; i++ ) {
		await flushPromises();
	}
	expect( wrapper.find( '#dashboard-widgets' ).exists() ).toBe( true );
	expect( wrapper.find( '.wp-admin-dashboard--user' ).exists() ).toBe( true );
	return wrapper;
}

test( 'Site Health renders when the data has it', async () => {
	const wrapper = await userDashboard( userData( { siteHealth: true } ) );
	expect( wrapper.find( '#dashboard_site_health' ).exists() ).toBe( true );
	expect( wrapper.find( '#dashboard_site_health .site-health-progress-wrapper' ).exists() ).toBe( true );
	expect( wrapper.findAll( '#dashboard-widgets .postbox' ).map( ( box ) => box.attributes( 'id' ) ) ).toEqual( [ 'dashboard_site_health', 'acme_user_widget' ] );
} );

test( 'Site Health does not render when the data does not have it', async () => {
	const wrapper = await userDashboard( userData( { siteHealth: false } ) );
	expect( wrapper.find( '#dashboard_site_health' ).exists() ).toBe( false );
	expect( wrapper.find( '.site-health-progress-wrapper' ).exists() ).toBe( false );
	expect( wrapper.findAll( '#dashboard-widgets .postbox' ).map( ( box ) => box.attributes( 'id' ) ) ).toEqual( [ 'acme_user_widget' ] );
	expect( wrapper.find( '#acme_user_widget .acme-user' ).exists() ).toBe( true );
} );

test( 'Site Health widget data without its box renders nothing: the box list decides', async () => {
	const data = userData( { siteHealth: false } );
	data.widgets.dashboard_site_health = HEALTH;
	const wrapper = await userDashboard( data );
	expect( wrapper.find( '#dashboard_site_health' ).exists() ).toBe( false );
	expect( wrapper.find( '.site-health-progress-wrapper' ).exists() ).toBe( false );
} );

test( 'the user Dashboard has no Welcome panel when the data has none', async () => {
	const wrapper = await userDashboard( userData( { siteHealth: true } ) );
	expect( wrapper.find( '#welcome-panel' ).exists() ).toBe( false );
} );
