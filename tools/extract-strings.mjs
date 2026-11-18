#!/usr/bin/env node
/**
 * Extracts the translatable strings of the admin site into languages/wp-admin-site.pot.
 *
 *   node tools/extract-strings.mjs           write the POT
 *   node tools/extract-strings.mjs --check   fail when the POT is stale or any error is reported
 *
 * Scans site/**\/*.js except site/vendor/ for `__`, `_x`, `_n` and `_nx` calls, plain and
 * `$`-prefixed (templates cannot resolve names that start with `_`, so they use `$__`,
 * `$_x`, `$_n`, `$_nx`). Every call passes its text domain as a string literal:
 *
 *   wp-admin-site  the strings of the skeleton and its own screens: written to the POT.
 *   default        strings of converted core screens, byte-identical to WordPress core's
 *                  so that existing language packs apply: not written, only reported (the
 *                  tests verify that each one exists in core's sources).
 *
 * No dependencies: a small tokenizer (tools/i18n/tokenize.mjs) reads the scripts and
 * tools/i18n/html.mjs the component templates.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, TokenizeError } from './i18n/tokenize.mjs';
import { tokenizeHtml, elementEnd, lineAt } from './i18n/html.mjs';

export const SITE_DOMAIN = 'wp-admin-site';
export const CORE_DOMAIN = 'default';
export const DOMAINS = [ SITE_DOMAIN, CORE_DOMAIN ];
export const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
export const POT_PATH = 'languages/wp-admin-site.pot';

/** Arguments of each translation function, in order. `n` is the count of `_n`. */
const SIGNATURES = {
	__: [ 'text', 'domain' ],
	_x: [ 'text', 'context', 'domain' ],
	_n: [ 'text', 'plural', 'n', 'domain' ],
	_nx: [ 'text', 'plural', 'n', 'context', 'domain' ],
};
const FUNCTION_NAME = /(?<![\w$])\$?(__|_nx|_n|_x)\s*\(/g;
const PLACEHOLDER = /%(?:\d+\$)?[sd]/g;

const normalize = ( text ) => text.replace( /\s+/g, ' ' ).trim();
const isTranslators = ( text ) => /^translators:/i.test( text );

/** The text of a script comment (or a run of adjacent line comments) without its delimiters. */
function commentText( value ) {
	return normalize( value
		.split( '\n' )
		.map( ( row ) => row.replace( /^\s*(?:\/\/|\/\*+|\*+\/?)\s?/, '' ).replace( /\*\/\s*$/, '' ) )
		.join( ' ' ) );
}

/** Script comments with adjacent `//` comments on consecutive lines merged into one. */
function mergedComments( tokens ) {
	const merged = [];
	for ( const token of tokens ) {
		if ( token.type !== 'comment' ) {
			continue;
		}
		const last = merged[ merged.length - 1 ];
		if ( token.kind === 'line' && last && last.kind === 'line' && last.endLine + 1 === token.line ) {
			last.value += '\n' + token.value;
			last.end = token.end;
			last.endLine = token.line;
		} else {
			merged.push( { ...token } );
		}
	}
	return merged;
}

/** Splits the tokens of a call, starting at its `(`, into arguments. Returns null when unclosed. */
function splitArguments( tokens, open ) {
	const args = [ [] ];
	let depth = 0;
	for ( let k = open; k < tokens.length; k++ ) {
		const token = tokens[ k ];
		if ( token.type === 'punct' && '([{'.includes( token.value ) ) {
			depth++;
			if ( depth === 1 ) {
				continue;
			}
		} else if ( token.type === 'punct' && ')]}'.includes( token.value ) ) {
			depth--;
			if ( depth === 0 ) {
				return args.length === 1 && args[ 0 ].length === 0 ? [] : args;
			}
		} else if ( depth === 1 && token.type === 'punct' && token.value === ',' ) {
			args.push( [] );
			continue;
		}
		args[ args.length - 1 ].push( token );
	}
	return null;
}

/** What one argument is: a literal, a template with substitutions, a concatenation, or something dynamic. */
function classify( tokens ) {
	if ( tokens === undefined ) {
		return { kind: 'missing' };
	}
	if ( tokens.length === 1 && tokens[ 0 ].type === 'string' ) {
		return { kind: 'literal', value: tokens[ 0 ].value };
	}
	if ( tokens.length === 1 && tokens[ 0 ].type === 'template' ) {
		return tokens[ 0 ].cooked === null ? { kind: 'substitution' } : { kind: 'literal', value: tokens[ 0 ].cooked };
	}
	if ( tokens.some( ( t ) => t.type === 'punct' && t.value === '+' ) && tokens.some( ( t ) => t.type === 'string' || t.type === 'template' ) ) {
		return { kind: 'concat' };
	}
	return { kind: 'dynamic' };
}

const placeholdersOf = ( text ) => ( text.replace( /%%/g, '' ).match( PLACEHOLDER ) ?? [] ).sort().join( ' ' );

/**
 * Turns the arguments of one call into a call record or errors.
 *
 * @return {{call?: object, errors: {line: number, message: string}[]}}
 */
function buildCall( fn, argTokens, { line, comment } ) {
	const roles = SIGNATURES[ fn ];
	const errors = [];
	const values = {};
	for ( const [ index, role ] of roles.entries() ) {
		if ( role === 'n' ) {
			continue;
		}
		const arg = classify( argTokens[ index ] );
		if ( arg.kind === 'literal' ) {
			values[ role ] = arg.value;
		} else if ( arg.kind === 'missing' && role === 'domain' ) {
			errors.push( { line, message: fn + '() has no text domain argument; pass \'' + SITE_DOMAIN + '\' (or \'' + CORE_DOMAIN + '\' for a converted core screen) as a string literal' } );
		} else if ( arg.kind === 'missing' ) {
			errors.push( { line, message: fn + '() is missing its ' + role + ' argument (a string literal)' } );
		} else if ( arg.kind === 'substitution' ) {
			errors.push( { line, message: 'the ' + role + ' of ' + fn + '() is a template literal with a ${} substitution; pass a plain string literal and use sprintf() for values' } );
		} else if ( arg.kind === 'concat' ) {
			errors.push( { line, message: 'string concatenation in the ' + role + ' of ' + fn + '(); write the whole string as one string literal' } );
		} else {
			errors.push( { line, message: 'the ' + role + ' of ' + fn + '() must be a string literal' } );
		}
	}
	if ( errors.length === 0 && ! DOMAINS.includes( values.domain ) ) {
		errors.push( { line, message: 'unknown text domain \'' + values.domain + '\' in ' + fn + '(); use \'' + SITE_DOMAIN + '\' or \'' + CORE_DOMAIN + '\'' } );
	}
	if ( errors.length === 0 && values.domain === SITE_DOMAIN ) {
		const found = placeholdersOf( values.text );
		if ( found !== '' && ! comment ) {
			errors.push( { line, message: 'the string \'' + values.text + '\' has placeholders but no translators comment (/* translators: %s: … */ in scripts, <!-- translators: … --> in templates)' } );
		}
		if ( values.plural !== undefined && found !== placeholdersOf( values.plural ) ) {
			errors.push( { line, message: 'the placeholders of the singular and plural of \'' + values.text + '\' differ' } );
		}
	}
	if ( errors.length > 0 ) {
		return { errors };
	}
	return {
		errors,
		call: { fn, text: values.text, plural: values.plural ?? null, context: values.context ?? '', domain: values.domain, comment, line },
	};
}

/** Calls in the text of a component template (the static text of a template literal). */
function callsInTemplateText( text, firstLine ) {
	const found = [];
	const errors = [];
	const html = tokenizeHtml( text );

	// Translators comments apply to the element that follows them (or the text node).
	const extents = [];
	let blanked = text;
	html.forEach( ( token, index ) => {
		if ( token.type !== 'comment' ) {
			return;
		}
		const inner = normalize( token.text );
		blanked = blanked.slice( 0, token.start ) + text.slice( token.start, token.end ).replace( /[^\n]/g, ' ' ) + blanked.slice( token.end );
		if ( ! isTranslators( inner ) ) {
			return;
		}
		let next = index + 1;
		while ( html[ next ]?.type === 'text' && html[ next ].text.trim() === '' ) {
			next++;
		}
		if ( html[ next ] ) {
			extents.push( { from: token.end, to: html[ next ].type === 'open' ? elementEnd( html, next ) : html[ next ].end, comment: inner } );
		}
	} );

	for ( const match of blanked.matchAll( FUNCTION_NAME ) ) {
		const line = lineAt( text, match.index, firstLine );
		const open = match.index + match[ 0 ].length - 1;
		let inner;
		try {
			inner = scan( blanked, { pos: open, stop: 'paren' } ).tokens.filter( ( t ) => t.type !== 'comment' );
		} catch ( error ) {
			errors.push( { line, message: 'cannot read the arguments of ' + match[ 1 ] + '(): ' + error.message } );
			continue;
		}
		const args = splitArguments( inner, 0 );
		if ( args === null ) {
			errors.push( { line, message: 'the call ' + match[ 1 ] + '() is not closed' } );
			continue;
		}
		const extent = extents.filter( ( e ) => e.from <= match.index && match.index < e.to ).pop();
		found.push( { fn: match[ 1 ], args, line, comment: extent?.comment } );
	}
	return { found, errors };
}

/** Calls in a script token list: recurses into template substitutions, scans template text. */
function callsInTokens( tokens, source, out ) {
	const significant = tokens.filter( ( t ) => t.type !== 'comment' );
	const comments = mergedComments( tokens ).filter( ( c ) => isTranslators( commentText( c.value ) ) );

	significant.forEach( ( token, index ) => {
		if ( token.type === 'template' ) {
			for ( const quasi of token.quasis ) {
				const { found, errors } = callsInTemplateText( quasi.text, quasi.line );
				out.found.push( ...found );
				out.errors.push( ...errors );
			}
			for ( const expression of token.expressions ) {
				callsInTokens( expression, source, out );
			}
			return;
		}
		if ( token.type !== 'ident' ) {
			return;
		}
		const name = token.value.replace( /^\$/, '' );
		if ( ! Object.hasOwn( SIGNATURES, name ) || significant[ index + 1 ]?.value !== '(' || significant[ index + 1 ].type !== 'punct' ) {
			return;
		}
		if ( significant[ index - 1 ]?.type === 'ident' && significant[ index - 1 ].value === 'function' ) {
			return;
		}
		const args = splitArguments( significant, index + 1 );
		if ( args === null ) {
			out.errors.push( { line: token.line, message: 'the call ' + name + '() is not closed' } );
			return;
		}
		const comment = comments.filter( ( c ) => c.end <= token.start ).pop();
		const attached = comment && ( source.slice( comment.end, token.start ).match( /\n/g ) ?? [] ).length <= 1 ? commentText( comment.value ) : undefined;
		out.found.push( { fn: name, args, line: token.line, comment: attached } );
	} );
}

/**
 * Translation calls of one source file.
 *
 * @param {string} path   Path used in references and errors (relative, with `/`).
 * @param {string} source Text of the file.
 * @return {{calls: object[], errors: {file: string, line: number, message: string}[]}}
 */
export function extractFromSource( path, source ) {
	const out = { found: [], errors: [] };
	try {
		callsInTokens( scan( source ).tokens, source, out );
	} catch ( error ) {
		if ( ! ( error instanceof TokenizeError ) ) {
			throw error;
		}
		return { calls: [], errors: [ { file: path, line: error.line, message: error.message } ] };
	}
	const calls = [];
	const errors = out.errors.map( ( e ) => ( { file: path, ...e } ) );
	for ( const item of out.found ) {
		const built = buildCall( item.fn, item.args, item );
		errors.push( ...built.errors.map( ( e ) => ( { file: path, ...e } ) ) );
		if ( built.call ) {
			calls.push( { ...built.call, file: path } );
		}
	}
	calls.sort( ( a, b ) => a.line - b.line );
	return { calls, errors };
}

const compare = ( a, b ) => ( a < b ? -1 : a > b ? 1 : 0 );

/**
 * Extracts from a list of files and merges the calls into entries per domain.
 *
 * @param {{path: string, source: string}[]} files
 * @return {{entries: Object<string, object[]>, errors: object[], files: string[]}}
 *         Entries sorted by context then msgid: { msgid, plural, context, comments, references }.
 */
export function extractSources( files ) {
	const errors = [];
	const merged = Object.fromEntries( DOMAINS.map( ( d ) => [ d, new Map() ] ) );
	const scanned = files
		.filter( ( f ) => ! f.path.startsWith( 'site/vendor/' ) )
		.sort( ( a, b ) => compare( a.path, b.path ) );

	for ( const file of scanned ) {
		const result = extractFromSource( file.path, file.source );
		errors.push( ...result.errors );
		for ( const call of result.calls ) {
			const key = call.context + '\u0004' + call.text;
			const entries = merged[ call.domain ];
			const reference = { file: call.file, line: call.line };
			const entry = entries.get( key );
			if ( ! entry ) {
				entries.set( key, { msgid: call.text, plural: call.plural, context: call.context, comments: call.comment ? [ call.comment ] : [], references: [ reference ], first: reference } );
				continue;
			}
			const where = entry.first.file + ':' + entry.first.line;
			if ( ( entry.plural === null ) !== ( call.plural === null ) ) {
				errors.push( { ...reference, message: 'the string \'' + call.text + '\' is used with a plural form here (or at ' + where + ') and without one elsewhere; one msgid and context cannot be both' } );
			} else if ( entry.plural !== call.plural ) {
				errors.push( { ...reference, message: 'the string \'' + call.text + '\' has the plural \'' + call.plural + '\' here but \'' + entry.plural + '\' at ' + where } );
			}
			if ( call.comment && ! entry.comments.includes( call.comment ) ) {
				entry.comments.push( call.comment );
			}
			if ( ! entry.references.some( ( r ) => r.file === reference.file && r.line === reference.line ) ) {
				entry.references.push( reference );
			}
		}
	}

	const entries = {};
	for ( const domain of DOMAINS ) {
		entries[ domain ] = [ ...merged[ domain ].values() ]
			.map( ( { first, ...entry } ) => ( {
				...entry,
				comments: [ ...entry.comments ].sort( compare ),
				references: [ ...entry.references ].sort( ( a, b ) => compare( a.file, b.file ) || a.line - b.line ),
			} ) )
			.sort( ( a, b ) => compare( a.context, b.context ) || compare( a.msgid, b.msgid ) );
	}
	return { entries, errors, files: scanned.map( ( f ) => f.path ) };
}

/** `site/**\/*.js` below `root`, except `site/vendor/`, as sorted { path, source }. */
export function readSiteFiles( root = ROOT ) {
	const files = [];
	const walk = ( directory ) => {
		for ( const item of readdirSync( directory, { withFileTypes: true } ) ) {
			const full = join( directory, item.name );
			const path = relative( root, full ).split( sep ).join( '/' );
			if ( item.isDirectory() ) {
				if ( path !== 'site/vendor' ) {
					walk( full );
				}
			} else if ( item.name.endsWith( '.js' ) ) {
				files.push( { path, source: readFileSync( full, 'utf8' ) } );
			}
		}
	};
	walk( join( root, 'site' ) );
	return files.sort( ( a, b ) => compare( a.path, b.path ) );
}

/** Extracts from the site tree below `root`. */
export function extractTree( root = ROOT ) {
	return extractSources( readSiteFiles( root ) );
}

export const formatErrors = ( errors ) => errors.map( ( e ) => e.file + ':' + e.line + ': ' + e.message );

const quote = ( text ) => '"' + text.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' ).replace( /\n/g, '\\n' ).replace( /\r/g, '\\r' ).replace( /\t/g, '\\t' ) + '"';

/**
 * The POT file text for the entries of one domain. Deterministic: no timestamp, sorted
 * entries and references, one line per string.
 */
export function renderPot( entries, domain ) {
	const lines = [
		'# Translation template for the "' + domain + '" text domain of the detached admin site.',
		'# Generated by tools/extract-strings.mjs (npm run i18n:pot). Do not edit by hand.',
		'msgid ""',
		'msgstr ""',
		quote( 'Project-Id-Version: ' + domain + '\n' ),
		quote( 'MIME-Version: 1.0\n' ),
		quote( 'Content-Type: text/plain; charset=UTF-8\n' ),
		quote( 'Content-Transfer-Encoding: 8bit\n' ),
		quote( 'Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\n' ),
		quote( 'X-Domain: ' + domain + '\n' ),
		'',
	];
	for ( const entry of entries ) {
		for ( const comment of entry.comments ) {
			lines.push( '#. ' + comment );
		}
		for ( const reference of entry.references ) {
			lines.push( '#: ' + reference.file + ':' + reference.line );
		}
		if ( entry.context !== '' ) {
			lines.push( 'msgctxt ' + quote( entry.context ) );
		}
		lines.push( 'msgid ' + quote( entry.msgid ) );
		if ( entry.plural !== null ) {
			lines.push( 'msgid_plural ' + quote( entry.plural ), 'msgstr[0] ""', 'msgstr[1] ""' );
		} else {
			lines.push( 'msgstr ""' );
		}
		lines.push( '' );
	}
	return lines.join( '\n' );
}

/** The command line: write the POT, or with `--check` compare it. Returns the exit code. */
export function main( argv, { root = ROOT, log = console.log, error = console.error } = {} ) {
	const check = argv.includes( '--check' );
	const result = extractTree( root );
	if ( result.errors.length > 0 ) {
		error( 'String extraction found ' + result.errors.length + ' problem(s):' );
		formatErrors( result.errors ).forEach( ( line ) => error( '  ' + line ) );
		return 1;
	}
	const pot = renderPot( result.entries[ SITE_DOMAIN ], SITE_DOMAIN );
	const target = join( root, POT_PATH );
	const current = existsSync( target ) ? readFileSync( target, 'utf8' ) : null;
	if ( check ) {
		if ( current !== pot ) {
			error( POT_PATH + ' is out of date; run `npm run i18n:pot` and commit the result.' );
			return 1;
		}
	} else if ( current !== pot ) {
		mkdirSync( dirname( target ), { recursive: true } );
		writeFileSync( target, pot );
	}
	const core = result.entries[ CORE_DOMAIN ];
	log( ( check ? 'Checked ' : 'Wrote ' ) + POT_PATH + ': ' + result.entries[ SITE_DOMAIN ].length + ' strings from ' + result.files.length + ' files.' );
	log( core.length + ' strings use the "' + CORE_DOMAIN + '" domain (WordPress core\'s own; not in the POT, verified against core by the tests):' );
	for ( const entry of core ) {
		const first = entry.references[ 0 ];
		log( '  ' + ( entry.context ? '[' + entry.context + '] ' : '' ) + JSON.stringify( entry.msgid ) + ( entry.plural ? ' / ' + JSON.stringify( entry.plural ) : '' ) + '  (' + first.file + ':' + first.line + ')' );
	}
	return 0;
}

if ( process.argv[ 1 ] && fileURLToPath( import.meta.url ) === process.argv[ 1 ] ) {
	process.exitCode = main( process.argv.slice( 2 ) );
}
