import test, { afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { FakeDOMParser } from './helpers/html-parser.mjs';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { contracts } = await import( './helpers/contracts-instance-stub.mjs' );
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { createNotices } = await import( '../site/runtime/notices.js' );
const { default: InlineMarkup, sanitizeMarkup } = await import( '../site/kit/InlineMarkup.js' );

const { h, reactive } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
globalThis.__modules[ '/contracts/core/notices.js' ] = await import( '../site/contracts/core/notices.js' );
globalThis.__modules[ '/components/core/notices.js' ] = await import( '../site/components/core/notices.js' );

const BASE = 'http://admin.test/wp-admin/';
const sanitize = ( html ) => sanitizeMarkup( html, { Parser: FakeDOMParser, base: BASE } );

let saved;
before( () => {
	saved = globalThis.DOMParser;
	globalThis.DOMParser = FakeDOMParser;
} );
after( () => {
	globalThis.DOMParser = saved;
} );
afterEach( () => {
	unmountAll();
	contracts.configure( { replacements: {}, slots: {} } );
} );

/** The tags of every element of a sanitized tree, depth first. */
const tagsOf = ( nodes ) => nodes.flatMap( ( node ) => ( typeof node === 'string' ? [] : [ node.tag, ...tagsOf( node.children ) ] ) );
const textOfNodes = ( nodes ) => nodes.map( ( node ) => ( typeof node === 'string' ? node : textOfNodes( node.children ) ) ).join( '' );

test( 'InlineMarkup keeps code, strong and em, without their attributes', () => {
	const nodes = sanitize( 'Run <code class="x">wp</code>, <strong onclick="steal()">now</strong> or <em style="color:red">later</em>.' );
	assert.deepEqual( nodes, [
		'Run ',
		{ tag: 'code', attributes: {}, children: [ 'wp' ] },
		', ',
		{ tag: 'strong', attributes: {}, children: [ 'now' ] },
		' or ',
		{ tag: 'em', attributes: {}, children: [ 'later' ] },
		'.',
	] );
} );

test( 'InlineMarkup with spans keeps span with class, title and aria-hidden only; without, span is dropped', () => {
	const html = '<span class="vers comment-grey-bubble" title="Comments" aria-hidden="true" onclick="steal()" style="color:red"></span><span class="screen-reader-text">Comments</span>';
	assert.deepEqual( sanitizeMarkup( html, { Parser: FakeDOMParser, base: BASE, spans: true } ), [
		{ tag: 'span', attributes: { class: 'vers comment-grey-bubble', title: 'Comments', 'aria-hidden': 'true' }, children: [] },
		{ tag: 'span', attributes: { class: 'screen-reader-text' }, children: [ 'Comments' ] },
	] );
	assert.deepEqual( sanitize( html ), [ 'Comments' ] );
} );

test( 'InlineMarkup spans prop renders the kept spans', async () => {
	const view = mount( () => h( 'p', null, [ h( InlineMarkup, { html: '<span class="dashicons" aria-hidden="true"></span> <script>x</script>Hi', spans: true } ) ] ) );
	await flush();
	const span = find( view.container, byTag( 'span' ) );
	assert.equal( span.props.class, 'dashicons' );
	assert.equal( span.props[ 'aria-hidden' ], 'true' );
	assert.equal( textOf( find( view.container, byTag( 'p' ) ) ), ' Hi' );
} );

test( 'InlineMarkup drops <img onerror> entirely', () => {
	const nodes = sanitize( 'Before <img src="x" onerror="alert(1)"> after' );
	assert.deepEqual( tagsOf( nodes ), [] );
	assert.equal( textOfNodes( nodes ), 'Before  after' );
} );

test( 'InlineMarkup turns a javascript: link into its text', () => {
	for ( const href of [ 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>' ] ) {
		const nodes = sanitize( `<a href="${ href }">click</a>` );
		assert.deepEqual( nodes, [ 'click' ], href );
	}
} );

test( 'InlineMarkup turns an entity-encoded javascript: link into its text', () => {
	for ( const href of [ 'javascript&#58;alert(1)', '&#x6A;avascript:alert(1)', '&#106;&#97;vascript&colon;alert(1)', 'jav&#x09;ascript:alert(1)' ] ) {
		assert.deepEqual( sanitize( `<a href="${ href }">click</a>` ), [ 'click' ], href );
	}
} );

test( 'InlineMarkup keeps a protocol-relative link, with rel="noopener"', () => {
	assert.deepEqual( sanitize( '<a href="//example.org/p">p</a>' ), [ { tag: 'a', attributes: { href: '//example.org/p', rel: 'noopener' }, children: [ 'p' ] } ] );
} );

test( 'InlineMarkup drops <iframe>, <script> and <style> with their content', () => {
	const nodes = sanitize( 'A<iframe src="https://evil.example/">frame text</iframe>B<script>alert(1)</script>C<style>p{}</style>D' );
	assert.deepEqual( nodes, [ 'ABCD' ] );
} );

test( 'InlineMarkup drops <b onclick> and keeps its text', () => {
	const nodes = sanitize( 'Be <b onclick="alert(1)">bold</b>.' );
	assert.deepEqual( tagsOf( nodes ), [] );
	assert.deepEqual( nodes, [ 'Be bold.' ] );
} );

test( 'InlineMarkup keeps the text of any other element, nested', () => {
	const nodes = sanitize( '<div><p>Hello <span title="t"><em>you</em></span></p><!-- comment --></div>' );
	assert.deepEqual( nodes, [ 'Hello ', { tag: 'em', attributes: {}, children: [ 'you' ] } ] );
} );

test( 'InlineMarkup keeps safe links, with rel="noopener" when they leave the admin', () => {
	const nodes = sanitize( '<a href="https://wordpress.org/support/" target="_blank" onclick="x" class="c">Forums</a> <a href="options-general.php">General</a> <a href="mailto:a@example.org">Mail</a>' );
	assert.deepEqual( nodes, [
		{ tag: 'a', attributes: { href: 'https://wordpress.org/support/', rel: 'noopener' }, children: [ 'Forums' ] },
		' ',
		{ tag: 'a', attributes: { href: 'options-general.php' }, children: [ 'General' ] },
		' ',
		{ tag: 'a', attributes: { href: 'mailto:a@example.org' }, children: [ 'Mail' ] },
	] );
} );

test( 'InlineMarkup decodes character references as text and keeps markup-looking text as text', () => {
	const nodes = sanitize( 'Use &lt;b&gt; &amp; &#8220;quotes&#8221;' );
	assert.deepEqual( nodes, [ 'Use <b> & “quotes”' ] );
} );

test( 'InlineMarkup renders elements, never innerHTML', async () => {
	const view = mount( () => h( 'p', null, [ h( InlineMarkup, { html: 'Saved <code>wp</code> <img src=x onerror=alert(1)><a href="https://example.org/">docs</a>' } ) ] ) );
	await flush();
	const p = find( view.container, byTag( 'p' ) );
	assert.equal( textOf( p ), 'Saved wp docs' );
	assert.ok( find( p, byTag( 'code' ) ) );
	assert.equal( find( p, byTag( 'img' ) ), null );
	const link = find( p, byTag( 'a' ) );
	assert.equal( link.props.href, 'https://example.org/' );
	assert.equal( link.props.rel, 'noopener' );
	for ( const el of findAll( view.container, () => true ) ) {
		assert.equal( el.props.innerHTML, undefined, el.tag + ' has no innerHTML' );
	}
} );

test( 'InlineMarkup shows the markup as text where the document has no parser', async () => {
	globalThis.DOMParser = undefined;
	try {
		const view = mount( () => h( 'p', null, [ h( InlineMarkup, { html: 'A <code>b</code>' } ) ] ) );
		await flush();
		assert.equal( textOf( find( view.container, byTag( 'p' ) ) ), 'A <code>b</code>' );
		assert.equal( find( view.container, byTag( 'code' ) ), null );
	} finally {
		globalThis.DOMParser = FakeDOMParser;
	}
} );

// Notices ----------------------------------------------------------------------

test( 'the notices service keeps a notice\'s markup', () => {
	const notices = createNotices();
	notices.add( { type: 'error', message: 'Use https.', markup: 'Use <code>https</code>.' } );
	notices.add( { type: 'info', message: 'Plain.', markup: 42 } );
	assert.equal( notices.items[ 0 ].markup, 'Use <code>https</code>.' );
	assert.equal( Object.hasOwn( notices.items[ 1 ], 'markup' ), false, 'markup that is not a string is ignored' );
} );

test( 'a notice with markup renders it through InlineMarkup, one without renders its message', async () => {
	const notices = createNotices( { reactive } );
	const view = mount( () => h( Contracted, { id: 'core/notices', notices: notices.items, onDismiss: notices.dismiss } ) );
	await flush();
	notices.add( { type: 'error', message: 'The address must start with https://.', markup: 'The address must start with <code>https://</code>.<script>alert(1)</script>' } );
	notices.add( { type: 'success', message: 'Settings saved <code>raw</code>.' } );
	await flush();
	const withMarkup = find( view.container, byClass( 'notice-error' ) );
	const plain = find( view.container, byClass( 'notice-success' ) );
	assert.equal( textOf( find( withMarkup, byTag( 'p' ) ) ), 'The address must start with https://.' );
	assert.equal( textOf( find( find( withMarkup, byTag( 'p' ) ), byTag( 'code' ) ) ), 'https://' );
	assert.equal( find( withMarkup, byTag( 'script' ) ), null );
	assert.equal( textOf( find( plain, byTag( 'p' ) ) ), 'Settings saved <code>raw</code>.', 'a message is text' );
	assert.equal( find( plain, byTag( 'code' ) ), null );
} );
