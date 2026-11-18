import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	LEGACY,
	FULL_LAYOUT_SCREENS,
	validateSrc,
	frameToTopUrl,
	topToFrameUrl,
	samePage,
	layoutFor,
	syncDecision,
	frameHeight,
	outsideLink,
	pushedHistoryEntry,
	parentTargetAction,
	isAppShell,
	isSignInUrl,
} from '../site/runtime/legacy-frame.js';

const ORIGIN = 'http://admin.test';

// src validation ------------------------------------------------------------------

test( 'accepts root-relative admin screens, with a query and a hash, and the sub-site form', () => {
	for ( const src of [
		'/wp-admin/',
		'/wp-admin/index.php',
		'/wp-admin/edit.php?post_type=page',
		'/wp-admin/admin.php?page=acme&tab=a%20b',
		'/wp-admin/options-general.php#home',
		'/wp-admin/network/sites.php',
		'/wp-admin/user/profile.php',
		'/sites/2/wp-admin/edit.php',
		'/sites/12/wp-admin/',
	] ) {
		assert.equal( validateSrc( src ), src, src );
	}
} );

test( 'rejects anything that is not a root-relative admin screen on this origin', () => {
	for ( const src of [
		undefined,
		null,
		42,
		{},
		'',
		'//evil.test/wp-admin/',
		'/\\evil.test/wp-admin/',
		'/wp-admin\\..\\x',
		'\\\\evil.test/wp-admin/',
		'javascript:alert(1)',
		'JavaScript:alert(1)//wp-admin/',
		'http://admin.test/wp-admin/',
		'https://evil.test/wp-admin/',
		'data:text/html,<p>x</p>',
		'wp-admin/edit.php',
		'edit.php',
		'/wp-adminx/edit.php',
		'/wp-admin',
		'/wp-content/uploads/x.html',
		'/wp-login.php',
		'/',
		'/?p=1',
		'/sites/x/wp-admin/',
		'/sites//wp-admin/',
		'/sites/2/../wp-admin/',
		'/wp-admin/../wp-content/x.html',
		'/wp-admin/%2e%2e/wp-content/x.html',
		'/wp-admin/./edit.php',
		'/wp-admin/edit.php\u0000',
		'/wp-admin/edit.php\n',
		'/wp-admin/\tedit.php',
		'/wp-admin/edit.php\u007f',
		'/wp-admin/edit .php',
		' /wp-admin/',
	] ) {
		assert.equal( validateSrc( src ), null, JSON.stringify( src ) );
	}
} );

// URL mapping -----------------------------------------------------------------------

test( 'the top-level URL of a frame location is its path, query and hash, on this origin only', () => {
	assert.equal( frameToTopUrl( ORIGIN + '/wp-admin/edit.php?post_type=page#top', ORIGIN ), '/wp-admin/edit.php?post_type=page#top' );
	assert.equal( frameToTopUrl( ORIGIN + '/sites/3/wp-admin/post.php?post=1&action=edit', ORIGIN ), '/sites/3/wp-admin/post.php?post=1&action=edit' );
	assert.equal( frameToTopUrl( ORIGIN + '/wp-admin/', ORIGIN ), '/wp-admin/' );
	assert.equal( frameToTopUrl( 'http://evil.test/wp-admin/edit.php', ORIGIN ), null );
	assert.equal( frameToTopUrl( ORIGIN + '/wp-content/uploads/a.pdf', ORIGIN ), null );
	assert.equal( frameToTopUrl( ORIGIN + '/wp-login.php', ORIGIN ), null );
	assert.equal( frameToTopUrl( 'about:blank', ORIGIN ), null );
	assert.equal( frameToTopUrl( null, ORIGIN ), null );
	assert.equal( frameToTopUrl( 'not a url', ORIGIN ), null );
} );

test( 'the frame URL of a top-level URL is the same URL, validated', () => {
	for ( const url of [ '/wp-admin/edit.php?post_type=page#top', '/sites/3/wp-admin/', '/wp-admin/admin.php?page=x' ] ) {
		assert.equal( topToFrameUrl( url ), url );
		assert.equal( frameToTopUrl( ORIGIN + topToFrameUrl( url ), ORIGIN ), url, 'round trip ' + url );
	}
	assert.equal( topToFrameUrl( '//evil.test/wp-admin/' ), null );
} );

test( 'samePage compares the router page (context, site, path and query), not the spelling or the hash', () => {
	assert.ok( samePage( '/wp-admin/', '/wp-admin/index.php' ) );
	assert.ok( samePage( '/wp-admin/edit.php?post_type=page', '/wp-admin/edit.php?post_type=page#x' ) );
	assert.ok( ! samePage( '/wp-admin/edit.php', '/wp-admin/edit.php?post_type=page' ) );
	assert.ok( ! samePage( '/wp-admin/edit.php', '/sites/2/wp-admin/edit.php' ) );
	assert.ok( ! samePage( '/wp-admin/sites.php', '/wp-admin/network/sites.php' ) );
	assert.ok( ! samePage( null, '/wp-admin/' ) );
} );

// Layout --------------------------------------------------------------------------------

test( 'full-document screens get the full layout, with or without a query; others the default', () => {
	assert.deepEqual( [ ...FULL_LAYOUT_SCREENS ].sort(), [ 'customize.php', 'post-new.php', 'post.php', 'site-editor.php', 'widgets.php' ] );
	for ( const url of [ '/wp-admin/post.php?post=1&action=edit', '/wp-admin/post-new.php', '/wp-admin/post-new.php?post_type=page', '/wp-admin/site-editor.php?p=%2F', '/wp-admin/customize.php?return=x', '/wp-admin/widgets.php', '/sites/2/wp-admin/post.php?post=3&action=edit' ] ) {
		assert.equal( layoutFor( url ), 'full', url );
	}
	for ( const url of [ '/wp-admin/nav-menus.php', '/wp-admin/edit.php', '/wp-admin/', '/wp-admin/admin.php?page=post.php', '/wp-admin/options-general.php?x=post.php', null ] ) {
		assert.equal( layoutFor( url ), 'default', String( url ) );
	}
} );

// Sync decision --------------------------------------------------------------------------

const decide = ( href, extra = {} ) => syncDecision( { href, origin: ORIGIN, current: '/wp-admin/edit.php', ...extra } );

test( 'a frame on the sign-in screen means the session has ended', () => {
	assert.deepEqual( decide( ORIGIN + '/wp-login.php?redirect_to=x&reauth=1' ), { action: 'login' } );
	assert.deepEqual( decide( ORIGIN + '/sites/2/wp-login.php' ), { action: 'login' } );
	// Another origin's sign-in screen is just somewhere else.
	assert.deepEqual( decide( 'http://evil.test/wp-login.php' ), { action: 'restore' } );
} );

test( 'a frame that left the admin (unreadable, another origin, outside /wp-admin/) is restored', () => {
	assert.deepEqual( decide( null ), { action: 'restore' } );
	assert.deepEqual( decide( 'https://evil.test/wp-admin/edit.php' ), { action: 'restore' } );
	assert.deepEqual( decide( ORIGIN + '/' ), { action: 'restore' } );
	assert.deepEqual( decide( ORIGIN + '/wp-content/uploads/a.pdf' ), { action: 'restore' } );
	assert.deepEqual( decide( ORIGIN + '/wp-admin/../x' ), { action: 'restore' } );
} );

test( 'an unreadable frame is restored, whoever started the navigation', () => {
	for ( const requested of [ true, false, undefined ] ) {
		assert.deepEqual( decide( null, { requested } ), { action: 'restore' } );
		assert.deepEqual( decide( undefined, { requested } ), { action: 'restore' } );
		assert.deepEqual( decide( ORIGIN + '/wp-content/x.html', { requested } ), { action: 'restore' } );
	}
} );

test( 'about:blank (no document yet) is ignored', () => {
	assert.deepEqual( decide( 'about:blank' ), { action: 'ignore' } );
} );

test( 'a frame on the current page stays, whatever the spelling or the hash', () => {
	assert.deepEqual( decide( ORIGIN + '/wp-admin/edit.php#x' ), { action: 'stay', url: '/wp-admin/edit.php#x' } );
	assert.deepEqual( decide( ORIGIN + '/wp-admin/index.php', { current: '/wp-admin/' } ), { action: 'stay', url: '/wp-admin/index.php' } );
} );

test( 'a frame on another admin screen asks the router, then adopts a legacy page or hands over to a native one', () => {
	const href = ORIGIN + '/wp-admin/post-new.php';
	assert.deepEqual( decide( href ), { action: 'lookup', url: '/wp-admin/post-new.php' } );
	assert.deepEqual( decide( href, { answer: { page: { component: LEGACY } } } ), { action: 'adopt', url: '/wp-admin/post-new.php' } );
	assert.deepEqual( decide( href, { answer: { page: { component: 'acme/page' } } } ), { action: 'native', url: '/wp-admin/post-new.php' } );
	assert.deepEqual( decide( href, { answer: { page: { component: 'core/settings' } } } ), { action: 'native', url: '/wp-admin/post-new.php' } );
	// The router does not know the screen (or failed): the content stays, the top URL is not changed.
	assert.deepEqual( decide( href, { answer: new Error( 'nope' ) } ), { action: 'keep', url: '/wp-admin/post-new.php' } );
	assert.deepEqual( decide( href, { answer: { page: null } } ), { action: 'keep', url: '/wp-admin/post-new.php' } );
	// Sub-sites map the same way.
	assert.deepEqual( decide( ORIGIN + '/sites/2/wp-admin/edit.php', { current: '/sites/2/wp-admin/' } ), { action: 'lookup', url: '/sites/2/wp-admin/edit.php' } );
} );

// Height --------------------------------------------------------------------------------

test( 'the frame height is the content height, never below the minimum, in whole pixels', () => {
	assert.equal( frameHeight( { contentBottom: 1234.2, minimum: 600 } ), 1235 );
	assert.equal( frameHeight( { contentBottom: 100, minimum: 600 } ), 600 );
	assert.equal( frameHeight( { contentBottom: Number.NaN, minimum: 600 } ), 600 );
	assert.equal( frameHeight( { contentBottom: 900, minimum: -5 } ), 900 );
} );

// Links that leave the admin --------------------------------------------------------------

test( 'outsideLink names the http(s) URL of a plain click that leaves the admin, else null', () => {
	const click = ( href, extra = {} ) => outsideLink( { href, origin: ORIGIN, button: 0, target: '', ...extra } );
	assert.equal( click( 'http://site.test/hello-world/' ), 'http://site.test/hello-world/' );
	assert.equal( click( ORIGIN + '/wp-content/uploads/a.pdf' ), ORIGIN + '/wp-content/uploads/a.pdf' );
	assert.equal( click( ORIGIN + '/wp-admin/edit.php' ), null, 'admin screens stay in the frame' );
	assert.equal( click( ORIGIN + '/sites/2/wp-admin/' ), null );
	assert.equal( click( ORIGIN + '/wp-login.php?action=logout' ), null, 'left to the frame (and the sign-in hand-over)' );
	assert.equal( click( 'javascript:alert(1)' ), null );
	assert.equal( click( 'mailto:a@b.test' ), null );
	assert.equal( click( 'http://site.test/', { target: '_blank' } ), null, 'a target is left to the browser' );
	assert.equal( click( 'http://site.test/', { button: 1 } ), null );
	assert.equal( click( 'http://site.test/', { modified: true } ), null );
	assert.equal( click( 'http://site.test/', { download: true } ), null );
	assert.equal( click( '' ), null );
} );

test( 'only a push the browser reports, of a navigation the frame made itself, counts as a pushed history entry', () => {
	assert.equal( pushedHistoryEntry( { hostNavigation: false, navigationType: 'push' } ), true );
	for ( const navigationType of [ 'replace', 'reload', 'traverse', null, undefined ] ) {
		assert.equal( pushedHistoryEntry( { hostNavigation: false, navigationType } ), false, String( navigationType ) );
	}
	assert.equal( pushedHistoryEntry( { hostNavigation: true, navigationType: 'push' } ), false, 'the host’s own navigation' );
} );

test( 'a blank frame is ignored only before any document has been in it', () => {
	assert.deepEqual( decide( 'about:blank', { blankAllowed: true } ), { action: 'ignore' } );
	assert.deepEqual( decide( 'about:blank', { blankAllowed: false } ), { action: 'restore' } );
	assert.deepEqual( decide( 'about:srcdoc', { blankAllowed: false } ), { action: 'restore' } );
} );

test( 'isSignInUrl matches this origin\'s sign-in screen, also under a site prefix', () => {
	assert.equal( isSignInUrl( ORIGIN + '/wp-login.php?reauth=1', ORIGIN ), true );
	assert.equal( isSignInUrl( ORIGIN + '/sites/2/wp-login.php', ORIGIN ), true );
	assert.equal( isSignInUrl( 'http://evil.test/wp-login.php', ORIGIN ), false );
	assert.equal( isSignInUrl( ORIGIN + '/wp-admin/', ORIGIN ), false );
	assert.equal( isSignInUrl( null, ORIGIN ), false );
} );

test( 'links and GET forms aimed at _parent or _top: admin screens in the frame, other http(s) URLs in a new tab, the rest left alone', () => {
	const act = ( href, target = '_parent' ) => parentTargetAction( { href, origin: ORIGIN, target } );
	assert.deepEqual( act( ORIGIN + '/wp-admin/plugins.php?activate=1' ), { action: 'frame', url: ORIGIN + '/wp-admin/plugins.php?activate=1' } );
	assert.deepEqual( act( ORIGIN + '/sites/3/wp-admin/update.php', '_top' ), { action: 'frame', url: ORIGIN + '/sites/3/wp-admin/update.php' } );
	assert.deepEqual( act( ORIGIN + '/wp-login.php?action=logout', '_top' ), { action: 'frame', url: ORIGIN + '/wp-login.php?action=logout' } );
	assert.deepEqual( act( 'https://example.org/x' ), { action: 'outside', url: 'https://example.org/x' } );
	assert.deepEqual( act( ORIGIN + '/wp-content/uploads/a.zip' ), { action: 'outside', url: ORIGIN + '/wp-content/uploads/a.zip' } );
	assert.equal( act( 'javascript:alert(1)' ), null );
	assert.equal( act( 'mailto:a@b.test' ), null );
	assert.equal( act( 'not a url' ), null );
	for ( const target of [ '', '_self', '_blank', 'named' ] ) {
		assert.equal( act( ORIGIN + '/wp-admin/', target ), null, target );
	}
} );

test( 'isAppShell tells the admin app\'s own document from a classic screen', () => {
	const doc = ( { app = false, classes = [] } = {} ) => ( {
		getElementById: ( id ) => ( id === 'app' && app ? {} : null ),
		body: { classList: { contains: ( name ) => classes.includes( name ) } },
	} );
	assert.equal( isAppShell( doc( { app: true } ) ), true );
	assert.equal( isAppShell( doc( { app: true, classes: [ 'wp-admin' ] } ) ), false );
	assert.equal( isAppShell( doc( { app: true, classes: [ 'wp-detached' ] } ) ), false );
	assert.equal( isAppShell( doc() ), false );
	assert.equal( isAppShell( null ), false );
	assert.equal( isAppShell( { get body() {
		throw new Error( 'x' );
	} } ), false );
} );
