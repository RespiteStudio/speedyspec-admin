import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/proxy.mjs';

let upstream, proxy, tmp, siteDir, last, hits = 0, sitesCalls = 0, sitesBody, sitesBodyFor = null, sitesDelay = 0;
// The stub WordPress session route: 200 only for a cookie in `validCookies`, with the session body
// of `sessionBodies` (a value is sent as JSON, a string as is), else a session with no page components.
const GOOD = 'wordpress_logged_in_t=admin%7C1%7Cgood';
// Cookie A may load the General Settings page; B may load no page; C's session body is malformed.
const COOKIE_A = 'wordpress_logged_in_t=alice%7C2%7Cpage';
const COOKIE_B = 'wordpress_logged_in_t=bob%7C3%7Cnone';
const COOKIE_C = 'wordpress_logged_in_t=carol%7C4%7Cbad';
const validCookies = new Set( [ GOOD, COOKIE_A, COOKIE_B, COOKIE_C ] );
const sessionBodies = {
	[ COOKIE_A ]: { user: { id: 2 }, nonce: 'n', components: [ 'core/options-general' ] },
	[ COOKIE_B ]: { user: { id: 3 }, nonce: 'n', components: [] },
	[ COOKIE_C ]: '{"user":{"id":4},"nonce":"n","components":"core/options-general"}',
};
const sessionBody = ( cookie ) => {
	const value = sessionBodies[ cookie ] ?? { user: { id: 1 }, nonce: 'n', components: [] };
	return typeof value === 'string' ? value : JSON.stringify( value );
};
let sessionChecks = 0, lastSessionCheck = null;
const MENU_SOURCE = 'export default { template: `<ul id="adminmenu">MENU-SECRET</ul>` };';
// Files of the test site's page tier (core/options-general) and of another page.
const PAGE_FILES = {
	'contracts/core/options-general.js': 'export default { id: "core/options-general", page: true }; // PAGE-SECRET contract',
	'components/core/options-general.js': 'export default { template: `<form>PAGE-SECRET component</form>` };',
	'components/core/options-general/timezone.js': 'export default { template: `<select>PAGE-SECRET helper</select>` };',
	'components/core/options-general-x.js': 'export default { template: `<p>PAGE-SECRET other page</p>` };',
	'runtime/stray.js': 'export const stray = "PAGE-SECRET stray";',
	'kit/index.js': 'export const kit = "KIT";',
};
const TEST_SHARED = [ '/components/core/menu.js', '/kit/index.js' ];

function listen( server ) {
	return new Promise( ( resolve ) => server.listen( 0, '127.0.0.1', () => resolve( server.address().port ) ) );
}
function close( server ) {
	server.closeAllConnections?.();
	return new Promise( ( resolve ) => server.close( resolve ) );
}
function request( port, { method = 'GET', url = '/', headers = {}, body } = {} ) {
	return new Promise( ( resolve, reject ) => {
		const req = http.request( { host: '127.0.0.1', port, method, path: url, headers, agent: false }, ( res ) => {
			const chunks = [];
			res.on( 'data', ( c ) => chunks.push( c ) );
			res.on( 'end', () => resolve( { status: res.statusCode, headers: res.headers, raw: res.rawHeaders, body: Buffer.concat( chunks ) } ) );
		} );
		req.on( 'error', reject );
		req.end( body );
	} );
}
// Sends a literal request line, which http.request would not allow for an absolute URL.
function rawRequest( port, requestLine, full = false ) {
	return new Promise( ( resolve, reject ) => {
		const sock = net.connect( port, '127.0.0.1' );
		let data = '';
		sock.on( 'data', ( c ) => data += c );
		sock.on( 'end', () => resolve( data ) );
		sock.on( 'error', reject );
		sock.write( full ? requestLine.replace( '\r\n', '\r\nHost: x\r\nConnection: close\r\n' ) : `${requestLine}\r\nHost: x\r\nConnection: close\r\n\r\n` );
	} );
}

before( async () => {
	tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'admin-test-' ) );
	siteDir = path.join( tmp, 'site' );
	fs.mkdirSync( path.join( siteDir, 'assets' ), { recursive: true } );
	fs.writeFileSync( path.join( siteDir, 'index.html' ), '<!doctype html><div id="app"></div>' );
	fs.writeFileSync( path.join( siteDir, 'assets', 'app.js' ), 'export default 1;' );
	fs.writeFileSync( path.join( siteDir, '.secret' ), 'dotfile' );
	fs.mkdirSync( path.join( siteDir, 'components', 'core' ), { recursive: true } );
	fs.writeFileSync( path.join( siteDir, 'components', 'core', 'menu.js' ), MENU_SOURCE );
	fs.writeFileSync( path.join( siteDir, 'public-files.json' ), JSON.stringify( { files: [ '/index.html', '/assets/app.js', '/assets/missing.js' ] } ) );
	fs.writeFileSync( path.join( siteDir, 'shared-files.json' ), JSON.stringify( { files: TEST_SHARED } ) );
	for ( const [ file, source ] of Object.entries( PAGE_FILES ) ) {
		fs.mkdirSync( path.dirname( path.join( siteDir, file ) ), { recursive: true } );
		fs.writeFileSync( path.join( siteDir, file ), source );
	}
	fs.writeFileSync( path.join( tmp, 'outside.txt' ), 'OUTSIDE' );

	upstream = http.createServer( ( req, res ) => {
		const chunks = [];
		req.on( 'data', ( c ) => chunks.push( c ) );
		req.on( 'end', () => {
			if ( /^(?:\/site3)?\/wp-json\/wp-admin\/v1\/session\/?(?:\?|$)/i.test( req.url ) || /rest_route=(?:%2F|\/)wp-admin(?:%2F|\/)v1(?:%2F|\/)session/i.test( req.url ) ) {
				res.setHeader( 'Content-Type', 'application/json' );
				if ( req.method === 'GET' ) {
					sessionChecks++;
					lastSessionCheck = { url: req.url, headers: req.headers };
					res.statusCode = validCookies.has( req.headers.cookie ) ? 200 : 401;
					return res.end( res.statusCode === 200 ? sessionBody( req.headers.cookie ) : '{"code":"rest_not_logged_in"}' );
				}
				// Signing out invalidates the cookie, as WordPress destroys the session token.
				last = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat( chunks ) };
				validCookies.delete( req.headers.cookie );
				return res.end( '{"loggedOut":true}' );
			}
			last = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat( chunks ) };
			if ( req.url.startsWith( '/wp-json/wp-admin/v1/sites' ) ) {
				sitesCalls++;
				res.setHeader( 'Content-Type', 'application/json' );
				const body = sitesBodyFor ? sitesBodyFor( req.headers.cookie ) : sitesBody;
				return setTimeout( () => res.end( body ), sitesDelay );
			}
			hits++;
			if ( req.url.includes( '/slow-redirect' ) ) {
				return setTimeout( () => {
					res.statusCode = 302;
					res.setHeader( 'Location', `http://127.0.0.1:${upstream.address().port}/site3/wp-admin/options-general.php` );
					res.end();
				}, 500 );
			}
			if ( req.url.includes( '/echo' ) ) {
				return res.end( String( last.body.length ) );
			}
			if ( req.url.includes( '/slow' ) ) {
				return; // never answers
			}
			if ( req.url.includes( '/redirect-site' ) ) {
				res.statusCode = 302;
				res.setHeader( 'Location', `http://127.0.0.1:${upstream.address().port}/site3/wp-admin/options-general.php` );
				return res.end();
			}
			if ( req.url.includes( '/cookies' ) ) {
				res.setHeader( 'Set-Cookie', [ 'a=1; HttpOnly', 'b=2; Path=/' ] );
				return res.end( 'ok' );
			}
			if ( req.url.includes( '/redirect-other' ) ) {
				res.statusCode = 302;
				res.setHeader( 'Location', 'https://example.com/a' );
				return res.end();
			}
			if ( req.url.includes( '/redirect' ) ) {
				const upPort = upstream.address().port;
				res.statusCode = 302;
				res.setHeader( 'Location', req.url.includes( 'public' ) ? 'http://public.test:8889/wp-login.php?x=1' : `http://127.0.0.1:${upPort}/wp-login.php?x=1` );
				return res.end();
			}
			if ( req.url.includes( '/boom' ) ) {
				res.statusCode = 503;
				res.setHeader( 'X-Boom', '1' );
				return res.end( 'upstream down' );
			}
			if ( req.url.includes( '/echo' ) ) {
				res.setHeader( 'Content-Type', 'text/plain' );
				return res.end( String( last.body.length ) );
			}
			res.setHeader( 'Content-Type', 'application/json' );
			res.end( '{"ok":true}' );
		} );
	} );
	const upPort = await listen( upstream );
	proxy = createServer( { upstream: `http://127.0.0.1:${upPort}`, publicUrl: 'http://public.test:8889', upstreamHost: `127.0.0.1:${upPort}`, siteDir, sitesNegativeTtlMs: 0 } );
	proxy.port = await listen( proxy );
	proxy.upPort = upPort;
} );

after( async () => {
	await close( proxy );
	await close( upstream );
	fs.rmSync( tmp, { recursive: true, force: true } );
} );

test( 'unreachable upstream yields 502 json', async () => {
	const dead = createServer( { upstream: 'http://127.0.0.1:1', siteDir } );
	const port = await listen( dead );
	const res = await request( port, { url: '/wp-json/' } );
	await close( dead );
	assert.equal( res.status, 502 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_upstream_unreachable' } );
} );

test( 'Location on upstream origin is rewritten to the admin origin', async () => {
	const res = await request( proxy.port, { url: '/wp-json/redirect', headers: { host: 'admin.test:8890' } } );
	assert.equal( res.status, 302 );
	assert.equal( res.headers.location, 'http://admin.test:8890/wp-login.php?x=1' );
} );

test( 'Location on the public WordPress origin is rewritten too', async () => {
	const res = await request( proxy.port, { url: '/wp-json/redirect?public', headers: { host: 'admin.test:8890' } } );
	assert.equal( res.headers.location, 'http://admin.test:8890/wp-login.php?x=1' );
} );

test( 'other Location values are untouched', async () => {
	const res = await request( proxy.port, { url: '/wp-json/redirect-other' } );
	assert.equal( res.headers.location, 'https://example.com/a' );
} );

test( 'client-supplied detached and forwarded headers are replaced', async () => {
	await request( proxy.port, { url: '/wp-json/', headers: {
		host: 'admin.test:8890', 'x-wp-detached-admin': '0', 'x-forwarded-host': 'evil', 'x-forwarded-for': '6.6.6.6', 'x-forwarded-proto': 'https',
	} } );
	assert.equal( last.headers['x-wp-detached-admin'], '1' );
	assert.equal( last.headers['x-forwarded-host'], 'admin.test:8890' );
	assert.equal( last.headers['x-forwarded-proto'], 'http' );
	assert.equal( last.headers['x-forwarded-for'], '127.0.0.1' );
} );

test( 'end-to-end headers pass through and Host is the upstream host', async () => {
	await request( proxy.port, { url: '/wp-json/x?y=1', headers: {
		host: 'admin.test:8890', cookie: 'k=v', origin: 'http://admin.test:8890', 'sec-fetch-site': 'same-origin',
		'x-wp-nonce': 'abc', authorization: 'Bearer t', referer: 'http://admin.test:8890/a', connection: 'close',
	} } );
	assert.equal( last.url, '/wp-json/x?y=1' );
	assert.equal( last.headers.host, `127.0.0.1:${proxy.upPort}` );
	for ( const [ k, v ] of Object.entries( { cookie: 'k=v', origin: 'http://admin.test:8890', 'sec-fetch-site': 'same-origin', 'x-wp-nonce': 'abc', authorization: 'Bearer t', referer: 'http://admin.test:8890/a' } ) ) {
		assert.equal( last.headers[ k ], v, k );
	}
} );

test( 'Host defaults to the upstream host, or to the public host when WP_PUBLIC_URL is set', async () => {
	const plain = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir } );
	const port = await listen( plain );
	await request( port, { url: '/wp-json/', headers: { host: 'admin.test' } } );
	await close( plain );
	assert.equal( last.headers.host, `127.0.0.1:${proxy.upPort}` );
	const pub = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, publicUrl: 'http://localhost:8889', siteDir } );
	const port2 = await listen( pub );
	await request( port2, { url: '/wp-json/' } );
	await close( pub );
	assert.equal( last.headers.host, 'localhost:8889' );
} );

test( 'multiple Set-Cookie headers survive as separate headers', async () => {
	const res = await request( proxy.port, { url: '/wp-json/cookies' } );
	assert.deepEqual( res.headers['set-cookie'], [ 'a=1; HttpOnly', 'b=2; Path=/' ] );
} );

test( 'a streamed ~1 MB POST body arrives intact', async () => {
	const body = Buffer.alloc( 1024 * 1024 + 7, 'x' );
	body[ 500000 ] = 0x7a;
	const res = await request( proxy.port, { method: 'POST', url: '/wp-admin/admin-ajax.php', headers: { 'content-type': 'application/octet-stream', 'content-length': body.length }, body } );
	assert.equal( res.status, 200 );
	assert.equal( last.method, 'POST' );
	assert.equal( last.body.length, body.length );
	assert.ok( last.body.equals( body ) );
} );

test( 'upstream 5xx passes through unchanged', async () => {
	const res = await request( proxy.port, { url: '/wp-json/boom' } );
	assert.equal( res.status, 503 );
	assert.equal( res.headers['x-boom'], '1' );
	assert.equal( res.body.toString(), 'upstream down' );
} );

test( 'SPA fallback serves index.html with no-cache', async () => {
	const res = await request( proxy.port, { url: '/wp-admin/', headers: { 'sec-fetch-dest': 'document' } } );
	assert.equal( res.status, 200 );
	assert.equal( res.headers['cache-control'], 'no-cache' );
	assert.match( res.headers['content-type'], /text\/html/ );
	assert.match( res.body.toString(), /id="app"/ );
} );

test( 'top-level navigation to a wp-admin screen is the SPA', async () => {
	const res = await request( proxy.port, { url: '/wp-admin/edit.php', headers: { 'sec-fetch-dest': 'document' } } );
	assert.equal( res.headers['cache-control'], 'no-cache' );
	assert.match( res.body.toString(), /id="app"/ );
} );

test( 'iframe navigation to a wp-admin screen is proxied', async () => {
	await request( proxy.port, { url: '/wp-admin/edit.php', headers: { 'sec-fetch-dest': 'iframe' } } );
	assert.equal( last.url, '/wp-admin/edit.php' );
} );

test( 'wp-cron and xmlrpc answer 404 and never reach WordPress', async () => {
	last = null;
	assert.equal( ( await request( proxy.port, { url: '/wp-cron.php' } ) ).status, 404 );
	assert.equal( ( await request( proxy.port, { method: 'POST', url: '/xmlrpc.php' } ) ).status, 404 );
	assert.equal( last, null );
} );

test( 'static files get ETag, Last-Modified and text/javascript for .js', async () => {
	const res = await request( proxy.port, { url: '/assets/app.js' } );
	assert.equal( res.status, 200 );
	assert.match( res.headers['content-type'], /^text\/javascript/ );
	assert.ok( res.headers.etag );
	assert.ok( res.headers['last-modified'] );
	const again = await request( proxy.port, { url: '/assets/app.js', headers: { 'if-none-match': res.headers.etag } } );
	assert.equal( again.status, 304 );
} );

test( 'path traversal never serves files outside site/', async () => {
	for ( const url of [ '/../outside.txt', '/%2e%2e/outside.txt', '/assets/..%2f..%2foutside.txt', '/%2e%2e%2foutside.txt', '/assets/%00.js', '/..%5coutside.txt' ] ) {
		const res = await request( proxy.port, { url } );
		assert.equal( res.status, 400, url );
		assert.ok( ! res.body.toString().includes( 'OUTSIDE' ), url );
	}
	// A dotfile is not public: anonymous callers get the same 401 as for any protected path.
	for ( const url of [ '/.secret', '/%2esecret' ] ) {
		const res = await request( proxy.port, { url } );
		assert.equal( res.status, 401, url );
		assert.ok( ! res.body.toString().includes( 'dotfile' ), url );
		const signedIn = await request( proxy.port, { url, headers: { cookie: GOOD } } );
		assert.equal( signedIn.status, 403, url );
		assert.ok( ! signedIn.body.toString().includes( 'dotfile' ), url );
	}
} );

test( 'a symlink inside site/ pointing outside is not followed', async () => {
	fs.symlinkSync( path.join( tmp, 'outside.txt' ), path.join( siteDir, 'link.txt' ) );
	const res = await request( proxy.port, { url: '/link.txt' } );
	assert.equal( res.status, 401 );
	assert.ok( ! res.body.toString().includes( 'OUTSIDE' ) );
	const signedIn = await request( proxy.port, { url: '/link.txt', headers: { cookie: GOOD } } );
	assert.equal( signedIn.status, 403 );
	assert.ok( ! signedIn.body.toString().includes( 'OUTSIDE' ) );
} );

test( 'a removed file is a 401 anonymously and a 404 when signed in and allowed, not a crash', async () => {
	const gone = path.join( siteDir, 'components', 'core', 'options-general', 'gone.js' );
	fs.writeFileSync( gone, 'x' );
	fs.rmSync( gone );
	assert.equal( ( await request( proxy.port, { url: '/components/core/options-general/gone.js' } ) ).status, 401 );
	const res = await request( proxy.port, { url: '/components/core/options-general/gone.js', headers: { cookie: COOKIE_A } } );
	assert.equal( res.status, 404 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_not_found' } );
} );

test( 'a directly requested /index.html is no-cache', async () => {
	const res = await request( proxy.port, { url: '/index.html' } );
	assert.equal( res.headers['cache-control'], 'no-cache' );
} );

test( 'the request cannot choose another upstream host', async () => {
	last = null;
	hits = 0;
	for ( const url of [ '//evil.example/x', '/\\evil.example', '/wp-json/..//evil.example' ] ) {
		assert.equal( ( await request( proxy.port, { url } ) ).status, 400, url );
	}
	const raw = await rawRequest( proxy.port, 'GET http://evil.example/wp-json/ HTTP/1.1' );
	assert.match( raw, /^HTTP\/1\.1 400/ );
	assert.equal( hits, 0 );
	assert.equal( last, null );
	// A hostile Host header does not change where the request goes either.
	await request( proxy.port, { url: '/wp-json/', headers: { host: 'evil.example' } } );
	assert.equal( last.headers.host, `127.0.0.1:${proxy.upPort}` );
} );

test( 'unknown site id gives 404 json after one refetch; known id is routed', async () => {
	sitesBody = JSON.stringify( [ { id: 3, name: 'Three', home: `http://127.0.0.1:${proxy.upPort}/site3`, restRoot: '' } ] );
	sitesCalls = 0;
	const miss = await request( proxy.port, { url: '/sites/9/wp-admin/admin-ajax.php', headers: { cookie: 'c=1' } } );
	assert.equal( miss.status, 404 );
	assert.deepEqual( JSON.parse( miss.body ), { code: 'admin_unknown_site' } );
	assert.ok( sitesCalls >= 1 );
	assert.equal( last.headers.cookie, 'c=1' );
	const hit = await request( proxy.port, { url: '/sites/3/wp-admin/admin-ajax.php?a=1', headers: { cookie: 'c=1' } } );
	assert.equal( hit.status, 200 );
	assert.equal( last.url, '/site3/wp-admin/admin-ajax.php?a=1' );
} );

test( 'a single-site install never requests the sites map', async () => {
	sitesCalls = 0;
	await request( proxy.port, { url: '/wp-json/' } );
	await request( proxy.port, { url: '/posts' } );
	assert.equal( sitesCalls, 0 );
} );

test( 'createServer requires an upstream', () => {
	assert.throws( () => createServer( {} ), /WP_UPSTREAM/ );
} );

test( 'a body on GET or HEAD is rejected and a smuggled second request never reaches upstream', async () => {
	hits = 0;
	const smuggle = 'GET /xmlrpc.php HTTP/1.1\r\nHost: x\r\nX-WP-Detached-Admin: 0\r\n\r\n';
	const chunk = `${smuggle.length.toString( 16 )}\r\n${smuggle}\r\n0\r\n\r\n`;
	const raw = await rawRequest( proxy.port, 'GET /wp-json/ HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n' + chunk, true );
	assert.match( raw, /^HTTP\/1\.1 400/ );
	assert.equal( ( raw.match( /HTTP\/1\.1 /g ) || [] ).length, 1 );
	assert.equal( hits, 0 );
	const head = await rawRequest( proxy.port, 'HEAD /wp-json/ HTTP/1.1\r\nContent-Length: 3\r\n\r\nabc', true );
	assert.match( head, /^HTTP\/1\.1 400/ );
	assert.equal( hits, 0 );
} );

test( 'a chunked DELETE reaches upstream as exactly one framed request', async () => {
	hits = 0;
	const raw = await rawRequest( proxy.port, 'DELETE /wp-json/wp/v2/posts/1 HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n', true );
	assert.match( raw, /^HTTP\/1\.1 200/ );
	assert.equal( hits, 1 );
	assert.equal( last.method, 'DELETE' );
	assert.equal( last.body.toString(), 'hello' );
	assert.equal( last.headers['transfer-encoding'], 'chunked' );
} );

test( 'Content-Length together with Transfer-Encoding is rejected', async () => {
	hits = 0;
	const raw = await rawRequest( proxy.port, 'POST /wp-json/ HTTP/1.1\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n', true );
	assert.match( raw, /^HTTP\/1\.1 400/ );
	assert.equal( hits, 0 );
} );

test( 'classification uses the decoded path', async () => {
	hits = 0;
	const doc = { 'sec-fetch-dest': 'document' };
	for ( const url of [ '/wp-admin/edit%2ephp', '/wp-admin/EDIT%2EPHP', '/wp-admin%2fedit.php' ] ) {
		const res = await request( proxy.port, { url, headers: doc } );
		assert.equal( res.status, 200, url );
		assert.match( res.body.toString(), /id="app"/, url );
	}
	// An encoded leading slash would make the path start with // once decoded.
	assert.equal( ( await request( proxy.port, { url: '/%2fwp-admin%2fedit.php', headers: doc } ) ).status, 400 );
	assert.equal( ( await request( proxy.port, { url: '/xmlrpc%2ephp' } ) ).status, 404 );
	assert.equal( ( await request( proxy.port, { url: '/wp-cron%2Ephp' } ) ).status, 404 );
	assert.equal( ( await request( proxy.port, { url: '/wp-admin/edit%252ephp', headers: doc } ) ).status, 400 );
	assert.equal( hits, 0 );
} );

test( 'site-prefixed REST and login paths are proxied', async () => {
	sitesBody = JSON.stringify( [ { id: 3, name: 'Three', home: `http://127.0.0.1:${proxy.upPort}/site3` } ] );
	const res = await request( proxy.port, { url: '/sites/3/wp-json/', headers: { cookie: 'c=1' } } );
	assert.equal( res.status, 200 );
	assert.equal( last.url, '/site3/wp-json/' );
} );

test( 'a subsite Location keeps the /sites/{id} prefix', async () => {
	sitesBody = JSON.stringify( [ { id: 3, name: 'Three', home: `http://127.0.0.1:${proxy.upPort}/site3` } ] );
	const res = await request( proxy.port, { method: 'POST', url: '/sites/3/wp-admin/redirect-site.php', headers: { cookie: 'c=1', host: 'admin.test:8890', 'content-length': '0' } } );
	assert.equal( res.status, 302 );
	assert.equal( res.headers.location, 'http://admin.test:8890/sites/3/wp-admin/options-general.php' );
} );

test( 'upstream timeout yields 504 json', async () => {
	const slow = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, timeoutMs: 100 } );
	const port = await listen( slow );
	const res = await request( port, { url: '/wp-json/slow' } );
	await close( slow );
	assert.equal( res.status, 504 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_upstream_timeout' } );
} );

test( 'concurrent unknown-site requests share one sites call; anonymous ones make none', async () => {
	sitesBody = '[]';
	sitesDelay = 80;
	sitesCalls = 0;
	const results = await Promise.all( Array.from( { length: 5 }, () => request( proxy.port, { url: '/sites/9/wp-admin/admin-ajax.php', headers: { cookie: 'c=1' } } ) ) );
	sitesDelay = 0;
	assert.ok( results.every( ( r ) => r.status === 404 ) );
	assert.equal( sitesCalls, 1 );
	sitesCalls = 0;
	const anon = await request( proxy.port, { url: '/sites/9/wp-admin/admin-ajax.php' } );
	assert.equal( anon.status, 404 );
	assert.deepEqual( JSON.parse( anon.body ), { code: 'admin_unknown_site' } );
	assert.equal( sitesCalls, 0 );
} );

test( 'sites map: cached until the TTL, refetched on an unknown id, merged, unknown ids cached briefly', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, sitesTtlMs: 150, sitesNegativeTtlMs: 0 } );
	const port = await listen( server );
	const home = ( n ) => `http://127.0.0.1:${proxy.upPort}/site${n}`;
	const get = ( id ) => request( port, { url: `/sites/${id}/wp-admin/admin-ajax.php`, headers: { cookie: 'c=1', 'x-wp-nonce': 'n' } } );
	sitesCalls = 0;
	sitesBody = JSON.stringify( [ { id: 3, home: home( 3 ) } ] );
	assert.equal( ( await get( 3 ) ).status, 200 );
	assert.equal( ( await get( 3 ) ).status, 200 );
	assert.equal( sitesCalls, 1 );
	// Another user's list lacks site 3 but must not evict it; a new id forces a refetch.
	sitesBody = JSON.stringify( [ { id: 4, home: home( 4 ) } ] );
	assert.equal( ( await get( 4 ) ).status, 200 );
	assert.equal( sitesCalls, 2 );
	assert.equal( ( await get( 3 ) ).status, 200 );
	assert.equal( sitesCalls, 2 );
	await new Promise( ( r ) => setTimeout( r, 200 ) );
	assert.equal( ( await get( 4 ) ).status, 200 );
	assert.equal( sitesCalls, 3 );
	await close( server );

	const neg = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir } );
	const port2 = await listen( neg );
	sitesCalls = 0;
	sitesBody = '[]';
	for ( let i = 0; i < 2; i++ ) {
		assert.equal( ( await request( port2, { url: '/sites/9/wp-admin/admin-ajax.php', headers: { cookie: 'c=1' } } ) ).status, 404 );
	}
	await close( neg );
	assert.equal( sitesCalls, 1 );
} );

test( 'ADMIN_PUBLIC_URL fixes the admin origin regardless of Host', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, adminPublicUrl: 'http://admin.example:8890', siteDir } );
	const port = await listen( server );
	const res = await request( port, { url: '/wp-json/redirect', headers: { host: 'evil' } } );
	await close( server );
	assert.equal( res.headers.location, 'http://admin.example:8890/wp-login.php?x=1' );
	assert.equal( last.headers['x-forwarded-host'], 'admin.example:8890' );
	assert.equal( last.headers['x-forwarded-proto'], 'http' );
} );

test( 'X-WP-Admin-Frame is not forwarded', async () => {
	await request( proxy.port, { url: '/wp-admin/edit.php', headers: { 'x-wp-admin-frame': '1' } } );
	assert.equal( last.url, '/wp-admin/edit.php' );
	assert.equal( last.headers['x-wp-admin-frame'], undefined );
} );

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
const home3 = () => `http://127.0.0.1:${proxy.upPort}/site3`;

test( 'an expired site entry cannot crash a pending response (regression)', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, sitesTtlMs: 200, sitesNegativeTtlMs: 0 } );
	const port = await listen( server );
	sitesBody = JSON.stringify( [ { id: 3, home: home3() } ] );
	assert.equal( ( await request( port, { url: '/sites/3/wp-admin/admin-ajax.php', headers: { cookie: 'c=1' } } ) ).status, 200 );
	const slow = request( port, { url: '/sites/3/wp-admin/slow-redirect.php', headers: { 'sec-fetch-dest': 'iframe', host: 'admin.test:8890' } } );
	await sleep( 300 );
	// A nonce-bearing request refreshes the now-expired entry (here to nothing) while the first is still pending.
	sitesBody = '[]';
	assert.equal( ( await request( port, { url: '/sites/3/wp-json/', headers: { cookie: 'c=1', 'x-wp-nonce': 'n' } } ) ).status, 200 );
	const res = await slow;
	assert.equal( res.status, 302 );
	assert.equal( res.headers.location, 'http://admin.test:8890/sites/3/wp-admin/options-general.php' );
	assert.equal( ( await request( port, { url: '/wp-json/' } ) ).status, 200 );
	await close( server );
} );

test( 'a handler error answers 500 json and the server keeps answering', async () => {
	const errors = [];
	const config = { upstream: `http://127.0.0.1:${proxy.upPort}`, logger: ( e ) => errors.push( e ) };
	Object.defineProperty( config, 'siteDir', { get() { throw new Error( 'boom' ); } } );
	const server = createServer( config );
	const port = await listen( server );
	const res = await request( port, { url: '/posts' } );
	assert.equal( res.status, 500 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_proxy_error' } );
	assert.equal( errors.length, 1 );
	assert.equal( ( await request( port, { url: '/wp-json/' } ) ).status, 200 );
	await close( server );
} );

test( 'a slow but steady upload longer than the timeout in total succeeds', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, timeoutMs: 300 } );
	const port = await listen( server );
	const res = await new Promise( ( resolve, reject ) => {
		const req = http.request( { host: '127.0.0.1', port, method: 'POST', path: '/wp-json/echo', headers: { 'content-length': 6 }, agent: false }, ( r ) => {
			const chunks = [];
			r.on( 'data', ( c ) => chunks.push( c ) );
			r.on( 'end', () => resolve( { status: r.statusCode, body: Buffer.concat( chunks ).toString() } ) );
		} );
		req.on( 'error', reject );
		( async () => {
			for ( let i = 0; i < 6; i++ ) {
				req.write( 'x' );
				await sleep( 120 );
			}
			req.end();
		} )();
	} );
	await close( server );
	assert.equal( res.status, 200 );
	assert.equal( res.body, '6' );
} );

test( 'an upstream that takes the body and never answers gives 504', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, timeoutMs: 150 } );
	const port = await listen( server );
	const res = await request( port, { method: 'POST', url: '/wp-json/slow', headers: { 'content-length': 3 }, body: 'abc' } );
	await close( server );
	assert.equal( res.status, 504 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_upstream_timeout' } );
} );

test( 'a client that stalls mid-upload is cut off with 408 json', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, timeoutMs: 150 } );
	const port = await listen( server );
	const raw = await new Promise( ( resolve, reject ) => {
		const sock = net.connect( port, '127.0.0.1' );
		let data = '';
		sock.on( 'data', ( c ) => data += c );
		sock.on( 'close', () => resolve( data ) );
		sock.on( 'error', reject );
		sock.write( 'POST /wp-json/echo HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\nabcdefghij' );
	} );
	await close( server );
	assert.match( raw, /^HTTP\/1\.1 408/ );
	assert.match( raw, /admin_request_timeout/ );
} );

test( 'an expired site entry keeps serving cookie-only requests; only nonce or Authorization requests refresh it', async ( t ) => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, sitesTtlMs: 100, sitesNegativeTtlMs: 0 } );
	t.after( () => close( server ) );
	const port = await listen( server );
	sitesBody = JSON.stringify( [ { id: 3, home: home3() } ] );
	sitesCalls = 0;
	const withNonce = { cookie: 'c=1', 'x-wp-nonce': 'n' };
	assert.equal( ( await request( port, { url: '/sites/3/wp-json/wp/v2/x', headers: withNonce } ) ).status, 200 );
	assert.equal( sitesCalls, 1 );
	await sleep( 150 );
	// WordPress refuses the sites route without a nonce: a refresh by a cookie-only request would lose the site.
	sitesBody = '{"code":"rest_cookie_invalid_nonce"}';
	const frame = await request( port, { url: '/sites/3/wp-admin/options.php', headers: { cookie: 'c=1', 'sec-fetch-dest': 'iframe' } } );
	assert.equal( frame.status, 200 );
	assert.equal( last.url, '/site3/wp-admin/options.php' );
	const post = await request( port, { method: 'POST', url: '/sites/3/wp-admin/options.php', headers: { cookie: 'c=1', 'content-length': '3' }, body: 'a=1' } );
	assert.equal( post.status, 200 );
	assert.equal( last.method, 'POST' );
	assert.equal( sitesCalls, 1 );
	// A nonce-bearing request refreshes; a failed refresh keeps the stale entry.
	assert.equal( ( await request( port, { url: '/sites/3/wp-json/wp/v2/x', headers: withNonce } ) ).status, 200 );
	assert.equal( sitesCalls, 2 );
	assert.equal( ( await request( port, { url: '/sites/3/wp-json/wp/v2/x', headers: { authorization: 'Basic eDp5' } } ) ).status, 200 );
	assert.equal( sitesCalls, 3 );
	// A successful refresh replaces the home.
	sitesBody = JSON.stringify( [ { id: 3, home: `http://127.0.0.1:${proxy.upPort}/moved3` } ] );
	await request( port, { url: '/sites/3/wp-json/wp/v2/x', headers: withNonce } );
	await request( port, { url: '/sites/3/wp-json/wp/v2/y', headers: withNonce } );
	assert.equal( last.url, '/moved3/wp-json/wp/v2/y' );
} );

test( 'site entries are validated before they are cached: a bad id or home is never routed to', async ( t ) => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, sitesNegativeTtlMs: 0 } );
	t.after( () => close( server ) );
	const port = await listen( server );
	sitesBody = JSON.stringify( [
		{ id: 3, home: home3() },
		{ id: 'x', home: home3() },
		{ id: 0, home: home3() },
		{ id: 5.5, home: home3() },
		{ id: 6, home: 'javascript:alert(1)' },
		{ id: 7, home: 'not a url' },
		{ id: 8, home: 'http://user:pass@127.0.0.1/site8' },
		{ id: 9 },
		{ id: 10, home: [ 'http://127.0.0.1/' ] },
		null,
	] );
	const get = ( id ) => request( port, { url: `/sites/${id}/wp-admin/admin-ajax.php`, headers: { cookie: 'c=1', 'x-wp-nonce': 'n' } } );
	assert.equal( ( await get( 3 ) ).status, 200 );
	for ( const id of [ 0, 6, 7, 8, 9, 10 ] ) {
		const res = await get( id );
		assert.equal( res.status, 404, String( id ) );
		assert.deepEqual( JSON.parse( res.body ), { code: 'admin_unknown_site' } );
	}
} );

test( 'sites lookups and unknown ids are per credential', async () => {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir } );
	const port = await listen( server );
	sitesBodyFor = ( cookie ) => ( cookie === 'u=b' ? JSON.stringify( [ { id: 3, home: home3() } ] ) : '[]' );
	sitesDelay = 60;
	sitesCalls = 0;
	const get = ( cookie ) => request( port, { url: '/sites/3/wp-admin/admin-ajax.php', headers: { cookie } } );
	const [ a, b ] = await Promise.all( [ get( 'u=a' ), get( 'u=b' ) ] );
	sitesDelay = 0;
	sitesBodyFor = null;
	await close( server );
	assert.equal( a.status, 404 );
	assert.equal( b.status, 200 );
	assert.equal( sitesCalls, 2 );
} );

test( 'a site prefix that is only a prefix once decoded is rejected', async () => {
	hits = 0;
	for ( const url of [ '/sites/%33/wp-json/', '/sites/3%2fwp-json/', '/%73ites/3/wp-json/' ] ) {
		assert.equal( ( await request( proxy.port, { url, headers: { cookie: 'c=1' } } ) ).status, 400, url );
	}
	assert.equal( hits, 0 );
} );

test( 'trailing path information after a screen still makes it a screen', async () => {
	hits = 0;
	for ( const url of [ '/wp-admin/edit.php/extra.css', '/wp-admin/edit.php;x.css', '/wp-admin/edit.php%3Fx.css' ] ) {
		const res = await request( proxy.port, { url, headers: { 'sec-fetch-dest': 'document' } } );
		assert.equal( res.status, 200, url );
		assert.match( res.body.toString(), /id="app"/, url );
	}
	assert.equal( hits, 0 );
} );

test( 'X-Forwarded-For and -Proto are overwritten unless TRUST_PROXY is set', async () => {
	const headers = { host: 'admin.test', 'x-forwarded-for': '1.2.3.4', 'x-forwarded-proto': 'https' };
	await request( proxy.port, { url: '/wp-json/', headers } );
	assert.equal( last.headers['x-forwarded-for'], '127.0.0.1' );
	assert.equal( last.headers['x-forwarded-proto'], 'http' );
	const trusting = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, siteDir, trustProxy: true } );
	const port = await listen( trusting );
	await request( port, { url: '/wp-json/', headers } );
	await close( trusting );
	assert.equal( last.headers['x-forwarded-for'], '1.2.3.4, 127.0.0.1' );
	assert.equal( last.headers['x-forwarded-proto'], 'https' );
} );

// --- Unauthorized by default: the static site is gated on WordPress's login cookie. ---

const UNAUTHORIZED = { code: 'admin_not_authenticated' };
const realSiteDir = new URL( '../site', import.meta.url ).pathname;

const FORBIDDEN = { code: 'admin_forbidden' };

function assertForbidden( res, label ) {
	assert.equal( res.status, 403, label );
	assert.equal( res.headers[ 'content-type' ], 'application/json; charset=utf-8', label );
	assert.equal( res.headers[ 'cache-control' ], 'no-store', label );
	assert.equal( res.headers.etag, undefined, label );
	assert.equal( res.headers[ 'last-modified' ], undefined, label );
	assert.equal( res.headers.vary, undefined, label );
	assert.ok( ! res.body.toString().includes( 'SECRET' ), label );
	if ( res.body.length > 0 ) {
		assert.deepEqual( JSON.parse( res.body ), FORBIDDEN, label );
	}
}

function assertUnauthorized( res, label ) {
	assert.equal( res.status, 401, label );
	assert.match( res.headers[ 'content-type' ], /^application\/json/, label );
	assert.equal( res.headers[ 'cache-control' ], 'no-store', label );
	assert.equal( res.headers.etag, undefined, label );
	assert.equal( res.headers[ 'last-modified' ], undefined, label );
	if ( res.body.length > 0 ) {
		assert.deepEqual( JSON.parse( res.body ), UNAUTHORIZED, label );
	}
}

/** Header names and values that may differ between two otherwise identical answers. */
const comparable = ( res ) => {
	const { date, ...rest } = res.headers;
	return { status: res.status, headers: rest, body: res.body.toString() };
};

async function withServer( config, fn ) {
	const server = createServer( { upstream: `http://127.0.0.1:${proxy.upPort}`, upstreamHost: `127.0.0.1:${proxy.upPort}`, ...config } );
	const port = await listen( server );
	try {
		return await fn( port );
	} finally {
		await close( server );
	}
}

test( 'an anonymous request for a protected file is 401 json, no-store, without its content', async () => {
	sessionChecks = 0;
	const res = await request( proxy.port, { url: '/components/core/menu.js' } );
	assertUnauthorized( res );
	assert.deepEqual( JSON.parse( res.body ), UNAUTHORIZED );
	assert.ok( ! res.body.toString().includes( 'MENU-SECRET' ) );
	assert.equal( sessionChecks, 0 );
} );

test( 'a protected path that does not exist gets the very same 401', async () => {
	const exists = await request( proxy.port, { url: '/components/core/menu.js' } );
	for ( const url of [ '/components/core/does-not-exist.js', '/posts/12', '/public-files.json', '/nope/' ] ) {
		const missing = await request( proxy.port, { url } );
		assertUnauthorized( missing, url );
		assert.deepEqual( comparable( missing ), comparable( exists ), url );
	}
} );

test( 'a cookie WordPress accepts gets the file, private and revalidated', async () => {
	const res = await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	assert.equal( res.status, 200 );
	assert.equal( res.body.toString(), MENU_SOURCE );
	assert.equal( res.headers[ 'cache-control' ], 'private, no-cache' );
	assert.equal( res.headers.vary, 'Cookie' );
	assert.ok( res.headers.etag );
	assert.match( res.headers[ 'content-type' ], /^text\/javascript/ );
} );

test( 'a missing file is 404 only for a page the user may load; any other missing path is the 403', async () => {
	const res = await request( proxy.port, { url: '/components/core/options-general/does-not-exist.js', headers: { cookie: COOKIE_A } } );
	assert.equal( res.status, 404 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_not_found' } );
	for ( const url of [ '/components/core/does-not-exist.js', '/runtime/does-not-exist.js', '/nope/x.js' ] ) {
		assertForbidden( await request( proxy.port, { url, headers: { cookie: COOKIE_A } } ), url );
	}
} );

test( 'a cookie WordPress rejects is 401, and the rejection is not cached', async () => {
	sessionChecks = 0;
	for ( let i = 0; i < 2; i++ ) {
		const res = await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: 'wordpress_logged_in_t=forged' } } );
		assertUnauthorized( res );
		assert.ok( ! res.body.toString().includes( 'MENU-SECRET' ) );
	}
	assert.equal( sessionChecks, 2 );
} );

test( 'the verification request carries only the cookie, to the main upstream with the usual proxy headers', async () => {
	await withServer( { siteDir }, async ( port ) => {
		lastSessionCheck = null;
		await request( port, { url: '/components/core/menu.js', headers: {
			host: 'admin.test:8890', cookie: GOOD, origin: 'http://evil.example', referer: 'http://evil.example/x',
			'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script', 'x-wp-nonce': 'abc', authorization: 'Basic YTpi',
		} } );
		assert.ok( lastSessionCheck );
		const h = lastSessionCheck.headers;
		assert.equal( lastSessionCheck.url, '/wp-json/wp-admin/v1/session' );
		assert.equal( h.cookie, GOOD );
		assert.equal( h.host, `127.0.0.1:${proxy.upPort}` );
		assert.equal( h[ 'x-wp-detached-admin' ], '1' );
		assert.equal( h[ 'x-forwarded-host' ], 'admin.test:8890' );
		assert.equal( h[ 'x-forwarded-proto' ], 'http' );
		assert.equal( h[ 'x-forwarded-for' ], '127.0.0.1' );
		for ( const name of [ 'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'x-wp-nonce', 'authorization' ] ) {
			assert.equal( h[ name ], undefined, name );
		}
	} );
} );

test( 'positive answers are cached: a second request makes no upstream check', async () => {
	await withServer( { siteDir }, async ( port ) => {
		sessionChecks = 0;
		await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
		await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
		assert.equal( sessionChecks, 1 );
	} );
} );

test( 'every file on the real public list loads anonymously without any upstream check', async () => {
	const list = JSON.parse( fs.readFileSync( path.join( realSiteDir, 'public-files.json' ) ) ).files;
	assert.ok( list.includes( '/index.html' ) );
	await withServer( { siteDir: realSiteDir }, async ( port ) => {
		sessionChecks = 0;
		for ( const url of list ) {
			const res = await request( port, { url } );
			assert.equal( res.status, 200, url );
			assert.ok( res.body.length > 0, url );
		}
		assert.equal( sessionChecks, 0 );
		// And the protected entry point is not public.
		assertUnauthorized( await request( port, { url: '/runtime/protected.js' } ) );
	} );
} );

test( 'the shell document is public for /, /index.html and every admin navigation', async () => {
	sessionChecks = 0;
	const doc = { 'sec-fetch-dest': 'document' };
	for ( const url of [ '/', '/index.html', '/wp-admin', '/wp-admin/', '/wp-admin/edit.php', '/wp-admin/options-general.php?x=1', '/sites/3/wp-admin/', '/wp-admin/network/' ] ) {
		const res = await request( proxy.port, { url, headers: doc } );
		assert.equal( res.status, 200, url );
		assert.match( res.body.toString(), /id="app"/, url );
		assert.equal( res.headers[ 'cache-control' ], 'no-cache', url );
	}
	assert.equal( sessionChecks, 0 );
} );

test( 'a public file that is listed but missing is 404, not the shell', async () => {
	const res = await request( proxy.port, { url: '/assets/missing.js' } );
	assert.equal( res.status, 404 );
	assert.deepEqual( JSON.parse( res.body ), { code: 'admin_not_found' } );
} );

test( 'HEAD follows the same rule', async () => {
	const anon = await request( proxy.port, { method: 'HEAD', url: '/components/core/menu.js' } );
	assertUnauthorized( anon );
	assert.equal( anon.body.length, 0 );
	const missing = await request( proxy.port, { method: 'HEAD', url: '/components/core/does-not-exist.js' } );
	assert.deepEqual( comparable( missing ), comparable( anon ) );
	const signedIn = await request( proxy.port, { method: 'HEAD', url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	assert.equal( signedIn.status, 200 );
	assert.equal( signedIn.body.length, 0 );
	assert.equal( signedIn.headers[ 'cache-control' ], 'private, no-cache' );
	assert.equal( signedIn.headers.vary, 'Cookie' );
	assert.equal( Number( signedIn.headers[ 'content-length' ] ), MENU_SOURCE.length );
	assert.equal( ( await request( proxy.port, { method: 'HEAD', url: '/assets/app.js' } ) ).status, 200 );
} );

test( 'a conditional request must pass the gate before it is answered 304', async () => {
	const first = await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	const etag = first.headers.etag;
	const lastModified = first.headers[ 'last-modified' ];
	assertUnauthorized( await request( proxy.port, { url: '/components/core/menu.js', headers: { 'if-none-match': etag } } ) );
	assertUnauthorized( await request( proxy.port, { url: '/components/core/menu.js', headers: { 'if-modified-since': lastModified } } ) );
	assertUnauthorized( await request( proxy.port, { url: '/components/core/menu.js', headers: { 'if-none-match': etag, cookie: 'wordpress_logged_in_t=forged' } } ) );
	const again = await request( proxy.port, { url: '/components/core/menu.js', headers: { 'if-none-match': etag, cookie: GOOD } } );
	assert.equal( again.status, 304 );
	assert.equal( again.headers[ 'cache-control' ], 'private, no-cache' );
	assert.equal( again.headers.vary, 'Cookie' );
} );

test( 'no encoded, double-encoded, mixed-case or otherwise varied path returns protected content anonymously', async () => {
	const variants = [
		'/components/core/menu%2Ejs', '/components/core/menu%2ejs', '/components%2Fcore%2Fmenu.js', '/%63omponents/core/menu.js',
		'/components/core/menu%252Ejs', '/components%252Fcore%252Fmenu.js', '/COMPONENTS/core/menu.js', '/components/core/MENU.JS',
		'/Components/Core/Menu.js', '/components/core/menu.js/', '/components//core/menu.js', '/components/core//menu.js',
		'/components/core/./menu.js', '/./components/core/menu.js', '/components/core/menu.js?x=1', '/components/core/menu.js;x',
		'/components/core/menu.js%3Fx', '/components/core/menu.js%23x', '/sites/1/components/core/menu.js', '/sites/1/index.html',
		'/assets/../components/core/menu.js', '/assets/%2e%2e/components/core/menu.js', '/index.html/../components/core/menu.js',
		'/components/core/menu.js%00', '/components/core/menu.js%2500', '/components\\core\\menu.js', '/components/core/menu.js%20',
		'/components/core/menu.js.', '/components/core/menu.js::$DATA', '/assets/app.js/../../components/core/menu.js',
		'/wp-admin/../components/core/menu.js', '/%2Fcomponents/core/menu.js', '/components/core/menu.j%73',
	];
	sessionChecks = 0;
	for ( const url of variants ) {
		for ( const method of [ 'GET', 'HEAD' ] ) {
			const res = await request( proxy.port, { method, url } );
			assert.ok( ! res.body.toString().includes( 'MENU-SECRET' ), `${ method } ${ url }` );
			assert.ok( [ 400, 401 ].includes( res.status ), `${ method } ${ url }: ${ res.status }` );
			if ( res.status === 401 ) {
				assertUnauthorized( res, `${ method } ${ url }` );
			}
		}
	}
	assert.equal( sessionChecks, 0 );
} );

test( 'a proxied sign-out makes the proxy forget the cookie at once', async () => {
	sitesBody = JSON.stringify( [ { id: 3, home: `http://127.0.0.1:${proxy.upPort}/site3` } ] );
	const signOuts = [
		{ method: 'DELETE', url: '/wp-json/wp-admin/v1/session' },
		{ method: 'DELETE', url: '/wp-json/WP-ADMIN/V1/Session/' },
		{ method: 'DELETE', url: '/sites/3/wp-json/wp-admin/v1/session' },
		{ method: 'DELETE', url: '/wp-json/?rest_route=/wp-admin/v1/session' },
		{ method: 'POST', url: '/wp-json/wp-admin/v1/session?_method=DELETE', headers: { 'content-length': '0' } },
		{ method: 'POST', url: '/wp-json/wp-admin/v1/session', headers: { 'content-length': '0', 'x-http-method-override': 'DELETE' } },
	];
	for ( const signOut of signOuts ) {
		const label = `${ signOut.method } ${ signOut.url }`;
		validCookies.add( GOOD );
		assert.equal( ( await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) ).status, 200, label );
		const res = await request( proxy.port, { method: signOut.method, url: signOut.url, headers: { cookie: GOOD, ...signOut.headers } } );
		assert.equal( res.status, 200, label );
		assert.equal( last.method, signOut.method, label );
		// The stub WordPress invalidated the cookie; without forget() the cached answer would still say yes.
		assertUnauthorized( await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ), label );
	}
	validCookies.add( GOOD );
} );

test( 'a sign-out through wp-login.php forgets the cookie too', async () => {
	validCookies.add( GOOD );
	assert.equal( ( await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) ).status, 200 );
	sessionChecks = 0;
	await request( proxy.port, { url: '/wp-login.php?action=logout&_wpnonce=x', headers: { cookie: GOOD } } );
	await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	assert.equal( sessionChecks, 1 );
} );

test( 'other proxied requests do not forget the cookie', async () => {
	validCookies.add( GOOD );
	await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	sessionChecks = 0;
	await request( proxy.port, { url: '/wp-json/wp-admin/v1/session', headers: { cookie: GOOD } } );
	await request( proxy.port, { method: 'DELETE', url: '/wp-json/wp/v2/posts/1', headers: { cookie: GOOD } } );
	sessionChecks = 0;
	await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } );
	assert.equal( sessionChecks, 0 );
} );

test( 'an upstream that is down fails closed for protected files while public files still load', async () => {
	await withServer( { upstream: 'http://127.0.0.1:1', upstreamHost: undefined, siteDir, timeoutMs: 500 }, async ( port ) => {
		assertUnauthorized( await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) );
		assert.equal( ( await request( port, { url: '/assets/app.js' } ) ).status, 200 );
		assert.equal( ( await request( port, { url: '/wp-admin/', headers: { 'sec-fetch-dest': 'document' } } ) ).status, 200 );
	} );
} );

test( 'an upstream that never answers the check fails closed after the timeout', async () => {
	const silent = http.createServer( () => {} );
	const silentPort = await listen( silent );
	try {
		await withServer( { upstream: `http://127.0.0.1:${silentPort}`, upstreamHost: undefined, siteDir, authTimeoutMs: 100 }, async ( port ) => {
			assertUnauthorized( await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) );
		} );
	} finally {
		await close( silent );
	}
} );

test( 'a huge session response is cut off and is not authenticated', async () => {
	const big = http.createServer( ( req, res ) => {
		res.writeHead( 200, { 'Content-Type': 'application/json' } );
		res.end( Buffer.alloc( 1024 * 1024, 'x' ) );
	} );
	const bigPort = await listen( big );
	try {
		await withServer( { upstream: `http://127.0.0.1:${bigPort}`, upstreamHost: undefined, siteDir }, async ( port ) => {
			assertUnauthorized( await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) );
		} );
	} finally {
		await close( big );
	}
} );

/** A site directory with index.html, a protected-by-default asset and the given list file content (or none). */
function makeSite( list ) {
	const dir = fs.mkdtempSync( path.join( tmp, 'list-' ) );
	fs.writeFileSync( path.join( dir, 'index.html' ), '<!doctype html><div id="app"></div>' );
	fs.mkdirSync( path.join( dir, 'assets' ) );
	fs.writeFileSync( path.join( dir, 'assets', 'app.js' ), 'export default 1;' );
	if ( list !== undefined ) {
		fs.writeFileSync( path.join( dir, 'public-files.json' ), list );
	}
	fs.writeFileSync( path.join( dir, 'shared-files.json' ), '{"files":[]}' );
	return dir;
}

for ( const [ name, list ] of [
	[ 'missing', undefined ],
	[ 'not JSON', '{ files: [' ],
	[ 'without a files array', '{"paths":["/assets/app.js"]}' ],
	[ 'with a glob', '{"files":["/index.html","/assets/*"]}' ],
	[ 'with a relative path', '{"files":["/index.html","assets/app.js"]}' ],
	[ 'with a dot segment', '{"files":["/index.html","/x/../assets/app.js"]}' ],
	[ 'with a directory', '{"files":["/index.html","/assets/"]}' ],
	[ 'with a non-string', '{"files":["/index.html",7]}' ],
] ) {
	test( `a public list that is ${ name } leaves only /index.html public and logs an error`, async () => {
		const errors = [];
		await withServer( { siteDir: makeSite( list ), logger: ( e ) => errors.push( e ) }, async ( port ) => {
			assertUnauthorized( await request( port, { url: '/assets/app.js' } ) );
			assert.equal( ( await request( port, { url: '/index.html' } ) ).status, 200 );
			assert.equal( ( await request( port, { url: '/wp-admin/', headers: { 'sec-fetch-dest': 'document' } } ) ).status, 200 );
			// Logged once, not on every request.
			await request( port, { url: '/assets/app.js' } );
		} );
		assert.equal( errors.length, 1 );
		assert.match( String( errors[ 0 ]?.message ?? errors[ 0 ] ), /public-files\.json/ );
	} );
}

test( 'the public list is read again when it changes, without a restart', async () => {
	const dir = makeSite( '{"files":["/index.html"]}' );
	const errors = [];
	await withServer( { siteDir: dir, logger: ( e ) => errors.push( e ) }, async ( port ) => {
		assertUnauthorized( await request( port, { url: '/assets/app.js' } ) );
		const file = path.join( dir, 'public-files.json' );
		fs.writeFileSync( file, '{"files":["/index.html","/assets/app.js"]}' );
		const later = new Date( Date.now() + 5000 );
		fs.utimesSync( file, later, later );
		assert.equal( ( await request( port, { url: '/assets/app.js' } ) ).status, 200 );
		fs.rmSync( file );
		assertUnauthorized( await request( port, { url: '/assets/app.js' } ) );
	} );
	assert.equal( errors.length, 1 );
} );

test( 'public paths are compared exactly and case-sensitively', async () => {
	for ( const url of [ '/ASSETS/app.js', '/assets/App.js', '/assets/app.js.map', '/assets', '/assets/' ] ) {
		assertUnauthorized( await request( proxy.port, { url } ), url );
	}
	assert.equal( ( await request( proxy.port, { url: '/assets//app.js' } ) ).status, 200 );
} );

// --- Page files are gated by role: the session's `components` decide which pages' files a user gets. ---

const PAGE_URLS = [ '/contracts/core/options-general.js', '/components/core/options-general.js', '/components/core/options-general/timezone.js' ];
const MADE_UP_PAGE = '/components/core/made-up-page.js';

test( 'a user allowed the page gets its contract, implementation and helper files', async () => {
	for ( const url of PAGE_URLS ) {
		const res = await request( proxy.port, { url, headers: { cookie: COOKIE_A } } );
		assert.equal( res.status, 200, url );
		assert.equal( res.body.toString(), PAGE_FILES[ url.slice( 1 ) ], url );
		assert.equal( res.headers[ 'cache-control' ], 'private, no-cache', url );
		assert.equal( res.headers.vary, 'Cookie', url );
	}
} );

test( 'a user not allowed the page gets the same 403 for each of its files as for a made-up page path', async () => {
	const madeUp = await request( proxy.port, { url: MADE_UP_PAGE, headers: { cookie: COOKIE_B } } );
	assertForbidden( madeUp );
	assert.deepEqual( JSON.parse( madeUp.body ), FORBIDDEN );
	for ( const url of [ ...PAGE_URLS, '/components/core/options-general/made-up.js', '/contracts/core/made-up-page.js', '/components/core/options-general-x.js' ] ) {
		const res = await request( proxy.port, { url, headers: { cookie: COOKIE_B } } );
		assertForbidden( res, url );
		assert.deepEqual( comparable( res ), comparable( madeUp ), url );
	}
} );

test( 'every shared file is served to every signed-in user, with or without page components', async () => {
	for ( const cookie of [ COOKIE_A, COOKIE_B, COOKIE_C, GOOD ] ) {
		for ( const url of TEST_SHARED ) {
			const res = await request( proxy.port, { url, headers: { cookie } } );
			assert.equal( res.status, 200, `${ cookie } ${ url }` );
		}
	}
} );

test( 'an anonymous visitor gets the unchanged 401 for shared, page and made-up files alike', async () => {
	const reference = await request( proxy.port, { url: '/components/core/menu.js' } );
	assertUnauthorized( reference );
	for ( const url of [ ...TEST_SHARED, ...PAGE_URLS, MADE_UP_PAGE, '/runtime/stray.js', '/shared-files.json', '/public-files.json' ] ) {
		const res = await request( proxy.port, { url } );
		assertUnauthorized( res, url );
		assert.deepEqual( comparable( res ), comparable( reference ), url );
	}
} );

test( 'a session body whose components are malformed is signed in for shared files and refused page files', async () => {
	assert.equal( ( await request( proxy.port, { url: '/components/core/menu.js', headers: { cookie: COOKIE_C } } ) ).status, 200 );
	for ( const url of PAGE_URLS ) {
		assertForbidden( await request( proxy.port, { url, headers: { cookie: COOKIE_C } } ), url );
	}
} );

test( 'a path on no list is never served: not to an allowed user either', async () => {
	for ( const url of [ '/runtime/stray.js', '/kit/stray.js', '/assets/other.js' ] ) {
		assertForbidden( await request( proxy.port, { url, headers: { cookie: COOKIE_A } } ), url );
	}
	for ( const url of [ '/shared-files.json', '/public-files.json' ] ) {
		assertUnauthorized( await request( proxy.port, { url } ), url );
		assertForbidden( await request( proxy.port, { url, headers: { cookie: COOKIE_A } } ), url );
		assertForbidden( await request( proxy.port, { url, headers: { cookie: COOKIE_B } } ), url );
	}
} );

test( 'no path variant turns a page file into a shared one or borrows another page\'s permission', async () => {
	const variants = [
		'/components/core/options-general%2Ejs', '/components%2Fcore%2Foptions-general.js', '/%63omponents/core/options-general.js',
		'/components/core/options-general%252Ejs', '/components%252Fcore%252Foptions-general.js',
		'/COMPONENTS/core/options-general.js', '/Components/core/options-general.js', '/components/core/OPTIONS-GENERAL.js', '/components/Core/options-general.js',
		'/contracts/core/Options-General.js', '/components/core/options-general.JS', '/components//core/options-general.js', '/components/core/./options-general.js',
		'/./components/core/options-general.js', '/components/core/options-general.js/', '/components/core/options-general.js?x=1',
		'/kit/index.js/../../components/core/options-general.js', '/kit/../components/core/options-general.js', '/kit/%2e%2e/components/core/options-general.js',
		'/components/core/menu.js/../options-general.js', '/components/core/menu.js%2f..%2foptions-general.js', '/components/core/options-general.js%00',
		'/components/core/options-general.js%20', '/components/core/options-general.js.', '/components/core/options-general.js;x',
		'/components/core/options-general/../options-general.js', '/sites/1/components/core/options-general.js', '/components/core/options-general.js::$DATA',
	];
	sessionChecks = 0;
	for ( const url of variants ) {
		for ( const method of [ 'GET', 'HEAD' ] ) {
			const res = await request( proxy.port, { method, url, headers: { cookie: COOKIE_B } } );
			const label = `${ method } ${ url }`;
			assert.ok( ! res.body.toString().includes( 'SECRET' ), label );
			assert.ok( [ 400, 403 ].includes( res.status ), `${ label }: ${ res.status }` );
			if ( res.status === 403 ) {
				assertForbidden( res, label );
			}
		}
	}
	// A user allowed core/options-general cannot reach another page through a case or a prefix of its name.
	for ( const url of [
		'/components/core/options-general-x.js', '/components/core/OPTIONS-GENERAL.js', '/contracts/core/options-general-x.js',
		'/components/core/options-general.js/../options-general-x.js', '/components/core/options-general%2f..%2foptions-general-x.js',
		'/components/core/options-general/../options-general-x.js', '/runtime/stray.js', '/components/core/options-general/../../../runtime/stray.js',
	] ) {
		const res = await request( proxy.port, { url, headers: { cookie: COOKIE_A } } );
		assert.ok( [ 400, 403 ].includes( res.status ), `${ url }: ${ res.status }` );
		assert.ok( ! res.body.toString().includes( 'SECRET' ), url );
	}
} );

test( 'HEAD and conditional requests pass the role gate first', async () => {
	const allowed = await request( proxy.port, { method: 'HEAD', url: '/components/core/options-general.js', headers: { cookie: COOKIE_A } } );
	assert.equal( allowed.status, 200 );
	assert.equal( allowed.body.length, 0 );
	const refused = await request( proxy.port, { method: 'HEAD', url: '/components/core/options-general.js', headers: { cookie: COOKIE_B } } );
	assertForbidden( refused );
	assert.equal( refused.body.length, 0 );
	const refusedMissing = await request( proxy.port, { method: 'HEAD', url: MADE_UP_PAGE, headers: { cookie: COOKIE_B } } );
	assert.deepEqual( comparable( refusedMissing ), comparable( refused ) );

	const first = await request( proxy.port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_A } } );
	const conditional = { 'if-none-match': first.headers.etag, 'if-modified-since': first.headers[ 'last-modified' ] };
	assertForbidden( await request( proxy.port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_B, ...conditional } } ) );
	assertForbidden( await request( proxy.port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_B, 'if-modified-since': first.headers[ 'last-modified' ] } } ) );
	assertUnauthorized( await request( proxy.port, { url: '/components/core/options-general.js', headers: conditional } ) );
	assert.equal( ( await request( proxy.port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_A, ...conditional } } ) ).status, 304 );
} );

test( 'a listed name that is a link to another file is not served (no symlink indirection)', async () => {
	const dir = makeSite( JSON.stringify( { files: [ '/index.html', '/assets/linked.js' ] } ) );
	fs.mkdirSync( path.join( dir, 'components', 'core' ), { recursive: true } );
	fs.mkdirSync( path.join( dir, 'kit' ) );
	fs.writeFileSync( path.join( dir, 'components', 'core', 'options-general.js' ), 'PAGE-SECRET' );
	fs.writeFileSync( path.join( dir, 'kit', 'real.js' ), 'export default 1;' );
	fs.symlinkSync( path.join( dir, 'components', 'core', 'options-general.js' ), path.join( dir, 'assets', 'linked.js' ) );
	fs.symlinkSync( path.join( dir, 'components', 'core', 'options-general.js' ), path.join( dir, 'kit', 'linked.js' ) );
	fs.symlinkSync( path.join( dir, 'kit' ), path.join( dir, 'kitlink' ) );
	fs.writeFileSync( path.join( dir, 'shared-files.json' ), JSON.stringify( { files: [ '/kit/linked.js', '/kit/real.js', '/kitlink/real.js' ] } ) );
	await withServer( { siteDir: dir }, async ( port ) => {
		assertUnauthorized( await request( port, { url: '/assets/linked.js' } ) );
		assertForbidden( await request( port, { url: '/assets/linked.js', headers: { cookie: COOKIE_A } } ) );
		for ( const cookie of [ COOKIE_A, COOKIE_B ] ) {
			assertForbidden( await request( port, { url: '/kit/linked.js', headers: { cookie } } ) );
			// A linked directory on the way is indirection too.
			assertForbidden( await request( port, { url: '/kitlink/real.js', headers: { cookie } } ) );
			assert.equal( ( await request( port, { url: '/kit/real.js', headers: { cookie } } ) ).status, 200 );
		}
		assertUnauthorized( await request( port, { url: '/kit/linked.js' } ) );
		// The real page file itself follows its own rule.
		assert.equal( ( await request( port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_A } } ) ).status, 200 );
	} );
} );

/** An fs that records the path of every call made through it. */
function spyFs() {
	const calls = [];
	const wrapped = new Proxy( fs, {
		get( target, prop ) {
			const value = target[ prop ];
			if ( typeof value !== 'function' ) {
				return value;
			}
			return ( ...args ) => {
				calls.push( [ prop, String( args[ 0 ] ) ] );
				return value.apply( target, args );
			};
		},
	} );
	return { calls, fs: wrapped };
}

test( 'the file system is not touched before the gate for anonymous and forbidden requests', async () => {
	const spy = spyFs();
	await withServer( { siteDir, fs: spy.fs }, async ( port ) => {
		// Only the two list files are ever looked at to decide.
		const beyondLists = () => spy.calls.filter( ( [ , file ] ) => ! /\/(?:public|shared)-files\.json$/.test( file ) );
		spy.calls.length = 0;
		for ( const url of [ ...PAGE_URLS, '/components/core/menu.js', '/runtime/stray.js', MADE_UP_PAGE ] ) {
			assertUnauthorized( await request( port, { url } ), url );
		}
		for ( const url of [ ...PAGE_URLS, '/runtime/stray.js', MADE_UP_PAGE ] ) {
			assertForbidden( await request( port, { url, headers: { cookie: COOKIE_B } } ), url );
		}
		assert.deepEqual( beyondLists(), [] );
		// Sanity: the spy does see the file system once a request is allowed.
		assert.equal( ( await request( port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_A } } ) ).status, 200 );
		assert.ok( beyondLists().some( ( [ , file ] ) => file.endsWith( path.join( 'components', 'core', 'options-general.js' ) ) ) );
	} );
} );

test( 'a proxied write that can change the user\'s own capabilities forgets the cookie', async () => {
	const original = sessionBodies[ COOKIE_A ];
	try {
		await withServer( { siteDir }, async ( port ) => {
			const page = () => request( port, { url: '/components/core/options-general.js', headers: { cookie: COOKIE_A } } );
			assert.equal( ( await page() ).status, 200 );
			// WordPress now says otherwise, but the cached answer still holds.
			sessionBodies[ COOKIE_A ] = { user: { id: 2 }, nonce: 'n', components: [] };
			assert.equal( ( await page() ).status, 200 );
			const write = await request( port, { method: 'POST', url: '/wp-json/wp/v2/users/5', headers: { cookie: COOKIE_A, 'content-length': '0' } } );
			assert.equal( write.status, 200 );
			assertForbidden( await page() );
			for ( const [ method, url ] of [ [ 'PUT', '/wp-json/wp/v2/users/me' ], [ 'POST', '/wp-admin/profile.php' ], [ 'POST', '/wp-admin/user-edit.php?user_id=2' ], [ 'POST', '/wp-admin/users.php' ], [ 'DELETE', '/wp-json/WP/V2/Users/7' ], [ 'POST', '/wp-json/?rest_route=/wp/v2/users/2' ] ] ) {
				sessionBodies[ COOKIE_A ] = original;
				assertForbidden( await page(), `${ method } ${ url } cached` );
				await request( port, { method, url, headers: { cookie: COOKIE_A, 'content-length': '0', 'sec-fetch-dest': 'empty' } } );
				assert.equal( ( await page() ).status, 200, `${ method } ${ url }` );
				sessionBodies[ COOKIE_A ] = { user: { id: 2 }, nonce: 'n', components: [] };
				await request( port, { method, url, headers: { cookie: COOKIE_A, 'content-length': '0', 'sec-fetch-dest': 'empty' } } );
				assertForbidden( await page(), `${ method } ${ url } again` );
			}
			// A read of the users route forgets nothing.
			sessionBodies[ COOKIE_A ] = original;
			sessionChecks = 0;
			await request( port, { url: '/wp-json/wp/v2/users/me', headers: { cookie: COOKIE_A } } );
			assertForbidden( await page() );
			assert.equal( sessionChecks, 0 );
		} );
	} finally {
		sessionBodies[ COOKIE_A ] = original;
	}
} );

test( 'the real site: every shared file for any signed-in user, page files only for those allowed', async () => {
	const shared = JSON.parse( fs.readFileSync( path.join( realSiteDir, 'shared-files.json' ) ) ).files;
	assert.ok( shared.includes( '/runtime/protected.js' ) );
	await withServer( { siteDir: realSiteDir }, async ( port ) => {
		for ( const url of shared ) {
			assertUnauthorized( await request( port, { url } ), url );
			for ( const cookie of [ COOKIE_A, COOKIE_B ] ) {
				const res = await request( port, { url, headers: { cookie } } );
				assert.equal( res.status, 200, url );
				assert.ok( res.body.length > 0, url );
			}
		}
		for ( const url of [ '/contracts/core/options-general.js', '/components/core/options-general.js', '/components/core/options-general/timezone.js' ] ) {
			assertForbidden( await request( port, { url, headers: { cookie: COOKIE_B } } ), url );
			assert.equal( ( await request( port, { url, headers: { cookie: COOKIE_A } } ) ).status, 200, url );
		}
		for ( const url of [ '/shared-files.json', '/public-files.json' ] ) {
			assertForbidden( await request( port, { url, headers: { cookie: COOKIE_A } } ), url );
		}
	} );
} );

for ( const [ name, list ] of [
	[ 'missing', undefined ],
	[ 'not JSON', '{ files: [' ],
	[ 'with a glob', '{"files":["/kit/*"]}' ],
	[ 'with a non-string', '{"files":["/kit/index.js",7]}' ],
] ) {
	test( `a shared list that is ${ name } shares nothing and logs an error once`, async () => {
		const dir = makeSite( JSON.stringify( { files: [ '/index.html' ] } ) );
		fs.mkdirSync( path.join( dir, 'kit' ) );
		fs.writeFileSync( path.join( dir, 'kit', 'index.js' ), 'export default 1;' );
		if ( list === undefined ) {
			fs.rmSync( path.join( dir, 'shared-files.json' ) );
		} else {
			fs.writeFileSync( path.join( dir, 'shared-files.json' ), list );
		}
		const errors = [];
		await withServer( { siteDir: dir, logger: ( e ) => errors.push( e ) }, async ( port ) => {
			assertForbidden( await request( port, { url: '/kit/index.js', headers: { cookie: COOKIE_A } } ) );
			assertForbidden( await request( port, { url: '/kit/index.js', headers: { cookie: COOKIE_A } } ) );
			assertUnauthorized( await request( port, { url: '/kit/index.js' } ) );
		} );
		assert.equal( errors.length, 1 );
		assert.match( String( errors[ 0 ]?.message ?? errors[ 0 ] ), /shared-files\.json/ );
	} );
}

test( 'the shared list is read again when it changes', async () => {
	const dir = makeSite( JSON.stringify( { files: [ '/index.html' ] } ) );
	fs.mkdirSync( path.join( dir, 'kit' ) );
	fs.writeFileSync( path.join( dir, 'kit', 'index.js' ), 'export default 1;' );
	const file = path.join( dir, 'shared-files.json' );
	fs.writeFileSync( file, '{"files":[]}' );
	await withServer( { siteDir: dir }, async ( port ) => {
		assertForbidden( await request( port, { url: '/kit/index.js', headers: { cookie: COOKIE_B } } ) );
		fs.writeFileSync( file, '{"files":["/kit/index.js"]}' );
		const later = new Date( Date.now() + 5000 );
		fs.utimesSync( file, later, later );
		assert.equal( ( await request( port, { url: '/kit/index.js', headers: { cookie: COOKIE_B } } ) ).status, 200 );
	} );
} );

test( 'the session check has its own short total timeout, configurable', async () => {
	const trickle = http.createServer( ( req, res ) => {
		res.writeHead( 200, { 'Content-Type': 'application/json' } );
		// Keeps the connection busy, a byte at a time, without ever finishing.
		const timer = setInterval( () => res.write( ' ' ), 20 );
		res.on( 'close', () => clearInterval( timer ) );
	} );
	const tricklePort = await listen( trickle );
	try {
		await withServer( { upstream: `http://127.0.0.1:${ tricklePort }`, upstreamHost: undefined, siteDir, authTimeoutMs: 150, timeoutMs: 60_000 }, async ( port ) => {
			const started = Date.now();
			assertUnauthorized( await request( port, { url: '/components/core/menu.js', headers: { cookie: GOOD } } ) );
			assert.ok( Date.now() - started < 2000 );
		} );
	} finally {
		await close( trickle );
	}
} );

test( 'configFromEnv reads AUTH_TIMEOUT_MS, defaulting to 5 seconds', async () => {
	const { configFromEnv } = await import( '../server/proxy.mjs' );
	assert.equal( configFromEnv( { WP_UPSTREAM: 'http://x' } ).authTimeoutMs, 5000 );
	assert.equal( configFromEnv( { WP_UPSTREAM: 'http://x', AUTH_TIMEOUT_MS: '1500' } ).authTimeoutMs, 1500 );
} );

test( 'configFromEnv: a timeout that is not a positive number is reported and the default used', async () => {
	const { configFromEnv } = await import( '../server/proxy.mjs' );
	for ( const bad of [ 'abc', '0', '-5', 'Infinity', 'NaN', '5s' ] ) {
		const warnings = [];
		const config = configFromEnv( { WP_UPSTREAM: 'http://x', AUTH_TIMEOUT_MS: bad, UPSTREAM_TIMEOUT_MS: bad }, ( m ) => warnings.push( m ) );
		assert.equal( config.authTimeoutMs, 5000, bad );
		assert.equal( config.timeoutMs, 60000, bad );
		assert.equal( warnings.length, 2, bad );
		assert.match( warnings[ 0 ], /UPSTREAM_TIMEOUT_MS|AUTH_TIMEOUT_MS/ );
	}
	const warnings = [];
	assert.equal( configFromEnv( { WP_UPSTREAM: 'http://x', UPSTREAM_TIMEOUT_MS: '250' }, ( m ) => warnings.push( m ) ).timeoutMs, 250 );
	assert.deepEqual( warnings, [] );
} );

test( 'page ids are exactly two segments: a page owns its directory, a nested id grants nothing', async () => {
	const COOKIE_D = 'wordpress_logged_in_t=dave%7C5%7Cnested';
	const extra = {
		'components/acme/page.js': 'export default {}; // ACME page',
		'components/acme/page/sub.js': 'export default {}; // ACME helper',
		'contracts/core/options-general/x.js': 'export default {}; // PAGE-SECRET nested contract',
	};
	for ( const [ file, source ] of Object.entries( extra ) ) {
		fs.mkdirSync( path.dirname( path.join( siteDir, file ) ), { recursive: true } );
		fs.writeFileSync( path.join( siteDir, file ), source );
	}
	validCookies.add( COOKIE_D );
	// What a plugin could register today: the PHP registry takes any string as a component id.
	sessionBodies[ COOKIE_D ] = { user: { id: 5 }, nonce: 'n', components: [ 'acme/page', 'core/options-general/timezone', 'acme/page/sub' ] };
	try {
		await withServer( { siteDir }, async ( port ) => {
			const get = ( url, cookie = COOKIE_D ) => request( port, { url, headers: { cookie } } );
			// The helper of acme/page is served by acme/page's rule, by design.
			assert.equal( ( await get( '/components/acme/page/sub.js' ) ).status, 200 );
			assert.equal( ( await get( '/components/acme/page.js' ) ).status, 200 );
			// The three-segment ids were dropped: they grant neither the helper nor its page.
			for ( const url of [ '/components/core/options-general/timezone.js', '/components/core/options-general.js', '/contracts/core/options-general.js' ] ) {
				assertForbidden( await get( url ), url );
			}
			// A contract path deeper than two segments is on no tier, even for a user allowed the page.
			assertForbidden( await get( '/contracts/core/options-general/x.js', COOKIE_A ), 'nested contract' );
		} );
	} finally {
		validCookies.delete( COOKIE_D );
		delete sessionBodies[ COOKIE_D ];
		for ( const file of Object.keys( extra ) ) {
			fs.rmSync( path.join( siteDir, file ) );
		}
	}
} );

// On multisite WordPress lists the page components of every site the user belongs to (a union),
// because the admin site's files are the same for every site and each site's data is checked by
// its own REST routes. The proxy needs nothing per site: the set it caches is already that union.
