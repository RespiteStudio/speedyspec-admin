import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFromSource, extractSources, extractTree, renderPot, formatErrors } from '../tools/extract-strings.mjs';

const one = ( source, path = 'site/x.js' ) => extractFromSource( path, source );
const messages = ( result ) => result.errors.map( ( e ) => e.message );

test( 'finds every call form, plain and $-prefixed', () => {
	const { calls, errors } = one( `
		__( 'a', 'wp-admin-site' );
		_x( 'b', 'ctx b', 'wp-admin-site' );
		_n( 'one c', 'many c', n, 'wp-admin-site' );
		_nx( 'one d', 'many d', n, 'ctx d', 'wp-admin-site' );
		i18n.__( 'e', 'wp-admin-site' );
		const t = \`<p>{{ $__( 'f', 'wp-admin-site' ) }} {{ $_x( "g", "ctx g", "wp-admin-site" ) }}
			{{ $sprintf( $_n( 'one h', 'many h', 2, 'wp-admin-site' ), 2 ) }} {{ $_nx( 'one i', 'many i', 2, 'ctx i', 'wp-admin-site' ) }}</p>\`;
	` );
	assert.deepEqual( errors, [] );
	assert.deepEqual( calls.map( ( c ) => [ c.fn, c.text, c.plural ?? null, c.context ?? '', c.domain ] ), [
		[ '__', 'a', null, '', 'wp-admin-site' ],
		[ '_x', 'b', null, 'ctx b', 'wp-admin-site' ],
		[ '_n', 'one c', 'many c', '', 'wp-admin-site' ],
		[ '_nx', 'one d', 'many d', 'ctx d', 'wp-admin-site' ],
		[ '__', 'e', null, '', 'wp-admin-site' ],
		[ '__', 'f', null, '', 'wp-admin-site' ],
		[ '_x', 'g', null, 'ctx g', 'wp-admin-site' ],
		[ '_n', 'one h', 'many h', '', 'wp-admin-site' ],
		[ '_nx', 'one i', 'many i', 'ctx i', 'wp-admin-site' ],
	] );
} );

test( 'reports the line of a call, also when it spans lines and sits in a template', () => {
	const { calls } = one( 'const a = 1;\n__(\n\t\'multi\',\n\t\'wp-admin-site\'\n);\nconst t = `\n<p>\n{{ $__( \'in template\', \'wp-admin-site\' ) }}</p>`;' );
	assert.deepEqual( calls.map( ( c ) => [ c.text, c.line ] ), [ [ 'multi', 2 ], [ 'in template', 8 ] ] );
} );

test( 'decodes escapes and keeps entities and markup untouched', () => {
	const { calls } = one( String.raw`__( 'It\'s "quoted" \\ and\ttab', 'default' ); __( "say \"hi\"\n", 'default' ); __( 'a &#8220;%s.&#8221; <a href="%s">x</a>', 'default' );` );
	assert.deepEqual( calls.map( ( c ) => c.text ), [ 'It\'s "quoted" \\ and\ttab', 'say "hi"\n', 'a &#8220;%s.&#8221; <a href="%s">x</a>' ] );
} );

test( 'accepts a template literal without substitutions as a string', () => {
	const { calls, errors } = one( '__( `plain`, `wp-admin-site` );' );
	assert.deepEqual( errors, [] );
	assert.equal( calls[ 0 ].text, 'plain' );
} );

test( 'translators comments: block, line and html styles are carried', () => {
	const { calls, errors } = one( `
		/* translators: %s: A name. */
		sprintf( __( 'Hello, %s', 'wp-admin-site' ), name );
		// translators: 1: First. 2: Second.
		// continued on a second line.
		sprintf( __( '%1$s and %2$s', 'wp-admin-site' ), a, b );
		const x = cond ? /* translators: %d: Count. */ sprintf( _n( '%d one', '%d many', n, 'wp-admin-site' ), n ) : '';
		const t = \`
			<!-- translators: %s: Label of the item. -->
			<button
				:aria-label="$sprintf( $__( 'Open %s', 'wp-admin-site' ), label )"
			>x</button>
			<p>{{ $__( 'No comment here', 'wp-admin-site' ) }}</p>\`;
	` );
	assert.deepEqual( errors, [] );
	assert.deepEqual( calls.map( ( c ) => c.comment ), [
		'translators: %s: A name.',
		'translators: 1: First. 2: Second. continued on a second line.',
		'translators: %d: Count.',
		'translators: %s: Label of the item.',
		undefined,
	] );
} );

test( 'a comment that is not a translators comment or is far above is not attached', () => {
	const { calls } = one( `
		/* translators: far away */

		const x = 1;
		__( 'a', 'wp-admin-site' );
		// just a note
		__( 'b', 'wp-admin-site' );
	` );
	assert.deepEqual( calls.map( ( c ) => c.comment ), [ undefined, undefined ] );
} );

test( 'strings in comments and regular expressions are ignored, and do not hide real calls', () => {
	const { calls, errors } = one( `
		// __( 'in a line comment', 'wp-admin-site' )
		/* __( 'in a block comment', 'wp-admin-site' ) */
		const re = /__\\( 'in a regex', ' wp-admin-site'/g;
		const quote = /["'\`]/.test( x );
		__( 'real', 'wp-admin-site' );
		const t = \`<!-- $__( 'in an html comment', 'wp-admin-site' ) -->\`;
	` );
	assert.deepEqual( errors, [] );
	assert.deepEqual( calls.map( ( c ) => c.text ), [ 'real' ] );
} );

test( 'a call nested in a template substitution is found', () => {
	const { calls, errors } = one( 'const t = `x ${ __( \'inside\', \'wp-admin-site\' ) } y ${ `nested ${ _x( \'deep\', \'c\', \'wp-admin-site\' ) }` }`;' );
	assert.deepEqual( errors, [] );
	assert.deepEqual( calls.map( ( c ) => c.text ), [ 'inside', 'deep' ] );
} );

test( 'a msgid with ${} is an error', () => {
	const result = one( 'const n = 1; __( `Hello ${ n }`, \'wp-admin-site\' );' );
	assert.equal( result.errors.length, 1 );
	assert.match( messages( result )[ 0 ], /\$\{\}|substitution/i );
	assert.equal( result.errors[ 0 ].file, 'site/x.js' );
	assert.equal( result.errors[ 0 ].line, 1 );
} );

test( 'a non-literal text, plural, context or domain is an error', () => {
	for ( const source of [
		'__( label, \'wp-admin-site\' );',
		'_x( \'a\', ctx, \'wp-admin-site\' );',
		'_n( \'a\', plural, n, \'wp-admin-site\' );',
		'__( \'a\', domain );',
		'__( \'a\', DOMAIN );',
	] ) {
		const result = one( source );
		assert.equal( result.errors.length, 1, source );
		assert.match( messages( result )[ 0 ], /string literal/, source );
	}
} );

test( 'a missing or unknown domain is an error', () => {
	assert.match( messages( one( '__( \'a\' );' ) )[ 0 ], /domain/ );
	assert.match( messages( one( '_n( \'a\', \'b\', 2 );' ) )[ 0 ], /domain/ );
	assert.match( messages( one( '__( \'a\', \'my-plugin\' );' ) )[ 0 ], /my-plugin/ );
	assert.deepEqual( one( '__( \'a\', \'default\' );' ).errors, [] );
} );

test( 'string concatenation inside a call is an error', () => {
	const result = one( '__( \'a\' + \'b\', \'wp-admin-site\' ); __( \'c\', \'wp-admin-\' + \'site\' );' );
	assert.equal( result.errors.length, 2 );
	assert.ok( messages( result ).every( ( m ) => /concatenat/i.test( m ) ) );
} );

test( 'placeholders need a translators comment in the wp-admin-site domain', () => {
	for ( const text of [ 'Hi %s', 'Total %d', 'A %1$s B %2$s' ] ) {
		const result = one( `__( '${ text }', 'wp-admin-site' );` );
		assert.equal( result.errors.length, 1, text );
		assert.match( messages( result )[ 0 ], /translators/ );
	}
	assert.deepEqual( one( '/* translators: %s: Name. */ __( \'Hi %s\', \'wp-admin-site\' );' ).errors, [] );
	assert.deepEqual( one( '__( \'100%% sure\', \'wp-admin-site\' );' ).errors, [], '%% is not a placeholder' );
	// Core owns the comments of the strings it provides.
	assert.deepEqual( one( '__( \'Hi %s\', \'default\' );' ).errors, [] );
} );

test( 'plural forms must agree on placeholders', () => {
	const bad = one( '/* translators: %d: n. */ _n( \'One item\', \'%d items\', n, \'wp-admin-site\' );' );
	assert.equal( bad.errors.length, 1 );
	assert.match( bad.errors[ 0 ].message, /placeholder/ );
	assert.deepEqual( one( '/* translators: %d: n. */ _n( \'%d item\', \'%d items\', n, \'wp-admin-site\' );' ).errors, [] );
} );

test( 'one msgid and context cannot be both plural and singular', () => {
	const result = extractSources( [
		{ path: 'site/a.js', source: '__( \'Item\', \'wp-admin-site\' );' },
		{ path: 'site/b.js', source: '_n( \'Item\', \'Items\', n, \'wp-admin-site\' );' },
	] );
	assert.equal( result.errors.length, 1 );
	assert.match( result.errors[ 0 ].message, /plural/ );
	// A different context is a different entry.
	const fine = extractSources( [
		{ path: 'site/a.js', source: '__( \'Item\', \'wp-admin-site\' );' },
		{ path: 'site/b.js', source: '_nx( \'Item\', \'Items\', n, \'menu\', \'wp-admin-site\' );' },
	] );
	assert.deepEqual( fine.errors, [] );
	// Two different plurals for one singular cannot both be in the POT.
	const clash = extractSources( [
		{ path: 'site/a.js', source: '_n( \'Item\', \'Items\', n, \'wp-admin-site\' );' },
		{ path: 'site/b.js', source: '_n( \'Item\', \'Things\', n, \'wp-admin-site\' );' },
	] );
	assert.equal( clash.errors.length, 1 );
} );

test( 'entries merge across files, split by domain, with sorted de-duplicated references and comments', () => {
	const result = extractSources( [
		{ path: 'site/b.js', source: '\n/* translators: %s: Name. */\n__( \'Hi %s\', \'wp-admin-site\' );' },
		{ path: 'site/a.js', source: '/* translators: %s: Name. */ __( \'Hi %s\', \'wp-admin-site\' ); __( \'Core text\', \'default\' );' },
		{ path: 'site/vendor/x.js', source: '__( \'Vendored\', \'wp-admin-site\' );' },
	] );
	assert.deepEqual( result.errors, [] );
	const [ hi ] = result.entries[ 'wp-admin-site' ];
	assert.deepEqual( hi.references, [ { file: 'site/a.js', line: 1 }, { file: 'site/b.js', line: 3 } ] );
	assert.deepEqual( hi.comments, [ 'translators: %s: Name.' ] );
	assert.deepEqual( result.entries.default.map( ( e ) => e.msgid ), [ 'Core text' ] );
	assert.equal( result.entries[ 'wp-admin-site' ].length, 1, 'site/vendor is not scanned' );
} );

test( 'renderPot writes the header, sorted entries, plurals, contexts and escapes', () => {
	const { entries } = extractSources( [
		{ path: 'site/a.js', source: [
			'__( \'Zebra\', \'wp-admin-site\' );',
			'__( \'Apple "quoted" \\\\ back\\nnew\\ttab\', \'wp-admin-site\' );',
			'_x( \'Apple\', \'Fruit\', \'wp-admin-site\' );',
			'/* translators: %d: Count. */',
			'_n( \'%d pear\', \'%d pears\', n, \'wp-admin-site\' );',
			'_nx( \'One cow\', \'Many cows\', n, \'Animals\', \'wp-admin-site\' );',
		].join( '\n' ) },
	] );
	const pot = renderPot( entries[ 'wp-admin-site' ], 'wp-admin-site' );
	assert.ok( pot.endsWith( '\n' ) && ! pot.endsWith( '\n\n' ) );
	assert.match( pot, /^# .*\nmsgid ""\nmsgstr ""\n"Project-Id-Version: wp-admin-site\\n"\n/m );
	for ( const header of [ 'Content-Type: text/plain; charset=UTF-8\\n', 'Content-Transfer-Encoding: 8bit\\n', 'X-Domain: wp-admin-site\\n', 'Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n' ] ) {
		assert.ok( pot.includes( '"' + header + '"' ), header );
	}
	assert.doesNotMatch( pot, /POT-Creation-Date|PO-Revision-Date|Last-Translator/ );
	const body = pot.slice( pot.indexOf( '\n\n' ) + 2 );
	assert.equal( body, [
		'#. translators: %d: Count.',
		'#: site/a.js:5',
		'msgid "%d pear"',
		'msgid_plural "%d pears"',
		'msgstr[0] ""',
		'msgstr[1] ""',
		'',
		'#: site/a.js:2',
		'msgid "Apple \\"quoted\\" \\\\ back\\nnew\\ttab"',
		'msgstr ""',
		'',
		'#: site/a.js:1',
		'msgid "Zebra"',
		'msgstr ""',
		'',
		'#: site/a.js:6',
		'msgctxt "Animals"',
		'msgid "One cow"',
		'msgid_plural "Many cows"',
		'msgstr[0] ""',
		'msgstr[1] ""',
		'',
		'#: site/a.js:3',
		'msgctxt "Fruit"',
		'msgid "Apple"',
		'msgstr ""',
		'',
	].join( '\n' ) );
} );

test( 'extracting twice gives byte-identical output, whatever the input order', () => {
	const files = [
		{ path: 'site/a.js', source: '__( \'one\', \'wp-admin-site\' ); __( \'two\', \'wp-admin-site\' );' },
		{ path: 'site/b.js', source: '__( \'two\', \'wp-admin-site\' ); __( \'three\', \'wp-admin-site\' );' },
	];
	const render = ( list ) => renderPot( extractSources( list ).entries[ 'wp-admin-site' ], 'wp-admin-site' );
	assert.equal( render( files ), render( files ) );
	assert.equal( render( files ), render( [ ...files ].reverse() ) );
} );

test( 'extractTree scans site/**/*.js except site/vendor and reports a bad file with its path', () => {
	const root = mkdtempSync( join( tmpdir(), 'extract-' ) );
	try {
		mkdirSync( join( root, 'site/vendor' ), { recursive: true } );
		mkdirSync( join( root, 'site/pages' ), { recursive: true } );
		writeFileSync( join( root, 'site/pages/A.js' ), '__( \'Hello\', \'wp-admin-site\' );\n' );
		writeFileSync( join( root, 'site/pages/B.js' ), '__( oops, \'wp-admin-site\' );\n' );
		writeFileSync( join( root, 'site/pages/readme.txt' ), '__( \'ignored\', \'wp-admin-site\' );\n' );
		writeFileSync( join( root, 'site/vendor/v.js' ), '__( \'Vendored\', \'wp-admin-site\' );\n' );
		const result = extractTree( root );
		assert.deepEqual( result.files, [ 'site/pages/A.js', 'site/pages/B.js' ] );
		assert.deepEqual( result.entries[ 'wp-admin-site' ].map( ( e ) => e.msgid ), [ 'Hello' ] );
		assert.deepEqual( formatErrors( result.errors ), [ 'site/pages/B.js:1: ' + result.errors[ 0 ].message ] );
	} finally {
		rmSync( root, { recursive: true, force: true } );
	}
} );

test( 'an unterminated string is reported as an error rather than thrown', () => {
	const result = one( 'const a = \'oops;\n__( \'ok\', \'wp-admin-site\' );' );
	assert.equal( result.errors.length, 1 );
	assert.equal( result.errors[ 0 ].line, 1 );
} );
