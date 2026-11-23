/** @jest-environment jsdom */
// The network Dashboard's Right Now widget (the throwaway e2e project's `detached-multisite` drives
// the same widget on a network). Its create links and the screens its two searches open come from
// the data (`_wp_admin_dashboard_network_right_now()`): nothing here knows the network screens.
// The paths below are not WordPress's own, so that only the data can give them.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts, resetContracts } from '../../helpers/contracts-table.mjs';
import * as api from '../../helpers/api-stub.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

const BOX = { id: 'network_dashboard_right_now', title: 'Right Now', basename: 'Right Now', classes: [], closed: false, hidden: false, pinned: false, warning: false };

const rightNow = ( overrides = {} ) => ( {
	actions: [
		{ key: 'create-site', text: 'Create a New Site', url: 'network/acme-site-new.php' },
		{ key: 'create-user', text: 'Create a New User', url: 'network/acme-user-new.php' },
	],
	text: 'You have 3 sites and 7 users.',
	search: { users: 'network/acme-users.php', sites: 'network/acme-sites.php' },
	resultHtml: '',
	endHtml: '',
	...overrides,
} );

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'dashboard-network-right-now' ] );
} );

afterEach( () => resetContracts() );

async function widget( data, provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/dashboard-network-right-now', data, box: BOX, context: 'network', assets: {} } ) }, { provide } );
	for ( let i = 0; i < 4; i++ ) {
		await flushPromises();
	}
	expect( wrapper.find( '.youhave' ).exists() ).toBe( true );
	return wrapper;
}

test( 'the create links are the data\'s, in its order, with its text', async () => {
	const wrapper = await widget( rightNow() );
	const links = wrapper.findAll( '.subsubsub li' );
	expect( links.map( ( li ) => li.classes() ) ).toEqual( [ [ 'create-site' ], [ 'create-user' ] ] );
	expect( links.map( ( li ) => li.find( 'a' ).text() ) ).toEqual( [ 'Create a New Site', 'Create a New User' ] );
	expect( links.map( ( li ) => li.find( 'a' ).attributes( 'href' ) ) ).toEqual( [ '/wp-admin/network/acme-site-new.php', '/wp-admin/network/acme-user-new.php' ] );
	expect( wrapper.find( '.youhave' ).text() ).toBe( 'You have 3 sites and 7 users.' );
} );

test( 'without create links in the data there is no link list', async () => {
	const wrapper = await widget( rightNow( { actions: [] } ) );
	expect( wrapper.find( '.subsubsub' ).exists() ).toBe( false );
	// The searches are still there.
	expect( wrapper.findAll( 'form' ) ).toHaveLength( 2 );
} );

test( 'without a router, each search form submits `s` with GET to the data\'s screen', async () => {
	const wrapper = await widget( rightNow() );
	const [ users, sites ] = wrapper.findAll( 'form' );
	expect( [ users.attributes( 'action' ), users.attributes( 'method' ) ] ).toEqual( [ '/wp-admin/network/acme-users.php', 'get' ] );
	expect( [ sites.attributes( 'action' ), sites.attributes( 'method' ) ] ).toEqual( [ '/wp-admin/network/acme-sites.php', 'get' ] );
	expect( users.find( '#search-users' ).attributes( 'name' ) ).toBe( 's' );
	expect( sites.find( '#search-sites' ).attributes( 'name' ) ).toBe( 's' );

	// The form is left to submit itself: the event is not prevented.
	const event = new Event( 'submit', { cancelable: true } );
	users.element.dispatchEvent( event );
	expect( event.defaultPrevented ).toBe( false );
} );

test( 'with a router, each search opens the data\'s screen with what was typed as `s`', async () => {
	const visited = [];
	const wrapper = await widget( rightNow(), { router: { navigate: ( url ) => visited.push( url ) } } );

	await wrapper.find( '#search-users' ).setValue( 'ann smith' );
	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	await wrapper.find( '#search-sites' ).setValue( 'detached-sub' );
	await wrapper.findAll( 'form' )[ 1 ].trigger( 'submit' );

	expect( visited ).toEqual( [ '/wp-admin/network/acme-users.php?s=ann+smith', '/wp-admin/network/acme-sites.php?s=detached-sub' ] );
} );

test( 'a search screen the data does not give as an admin path is not followed', async () => {
	const visited = [];
	const wrapper = await widget( rightNow( { search: { users: 'javascript:alert(1)', sites: 'network/acme-sites.php' } } ), { router: { navigate: ( url ) => visited.push( url ) } } );
	await wrapper.find( '#search-users' ).setValue( 'ann' );
	await wrapper.findAll( 'form' )[ 0 ].trigger( 'submit' );
	expect( visited ).toEqual( [] );
	expect( wrapper.findAll( 'form' )[ 0 ].attributes( 'action' ) ).toBe( '' );
} );
