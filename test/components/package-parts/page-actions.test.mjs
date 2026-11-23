/** @jest-environment jsdom */
// What the package pages share (package-parts/page-actions.js): an admin path opened through the
// router, the information dialog's state, the classic error page a fatal answer leads to, and the
// jobs a cancelled credentials dialog drops announced once, for a plugin and a theme page.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { ROUTE, fatalTarget, usePackagePage } from '../../../site/components/core/package-parts/page-actions.js';

const WHERE = { origin: 'http://localhost', pathname: '/sites/3/wp-admin/plugins.php', search: '' };

/** Mounts a page using usePackagePage(); `navigated` records what the router is asked to open. */
function mountPage( type ) {
	const navigated = [];
	const given = { navigate: async ( url, options ) => navigated.push( options ? [ url, options ] : url ) };
	let page;
	mountPart( {
		setup() {
			page = usePackagePage( { router: given, where: () => WHERE, type } );
			return () => h( 'div' );
		},
	} );
	return { page, navigated };
}

let triggers;
beforeEach( () => {
	triggers = [];
	window.jQuery = () => ( { trigger: ( name, detail ) => triggers.push( [ name, detail ] ) } );
} );
afterEach( () => {
	delete window.jQuery;
	jest.restoreAllMocks();
} );

test( 'ROUTE is the admin API namespace the pages post to', () => {
	expect( ROUTE ).toBe( 'wp-admin/v1/' );
} );

test.each( [ 'plugin', 'theme' ] )( 'navigate (%s): an admin path opens through the router on the site shown, with the options given', async ( type ) => {
	const { page, navigated } = mountPage( type );
	await page.navigate( 'plugins.php?s=x' );
	await page.navigate( 'themes.php?search=x', { replace: true, inPlace: true } );
	expect( navigated ).toEqual( [ '/sites/3/wp-admin/plugins.php?s=x', [ '/sites/3/wp-admin/themes.php?search=x', { replace: true, inPlace: true } ] ] );
} );

test.each( [ 'plugin', 'theme' ] )( 'openDetails (%s): a slug opens the dialog on its section (Description by default), each time with a new key; no slug opens nothing', ( type ) => {
	const { page } = mountPage( type );
	page.openDetails( '' );
	expect( page.details.value ).toBeNull();
	page.openDetails( 'hello-dolly' );
	const first = page.details.value;
	page.openDetails( 'hello-dolly', 'changelog' );
	expect( [ first.slug, first.section, page.details.value.section, page.details.value.key > first.key ] ).toEqual( [ 'hello-dolly', 'description', 'changelog', true ] );
} );

test( 'fatalTarget: a plugin\'s fatal activation and a theme\'s fatal resume lead to their classic error page; any other error to nothing', () => {
	const plugin = { code: 'plugin_activation_fatal', data: { redirect: 'plugins.php?error=true&plugin=x', location: null } };
	const theme = { code: 'theme_resume_fatal', data: { redirect: 'themes.php?error=resuming' } };
	expect( [
		fatalTarget( plugin, 'plugin' ), fatalTarget( theme, 'theme' ), fatalTarget( theme, 'plugin' ), fatalTarget( plugin, 'theme' ),
		fatalTarget( { code: 'plugin_activation_fatal', data: {} }, 'plugin' ), fatalTarget( null, 'plugin' ),
	] ).toEqual( [
		{ redirect: 'plugins.php?error=true&plugin=x', location: null }, { redirect: 'themes.php?error=resuming', location: null }, null, null, null, null,
	] );
} );

test.each( [ 'plugin', 'theme' ] )( 'the page\'s fatalTarget (%s) is the pure one for its type', ( type ) => {
	const { page } = mountPage( type );
	const error = { code: type === 'plugin' ? 'plugin_activation_fatal' : 'theme_resume_fatal', data: { redirect: 'x.php' } };
	expect( page.fatalTarget( error ) ).toEqual( { redirect: 'x.php', location: null } );
} );

test( 'announceDropped (plugin): each dropped job once, as updates.js queued it, with the slug the page knows and no credentials', () => {
	const { page } = mountPage( 'plugin' );
	const jobs = [
		{ kind: 'update', key: 'a/a.php', body: { plugin: 'a/a.php', screen: 'plugins', credentials: { password: 's3cret' } } },
		{ kind: 'install', key: 'b', body: { slug: 'b' } },
	];
	page.announceDropped( jobs, ( job ) => ( job.key === 'a/a.php' ? 'a' : job.key ) );
	expect( triggers ).toEqual( [
		[ 'credential-modal-cancel', { action: 'update-plugin', data: { plugin: 'a/a.php', slug: 'a' } } ],
		[ 'credential-modal-cancel', { action: 'install-plugin', data: { slug: 'b' } } ],
	] );
} );

test( 'announceDropped (theme): each dropped job once, in the classic theme shape; without a slug lookup, the job\'s key', () => {
	const { page } = mountPage( 'theme' );
	page.announceDropped( [ { kind: 'delete', key: 'twentyten', body: { stylesheet: 'twentyten' } } ] );
	expect( triggers ).toEqual( [ [ 'credential-modal-cancel', { action: 'delete-theme', data: { slug: 'twentyten' } } ] ] );
} );
