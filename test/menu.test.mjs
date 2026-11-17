import test from 'node:test';
import assert from 'node:assert/strict';
import { httpUrl, adminBase, menuHref, menuIcon, currentMenuPath, findCurrent } from '../site/runtime/menu.js';

const item = ( path, children = [] ) => ( { path, label: path, icon: '', count: null, children } );

const MENU = [
	item( 'index.php', [ item( 'index.php' ), item( 'update-core.php' ) ] ),
	item( 'edit.php', [ item( 'edit.php' ), item( 'post-new.php' ), item( 'edit-tags.php?taxonomy=category' ) ] ),
	item( 'edit.php?post_type=page', [ item( 'edit.php?post_type=page' ), item( 'post-new.php?post_type=page' ) ] ),
	item( 'options-general.php', [ item( 'options-general.php' ), item( 'options-writing.php' ) ] ),
	item( 'detached-fixture.php' ),
];

const at = ( result ) => ( result ? [ result.top?.path ?? null, result.child?.path ?? null ] : null );

test( 'httpUrl accepts only absolute http(s) URLs', () => {
	assert.equal( httpUrl( 'https://secure.gravatar.com/avatar/x?s=96' ), 'https://secure.gravatar.com/avatar/x?s=96' );
	assert.equal( httpUrl( 'http://localhost:8889/a.png' ), 'http://localhost:8889/a.png' );
	for ( const value of [ '', null, '/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://a b', 'https://"x' ] ) {
		assert.equal( httpUrl( value ), null, String( value ) );
	}
} );

test( 'adminBase follows the site of the current URL', () => {
	assert.equal( adminBase( null ), '/wp-admin/' );
	assert.equal( adminBase( 3 ), '/sites/3/wp-admin/' );
} );

test( 'menuHref joins relative paths to the admin base and keeps root-relative and http(s) URLs', () => {
	assert.equal( menuHref( 'edit.php?post_type=page', '/wp-admin/' ), '/wp-admin/edit.php?post_type=page' );
	assert.equal( menuHref( 'network/sites.php', '/wp-admin/' ), '/wp-admin/network/sites.php' );
	assert.equal( menuHref( 'index.php', '/sites/2/wp-admin/' ), '/sites/2/wp-admin/index.php' );
	assert.equal( menuHref( '/custom/page', '/wp-admin/' ), '/custom/page' );
	assert.equal( menuHref( 'https://example.org/x', '/wp-admin/' ), 'https://example.org/x' );
	// Anything else stays inside the admin: no scheme of its own can take effect.
	assert.equal( menuHref( 'javascript:alert(1)', '/wp-admin/' ), '/wp-admin/javascript:alert(1)' );
	assert.equal( menuHref( '//evil.example/x', '/wp-admin/' ), '/wp-admin///evil.example/x' );
} );

test( 'menuIcon accepts Dashicons classes', () => {
	assert.deepEqual( menuIcon( 'dashicons-admin-post' ), { kind: 'dashicons', className: 'dashicons-admin-post' } );
} );

test( 'menuIcon accepts root-relative, http(s) and base64 SVG data URIs as images', () => {
	assert.deepEqual( menuIcon( '/wp-content/plugins/x/icon.png' ), { kind: 'image', src: '/wp-content/plugins/x/icon.png' } );
	assert.deepEqual( menuIcon( 'https://cdn.example.org/i.svg' ), { kind: 'image', src: 'https://cdn.example.org/i.svg' } );
	assert.deepEqual( menuIcon( 'http://example.org/i.png' ), { kind: 'image', src: 'http://example.org/i.png' } );
	const svg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
	assert.deepEqual( menuIcon( svg ), { kind: 'image', src: svg } );
} );

test( 'menuIcon renders no icon for none, div, empty and every other shape', () => {
	for ( const value of [
		'none', 'div', '', null, undefined, 42,
		'javascript:alert(1)',
		'data:text/html;base64,PHNjcmlwdD4=',
		'data:image/svg+xml,<svg onload=alert(1)>',
		'data:image/svg+xml;base64,not base64!',
		'//evil.example/i.png',
		'/path\\with\\backslash.png',
		'/path with space.png',
		'ftp://example.org/i.png',
		'dashicons-admin-post dashicons-evil" onclick="x',
		'DASHICONS-ADMIN-POST',
		'icon.png',
		'url(x)',
	] ) {
		assert.deepEqual( menuIcon( value ), { kind: 'none' }, String( value ) );
	}
} );

test( 'currentMenuPath adds the context prefix menu paths use', () => {
	assert.equal( currentMenuPath( { context: 'site', path: 'edit.php' } ), 'edit.php' );
	assert.equal( currentMenuPath( { context: 'network', path: 'sites.php' } ), 'network/sites.php' );
	assert.equal( currentMenuPath( { context: 'user', path: 'profile.php' } ), 'user/profile.php' );
} );

test( 'findCurrent: an exact match marks the child and its parent', () => {
	assert.deepEqual( at( findCurrent( MENU, 'edit.php' ) ), [ 'edit.php', 'edit.php' ] );
	assert.deepEqual( at( findCurrent( MENU, 'edit.php?post_type=page' ) ), [ 'edit.php?post_type=page', 'edit.php?post_type=page' ] );
	assert.deepEqual( at( findCurrent( MENU, 'post-new.php?post_type=page' ) ), [ 'edit.php?post_type=page', 'post-new.php?post_type=page' ] );
	assert.deepEqual( at( findCurrent( MENU, 'options-writing.php' ) ), [ 'options-general.php', 'options-writing.php' ] );
} );

test( 'findCurrent: a top-level item without children', () => {
	assert.deepEqual( at( findCurrent( MENU, 'detached-fixture.php' ) ), [ 'detached-fixture.php', null ] );
} );

test( 'findCurrent: an exact match wins over a file-only match', () => {
	// post-new.php (Posts) must not be chosen for the page variant.
	assert.deepEqual( at( findCurrent( MENU, 'post-new.php?post_type=page' ) )[ 1 ], 'post-new.php?post_type=page' );
} );

test( 'findCurrent: file-only match when the item query is part of the current query', () => {
	assert.deepEqual( at( findCurrent( MENU, 'edit.php?post_status=draft' ) ), [ 'edit.php', 'edit.php' ] );
	assert.deepEqual( at( findCurrent( MENU, 'edit.php?post_type=page&orderby=title' ) ), [ 'edit.php?post_type=page', 'edit.php?post_type=page' ] );
	assert.deepEqual( at( findCurrent( MENU, 'edit-tags.php?taxonomy=category&orderby=name' ) ), [ 'edit.php', 'edit-tags.php?taxonomy=category' ] );
	assert.equal( findCurrent( MENU, 'edit-tags.php?taxonomy=post_tag' ), null );
} );

test( 'findCurrent: nothing matches', () => {
	assert.equal( findCurrent( MENU, 'tools.php' ), null );
	assert.equal( findCurrent( [], 'index.php' ), null );
	assert.equal( findCurrent( null, 'index.php' ), null );
} );
