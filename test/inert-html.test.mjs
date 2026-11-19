import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fakeTemplateDocument, serialize } from './helpers/html-parser.mjs';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const kit = await import( '../site/kit/index.js' );
const { default: InertHtml, toInertFragment } = await import( '../site/kit/InertHtml.js' );

const { h } = Vue;
afterEach( unmountAll );

const inert = ( html ) => serialize( toInertFragment( html, fakeTemplateDocument() ) );

test( 'toInertFragment parses through a template, so nothing in the HTML runs or loads while it is parsed', () => {
	const doc = fakeTemplateDocument();
	const fragment = toInertFragment( '<p>Hi</p>', doc );
	assert.equal( doc.created.length, 1 );
	assert.equal( fragment, doc.created[ 0 ].content, 'the template\'s own content' );
} );

test( 'toInertFragment drops script elements, also inside other elements and in SVG', () => {
	assert.equal( inert( '<p>Before</p><script>globalThis.ran = true;</script><p>After</p>' ), '<p>Before</p><p>After</p>' );
	assert.equal( inert( '<div><span><script src="/x.js"></script>Text</span></div>' ), '<div><span>Text</span></div>' );
	assert.equal( inert( '<svg><script>alert(1)</script><circle r="1"></circle></svg>' ), '<svg><circle r="1"></circle></svg>' );
	assert.equal( globalThis.ran, undefined );
} );

test( 'toInertFragment drops event handler attributes (Review Focus 5: <img src=x onerror>)', () => {
	assert.equal( inert( '<img src=x onerror="alert(1)">' ), '<img src="x">' );
	assert.equal( inert( '<a href="https://example.org/" ONCLICK="steal()" onmouseover=x>Link</a>' ), '<a href="https://example.org/">Link</a>' );
	assert.equal( inert( '<svg onload="x"><circle r="1"></circle></svg>' ), '<svg><circle r="1"></circle></svg>' );
} );

test( 'toInertFragment drops javascript: addresses where a click or a submit would run them, however they are written', () => {
	assert.equal( inert( '<a href="javascript:alert(1)">A</a>' ), '<a>A</a>' );
	assert.equal( inert( '<a href=" JaVaScRiPt:alert(1)">A</a>' ), '<a>A</a>' );
	assert.equal( inert( '<a href="java&#9;script:alert(1)">A</a>' ), '<a>A</a>' );
	assert.equal( inert( '<form action="javascript:x()"><button formaction="javascript:y()">Go</button></form>' ), '<form><button>Go</button></form>' );
	assert.equal( inert( '<iframe src="javascript:alert(1)"></iframe>' ), '<iframe></iframe>' );
	assert.equal( inert( '<svg><a xlink:href="javascript:alert(1)"><text>T</text></a></svg>' ), '<svg><a><text>T</text></a></svg>' );
	assert.equal( inert( '<iframe srcdoc="<script>alert(1)</script>"></iframe>' ), '<iframe></iframe>', 'srcdoc is a document of its own, whose scripts would run' );
	assert.equal( inert( '<svg><a><animate attributeName="href" values="javascript:alert(1)"></animate><text>T</text></a></svg>' ), '<svg><a><animate attributename="href"></animate><text>T</text></a></svg>' );
} );

test( 'toInertFragment keeps every other markup unchanged: strong, links, images, classes', () => {
	const html = '<p class="comment">Hi <strong>there</strong>, see <a href="https://example.org/a?b=1" rel="nofollow ugc">this</a> <img src="https://example.org/i.png" alt="An image" width="10"> <em>now</em>.</p><blockquote><p>Quoted</p></blockquote><!-- note -->';
	assert.equal( inert( html ), html );
	assert.equal( inert( '<a href="/wp-admin/edit.php">Relative</a><a href="mailto:a@example.org">Mail</a>' ), '<a href="/wp-admin/edit.php">Relative</a><a href="mailto:a@example.org">Mail</a>' );
	assert.equal( inert( '' ), '' );
} );

test( 'toInertFragment also cleans the content of nested templates', () => {
	const doc = fakeTemplateDocument();
	const fragment = toInertFragment( '<p>x</p>', doc );
	// A nested template, as a browser parses it: its children live in `content`.
	const nested = { nodeType: 1, localName: 'template', attributes: [], childNodes: [], content: doc.createElement( 'template' ) };
	nested.content.innerHTML = '<img src=x onerror=alert(1)>';
	nested.content = nested.content.content;
	fragment.childNodes.push( nested );
	toInertFragment.clean( fragment );
	assert.equal( serialize( nested.content ), '<img src="x">' );
} );

test( 'the kit exports InertHtml (1.6.0)', () => {
	assert.equal( kit.InertHtml, InertHtml );
	assert.equal( kit.VERSION, '1.6.0' );
} );

test( 'InertHtml puts the inert fragment into its own element, and again when the HTML changes', async () => {
	const saved = globalThis.document;
	globalThis.document = fakeTemplateDocument();
	try {
		const html = Vue.ref( '<p>One<script>globalThis.ranInert = 1</script></p>' );
		const view = mount( () => h( InertHtml, { html: html.value, tag: 'span' } ) );
		await flush();
		const element = find( view.container, byClass( 'wp-admin-inert-html' ) );
		assert.equal( element.tag, 'span' );
		const inserted = () => element.children.map( ( child ) => serialize( child ) ).join( '' );
		assert.equal( inserted(), '<p>One</p>' );
		html.value = '<p>Two <img src=x onerror=alert(1)></p>';
		await flush();
		assert.equal( inserted(), '<p>Two <img src="x"></p>' );
		assert.equal( globalThis.ranInert, undefined );
	} finally {
		globalThis.document = saved;
	}
} );
