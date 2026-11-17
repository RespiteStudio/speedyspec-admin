import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';
import { classify, resolveUpstream, rewriteLocation, filterRequestHeaders, filterResponseHeaders } from './upstream.mjs';
import { resolveStatic, sendFile } from './static.mjs';

const SITES_TTL_MS = 60_000;
const SITE_PATH = /^\/sites\/(\d+)(?=\/|$)/;

function json( res, status, body ) {
	const data = JSON.stringify( body );
	res.writeHead( status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength( data ) } );
	res.end( data );
}

/**
 * Builds the proxy server (not listening).
 *
 * @param {{upstream: string, publicUrl?: string, upstreamHost?: string, siteDir: string}} config
 */
export function createServer( config ) {
	if ( ! config?.upstream ) {
		throw new Error( 'WP_UPSTREAM is required, for example WP_UPSTREAM=http://wordpress-develop' );
	}
	const upstream = new URL( config.upstream );
	const publicOrigin = config.publicUrl ? new URL( config.publicUrl ).origin : null;
	const hostOverride = config.upstreamHost || ( publicOrigin ? new URL( publicOrigin ).host : undefined );
	const siteDir = config.siteDir;
	const origins = [ upstream.origin, publicOrigin ].filter( Boolean );

	// The one thing that is cached: id -> { home }, for a short time.
	let sites = new Map();
	let sitesAt = 0;

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
			out.on( 'error', () => resolve( null ) );
			out.on( 'response', ( res ) => {
				const chunks = [];
				res.on( 'data', ( c ) => chunks.push( c ) );
				res.on( 'error', () => resolve( null ) );
				res.on( 'end', () => {
					try {
						const list = res.statusCode === 200 ? JSON.parse( Buffer.concat( chunks ).toString() ) : null;
						resolve( Array.isArray( list ) ? new Map( list.map( ( s ) => [ Number( s.id ), { home: s.home } ] ) ) : null );
					} catch {
						resolve( null );
					}
				} );
			} );
			out.end();
		} );
	}

	async function lookupSite( req, id ) {
		if ( Date.now() - sitesAt < SITES_TTL_MS && sites.has( id ) ) {
			return;
		}
		// Unknown or stale: refresh once.
		const fresh = await fetchSites( req );
		if ( fresh ) {
			sites = fresh;
			sitesAt = Date.now();
		}
	}

	async function forward( req, res, pathname, search ) {
		const match = SITE_PATH.exec( pathname );
		if ( match ) {
			await lookupSite( req, Number( match[ 1 ] ) );
		}
		const target = resolveUpstream( pathname, sites, config.upstream, hostOverride );
		if ( ! target ) {
			return json( res, 404, { code: 'admin_unknown_site' } );
		}

		const secure = Boolean( req.socket.encrypted );
		const adminHost = req.headers.host || '';
		const adminOrigin = `${secure ? 'https' : 'http'}://${adminHost}`;
		const headers = filterRequestHeaders( req.headers );
		headers[ 'x-wp-detached-admin' ] = '1';
		headers[ 'x-forwarded-host' ] = adminHost;
		headers[ 'x-forwarded-proto' ] = secure ? 'https' : 'http';
		headers[ 'x-forwarded-for' ] = req.socket.remoteAddress || '';

		const out = upstreamRequest( { method: req.method, path: target.path + search, headers, host: target.host } );
		out.on( 'response', ( up ) => {
			const resHeaders = filterResponseHeaders( up.headers );
			if ( resHeaders.location ) {
				resHeaders.location = rewriteLocation( resHeaders.location, { origins, adminOrigin } );
			}
			// rawHeaders-derived set-cookie stays an array: separate headers, unchanged.
			res.writeHead( up.statusCode, up.statusMessage, resHeaders );
			pipeline( up, res, () => {} );
		} );
		out.on( 'error', () => {
			if ( res.headersSent ) {
				return res.destroy();
			}
			json( res, 502, { code: 'admin_upstream_unreachable' } );
		} );
		res.on( 'close', () => out.destroy() );
		pipeline( req, out, () => {} );
	}

	function handle( req, res ) {
		const raw = req.url || '';
		// Origin-form request targets only: rejects absolute URLs, //host and backslashes.
		if ( ! raw.startsWith( '/' ) || raw.startsWith( '//' ) || raw.includes( '\\' ) || raw.includes( '\0' ) ) {
			return json( res, 400, { code: 'admin_bad_request' } );
		}
		const q = raw.indexOf( '?' );
		const pathname = q === -1 ? raw : raw.slice( 0, q );
		const search = q === -1 ? '' : raw.slice( q );
		let decoded;
		try {
			decoded = decodeURIComponent( pathname );
		} catch {
			return json( res, 400, { code: 'admin_bad_request' } );
		}
		if ( decoded.split( '/' ).includes( '..' ) || decoded.includes( '\\' ) || decoded.includes( '\0' ) || decoded.startsWith( '//' ) ) {
			return json( res, 400, { code: 'admin_bad_request' } );
		}

		const kind = classify( req.method, pathname, req.headers[ 'sec-fetch-dest' ], req.headers[ 'x-wp-admin-frame' ] );
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
			return sendFile( req, res, file );
		}
		const index = resolveStatic( siteDir, '/index.html' );
		if ( ! index || index === 'forbidden' ) {
			return json( res, 404, { code: 'admin_not_found' } );
		}
		return sendFile( req, res, index, { 'Cache-Control': 'no-cache' } );
	}

	const server = http.createServer( handle );
	server.on( 'clientError', ( err, socket ) => socket.end( 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n' ) );
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
		siteDir: env.SITE_DIR || path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '../site' ),
	};
}
