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
export function resolveStatic( siteDir, pathname, fsImpl = fs ) {
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
		root = fsImpl.realpathSync( siteDir );
	} catch {
		return null;
	}
	let real;
	try {
		real = fsImpl.realpathSync( path.join( root, ...segments ) );
	} catch {
		return null;
	}
	if ( real !== root && ! real.startsWith( root + path.sep ) ) {
		return 'forbidden';
	}
	let stat;
	try {
		stat = fsImpl.statSync( real );
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

export const PUBLIC_LIST = 'public-files.json';
const SHELL = '/index.html';

/** The form a decoded request path is compared in: the segments resolveStatic reads, joined. */
export function staticKey( decoded ) {
	return '/' + decoded.split( '/' ).filter( ( s ) => s !== '' ).join( '/' );
}

/**
 * Whether a normalised path (staticKey) may be served without a signed-in user.
 * Exact and case-sensitive: anything not on the list is protected.
 *
 * @param {string} key
 * @param {Set<string>} publicFiles
 * @returns {'public'|'protected'}
 */
export function gate( key, publicFiles ) {
	return publicFiles.has( key ) ? 'public' : 'protected';
}

/** Root-relative file paths only: no globs, directories, dot segments or encodings. */
function validEntry( entry ) {
	if ( typeof entry !== 'string' || ! entry.startsWith( '/' ) || entry.endsWith( '/' ) ) {
		return false;
	}
	if ( /[*?[\]{}%\\\0]/.test( entry ) || entry !== staticKey( entry ) ) {
		return false;
	}
	return entry.split( '/' ).slice( 1 ).every( ( s ) => ! s.startsWith( '.' ) );
}

/**
 * The site's public list, `{ "files": [ "/index.html", … ] }` in `site/public-files.json`.
 * Read on first use and again whenever the file's mtime or size changes; a missing or invalid
 * list leaves only the shell document public (fail closed) and logs one error.
 */
export function createPublicFiles( { fsImpl = fs, log = ( error ) => console.error( error ) } = {} ) {
	let signature = null;
	let current = new Set( [ SHELL ] );

	function failClosed( sig, message ) {
		current = new Set( [ SHELL ] );
		if ( signature !== sig ) {
			log( new Error( message ) );
		}
		signature = sig;
		return current;
	}

	return {
		get( siteDir ) {
			const file = path.join( siteDir, PUBLIC_LIST );
			let stat;
			try {
				stat = fsImpl.statSync( file );
			} catch {
				return failClosed( 'missing', `${ PUBLIC_LIST } not found in ${ siteDir }: only ${ SHELL } is public.` );
			}
			const sig = `${ stat.mtimeMs }:${ stat.size }:${ stat.ino }`;
			if ( sig === signature ) {
				return current;
			}
			let files;
			try {
				files = JSON.parse( fsImpl.readFileSync( file, 'utf8' ) )?.files;
			} catch {
				files = null;
			}
			if ( ! Array.isArray( files ) || ! files.every( validEntry ) ) {
				return failClosed( sig, `${ PUBLIC_LIST } is invalid (it must be { "files": [ exact root-relative paths ] }): only ${ SHELL } is public.` );
			}
			signature = sig;
			current = new Set( [ SHELL, ...files ] );
			return current;
		},
	};
}
