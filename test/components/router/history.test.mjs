/** @jest-environment jsdom */
// Back and Forward between native pages: the router is given the real window.history and
// location of jsdom, listens for the real popstate that history.back() and forward() fire, and
// asks the API for the page of the address it finds, query included. A page is shown from its
// own address, so Back to a list restores its filter, page and search.
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { createRouter } from '../../../site/runtime/router.js';

const manifestFor = ( path ) => ( {
	apiVersion: 1,
	locale: { code: 'en_US', dir: 'ltr' },
	importMap: { imports: {} },
	menu: [],
	replacements: {},
	slots: {},
	page: { path, title: path, component: 'core/x', textDomains: [], data: {} },
} );

let asked = [];

function api() {
	return {
		setBase() {},
		setNonce() {},
		onUnauthorized() {},
		async get( route, params ) {
			asked.push( params?.path );
			return manifestFor( params?.path );
		},
	};
}

/** Shows what the router shows: the page path of a ready page. */
const shownPath = () => ( router.state.status === 'ready' ? router.state.page?.path : router.state.status );

/** Runs a history traversal and resolves with the path of the page the router then shows (its answer was applied). */
function traverse( action ) {
	return new Promise( ( resolve ) => {
		const stop = router.observe( ( manifest ) => {
			stop();
			resolve( manifest.page.path );
		} );
		action();
	} );
}

// One router for the file: listen() has no stop, so a router per test would leave the earlier
// ones answering the same popstate. Each test starts from its own first address and answers.
const router = createRouter( { api: api(), history: window.history, location: window.location } );
router.listen( { window, document } );

beforeEach( () => {
	asked = [];
} );

afterEach( () => {
	history.replaceState( null, '', '/' );
} );

test( 'Settings to Writing, Back shows General and Forward shows Writing, each asked for by its address', async () => {
	await router.navigate( '/wp-admin/options-general.php' );
	await router.navigate( '/wp-admin/options-writing.php' );
	expect( shownPath() ).toBe( 'options-writing.php' );
	expect( location.pathname ).toBe( '/wp-admin/options-writing.php' );

	expect( await traverse( () => history.back() ) ).toBe( 'options-general.php' );
	expect( shownPath() ).toBe( 'options-general.php' );
	expect( location.pathname ).toBe( '/wp-admin/options-general.php' );

	expect( await traverse( () => history.forward() ) ).toBe( 'options-writing.php' );
	expect( shownPath() ).toBe( 'options-writing.php' );
	expect( location.pathname ).toBe( '/wp-admin/options-writing.php' );
	expect( asked ).toEqual( [ 'options-general.php', 'options-writing.php', 'options-general.php', 'options-writing.php' ] );
} );

test( 'Back and Forward restore a list\'s status filter, page and search', async () => {
	const filtered = 'edit.php?post_status=draft&paged=2&s=needle';
	await router.navigate( '/wp-admin/edit.php' );
	await router.navigate( '/wp-admin/' + filtered );
	await router.navigate( '/wp-admin/edit.php?post_type=page&paged=3' );
	expect( shownPath() ).toBe( 'edit.php?post_type=page&paged=3' );

	expect( await traverse( () => history.back() ) ).toBe( filtered );
	expect( location.search ).toBe( '?post_status=draft&paged=2&s=needle' );

	expect( await traverse( () => history.back() ) ).toBe( 'edit.php' );
	expect( location.search ).toBe( '' );

	expect( await traverse( () => history.forward() ) ).toBe( filtered );
	expect( await traverse( () => history.forward() ) ).toBe( 'edit.php?post_type=page&paged=3' );
	expect( location.search ).toBe( '?post_type=page&paged=3' );
	// Each address is asked for with its whole query: nothing is shown from a remembered list.
	expect( asked ).toEqual( [
		'edit.php',
		filtered,
		'edit.php?post_type=page&paged=3',
		filtered,
		'edit.php',
		filtered,
		'edit.php?post_type=page&paged=3',
	] );
} );

test( 'navigating to the address already shown pushes no entry, so one Back goes back one page', async () => {
	await router.navigate( '/wp-admin/options-general.php' );
	const length = history.length;
	await router.navigate( '/wp-admin/options-writing.php' );
	expect( history.length ).toBe( length + 1 );
	await router.navigate( '/wp-admin/options-writing.php' );
	expect( history.length ).toBe( length + 1 );

	expect( await traverse( () => history.back() ) ).toBe( 'options-general.php' );
} );
