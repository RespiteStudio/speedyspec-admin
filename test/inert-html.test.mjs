import test, { afterEach } from './helpers/node-test-shim.mjs';
import assert from 'node:assert/strict';
import { fakeTemplateDocument, serialize, FakeNode, FakeElement } from './helpers/html-parser.mjs';


const { mount, unmountAll, find, byClass, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const kit = await import( '../site/kit/index.js' );
const { default: InertHtml, toInertFragment, markupCost, tooComplex, MAX_TAGS, MAX_DEPTH } = await import( '../site/kit/InertHtml.js' );

const { h } = Vue;
afterEach( unmountAll );

const DOM = { Node: FakeNode, Element: FakeElement };
const inert = ( html, doc = fakeTemplateDocument() ) => serialize( toInertFragment( html, doc, DOM ) );

test( 'toInertFragment parses through a template and returns a new fragment, never the parsed tree', () => {
	const doc = fakeTemplateDocument();
	const fragment = toInertFragment( '<p>Hi</p>', doc, DOM );
	assert.equal( doc.created.length, 1 );
	assert.notEqual( fragment, doc.created[ 0 ].content );
	assert.notEqual( fragment.childNodes[ 0 ], doc.created[ 0 ].content.childNodes[ 0 ], 'each element is created anew' );
	assert.equal( serialize( fragment ), '<p>Hi</p>' );
} );

test( 'ordinary comment formatting survives', () => {
	const html = '<p>Hi <strong>there</strong>, <em>see</em> <a href="https://example.org/a?b=1" rel="nofollow ugc" title="T">this</a><br>and <code>code</code>.</p><blockquote cite="https://example.org/"><p>Quoted</p></blockquote><ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol><img src="https://example.org/i.png" alt="An image" width="10" height="20"><p><del datetime="2020-01-01">old</del> <ins>new</ins> <b>b</b> <i>i</i> <abbr title="Abbr">ab</abbr> <q cite="/x">q</q></p>';
	assert.equal( inert( html ), html );
	assert.equal( inert( '<a href="/wp-admin/edit.php">Relative</a> <a href="mailto:a@example.org">Mail</a> <a href="#c2">Anchor</a>' ), '<a href="/wp-admin/edit.php">Relative</a> <a href="mailto:a@example.org">Mail</a> <a href="#c2">Anchor</a>' );
	assert.equal( inert( '' ), '' );
} );

test( 'scripts, styles and everything that loads, navigates or submits are dropped with their content (C2, I1)', () => {
	assert.equal( inert( '<p>Before</p><script>globalThis.ran = true;</script><p>After</p>' ), '<p>Before</p><p>After</p>' );
	assert.equal( inert( '<base href="https://evil.example/"><p>x</p>' ), '<p>x</p>', 'C2: a base would move document.baseURI' );
	assert.equal( inert( '<meta http-equiv="refresh" content="0;url=https://evil.example/"><p>x</p>' ), '<p>x</p>' );
	assert.equal( inert( '<link rel="stylesheet" href="https://evil.example/a.css"><style>body{background:url(javascript:alert(1))}</style>ok' ), 'ok' );
	assert.equal( inert( '<iframe src="https://evil.example/"></iframe><object data="x"></object><embed src="x"><svg><a href="javascript:alert(1)"><text>T</text></a></svg><math><mtext>m</mtext></math>z' ), 'z' );
	assert.equal( inert( '<template><img src=x onerror=alert(1)></template>y' ), 'y', 'a template goes with its content' );
	// noscript is raw text when scripting is on: its </noscript> inside the attribute ends it, and the
	// img after it is a real element. It is cleaned like any other, and the output is never parsed again (no mXSS).
	assert.equal( inert( '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>y' ), '<img src="x">"&gt;y' );
	assert.equal( globalThis.ran, undefined );
} );

test( 'forms and controls are unwrapped: their text stays, nothing that submits does (I1)', () => {
	assert.equal( inert( '<form action="javascript:alert(1)"><p>In a form</p><input name="q" value="v"><button formaction="javascript:x()">Go</button><select><option>o</option></select></form>' ), '<p>In a form</p>Go' );
	assert.equal( inert( '<custom-tag data-x="1"><span>kept</span></custom-tag>' ), '<span>kept</span>', 'unknown elements are unwrapped' );
} );

test( 'only allowed attributes are kept: no handlers, style, srcset, id or name (Review Focus 5)', () => {
	assert.equal( inert( '<img src=x onerror="alert(1)">' ), '<img src="x">' );
	assert.equal( inert( '<a href="https://example.org/" ONCLICK="steal()" style="color:red" id="selection" name="x" target="_top">L</a>' ), '<a href="https://example.org/">L</a>' );
	assert.equal( inert( '<img src="https://example.org/a.png" srcset="javascript:alert(1) 1x" style="background:url(javascript:alert(1))" width="100px" height="5">' ), '<img src="https://example.org/a.png" height="5">' );
	assert.equal( inert( '<p onmouseover="x" data-a="1" lang="fr" dir="rtl">t</p>' ), '<p lang="fr" dir="rtl">t</p>' );
	assert.equal( inert( '<div class="notice notice-error"><p class="x">Your site is hacked</p></div>' ), '<div><p>Your site is hacked</p></div>', 'no class: a comment cannot look like an admin notice' );
} );

test( 'addresses are kept only when the URL parser reads them as http(s) (or mailto for links)', () => {
	for ( const href of [ 'javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java&#9;script:alert(1)', 'java&#x0A;script:alert(1)', '&#106;avascript:alert(1)', '  javascript:alert(1)  ', 'vbscript:x', 'data:text/html,<script>alert(1)</script>' ] ) {
		assert.equal( inert( `<a href="${ href }">A</a>` ), '<a>A</a>', href );
	}
	assert.equal( inert( '<img src="data:image/png;base64,AAAA" alt="d">' ), '<img alt="d">' );
	assert.equal( inert( '<img src="mailto:a@example.org">' ), '<img>', 'mailto only on links' );
	assert.equal( inert( '<blockquote cite="javascript:x">q</blockquote>' ), '<blockquote>q</blockquote>' );
} );

test( 'DOM clobbering (C1): the tree is read through the prototypes, not through properties a form can shadow', () => {
	// The tree a browser parses from
	// <form onclick="alert(1)"><input name="nodeType"><input name="childNodes"><input name="attributes"><input name="attributes"><img src=x onerror=alert(1)></form>:
	// the inputs shadow the form's own properties, which a cleaner reading them would trust.
	const parser = fakeTemplateDocument();
	const parsed = parser.createElement( 'template' );
	parsed.innerHTML = '<form onclick="alert(1)"><img src="x" onerror="alert(1)"><b>t</b></form>';
	const form = parsed.content.childNodes[ 0 ];
	for ( const [ name, value ] of Object.entries( {
		nodeType: { name: 'nodeType' },
		childNodes: [],
		attributes: [ { name: 'attributes' }, { name: 'attributes' } ],
		localName: 'b',
		getAttributeNames: () => [],
		getAttribute: () => null,
	} ) ) {
		Object.defineProperty( form, name, { value } );
	}
	const doc = { ...fakeTemplateDocument(), createElement: ( tag ) => ( tag === 'template' ? { content: parsed.content, set innerHTML( v ) {} } : parser.createElement( tag ) ) };
	assert.equal( serialize( toInertFragment( 'ignored', doc, DOM ) ), '<img src="x"><b>t</b>', 'the form is unwrapped, its img cleaned, its onclick not kept' );
} );

test( 'markupCost counts tag openings and estimates nesting in one pass; the limits are module constants', () => {
	assert.deepEqual( markupCost( '<p>a <b>b</b><br><img src=x></p><p>c</p>' ), { tags: 8, depth: 2 } );
	assert.deepEqual( markupCost( 'a < b and 3<4' ), { tags: 0, depth: 0 } );
	assert.equal( MAX_TAGS, 2000 );
	assert.equal( MAX_DEPTH, 100 );
	assert.equal( tooComplex( '<b>'.repeat( MAX_DEPTH ) + 'x' ), false );
	assert.equal( tooComplex( '<b>'.repeat( MAX_DEPTH + 1 ) ), true );
	assert.equal( tooComplex( '<br>'.repeat( MAX_TAGS ) ), false, 'void tags do not nest' );
	assert.equal( tooComplex( '<br>'.repeat( MAX_TAGS + 1 ) ), true );
} );

test( 'markup too deep to parse cheaply (21,800 nested <b>, a comment at its size limit) is shown as text, quickly', () => {
	const html = '<b>'.repeat( 21800 ) + 'spam';
	const doc = fakeTemplateDocument();
	const started = performance.now();
	const fragment = toInertFragment( html, doc, DOM );
	const took = performance.now() - started;
	assert.equal( doc.created.length, 0, 'never parsed' );
	assert.equal( fragment.childNodes.length, 1 );
	assert.equal( fragment.childNodes[ 0 ].nodeType, 3, 'one text node' );
	assert.equal( fragment.childNodes[ 0 ].nodeValue, html );
	assert.ok( took < 20, `took ${ took } ms` );
	// A normal comment still formats.
	assert.equal( inert( '<p>Thanks, <strong>great</strong> <a href="https://example.org/">post</a>!</p><blockquote><p><em>Quoted</em></p></blockquote>' ), '<p>Thanks, <strong>great</strong> <a href="https://example.org/">post</a>!</p><blockquote><p><em>Quoted</em></p></blockquote>' );
} );

test( 'the kit exports InertHtml (1.6.0)', () => {
	assert.equal( kit.InertHtml, InertHtml );
	// 1.6.0 added it; later minors keep it.
	assert.ok( kit.VERSION.localeCompare( '1.6.0', undefined, { numeric: true } ) >= 0 );
} );

test( 'InertHtml puts the cleaned fragment into its own element, and again when the HTML changes', async () => {
	const saved = { document: globalThis.document, Node: globalThis.Node, Element: globalThis.Element };
	Object.assign( globalThis, { document: fakeTemplateDocument(), Node: FakeNode, Element: FakeElement } );
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
		Object.assign( globalThis, saved );
	}
} );

test( 'opt-ins (kit 1.9.0): `classes` keeps only the class names listed, `linkTarget` opens every kept link in a new tab', () => {
	const stars = '<div class="star-rating notice"><span class="star dashicons dashicons-star-filled evil"></span><span class="star dashicons dashicons-star-half"></span><span class="notice-error"></span></div>';
	const classes = [ 'star-rating', 'star', 'dashicons', 'dashicons-star-filled', 'dashicons-star-half' ];
	assert.equal( serialize( toInertFragment( stars, fakeTemplateDocument(), DOM, { classes } ) ), '<div class="star-rating"><span class="star dashicons dashicons-star-filled"></span><span class="star dashicons dashicons-star-half"></span><span></span></div>' );
	assert.equal( inert( stars ), '<div><span></span><span></span><span></span></div>', 'without the opt-in, no class' );
	assert.equal( serialize( toInertFragment( '<p class="x">t</p>', fakeTemplateDocument(), DOM, { classes: [ 'x y', '"q"' ] } ) ), '<p>t</p>', 'only plain names are kept' );

	const links = '<a href="https://wordpress.org/plugins/x/" rel="nofollow" target="_top">Page</a> <a href="javascript:alert(1)">Bad</a>';
	assert.equal( serialize( toInertFragment( links, fakeTemplateDocument(), DOM, { linkTarget: '_blank' } ) ), '<a href="https://wordpress.org/plugins/x/" target="_blank" rel="noopener noreferrer">Page</a> <a>Bad</a>' );
	assert.equal( serialize( toInertFragment( links, fakeTemplateDocument(), DOM, { linkTarget: '_top' } ) ), '<a href="https://wordpress.org/plugins/x/" rel="nofollow">Page</a> <a>Bad</a>', 'only _blank' );
} );
