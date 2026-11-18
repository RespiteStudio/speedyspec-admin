import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';
import realFs from 'node:fs';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders, filterResponseHeaders, isSignOut, changesOwnCapabilities } from './upstream.mjs';
import { resolveStatic, sendFile, staticKey, createPublicFiles, createSharedFiles } from './static.mjs';
import { createAuthChecker, SESSION_MAX_BYTES } from './auth.mjs';
import { classifyStatic, mayServe } from './tiers.mjs';

const SITE_PATH = /^\/sites\/(\d+)(?=\/|$)/;
const SITES_MAX_BYTES = 1024 * 1024;
const NEGATIVE_MAX_ENTRIES = 1000;
const ADMIN_NAVIGATION = /^(?:\/sites\/\d+)?\/wp-admin(?:\/|$)/;

function json( res, status, body, extraHeaders = {} ) {
	const data = JSON.stringify( body );
	res.writeHead( status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength( data ), ...extraHeaders } );
	res.end( data );
}

// The same answer for every protected path, existing or not, so that file names are not disclosed.
function unauthorized( res ) {
	json( res, 401, { code: 'admin_not_authenticated' }, { 'Cache-Control': 'no-store' } );
}

// The same answer for every file a signed-in user may not have (a page their role does not allow,
// a path on no list), existing or not.
function forbidden( res ) {
	json( res, 403, { code: 'admin_forbidden' }, { 'Cache-Control': 'no-store' } );
}

// Answers 400 and closes the connection, so unread request bytes can never be parsed as a new request.
function badRequest( res ) {
	json( res, 400, { code: 'admin_bad_request' }, { Connection: 'close' } );
}

/**
 * Builds the proxy server (not listening).
 *
 * @param {{upstream: string, publicUrl?: string, upstreamHost?: string, adminPublicUrl?: string, siteDir: string,
 *          timeoutMs?: number, sitesTtlMs?: number, sitesNegativeTtlMs?: number, trustProxy?: boolean,
 *          authTtlMs?: number, authTimeoutMs?: number, logger?: (error: unknown) => void, fs?: typeof import('node:fs')}} config
 *        `fs` is the file system the static files are read through (tests only); the real one by default.
 */
export function createServer( config ) {
	if ( ! config?.upstream ) {
		throw new Error( 'WP_UPSTREAM is required, for example WP_UPSTREAM=http://wordpress-develop' );
	}
	const upstream = new URL( config.upstream );
	const publicOrigin = config.publicUrl ? new URL( config.publicUrl ).origin : null;
	const adminPublic = config.adminPublicUrl ? new URL( config.adminPublicUrl ) : null;
	const hostOverride = config.upstreamHost || ( publicOrigin ? new URL( publicOrigin ).host : undefined );
	const trustProxy = Boolean( config.trustProxy );
	const log = config.logger ?? ( ( error ) => console.error( 'Admin proxy error:', error ) );
	const origins = [ upstream.origin, publicOrigin ].filter( Boolean );
	const timeoutMs = config.timeoutMs ?? 60_000;
	const sitesTtlMs = config.sitesTtlMs ?? 60_000;
	const negativeTtlMs = config.sitesNegativeTtlMs ?? 3_000;
	const fsImpl = config.fs ?? realFs;

	// The one thing that is cached: id -> { home, expires }, merged across users, plus unknown ids for a few seconds.
	// In-flight fetches and unknown ids are keyed by a hash of the caller's credentials: one user's list says
	// nothing about another's.
	const sites = new Map();
	const unknown = new Map();
	const inflight = new Map();

	const credentialKey = ( req ) => crypto.createHash( 'sha256' ).update( `${req.headers.cookie ?? ''}\0${req.headers.authorization ?? ''}` ).digest( 'hex' );

	function upstreamRequest( { method, path: reqPath, headers, host } ) {
		return http.request( {
			protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || 80,
			method, path: reqPath, headers: { ...headers, host }, setHost: false, agent: false,
		} );
	}

	// The X-Forwarded-* headers WordPress gets with every request from the proxy.
	function forwardedHeaders( req ) {
		const secure = Boolean( req.socket.encrypted );
		const remote = req.socket.remoteAddress || '';
		const incomingProto = String( req.headers[ 'x-forwarded-proto' ] || '' ).split( ',' )[ 0 ].trim();
		const adminHost = adminPublic ? adminPublic.host : req.headers.host || '';
		const adminProto = adminPublic
			? adminPublic.protocol.replace( ':', '' )
			: trustProxy && ( incomingProto === 'http' || incomingProto === 'https' ) ? incomingProto : secure ? 'https' : 'http';
		return {
			'x-forwarded-host': adminHost,
			'x-forwarded-proto': adminProto,
			'x-forwarded-for': trustProxy && req.headers[ 'x-forwarded-for' ] ? `${req.headers[ 'x-forwarded-for' ]}, ${remote}` : remote,
		};
	}

	// The auth checker's transport: GET on the main upstream, resolving to the status and the body
	// (status null on an error, an oversized body or an abort). The checker owns the timeout.
	function sessionAnswer( { method, path: reqPath, headers, signal } ) {
		return new Promise( ( resolve ) => {
			let settled = false;
			const done = ( status, body ) => {
				if ( ! settled ) {
					settled = true;
					resolve( { status, body } );
				}
			};
			if ( signal?.aborted ) {
				return done( null );
			}
			const out = upstreamRequest( { method, path: reqPath, headers, host: hostOverride || upstream.host } );
			signal?.addEventListener( 'abort', () => {
				out.destroy();
				done( null );
			}, { once: true } );
			out.on( 'error', () => done( null ) );
			out.on( 'response', ( res ) => {
				const chunks = [];
				let size = 0;
				res.on( 'data', ( c ) => {
					size += c.length;
					if ( size > SESSION_MAX_BYTES ) {
						out.destroy();
						return done( null );
					}
					chunks.push( c );
				} );
				res.on( 'error', () => done( null ) );
				res.on( 'end', () => done( res.statusCode, Buffer.concat( chunks ) ) );
			} );
			out.end();
		} );
	}

	const auth = createAuthChecker( { upstreamRequest: sessionAnswer, ttlMs: config.authTtlMs ?? 30_000, timeoutMs: config.authTimeoutMs ?? 5_000 } );
	const publicFiles = createPublicFiles( { log, fsImpl } );
	const sharedFiles = createSharedFiles( { log, fsImpl } );
	try {
		// Read at start-up so a missing or invalid list is reported at once; read again on change.
		publicFiles.get( config.siteDir );
		sharedFiles.get( config.siteDir );
	} catch {
		// The same error is met, and answered, by the first static request.
	}

	function fetchSites( req ) {
		return new Promise( ( resolve ) => {
			const headers = { 'x-wp-detached-admin': '1', accept: 'application/json' };
			for ( const h of [ 'cookie', 'x-wp-nonce', 'authorization' ] ) {
				if ( req.headers[ h ] ) {
					headers[ h ] = req.headers[ h ];
				}
			}
			const out = upstreamRequest( { method: 'GET', path: '/wp-json/wp-admin/v1/sites', headers, host: hostOverride || upstream.host } );
			const timer = setTimeout( () => out.destroy(), timeoutMs );
			const done = ( value ) => {
				clearTimeout( timer );
				resolve( value );
			};
			out.on( 'error', () => done( null ) );
			out.on( 'response', ( res ) => {
				const chunks = [];
				let size = 0;
				res.on( 'data', ( c ) => {
					size += c.length;
					if ( size > SITES_MAX_BYTES ) {
						out.destroy();
						return done( null );
					}
					chunks.push( c );
				} );
				res.on( 'error', () => done( null ) );
				res.on( 'end', () => {
					try {
						const list = res.statusCode === 200 ? JSON.parse( Buffer.concat( chunks ).toString() ) : null;
						done( Array.isArray( list ) ? list : null );
					} catch {
						done( null );
					}
				} );
			} );
			out.end();
		} );
	}

	function known( id ) {
		const entry = sites.get( id );
		if ( entry && entry.expires > Date.now() ) {
			return true;
		}
		sites.delete( id );
		return false;
	}

	function isUnknown( key ) {
		const until = unknown.get( key );
		if ( until === undefined ) {
			return false;
		}
		if ( until > Date.now() ) {
			return true;
		}
		unknown.delete( key );
		return false;
	}

	function rememberUnknown( key ) {
		unknown.delete( key );
		unknown.set( key, Date.now() + negativeTtlMs );
		while ( unknown.size > NEGATIVE_MAX_ENTRIES ) {
			unknown.delete( unknown.keys().next().value );
		}
	}

	async function lookupSite( req, id ) {
		if ( known( id ) ) {
			return;
		}
		// An anonymous caller cannot learn the sites, so there is nothing to refetch.
		if ( ! req.headers.cookie && ! req.headers.authorization ) {
			return;
		}
		const who = credentialKey( req );
		const negKey = `${who}:${id}`;
		if ( isUnknown( negKey ) ) {
			return;
		}
		if ( ! inflight.has( who ) ) {
			inflight.set( who, fetchSites( req ).finally( () => inflight.delete( who ) ) );
		}
		const list = await inflight.get( who );
		for ( const s of list ?? [] ) {
			sites.set( Number( s.id ), { home: s.home, expires: Date.now() + sitesTtlMs } );
		}
		if ( list && ! known( id ) && negativeTtlMs > 0 ) {
			rememberUnknown( negKey );
		}
	}

	// Last resort: an unexpected error answers 500, or drops the connection when headers are out.
	function fail( res, error ) {
		try {
			log( error );
			if ( res.headersSent ) {
				res.destroy();
			} else {
				json( res, 500, { code: 'admin_proxy_error' }, { Connection: 'close' } );
			}
		} catch {
			res.destroy();
		}
	}

	async function forward( req, res, pathname, search, forgets ) {
		// A sign-out, or a write that can change the user's own capabilities, drops the cached answer for
		// this cookie before and once WordPress has answered, whatever it said.
		if ( forgets ) {
			auth.forget( req.headers );
		}
		const match = SITE_PATH.exec( pathname );
		const siteId = match ? Number( match[ 1 ] ) : null;
		if ( match ) {
			await lookupSite( req, siteId );
		}
		const target = resolveUpstream( pathname, sites, config.upstream, hostOverride );
		if ( ! target ) {
			return json( res, 404, { code: 'admin_unknown_site' } );
		}
		// Resolved once, here: response handlers must never look the site up again (the entry can expire meanwhile).
		const site = siteId === null ? undefined : { id: siteId, home: sites.get( siteId ).home };

		const forwarded = forwardedHeaders( req );
		const adminOrigin = `${forwarded[ 'x-forwarded-proto' ]}://${forwarded[ 'x-forwarded-host' ]}`;
		const headers = filterRequestHeaders( req.headers );
		headers[ 'x-wp-detached-admin' ] = '1';
		Object.assign( headers, forwarded );
		// The body is framed explicitly: Transfer-Encoding is hop-by-hop and was dropped above.
		if ( req.headers[ 'transfer-encoding' ] ) {
			headers[ 'transfer-encoding' ] = 'chunked';
		}

		const out = upstreamRequest( { method: req.method, path: target.path + search, headers, host: target.host } );

		// One idle timer: it is restarted by any traffic in either direction, so a slow but steady upload is fine.
		let requestEnded = false;
		let expired = null;
		let timer;
		const touch = () => {
			clearTimeout( timer );
			timer = setTimeout( () => {
				if ( res.headersSent ) {
					out.destroy();
					return res.destroy();
				}
				expired = requestEnded ? 'upstream' : 'client';
				out.destroy();
			}, timeoutMs );
		};
		touch();

		out.on( 'finish', touch );
		out.on( 'response', ( up ) => {
			if ( forgets ) {
				auth.forget( req.headers );
			}
			try {
				touch();
				up.on( 'data', touch );
				up.on( 'end', () => clearTimeout( timer ) );
				const resHeaders = filterResponseHeaders( up.headers );
				if ( resHeaders.location ) {
					resHeaders.location = rewriteLocation( resHeaders.location, { origins, adminOrigin, site } );
				}
				// set-cookie stays an array: separate headers, unchanged.
				res.writeHead( up.statusCode, up.statusMessage, resHeaders );
				pipeline( up, res, () => {} );
			} catch ( error ) {
				out.destroy();
				fail( res, error );
			}
		} );
		out.on( 'error', () => {
			clearTimeout( timer );
			if ( res.headersSent ) {
				return res.destroy();
			}
			if ( expired === 'client' ) {
				return json( res, 408, { code: 'admin_request_timeout' }, { Connection: 'close' } );
			}
			if ( expired === 'upstream' ) {
				return json( res, 504, { code: 'admin_upstream_timeout' } );
			}
			json( res, 502, { code: 'admin_upstream_unreachable' } );
		} );
		res.on( 'close', () => {
			clearTimeout( timer );
			out.destroy();
		} );
		req.on( 'error', () => out.destroy() );
		req.on( 'end', () => {
			requestEnded = true;
		} );
		req.pipe( out );
		req.on( 'data', touch );
	}

	function handleRequest( req, res ) {
		const raw = req.url || '';
		// Origin-form request targets only: rejects absolute URLs, //host and backslashes.
		if ( ! raw.startsWith( '/' ) || raw.startsWith( '//' ) || raw.includes( '\\' ) || raw.includes( '\0' ) ) {
			return badRequest( res );
		}
		const q = raw.indexOf( '?' );
		const pathname = q === -1 ? raw : raw.slice( 0, q );
		const search = q === -1 ? '' : raw.slice( q );
		let decoded;
		try {
			decoded = decodeURIComponent( pathname );
		} catch {
			return badRequest( res );
		}
		if ( decoded.split( '/' ).includes( '..' ) || decoded.includes( '\\' ) || decoded.includes( '\0' ) || decoded.startsWith( '//' ) ) {
			return badRequest( res );
		}

		const te = req.headers[ 'transfer-encoding' ];
		const cl = req.headers[ 'content-length' ];
		if ( te && cl !== undefined ) {
			return badRequest( res );
		}
		if ( ( req.method === 'GET' || req.method === 'HEAD' ) && ( te || ( cl !== undefined && cl !== '0' ) ) ) {
			return badRequest( res );
		}

		// Routing uses the raw path and classification the decoded one: they must agree about a site prefix.
		if ( SITE_PATH.test( decoded ) && ! SITE_PATH.test( pathname ) ) {
			return badRequest( res );
		}

		// Classified on the decoded path: that is the form the upstream web server will act on.
		const dest = req.headers[ 'sec-fetch-dest' ];
		const frame = req.headers[ 'x-wp-admin-frame' ];
		const kind = classify( req.method, decoded, dest, frame );
		let twice = decoded;
		try {
			twice = decodeURIComponent( decoded );
		} catch {
			// Not decodable a second time: nothing further to compare.
		}
		if ( twice !== decoded && ( twice.split( '/' ).includes( '..' ) || classify( req.method, twice, dest, frame ) !== kind ) ) {
			return badRequest( res );
		}

		if ( kind === 'notfound' ) {
			return json( res, 404, { code: 'admin_not_found' } );
		}
		if ( kind === 'proxy' ) {
			// Forgetting after a role change is only a shortcut, and it is limited on purpose: it covers the
			// caller's own writes to the users route and the user screens. A bulk role change made with a GET
			// on users.php, changes made through admin-ajax.php or a role-editor plugin, and any change to
			// another user's capabilities do not forget anything; the 30-second TTL bounds all of those.
			const forgets = isSignOut( req.method, decoded, search, req.headers ) || changesOwnCapabilities( req.method, decoded, search, req.headers );
			return forward( req, res, pathname, search, forgets );
		}
		if ( req.method !== 'GET' && req.method !== 'HEAD' ) {
			res.setHeader( 'Allow', 'GET, HEAD' );
			return json( res, 405, { code: 'admin_method_not_allowed' } );
		}
		return serveStatic( req, res, pathname, decoded );
	}

	// Unauthorized by default, in three tiers (tiers.mjs): the shell document and the files on the
	// public list are served to anyone; the files on the shared list to any caller whose login cookie
	// WordPress accepts; a page's files only to a caller whose session lists that page's component.
	// Anything else is never served. The decision is taken on the path alone, before the file system
	// is looked at, and a listed name is served only as the very file it names (no symbolic links).
	async function serveStatic( req, res, pathname, decoded ) {
		const key = staticKey( decoded );
		if ( key === '/' || key === '/index.html' || ADMIN_NAVIGATION.test( decoded ) ) {
			const index = resolveStatic( config.siteDir, '/index.html', fsImpl );
			if ( ! index || index === 'forbidden' ) {
				return json( res, 404, { code: 'admin_not_found' } );
			}
			return sendFile( req, res, index, { 'Cache-Control': 'no-cache' }, fsImpl );
		}
		const tier = classifyStatic( key, publicFiles.get( config.siteDir ), sharedFiles.get( config.siteDir ) );
		if ( tier.tier === 'public' ) {
			const file = resolveStatic( config.siteDir, pathname, fsImpl, { exact: true } );
			if ( file !== 'indirect' ) {
				return file && file !== 'forbidden' ? sendFile( req, res, file, {}, fsImpl ) : json( res, 404, { code: 'admin_not_found' } );
			}
			// Not the file the list names: not on the list after all.
			const session = await auth.check( req.headers, forwardedHeaders( req ) );
			return session.authenticated ? forbidden( res ) : unauthorized( res );
		}
		const decision = mayServe( tier, await auth.check( req.headers, forwardedHeaders( req ) ) );
		if ( decision === 'unauthenticated' ) {
			return unauthorized( res );
		}
		if ( decision !== 'serve' ) {
			return forbidden( res );
		}
		const file = resolveStatic( config.siteDir, pathname, fsImpl, { exact: true } );
		if ( file === 'forbidden' || file === 'indirect' ) {
			return forbidden( res );
		}
		if ( ! file ) {
			return json( res, 404, { code: 'admin_not_found' } );
		}
		return sendFile( req, res, file, { 'Cache-Control': 'private, no-cache', Vary: 'Cookie' }, fsImpl );
	}

	function handle( req, res ) {
		try {
			Promise.resolve( handleRequest( req, res ) ).catch( ( error ) => fail( res, error ) );
		} catch ( error ) {
			fail( res, error );
		}
	}

	const server = http.createServer( handle );
	server.on( 'clientError', ( err, socket ) => {
		if ( err.code === 'ECONNRESET' || ! socket.writable ) {
			return socket.destroy();
		}
		socket.end( 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n' );
	} );
	return server;
}

/**
 * A positive number of milliseconds from the environment, or the default: a value that is not one
 * is reported and ignored, rather than becoming a timeout that refuses every request.
 */
function milliseconds( env, name, fallback, warn ) {
	if ( env[ name ] === undefined || env[ name ] === '' ) {
		return fallback;
	}
	const value = Number( env[ name ] );
	if ( ! Number.isFinite( value ) || value <= 0 ) {
		warn( `${ name }=${ JSON.stringify( env[ name ] ) } is not a positive number of milliseconds: using ${ fallback }.` );
		return fallback;
	}
	return value;
}

export function configFromEnv( env = process.env, warn = ( message ) => console.warn( message ) ) {
	if ( ! env.WP_UPSTREAM ) {
		throw new Error( 'WP_UPSTREAM is required, for example WP_UPSTREAM=http://wordpress-develop' );
	}
	return {
		port: Number( env.PORT || 8890 ),
		upstream: env.WP_UPSTREAM,
		publicUrl: env.WP_PUBLIC_URL || undefined,
		upstreamHost: env.WP_UPSTREAM_HOST || undefined,
		adminPublicUrl: env.ADMIN_PUBLIC_URL || undefined,
		timeoutMs: milliseconds( env, 'UPSTREAM_TIMEOUT_MS', 60000, warn ),
		authTimeoutMs: milliseconds( env, 'AUTH_TIMEOUT_MS', 5000, warn ),
		trustProxy: env.TRUST_PROXY === '1',
		siteDir: env.SITE_DIR || path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../site' ),
	};
}
