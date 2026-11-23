/** @jest-environment jsdom */
// The Dashboard's help (components/core/dashboard/help.js): the tabs and the sidebar the frame shows. WordPress decides
// which set shows and which lines of the Content tab apply (the page data's `help`); the component only shows them.
import { expect, test } from '@jest/globals';
import { h, ref } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { help, isNetworkHelp } from '../../../site/components/core/dashboard/help.js';

const tab = ( id, page ) => help.tabs.find( ( item ) => item.id === id && item.when( page ) !== false );
const pageOf = ( data ) => ( { data: { help: data } } );
const mountTab = ( component, page ) => mountPart( { render: () => h( component ) }, { provide: { framePage: ref( page ) } } );
const lines = ( wrapper ) => wrapper.findAll( 'p, li' ).map( ( line ) => line.text() );

const ALL = { set: 'site', welcome: true, siteHealth: true, glance: true, comments: true, quickDraft: true, version: '7.3', versionUrl: 'https://wordpress.org/documentation/wordpress-version/version-7-3/' };
const SUBSCRIBER_LIKE = { set: 'site', welcome: false, siteHealth: false, glance: false, comments: false, quickDraft: false, version: '7.3', versionUrl: null };

test( 'the site Dashboard has the Overview, Navigation, Layout and Content tabs, in that order', () => {
	const page = pageOf( ALL );
	const shown = help.tabs.filter( ( item ) => item.when( page ) !== false );
	expect( shown.map( ( item ) => [ item.id, item.title() ] ) ).toEqual( [
		[ 'overview', 'Overview' ],
		[ 'help-navigation', 'Navigation' ],
		[ 'help-layout', 'Layout' ],
		[ 'help-content', 'Content' ],
	] );
} );

test( 'the Content tab lists the boxes the data says the user has, and the ones everybody has', () => {
	const all = mountTab( tab( 'help-content', pageOf( ALL ) ).component, pageOf( ALL ) );
	expect( lines( all ).map( ( line ) => line.split( ' — ' )[ 0 ] ) ).toEqual( [
		'The boxes on your Dashboard screen are:',
		'Welcome',
		'Site Health Status',
		'At a Glance',
		'Activity',
		'Recent Comments',
		'Quick Draft',
		'WordPress Events and News',
	] );
	expect( all.find( 'a' ).attributes( 'href' ) ).toBe( 'https://planet.wordpress.org/' );

	const few = mountTab( tab( 'help-content', pageOf( SUBSCRIBER_LIKE ) ).component, pageOf( SUBSCRIBER_LIKE ) );
	expect( lines( few ).map( ( line ) => line.split( ' — ' )[ 0 ] ) ).toEqual( [ 'The boxes on your Dashboard screen are:', 'Activity', 'WordPress Events and News' ] );
} );

test( 'the Layout tab explains Screen Options, drag and drop and the box controls', () => {
	const wrapper = mountTab( tab( 'help-layout', pageOf( ALL ) ).component, pageOf( ALL ) );
	expect( wrapper.findAll( 'p strong' ).map( ( strong ) => strong.text() ) ).toEqual( [ 'Screen Options', 'Drag and Drop', 'Box Controls' ] );
} );

test( 'the sidebar links the documentation and the forums, and the version to its notes when the data has them', () => {
	const linked = mountTab( help.sidebar, pageOf( ALL ) );
	expect( linked.findAll( 'a' ).map( ( link ) => [ link.text(), link.attributes( 'href' ) ] ) ).toEqual( [
		[ 'Documentation on Dashboard', 'https://wordpress.org/documentation/article/dashboard-screen/' ],
		[ 'Support forums', 'https://wordpress.org/support/forums/' ],
		[ 'Version 7.3', ALL.versionUrl ],
	] );

	const plain = mountTab( help.sidebar, pageOf( SUBSCRIBER_LIKE ) );
	expect( plain.findAll( 'a' ) ).toHaveLength( 2 );
	expect( plain.text() ).toContain( 'Version 7.3' );
} );

test( 'the network Dashboard has the Overview and Quick Tasks tabs and the network sidebar', () => {
	const page = pageOf( { set: 'network' } );
	expect( isNetworkHelp( page ) ).toBe( true );
	expect( isNetworkHelp( pageOf( ALL ) ) ).toBe( false );
	const shown = help.tabs.filter( ( item ) => item.when( page ) !== false );
	expect( shown.map( ( item ) => item.id ) ).toEqual( [ 'overview', 'quick-tasks' ] );

	const quick = mountTab( shown[ 1 ].component, page );
	expect( quick.findAll( 'li strong' ).map( ( strong ) => strong.text() ) ).toEqual( [ 'click Create a New User', 'click Create a New Site', 'enter an email address or username', 'enter the path or domain' ] );
	const sidebar = mountTab( help.sidebar, page );
	expect( sidebar.findAll( 'a' ).map( ( link ) => link.text() ) ).toEqual( [ 'Documentation on the Network Admin', 'Support forums' ] );
	expect( sidebar.findAll( 'a' )[ 1 ].attributes( 'href' ) ).toBe( 'https://wordpress.org/support/forum/multisite/' );
} );
