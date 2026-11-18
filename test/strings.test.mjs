import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, POT_PATH, SITE_DOMAIN, CORE_DOMAIN, extractSources, readSiteFiles, renderPot, formatErrors } from '../tools/extract-strings.mjs';
import { isCorePage, CORE_PAGE_PATHS } from '../tools/i18n/domains.mjs';
import { templatesOf, checkTemplate } from '../tools/i18n/template-text.mjs';
import { checkScript } from '../tools/i18n/script-text.mjs';
import { loadCoreStrings, stringsOfPhp } from '../tools/i18n/core-strings.mjs';

const files = readSiteFiles();
const extracted = extractSources( files );

/**
 * Genuine exceptions to the "no untranslated text" rules. Each entry names the file, the
 * finding's kind and text, and why it is not user-visible text. An entry that no longer
 * matches a finding fails the test, so this list cannot go stale.
 */
const ALLOW = [
	{ file: 'site/components/core/options-general/help.js', kind: 'property', text: 'http://', reason: 'A protocol prefix shown as code; the classic screen passes it untranslated to sprintf() too (wp-admin/options-general.php).' },
	{ file: 'site/components/core/options-general/help.js', kind: 'property', text: 'https://', reason: 'A protocol prefix shown as code; the classic screen passes it untranslated to sprintf() too (wp-admin/options-general.php).' },
];

function unallowed( file, findings, used ) {
	return findings.filter( ( finding ) => {
		const entry = ALLOW.find( ( e ) => e.file === file && e.kind === finding.kind && e.text === finding.text );
		if ( entry ) {
			used.add( entry );
		}
		return ! entry;
	} );
}
const usedAllowances = new Set();

test( 'the committed POT equals freshly extracted output', () => {
	const committed = readFileSync( join( ROOT, POT_PATH ), 'utf8' );
	assert.ok( committed === renderPot( extracted.entries[ SITE_DOMAIN ], SITE_DOMAIN ), POT_PATH + ' is stale: run `npm run i18n:pot`' );
	assert.ok( extracted.entries[ SITE_DOMAIN ].length > 30, 'the extractor found the site\'s strings' );
	assert.ok( extracted.files.length > 50, 'the extractor scanned the site tree' );
	assert.ok( ! extracted.files.some( ( f ) => f.startsWith( 'site/vendor/' ) ), 'site/vendor is not scanned' );
} );

test( 'the extractor reports no errors on the site tree', () => {
	assert.deepEqual( formatErrors( extracted.errors ), [] );
} );

test( 'every translation call passes a literal domain: default only on converted core pages, wp-admin-site elsewhere', () => {
	const wrong = [];
	for ( const entry of extracted.entries[ CORE_DOMAIN ] ) {
		for ( const reference of entry.references ) {
			if ( ! isCorePage( reference.file ) ) {
				wrong.push( reference.file + ':' + reference.line + ' uses the default domain for "' + entry.msgid + '" outside a converted core page' );
			}
		}
	}
	assert.deepEqual( wrong, [], 'core pages: ' + CORE_PAGE_PATHS.join( ', ' ) );
	// Non-literal or unknown domains are extractor errors (checked above); every call landed in a known domain.
	assert.ok( extracted.entries[ CORE_DOMAIN ].length > 0 );
} );

test( 'component templates have no untranslated text', () => {
	const problems = [];
	let templates = 0;
	let expected = 0;
	for ( const file of files ) {
		const list = templatesOf( file.source );
		templates += list.length;
		expected += ( file.source.match( /^\s*template:\s*[`'"]/gm ) ?? [] ).length;
		for ( const { text, line } of list ) {
			for ( const finding of unallowed( file.path, checkTemplate( text, { firstLine: line } ), usedAllowances ) ) {
				problems.push( file.path + ':' + finding.line + ': ' + finding.message );
			}
		}
	}
	assert.ok( templates >= 25, 'found the component templates (' + templates + ')' );
	assert.equal( templates, expected, 'every `template:` property was read as a template' );
	assert.deepEqual( problems, [] );
} );

test( 'scripts have no untranslated user-visible text', () => {
	const problems = [];
	for ( const file of files ) {
		for ( const finding of unallowed( file.path, checkScript( file.path, file.source ), usedAllowances ) ) {
			problems.push( file.path + ':' + finding.line + ': ' + finding.message );
		}
	}
	assert.deepEqual( problems, [] );
} );

test( 'the allow-list holds no stale entries', () => {
	assert.deepEqual( ALLOW.filter( ( entry ) => ! usedAllowances.has( entry ) ).map( ( e ) => e.file + ' ' + e.text ), [] );
	assert.ok( ALLOW.every( ( entry ) => entry.reason.length > 20 ), 'every entry says why' );
} );

const WP_SRC = resolve( ROOT, process.env.WP_SRC ?? '../wordpress-develop-original/src' );
const hasCore = existsSync( join( WP_SRC, 'wp-admin' ) ) && existsSync( join( WP_SRC, 'wp-includes' ) );

test( 'every default-domain string exists verbatim in WordPress core (same context and plural)', { skip: hasCore ? false : 'WordPress sources not found at ' + WP_SRC + '; set WP_SRC to the src directory of a WordPress checkout to run this check' }, ( t ) => {
	const core = loadCoreStrings( WP_SRC );
	assert.ok( core.size > 5000, 'read core\'s strings (' + core.size + ')' );
	const lost = extracted.entries[ CORE_DOMAIN ]
		.filter( ( entry ) => ! core.has( { text: entry.msgid, plural: entry.plural, context: entry.context } ) )
		.map( ( entry ) => JSON.stringify( entry.msgid ) + ( entry.context ? ' [context ' + entry.context + ']' : '' ) + ( entry.plural ? ' [plural]' : '' ) + ' at ' + entry.references[ 0 ].file + ':' + entry.references[ 0 ].line );
	assert.deepEqual( lost, [], 'these strings are not in core, so no language pack would translate them' );

	const hints = extracted.entries[ SITE_DOMAIN ]
		.filter( ( entry ) => core.has( { text: entry.msgid, plural: entry.plural, context: entry.context } ) )
		.map( ( entry ) => entry.msgid );
	t.diagnostic( 'Hint: ' + hints.length + ' wp-admin-site strings are identical to core strings and could use the default domain: ' + hints.join( '; ' ) );
} );

test( 'the core string reader decodes PHP literals and matches context and plural', () => {
	const php = String.raw`<?php
		echo __( 'Single \'quoted\' and back\\slash and \n kept' );
		_e( "Double \"quoted\" and\ttab and \\ and \$dollar" );
		echo esc_html__( 'Entity &#8220;%s.&#8221; <a href="%s">link</a>', 'default' );
		_x( 'Cancel request', 'admin email change' );
		esc_attr_x( 'Attr', 'ctx' );
		_n( '%s item', '%s items', $count );
		_nx( '%d comment', '%d comments', $number, 'comments title' );
		_n_noop( 'One', 'Many' );
		_nx_noop( 'One', 'Many', 'noop ctx' );
		__( $variable );
		__( 'a' . 'b' );
		__( "interpolated $name" );
		$x->__( 'method call' );
		// a_n( 'not a call', 'x' )
	`;
	const found = stringsOfPhp( php );
	const has = ( text, plural = null, context = '' ) => found.some( ( s ) => s.text === text && s.plural === plural && s.context === context );
	assert.ok( has( 'Single \'quoted\' and back\\slash and \\n kept' ) );
	assert.ok( has( 'Double "quoted" and\ttab and \\ and $dollar' ) );
	assert.ok( has( 'Entity &#8220;%s.&#8221; <a href="%s">link</a>' ) );
	assert.ok( has( 'Cancel request', null, 'admin email change' ) );
	assert.ok( has( 'Attr', null, 'ctx' ) );
	assert.ok( has( '%s item', '%s items' ) );
	assert.ok( has( '%d comment', '%d comments', 'comments title' ) );
	assert.ok( has( 'One', 'Many' ) );
	assert.ok( has( 'One', 'Many', 'noop ctx' ) );
	assert.ok( ! has( 'Cancel request' ), 'a string with a context does not match without it' );
	assert.ok( ! has( '%s item' ), 'a plural does not match as a singular' );
	assert.ok( ! found.some( ( s ) => [ 'a', 'ab', 'method call', 'not a call' ].includes( s.text ) || s.text.startsWith( 'interpolated' ) ) );
	assert.equal( found.length, 9 );
} );

test( 'the core string reader ignores comments, heredocs, inline HTML and other domains', () => {
	const php = String.raw`<script> var a = __( 'in outside js' ); </script>
	<?php
	// __( 'in line comment' );
	# __( 'in hash comment' );
	/* __( 'in block comment' ); */
	/**
	 * Docblock example: __( 'in docblock' ).
	 */
	$heredoc = <<<EOT
	__( 'in heredoc' )
	EOT;
	$nowdoc = <<<'EOT'
	__( 'in nowdoc' )
	EOT;
	$html = "<script>__( 'in a string' )</script>";
	echo __( 'plugin text', 'my-plugin' );
	echo __( 'variable domain', $domain );
	echo _x( 'ctx plugin', 'c', 'my-plugin' );
	echo __( 'explicit default', 'default' );
	echo __( 'no domain' ); // trailing __( 'trailing comment' )
	echo _n( 'one', 'many', $n, 'default' );
	echo _nx( 'one x', 'many x', $n, 'cx' );
	echo __( 'after attr' ); #[Attr]
	?>
	<p><?php echo esc_html__( 'in short tag' ); ?> __( 'between tags' )</p>
	`;
	const texts = stringsOfPhp( php ).map( ( s ) => s.text ).sort();
	assert.deepEqual( texts, [ 'after attr', 'explicit default', 'in short tag', 'no domain', 'one', 'one x' ].sort() );
} );

test( 'a corrupted default-domain string would be caught: the lookup is exact', { skip: hasCore ? false : 'WordPress sources not found at ' + WP_SRC }, () => {
	const core = loadCoreStrings( WP_SRC );
	const known = extracted.entries[ CORE_DOMAIN ].find( ( e ) => e.msgid === 'Site Title' );
	assert.ok( known && core.has( { text: 'Site Title', plural: null, context: '' } ) );
	assert.ok( ! core.has( { text: 'Site title', plural: null, context: '' } ), 'case differs' );
	assert.ok( ! core.has( { text: 'Site Title ', plural: null, context: '' } ), 'whitespace differs' );
	assert.ok( ! core.has( { text: 'Site Title', plural: null, context: 'x' } ), 'context differs' );
} );

test( 'checkTemplate: text nodes must be whitespace, interpolations, comments or allowed punctuation', () => {
	const kinds = ( html ) => checkTemplate( html ).map( ( f ) => f.kind );
	assert.deepEqual( kinds( '<p>Hello</p>' ), [ 'text' ] );
	assert.deepEqual( kinds( '<p>{{ a }} Hello {{ b }}</p>' ), [ 'text' ] );
	assert.deepEqual( kinds( '<p>1</p>' ), [ 'text' ], 'digits are text' );
	assert.deepEqual( kinds( '<p>Save!</p>' ), [ 'text' ] );
	assert.deepEqual( kinds( '<p>{{ $__( \'Hello\', \'wp-admin-site\' ) }}</p>\n<!-- a comment with words -->\n' ), [] );
	assert.deepEqual( kinds( '<p>{{ a }} | {{ b }} &nbsp; &mdash; ( {{ c }} ), {{ d }}: …</p>' ), [] );
	assert.deepEqual( kinds( '<ul><li>{{ a < b ? 1 : 2 }}</li></ul>' ), [], 'a < in an interpolation is not a tag' );
	assert.equal( checkTemplate( '<div>\n\t<p>\n\t\tHi there\n\t</p>\n</div>', { firstLine: 10 } )[ 0 ].line, 12 );
} );

test( 'checkTemplate: literal attributes and bare literal expressions', () => {
	const kinds = ( html ) => checkTemplate( html ).map( ( f ) => f.kind + ':' + f.text );
	assert.deepEqual( kinds( '<input placeholder="Search">' ), [ 'attribute:Search' ] );
	assert.deepEqual( kinds( '<a title="Close" aria-label="Close it" aria-description="d" alt="x" label="L"></a>' ), [ 'attribute:Close', 'attribute:Close it', 'attribute:d', 'attribute:x', 'attribute:L' ] );
	assert.deepEqual( kinds( '<input type="submit" value="Save"><button value="Go">{{ a }}</button>' ), [ 'attribute:Save', 'attribute:Go' ] );
	assert.deepEqual( kinds( '<input type="text" value="kept"><input type="hidden" name="x" value="1"><option value="a">{{ b }}</option>' ), [], 'value is only visible on buttons' );
	assert.deepEqual( kinds( '<img alt="" src="a.png"><a title="">{{ x }}</a>' ), [], 'an empty value is fine' );
	assert.deepEqual( kinds( '<a :title="\'Close\'" :aria-label="`Shut`">{{ \'Text\' }}</a>' ), [ 'literal:Close', 'literal:Shut', 'literal:Text' ] );
	assert.deepEqual( kinds( '<a :title="$__( \'Close\', \'wp-admin-site\' )" :aria-label="busy ? $__( \'a\', \'wp-admin-site\' ) : $__( \'b\', \'wp-admin-site\' )" :alt="label">{{ $sprintf( $__( \'Hi %s\', \'wp-admin-site\' ), n ) }}</a>' ), [], 'calls and expressions are fine' );
	assert.deepEqual( kinds( '<a :class="\'x\'" :href="\'/y\'" :type="\'button\'"></a>' ), [], 'only visible attributes are checked' );
	assert.deepEqual( kinds( '<p>{{ \' | \' }}</p>' ), [], 'a punctuation literal is a separator' );
	assert.deepEqual( kinds( '<a title="a > b" :aria-label="x > y ? $__( \'a\', \'wp-admin-site\' ) : \'\'">{{ x }}</a>' ), [ 'attribute:a > b' ], '> inside a quoted value does not end the tag' );
} );

test( 'checkTemplate: literals hidden in conditions, operators and concatenation are found', () => {
	const kinds = ( html ) => checkTemplate( html ).map( ( f ) => f.kind + ':' + f.text );
	assert.deepEqual( kinds( '<p>{{ cond ? \'Yes\' : \'No\' }}</p>' ), [ 'literal:Yes', 'literal:No' ] );
	assert.deepEqual( kinds( '<a :title="cond ? \'Open\' : \'Close\'">{{ x }}</a>' ), [ 'literal:Open', 'literal:Close' ] );
	assert.deepEqual( kinds( '<p>{{ cond && \'Loading\' }}</p>' ), [ 'literal:Loading' ] );
	assert.deepEqual( kinds( '<p>{{ message || \'Unknown error\' }}</p>' ), [ 'literal:Unknown error' ] );
	assert.deepEqual( kinds( '<p>{{ \'Hi \' + name }}</p>' ), [ 'literal:Hi ' ] );
	assert.deepEqual( kinds( '<p>{{ ( \'Saved\' ) }}</p>' ), [ 'literal:Saved' ] );
	assert.deepEqual( kinds( '<p v-text="cond ? \'a\' : \'b\'"></p>' ), [ 'literal:a', 'literal:b' ] );
	assert.deepEqual( kinds( '<p>{{ `Failed ${ name }` }}</p>' ), [ 'literal:Failed ' ] );
	assert.deepEqual( kinds( '<p :title="$sprintf( \'%s items\', n )">{{ x }}</p>' ), [ 'literal:%s items' ], 'a literal outside a translation call is found, also inside sprintf' );
	// Fine: translated, compared, empty, or punctuation.
	assert.deepEqual( kinds( '<p>{{ cond ? $__( \'Yes\', \'wp-admin-site\' ) : $__( \'No\', \'wp-admin-site\' ) }}</p>' ), [] );
	assert.deepEqual( kinds( '<p>{{ kind === \'a\' ? label : \'\' }} {{ map[ \'k\' ] }} {{ x != \'b\' && y }}</p>' ), [] );
	assert.deepEqual( kinds( '<p>{{ a ? \' | \' : \' · \' }}</p>' ), [] );
	assert.deepEqual( kinds( '<p :title="$sprintf( $_n( \'%d item\', \'%d items\', n, \'wp-admin-site\' ), n )">{{ x }}</p>' ), [] );
} );

test( 'templatesOf reads template properties, also inside nested templates', () => {
	const source = 'const a = { name: \'A\', template: `\n<p>{{ x }}</p>` };\nconst b = { template: \'<b>{{ y }}</b>\' };\n// template: `<i>not</i>`\nconst c = `${ { template: `<u>{{ z }}</u>` }.template }`;';
	assert.deepEqual( templatesOf( source ).map( ( t ) => [ t.text, t.line ] ), [ [ '\n<p>{{ x }}</p>', 1 ], [ '<b>{{ y }}</b>', 3 ], [ '<u>{{ z }}</u>', 5 ] ] );
} );

test( 'checkScript: user-visible literals in scripts', () => {
	const kinds = ( source, path = 'site/runtime/x.js' ) => checkScript( path, source ).map( ( f ) => f.kind + ':' + f.text );
	assert.deepEqual( kinds( 'notices.add( { type: \'info\', message: \'Saved\', dismissible: true } );' ), [ 'property:Saved' ] );
	assert.deepEqual( kinds( 'x = { label: "Go", title: `T`, \'aria-label\': \'A\', placeholder: \'P\', alt: \'a\', text: \'t\' };' ), [ 'property:Go', 'property:T', 'property:A', 'property:P', 'property:a', 'property:t' ] );
	assert.deepEqual( kinds( 'x = { type: \'warning\', name: \'Foo\', label: __( \'a\', \'wp-admin-site\' ), message, title: props.title, text: \'\' };' ), [] );
	assert.deepEqual( kinds( 'cond ? message : \'x\'; foo( message ? 1 : 2 );' ), [], 'a ternary is not an object property' );
	assert.deepEqual( kinds( 'document.title = \'Hello\'; document.title = shellTitle( s ); if ( a.title == \'x\' ) {}' ), [ 'assignment:Hello' ] );
	assert.deepEqual( kinds( 'el.setAttribute( \'aria-label\', \'Close\' ); el.setAttribute( \'class\', \'x\' ); el.setAttribute( \'title\', t );' ), [ 'attribute:Close' ] );
	assert.deepEqual( kinds( 'h( \'p\', { class: \'a\' }, \'Text\' ); h( \'span\', \'More\' ); h( \'p\', null, __( \'ok\', \'wp-admin-site\' ) ); h( Comp, props );' ), [ 'child:Text', 'child:More' ] );
	assert.deepEqual( kinds( 'notify( notices, \'Oops\' ); notify( notices, __( \'ok\', \'wp-admin-site\' ) );' ), [ 'notify:Oops' ] );
	assert.deepEqual( kinds( 'alert( \'Hi\' ); confirm( msg );' ), [ 'dialog:Hi' ] );
	assert.deepEqual( kinds( 'console.warn( \'dev only\' ); console.error( \'x\' ); throw new Error( \'internal\' );' ), [], 'console output and runtime errors are developer text' );
	assert.deepEqual( kinds( 'throw new Error( \'Shown\' );', 'site/pages/Login.js' ), [ 'error:Shown' ] );
	// Literals in conditions, concatenation and templates with substitutions.
	assert.deepEqual( kinds( 'x = { message: cond ? \'A\' : \'B\' };' ), [ 'property:A', 'property:B' ] );
	assert.deepEqual( kinds( 'x = { message: `Failed ${ name }`, title: \'T \' + name, label: a || \'Fallback\' };' ), [ 'property:Failed ', 'property:T ', 'property:Fallback' ] );
	assert.deepEqual( kinds( 'notify( notices, \'Oops \' + x ); notify( n, c ? \'a\' : \'b\' );' ), [ 'notify:Oops ', 'notify:a', 'notify:b' ] );
	assert.deepEqual( kinds( 'h( \'p\', null, \'Hello \' + name ); h( \'p\', { class: \'c\' }, [ \'x\' ] );' ), [ 'child:Hello ', 'child:x' ] );
	assert.deepEqual( kinds( 'el.textContent = cond ? \'A\' : \'B\'; el.title = `Close ${ x }`;' ), [ 'assignment:A', 'assignment:B', 'assignment:Close ' ] );
	assert.deepEqual( kinds( 'el.setAttribute( \'title\', `Close ${ x }` ); el.setAttribute( \'data-x\', \'a\' + b );' ), [ 'attribute:Close ' ] );
	assert.deepEqual( kinds( 'return { error: \'Could not save the thing\' };' ), [ 'property:Could not save the thing' ] );
	assert.deepEqual( kinds( 'x = { message: kind === \'a\' ? __( \'A\', \'wp-admin-site\' ) : sprintf( __( \'B %s\', \'wp-admin-site\' ), n ), label: { type: \'String\' } };' ), [], 'translated, compared or nested' );
	assert.deepEqual( kinds( 'x = { message: String( error.message ?? \'\' ), title: typeof p.title === \'string\' ? p.title : \'\' };' ), [] );
	// Known gaps (listed in the script-text.mjs header): a variable holding text, an unknown key.
	assert.deepEqual( kinds( 'const msg = \'Oops\'; notify( n, msg ); x = { save: \'Save changes\' };' ), [], 'documented gap' );
	assert.deepEqual( kinds( 'throw new Error( String( e ) ); // new Error( \'in a comment\' )', 'site/kit/X.js' ), [] );
	assert.deepEqual( kinds( 'const t = `${ notify( n, \'inside\' ) }`;' ), [ 'notify:inside' ] );
} );
