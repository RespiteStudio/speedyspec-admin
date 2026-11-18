import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders, filterResponseHeaders, changesOwnCapabilities } from '../server/upstream.mjs';

test('top-level GET of a screen is the SPA', () => assert.equal(classify('GET', '/wp-admin/edit.php', 'document'), 'spa'));
test('iframe GET of a screen is proxied', () => assert.equal(classify('GET', '/wp-admin/edit.php', 'iframe'), 'proxy'));
test('POST to a screen is proxied', () => assert.equal(classify('POST', '/wp-admin/options.php', 'document'), 'proxy'));
test('admin-ajax is always proxied', () => assert.equal(classify('GET', '/wp-admin/admin-ajax.php', 'empty'), 'proxy'));
test('admin-post, async-upload, load-scripts, load-styles are always proxied', () => {
	for ( const f of [ 'admin-post.php', 'async-upload.php', 'load-scripts.php', 'load-styles.php' ] ) {
		assert.equal(classify('GET', `/wp-admin/${f}`, 'document'), 'proxy', f);
	}
});
test('REST, content and includes are proxied', () => {
	for ( const p of [ '/wp-json/', '/wp-json/wp/v2/posts', '/wp-content/uploads/a.png', '/wp-includes/js/jquery/jquery.js' ] ) {
		assert.equal(classify('GET', p, 'document'), 'proxy', p);
	}
});
test('static WordPress admin assets are always proxied', () => {
	for ( const p of [ '/wp-admin/css/common.css', '/wp-admin/js/post.js', '/wp-admin/images/wordpress-logo.svg', '/wp-admin/some/file.txt' ] ) {
		assert.equal(classify('GET', p, 'document'), 'proxy', p);
	}
});
test('wp-login is proxied for every method', () => {
	assert.equal(classify('GET', '/wp-login.php', 'document'), 'proxy');
	assert.equal(classify('POST', '/wp-login.php', 'document'), 'proxy');
});
test('wp-cron and xmlrpc are not proxied and not the SPA', () => {
	for ( const p of [ '/wp-cron.php', '/xmlrpc.php' ] ) {
		assert.equal(classify('GET', p, 'document'), 'notfound', p);
		assert.equal(classify('POST', p, 'empty'), 'notfound', p);
	}
});
test('HEAD is treated like GET', () => {
	assert.equal(classify('HEAD', '/wp-admin/edit.php', 'document'), 'spa');
	assert.equal(classify('HEAD', '/wp-admin/edit.php', 'iframe'), 'proxy');
});
test('absent Sec-Fetch-Dest on a screen is a document, unless the frame header is set', () => {
	assert.equal(classify('GET', '/wp-admin/edit.php', undefined), 'spa');
	assert.equal(classify('GET', '/wp-admin/edit.php', '', '1'), 'proxy');
});
test('subsite screens follow the same rules', () => {
	assert.equal(classify('GET', '/sites/3/wp-admin/edit.php', 'document'), 'spa');
	assert.equal(classify('GET', '/sites/3/wp-admin/edit.php', 'iframe'), 'proxy');
	assert.equal(classify('GET', '/sites/3/wp-admin/admin-ajax.php', 'empty'), 'proxy');
	assert.equal(classify('GET', '/sites/3/wp-admin/css/common.css', 'style'), 'proxy');
});
test('everything else is the SPA', () => {
	assert.equal(classify('GET', '/', 'document'), 'spa');
	assert.equal(classify('GET', '/posts/12', 'document'), 'spa');
});
test('directory index of wp-admin is a screen', () => {
	assert.equal(classify('GET', '/wp-admin/', 'document'), 'spa');
	assert.equal(classify('GET', '/wp-admin/', 'iframe'), 'proxy');
});

test('subsite path resolves to that site', () => {
	const r = resolveUpstream('/sites/3/wp-admin/edit.php', new Map([[3, { home: 'http://wp/site3' }]]));
	assert.deepEqual(r, { origin: 'http://wp', path: '/site3/wp-admin/edit.php', host: 'wp' });
});
test('unknown subsite resolves to null', () => {
	assert.equal(resolveUpstream('/sites/9/wp-admin/edit.php', new Map()), null);
});
test('non-site path resolves against the base upstream', () => {
	assert.deepEqual(resolveUpstream('/wp-json/', new Map(), 'http://wordpress-develop'), { origin: 'http://wordpress-develop', path: '/wp-json/', host: 'wordpress-develop' });
	assert.deepEqual(resolveUpstream('/wp-json/', new Map(), 'http://wp:8080', 'localhost:8889'), { origin: 'http://wp:8080', path: '/wp-json/', host: 'localhost:8889' });
});

test('rewriteLocation rewrites only upstream and public origins', () => {
	const o = { origins: [ 'http://wordpress-develop', 'http://localhost:8889' ], adminOrigin: 'http://localhost:8890' };
	assert.equal(rewriteLocation('http://wordpress-develop/wp-login.php?x=1', o), 'http://localhost:8890/wp-login.php?x=1');
	assert.equal(rewriteLocation('http://localhost:8889/wp-admin/', o), 'http://localhost:8890/wp-admin/');
	assert.equal(rewriteLocation('https://example.com/a', o), 'https://example.com/a');
	assert.equal(rewriteLocation('/relative', o), '/relative');
	assert.equal(rewriteLocation('http://localhost:88890/x', o), 'http://localhost:88890/x');
});

test('filterRequestHeaders drops hop-by-hop and spoofable headers', () => {
	const out = filterRequestHeaders({
		connection: 'keep-alive, x-custom', 'x-custom': '1', 'keep-alive': 'timeout=5', te: 'trailers', upgrade: 'h2c',
		'proxy-authorization': 'x', 'x-wp-detached-admin': '0', 'x-forwarded-host': 'evil', 'x-forwarded-for': '6.6.6.6',
		cookie: 'a=b', origin: 'http://localhost:8890', 'sec-fetch-site': 'same-origin', 'x-wp-nonce': 'n',
	});
	assert.deepEqual(Object.keys(out).sort(), [ 'cookie', 'origin', 'sec-fetch-site', 'x-wp-nonce' ]);
});

test('site-prefixed REST, content, includes and login are classified like the unprefixed forms', () => {
	for ( const p of [ '/wp-json/wp/v2/posts', '/wp-content/a.png', '/wp-includes/x.js', '/wp-login.php' ] ) {
		assert.equal(classify('GET', '/sites/3' + p, 'document'), classify('GET', p, 'document'), p);
		assert.equal(classify('GET', '/sites/3' + p, 'document'), 'proxy', p);
	}
	assert.equal(classify('GET', '/sites/3/wp-cron.php', 'document'), 'notfound');
	assert.equal(classify('GET', '/sites/3/xmlrpc.php', 'document'), 'notfound');
});
test('screen detection ignores case', () => assert.equal(classify('GET', '/wp-admin/EDIT.PHP', 'document'), 'spa'));

test('subsite Location keeps the /sites/{id} prefix (subdirectory and subdomain homes)', () => {
	const base = { origins: [ 'http://localhost:8889' ], adminOrigin: 'http://admin' };
	const dir = { ...base, site: { id: 3, home: 'http://localhost:8889/site3/' } };
	assert.equal(rewriteLocation('http://localhost:8889/site3/wp-admin/options-general.php?a=1', dir), 'http://admin/sites/3/wp-admin/options-general.php?a=1');
	assert.equal(rewriteLocation('http://localhost:8889/site3', dir), 'http://admin/sites/3');
	// Look-alike prefix: not under the home, so only the origin is rewritten.
	assert.equal(rewriteLocation('http://localhost:8889/site30/wp-admin/', dir), 'http://admin/site30/wp-admin/');
	const sub = { ...base, site: { id: 4, home: 'http://sub.localhost:8889' } };
	assert.equal(rewriteLocation('http://sub.localhost:8889/wp-admin/index.php', sub), 'http://admin/sites/4/wp-admin/index.php');
	assert.equal(rewriteLocation('http://sub.localhost:88890/x', sub), 'http://sub.localhost:88890/x');
});

test('filterResponseHeaders drops hop-by-hop headers and those named in Connection, keeps Set-Cookie', () => {
	const out = filterResponseHeaders({ connection: 'x-drop', 'x-drop': '1', 'keep-alive': 'timeout=5', 'transfer-encoding': 'chunked', 'set-cookie': [ 'a=1', 'b=2' ], location: '/x', 'content-type': 'text/plain' });
	assert.deepEqual(out, { 'set-cookie': [ 'a=1', 'b=2' ], location: '/x', 'content-type': 'text/plain' });
});

test('X-WP-Admin-Frame is stripped from forwarded headers', () => {
	assert.deepEqual(filterRequestHeaders({ 'x-wp-admin-frame': '1', cookie: 'a=b' }), { cookie: 'a=b' });
});

test('trailing path information after a PHP file keeps it a screen', () => {
	for ( const p of [ '/wp-admin/edit.php/extra.css', '/wp-admin/edit.php;x.css', '/wp-admin/edit.php?x.css', '/wp-admin/edit.php#x.css', '/wp-admin/edit.php%3Fx.css', '/sites/3/wp-admin/edit.php/x.css' ].map( decodeURIComponent ) ) {
		assert.equal(classify('GET', p, 'document'), 'spa', p);
		assert.equal(classify('GET', p, 'iframe'), 'proxy', p);
	}
	assert.equal(classify('GET', '/wp-admin/admin-ajax.php/x', 'document'), 'proxy');
	assert.equal(classify('GET', '/wp-admin/readme.txt', 'document'), 'proxy');
});

import { isSignOut } from '../server/upstream.mjs';

test( 'isSignOut recognises every way WordPress would route a sign-out', () => {
	const yes = [
		[ 'DELETE', '/wp-json/wp-admin/v1/session', '' ],
		[ 'DELETE', '/wp-json/wp-admin/v1/session/', '' ],
		[ 'DELETE', '/wp-json/WP-Admin/V1/SESSION', '?x=1' ],
		[ 'DELETE', '/sites/3/wp-json/wp-admin/v1/session', '' ],
		[ 'DELETE', '/wp-json/', '?rest_route=/wp-admin/v1/session' ],
		[ 'DELETE', '/sites/2/wp-json', '?rest_route=%2Fwp-admin%2Fv1%2Fsession%2F' ],
		[ 'POST', '/wp-json/wp-admin/v1/session', '?_method=DELETE' ],
		[ 'POST', '/wp-json/wp-admin/v1/session', '?_method=delete' ],
		[ 'POST', '/wp-json/wp-admin/v1/session', '', { 'x-http-method-override': 'DELETE' } ],
		[ 'GET', '/wp-login.php', '?action=logout&_wpnonce=abc' ],
		[ 'GET', '/sites/3/wp-login.php', '?action=logout' ],
	];
	for ( const [ method, pathname, search, headers = {} ] of yes ) {
		assert.equal( isSignOut( method, pathname, search, headers ), true, `${ method } ${ pathname }${ search }` );
	}
	const no = [
		[ 'GET', '/wp-json/wp-admin/v1/session', '' ],
		[ 'POST', '/wp-json/wp-admin/v1/session', '' ],
		[ 'DELETE', '/wp-json/wp-admin/v1/sessions', '' ],
		[ 'DELETE', '/wp-json/wp/v2/posts/1', '' ],
		[ 'DELETE', '/wp-json/x/wp-admin/v1/session', '' ],
		[ 'GET', '/wp-login.php', '?action=login' ],
		[ 'GET', '/wp-login.php', '' ],
	];
	for ( const [ method, pathname, search, headers = {} ] of no ) {
		assert.equal( isSignOut( method, pathname, search, headers ), false, `${ method } ${ pathname }${ search }` );
	}
} );

test( 'changesOwnCapabilities: writes to the users route and the user screens, nothing else', () => {
	for ( const [ method, path, search = '', headers = {} ] of [
		[ 'POST', '/wp-json/wp/v2/users/5' ], [ 'PUT', '/wp-json/wp/v2/users/me' ], [ 'DELETE', '/wp-json/WP/V2/Users/7' ], [ 'PATCH', '/wp-json/wp/v2/users' ],
		[ 'POST', '/sites/3/wp-json/wp/v2/users/2' ], [ 'POST', '/wp-json/', '?rest_route=/wp/v2/users/2' ], [ 'POST', '/index.php', '?rest_route=%2Fwp%2Fv2%2Fusers' ],
		[ 'GET', '/wp-json/wp/v2/users/5', '?_method=POST' ], [ 'GET', '/wp-json/wp/v2/users/5', '', { 'x-http-method-override': 'PUT' } ],
		[ 'POST', '/wp-admin/user-edit.php' ], [ 'POST', '/wp-admin/users.php' ], [ 'POST', '/wp-admin/profile.php' ], [ 'POST', '/wp-admin/network/users.php' ],
		[ 'POST', '/wp-admin/user/profile.php' ], [ 'POST', '/sites/2/wp-admin/Profile.PHP' ],
	] ) {
		assert.equal( changesOwnCapabilities( method, path, search, headers ), true, `${ method } ${ path }${ search }` );
	}
	for ( const [ method, path, search = '' ] of [
		[ 'GET', '/wp-json/wp/v2/users/5' ], [ 'HEAD', '/wp-json/wp/v2/users' ], [ 'GET', '/wp-admin/profile.php' ], [ 'POST', '/wp-json/wp/v2/posts/1' ],
		[ 'POST', '/wp-json/wp/v2/usersx' ], [ 'POST', '/wp-admin/user-new.php' ], [ 'POST', '/wp-admin/admin-ajax.php' ], [ 'DELETE', '/wp-json/wp-admin/v1/session' ],
		[ 'GET', '/wp-json/', '?rest_route=/wp/v2/users/2' ],
	] ) {
		assert.equal( changesOwnCapabilities( method, path, search ), false, `${ method } ${ path }${ search }` );
	}
} );
