import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/proxy.mjs';

let upstream, proxy, tmp, siteDir, last, sitesCalls = 0, sitesBody;

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
function rawRequest( port, requestLine ) {
	return new Promise( ( resolve, reject ) => {
		const sock = net.connect( port, '127.0.0.1' );
		let data = '';
		sock.on( 'data', ( c ) => data += c );
		sock.on( 'end', () => resolve( data ) );
		sock.on( 'error', reject );
		sock.write( `${requestLine}\r\nHost: x\r\nConnection: close\r\n\r\n` );
	} );
}

before( async () => {
	tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'admin-test-' ) );
	siteDir = path.join( tmp, 'site' );
	fs.mkdirSync( path.join( siteDir, 'assets' ), { recursive: true } );
	fs.writeFileSync( path.join( siteDir, 'index.html' ), '<!doctype html><div id="app"></div>' );
	fs.writeFileSync( path.join( siteDir, 'assets', 'app.js' ), 'export default 1;' );
	fs.writeFileSync( path.join( siteDir, '.secret' ), 'dotfile' );
	fs.writeFileSync( path.join( tmp, 'outside.txt' ), 'OUTSIDE' );

	upstream = http.createServer( ( req, res ) => {
		const chunks = [];
		req.on( 'data', ( c ) => chunks.push( c ) );
		req.on( 'end', () => {
			last = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat( chunks ) };
			if ( req.url.startsWith( '/wp-json/wp-admin/v1/sites' ) ) {
				sitesCalls++;
				res.setHeader( 'Content-Type', 'application/json' );
				return res.end( sitesBody );
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
	proxy = createServer( { upstream: `http://127.0.0.1:${upPort}`, publicUrl: 'http://public.test:8889', upstreamHost: `127.0.0.1:${upPort}`, siteDir } );
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
	const res = await request( proxy.port, { url: '/posts/12' } );
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
	for ( const url of [ '/../outside.txt', '/%2e%2e/outside.txt', '/assets/..%2f..%2foutside.txt', '/%2e%2e%2foutside.txt', '/assets/%00.js', '/..%5coutside.txt', '/.secret', '/%2esecret' ] ) {
		const res = await request( proxy.port, { url } );
		assert.ok( [ 400, 403, 404 ].includes( res.status ) || res.body.toString().includes( 'id="app"' ), `${url} -> ${res.status}` );
		assert.ok( ! res.body.toString().includes( 'OUTSIDE' ), url );
		assert.ok( ! res.body.toString().includes( 'dotfile' ), url );
	}
} );

test( 'a symlink inside site/ pointing outside is not followed', async () => {
	fs.symlinkSync( path.join( tmp, 'outside.txt' ), path.join( siteDir, 'link.txt' ) );
	const res = await request( proxy.port, { url: '/link.txt' } );
	assert.ok( ! res.body.toString().includes( 'OUTSIDE' ) );
} );

test( 'the request cannot choose another upstream host', async () => {
	last = null;
	for ( const url of [ '//evil.example/x', '/\\evil.example', '/wp-json/..//evil.example' ] ) {
		const res = await request( proxy.port, { url } );
		assert.ok( res.status === 400 || res.status === 404 || res.status === 200, url );
	}
	const raw = await rawRequest( proxy.port, 'GET http://evil.example/wp-json/ HTTP/1.1' );
	assert.match( raw, /^HTTP\/1\.1 400/ );
	assert.equal( last?.headers?.host === undefined || last.headers.host.includes( '127.0.0.1' ), true );
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
