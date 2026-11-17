import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8',
	'.pot': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

export function contentType( file ) {
	return TYPES[ path.extname( file ).toLowerCase() ] || 'application/octet-stream';
}

/**
 * Resolves a request pathname to a regular file inside siteDir.
 *
 * @returns {{file: string, stat: fs.Stats}|null|'forbidden'} null when there is no such file.
 */
export function resolveStatic( siteDir, pathname ) {
	let decoded;
	try {
		decoded = decodeURIComponent( pathname );
	} catch {
		return 'forbidden';
	}
	if ( decoded.includes( '\0' ) || decoded.includes( '\\' ) ) {
		return 'forbidden';
	}
	const segments = decoded.split( '/' ).filter( ( s ) => s !== '' );
	if ( segments.some( ( s ) => s === '..' || s.startsWith( '.' ) ) ) {
		return 'forbidden';
	}
	let root;
	try {
		root = fs.realpathSync( siteDir );
	} catch {
		return null;
	}
	let real;
	try {
		real = fs.realpathSync( path.join( root, ...segments ) );
	} catch {
		return null;
	}
	if ( real !== root && ! real.startsWith( root + path.sep ) ) {
		return 'forbidden';
	}
	let stat;
	try {
		stat = fs.statSync( real );
	} catch {
		return null;
	}
	if ( ! stat.isFile() ) {
		return null;
	}
	return { file: real, stat };
}

export function sendFile( req, res, { file, stat }, extraHeaders = {} ) {
	const etag = `W/"${stat.size.toString( 16 )}-${Math.floor( stat.mtimeMs ).toString( 16 )}"`;
	const headers = { 'Content-Type': contentType( file ), ETag: etag, 'Last-Modified': stat.mtime.toUTCString(), ...extraHeaders };
	const since = req.headers[ 'if-modified-since' ];
	const fresh = req.headers[ 'if-none-match' ]
		? req.headers[ 'if-none-match' ].split( ',' ).map( ( t ) => t.trim() ).includes( etag )
		: since && Math.floor( stat.mtimeMs / 1000 ) <= Math.floor( Date.parse( since ) / 1000 );
	if ( fresh ) {
		res.writeHead( 304, headers );
		return res.end();
	}
	headers[ 'Content-Length' ] = stat.size;
	res.writeHead( 200, headers );
	if ( req.method === 'HEAD' ) {
		return res.end();
	}
	pipeline( createReadStream( file ), res, () => {} );
}
