import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders } from '../server/upstream.mjs';

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
