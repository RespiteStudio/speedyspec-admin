import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders, filterResponseHeaders } from './upstream.mjs';
import { resolveStatic, sendFile } from './static.mjs';

const SITE_PATH = /^\/sites\/(\d+)(?=\/|$)/;
const SITES_MAX_BYTES = 1024 * 1024;

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
 *          timeoutMs?: number, sitesTtlMs?: number, sitesNegativeTtlMs?: number}} config
 */
export function createServer( config ) {
	if ( ! config?.upstream ) {
		throw new Error( 'WP_UPSTREAM is required, for example WP_UPSTREAM=http://wordpress-develop' );
	}
	const upstream = new URL( config.upstream );
	const publicOrigin = config.publicUrl ? new URL( config.publicUrl ).origin : null;
	const adminPublic = config.adminPublicUrl ? new URL( config.adminPublicUrl ) : null;
	const hostOverride = config.upstreamHost || ( publicOrigin ? new URL( publicOrigin ).host : undefined );
	const siteDir = config.siteDir;
	const origins = [ upstream.origin, publicOrigin ].filter( Boolean );
	const timeoutMs = config.timeoutMs ?? 60_000;
	const sitesTtlMs = config.sitesTtlMs ?? 60_000;
	const negativeTtlMs = config.sitesNegativeTtlMs ?? 3_000;

	// The one thing that is cached: id -> { home, expires }, merged across users, plus unknown ids for a few seconds.
	const sites = new Map();
	const unknown = new Map();
	let inflight = null;

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

	async function lookupSite( req, id ) {
		if ( known( id ) || ( unknown.get( id ) ?? 0 ) > Date.now() ) {
			return;
		}
		// An anonymous caller cannot learn the sites, so there is nothing to refetch.
		if ( ! req.headers.cookie && ! req.headers.authorization ) {
			return;
		}
		inflight ??= fetchSites( req ).finally( () => {
			inflight = null;
		} );
		const list = await inflight;
		for ( const s of list ?? [] ) {
			sites.set( Number( s.id ), { home: s.home, expires: Date.now() + sitesTtlMs } );
		}
		if ( list && ! known( id ) && negativeTtlMs > 0 ) {
			unknown.set( id, Date.now() + negativeTtlMs );
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

		const secure = Boolean( req.socket.encrypted );
		const adminHost = adminPublic ? adminPublic.host : req.headers.host || '';
		const adminProto = adminPublic ? adminPublic.protocol.replace( ':', '' ) : secure ? 'https' : 'http';
		const adminOrigin = `${adminProto}://${adminHost}`;
		const headers = filterRequestHeaders( req.headers );
		headers[ 'x-wp-detached-admin' ] = '1';
		headers[ 'x-forwarded-host' ] = adminHost;
		headers[ 'x-forwarded-proto' ] = adminProto;
		headers[ 'x-forwarded-for' ] = req.socket.remoteAddress || '';
		// The body is framed explicitly: Transfer-Encoding is hop-by-hop and was dropped above.
		if ( req.headers[ 'transfer-encoding' ] ) {
			headers[ 'transfer-encoding' ] = 'chunked';
		}

		const out = upstreamRequest( { method: req.method, path: target.path + search, headers, host: target.host } );
		let timedOut = false;
		const timer = setTimeout( () => {
			timedOut = true;
			out.destroy();
		}, timeoutMs );
		out.on( 'response', ( up ) => {
			clearTimeout( timer );
			const resHeaders = filterResponseHeaders( up.headers );
			if ( resHeaders.location ) {
				const site = siteId === null ? undefined : { id: siteId, home: sites.get( siteId ).home };
				resHeaders.location = rewriteLocation( resHeaders.location, { origins, adminOrigin, site } );
			}
			// set-cookie stays an array: separate headers, unchanged.
			res.writeHead( up.statusCode, up.statusMessage, resHeaders );
			pipeline( up, res, () => {} );
		} );
		out.on( 'error', () => {
			clearTimeout( timer );
			if ( res.headersSent ) {
				return res.destroy();
			}
			if ( timedOut ) {
				return json( res, 504, { code: 'admin_upstream_timeout' } );
			}
			json( res, 502, { code: 'admin_upstream_unreachable' } );
		} );
		res.on( 'close', () => {
			clearTimeout( timer );
			out.destroy();
		} );
		pipeline( req, out, () => {} );
	}

	function handle( req, res ) {
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
			return forward( req, res, pathname, search ).catch( () => json( res, 502, { code: 'admin_upstream_unreachable' } ) );
		}
		if ( req.method !== 'GET' && req.method !== 'HEAD' ) {
			res.setHeader( 'Allow', 'GET, HEAD' );
			return json( res, 405, { code: 'admin_method_not_allowed' } );
		}
		const file = resolveStatic( siteDir, pathname );
		if ( file === 'forbidden' ) {
			return json( res, 403, { code: 'admin_forbidden' } );
		}
		if ( file && pathname !== '/' ) {
			return sendFile( req, res, file, decoded === '/index.html' ? { 'Cache-Control': 'no-cache' } : {} );
		}
		const index = resolveStatic( siteDir, '/index.html' );
		if ( ! index || index === 'forbidden' ) {
			return json( res, 404, { code: 'admin_not_found' } );
		}
		return sendFile( req, res, index, { 'Cache-Control': 'no-cache' } );
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
		siteDir: env.SITE_DIR || path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../site' ),
	};
}
