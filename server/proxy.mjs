import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders, filterResponseHeaders } from './upstream.mjs';
import { resolveStatic, sendFile } from './static.mjs';

const SITE_PATH = /^\/sites\/(\d+)(?=\/|$)/;
const SITES_MAX_BYTES = 1024 * 1024;
const NEGATIVE_MAX_ENTRIES = 1000;

function json( res, status, body, extraHeaders = {} ) {
	const data = JSON.stringify( body );
	res.writeHead( status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength( data ), ...extraHeaders } );
	res.end( data );
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
 *          logger?: (error: unknown) => void}} config
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

	async function forward( req, res, pathname, search ) {
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

		const secure = Boolean( req.socket.encrypted );
		const remote = req.socket.remoteAddress || '';
		const incomingProto = String( req.headers[ 'x-forwarded-proto' ] || '' ).split( ',' )[ 0 ].trim();
		const adminHost = adminPublic ? adminPublic.host : req.headers.host || '';
		const adminProto = adminPublic
			? adminPublic.protocol.replace( ':', '' )
			: trustProxy && ( incomingProto === 'http' || incomingProto === 'https' ) ? incomingProto : secure ? 'https' : 'http';
		const adminOrigin = `${adminProto}://${adminHost}`;
		const headers = filterRequestHeaders( req.headers );
		headers[ 'x-wp-detached-admin' ] = '1';
		headers[ 'x-forwarded-host' ] = adminHost;
		headers[ 'x-forwarded-proto' ] = adminProto;
		headers[ 'x-forwarded-for' ] = trustProxy && req.headers[ 'x-forwarded-for' ] ? `${req.headers[ 'x-forwarded-for' ]}, ${remote}` : remote;
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
			return forward( req, res, pathname, search );
		}
		if ( req.method !== 'GET' && req.method !== 'HEAD' ) {
			res.setHeader( 'Allow', 'GET, HEAD' );
			return json( res, 405, { code: 'admin_method_not_allowed' } );
		}
		const file = resolveStatic( config.siteDir, pathname );
		if ( file === 'forbidden' ) {
			return json( res, 403, { code: 'admin_forbidden' } );
		}
		if ( file && pathname !== '/' ) {
			return sendFile( req, res, file, decoded === '/index.html' ? { 'Cache-Control': 'no-cache' } : {} );
		}
		const index = resolveStatic( config.siteDir, '/index.html' );
		if ( ! index || index === 'forbidden' ) {
			return json( res, 404, { code: 'admin_not_found' } );
		}
		return sendFile( req, res, index, { 'Cache-Control': 'no-cache' } );
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

export function configFromEnv( env = process.env ) {
	if ( ! env.WP_UPSTREAM ) {
		throw new Error( 'WP_UPSTREAM is required, for example WP_UPSTREAM=http://wordpress-develop' );
	}
	return {
		port: Number( env.PORT || 8890 ),
		upstream: env.WP_UPSTREAM,
		publicUrl: env.WP_PUBLIC_URL || undefined,
		upstreamHost: env.WP_UPSTREAM_HOST || undefined,
		adminPublicUrl: env.ADMIN_PUBLIC_URL || undefined,
		timeoutMs: Number( env.UPSTREAM_TIMEOUT_MS || 60000 ),
		trustProxy: env.TRUST_PROXY === '1',
		siteDir: env.SITE_DIR || path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../site' ),
	};
}
