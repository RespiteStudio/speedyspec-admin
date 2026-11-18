import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { default: Interpolate, interpolate, decodeEntities } = await import( '../site/kit/Interpolate.js' );
const { default: LegacyHtml, collectControls, sameOriginUrl } = await import( '../site/kit/LegacyHtml.js' );

const { h, ref } = Vue;
afterEach( unmountAll );

const render = ( props ) => mount( () => h( Interpolate, props ) );

test( 'Interpolate renders an allowed tag with the attributes the template gives, never those of the string', () => {
	const view = render( {
		text: 'Enter the same address here unless you <a href="%s" onclick="evil()">want a different home</a>.',
		tags: { a: { href: 'https://developer.wordpress.org/x/' } },
	} );
	const link = find( view.container, byTag( 'a' ) );
	assert.equal( link.props.href, 'https://developer.wordpress.org/x/' );
	assert.equal( link.props.onclick, undefined );
	assert.equal( textOf( link ), 'want a different home' );
	assert.equal( view.text(), 'Enter the same address here unless you want a different home.' );
} );

test( 'Interpolate shows markup the template did not allow as text', () => {
	const view = render( {
		text: 'Look <script>alert(1)</script> and <em>here</em> or <code>there</code>',
		tags: { code: {} },
	} );
	assert.equal( findAll( view.container, byTag( 'script' ) ).length, 0 );
	assert.equal( findAll( view.container, byTag( 'em' ) ).length, 0 );
	assert.equal( textOf( find( view.container, byTag( 'code' ) ) ), 'there' );
	assert.equal( view.text(), 'Look <script>alert(1)</script> and <em>here</em> or there' );
} );

test( 'Interpolate never renders a tag outside its allow list, even when the template asks', () => {
	const view = render( { text: '<script>x</script><iframe>y</iframe>', tags: { script: {}, iframe: {} } } );
	assert.equal( findAll( view.container, byTag( 'script' ) ).length, 0 );
	assert.equal( findAll( view.container, byTag( 'iframe' ) ).length, 0 );
	assert.equal( view.text(), '<script>x</script><iframe>y</iframe>' );
} );

test( 'Interpolate drops attributes outside its allow list and unsafe link targets', () => {
	const view = render( { text: '<a>one</a> <code>two</code>', tags: { a: { href: 'javascript:alert(1)', onmouseover: 'x', class: 'ok' }, code: { style: 'color:red', lang: 'en' } } } );
	const link = find( view.container, byTag( 'a' ) );
	assert.equal( link.props.href, undefined );
	assert.equal( link.props.onmouseover, undefined );
	assert.equal( link.props.class, 'ok' );
	const code = find( view.container, byTag( 'code' ) );
	assert.equal( code.props.style, undefined );
	assert.equal( code.props.lang, 'en' );
} );

test( 'Interpolate fills placeholders with text or with a fixed element, in order or by number', () => {
	const view = render( {
		text: 'Universal time is %s.',
		args: [ { tag: 'code', text: '2026-11-17 10:00:00' } ],
	} );
	assert.equal( textOf( find( view.container, byTag( 'code' ) ) ), '2026-11-17 10:00:00' );
	assert.equal( view.text(), 'Universal time is 2026-11-17 10:00:00.' );

	const numbered = render( { text: 'It should be at least <strong>%1$s by %2$s</strong> pixels, 100%%.', args: [ '512', '<b>512</b>' ], tags: { strong: {} } } );
	assert.equal( textOf( find( numbered.container, byTag( 'strong' ) ) ), '512 by <b>512</b>' );
	assert.equal( findAll( numbered.container, byTag( 'b' ) ).length, 0, 'An argument is text, never markup.' );
	assert.equal( numbered.text(), 'It should be at least 512 by <b>512</b> pixels, 100%.' );
} );

test( 'a placeholder inside a tag still takes its argument, as sprintf() does', () => {
	const view = render( { text: 'See <a href="%s">the docs</a> for %s.', args: [ 'https://example.org/', 'details' ], tags: { a: { href: '/help' } } } );
	assert.equal( view.text(), 'See the docs for details.' );
	assert.equal( find( view.container, byTag( 'a' ) ).props.href, '/help' );
} );

test( 'Interpolate decodes the character references of the source string', () => {
	const view = render( { text: 'Example: &#8220;%s.&#8221; &amp; &hellip; &#x2014;', args: [ 'Just another WordPress site' ] } );
	assert.equal( view.text(), 'Example: “Just another WordPress site.” & … —' );
	assert.equal( decodeEntities( '&lt;b&gt; &unknown; &#0;' ), '<b> &unknown; &#0;' );
} );

test( 'interpolate() closes an unclosed tag and keeps a stray closing tag as text', () => {
	const tree = interpolate( '<strong>bold</em> and </code>', [], { strong: {}, code: {} } );
	assert.equal( tree.length, 1 );
	assert.equal( tree[ 0 ].tag, 'strong' );
	assert.deepEqual( tree[ 0 ].children, [ 'bold</em> and </code>' ] );
} );

test( 'LegacyHtml inserts the HTML into its own element without compiling it', async () => {
	const html = '<p>{{ 7*7 }}</p><div v-if="false" @click="alert(1)">shown</div><input name="acme" value="1">';
	const view = mount( () => h( LegacyHtml, { html, class: 'acme-row' } ) );
	await flush();
	const el = find( view.container, byTag( 'div' ) );
	assert.equal( el.innerHTML, html, 'The string is the element’s HTML as it is.' );
	assert.ok( ! view.text().includes( '49' ), 'Nothing was evaluated.' );
	assert.equal( el.children.length, 0, 'Vue renders no children into it.' );
	assert.ok( hasClass( el, 'acme-row' ) && hasClass( el, 'wp-admin-legacy-html' ) );
} );

test( 'LegacyHtml replaces its HTML when the prop changes and uses the given tag', async () => {
	const html = ref( '<b>one</b>' );
	const view = mount( () => h( LegacyHtml, { html: html.value, tag: 'span' } ) );
	await flush();
	const el = find( view.container, byTag( 'span' ) );
	assert.equal( el.innerHTML, '<b>one</b>' );
	html.value = '<b>two</b>';
	await flush();
	assert.equal( el.innerHTML, '<b>two</b>' );
} );

test( 'sameOriginUrl accepts only http(s) URLs of the admin origin', () => {
	const origin = 'http://localhost:8890';
	assert.equal( sameOriginUrl( '/wp-content/plugins/acme/acme.js?ver=1', origin ), 'http://localhost:8890/wp-content/plugins/acme/acme.js?ver=1' );
	assert.equal( sameOriginUrl( 'http://localhost:8890/wp-includes/js/a.js', origin ), 'http://localhost:8890/wp-includes/js/a.js' );
	assert.equal( sameOriginUrl( 'http://localhost:8889/wp-includes/js/a.js', origin ), null, 'WordPress’s own origin is another origin.' );
	assert.equal( sameOriginUrl( '//evil.example/a.js', origin ), null );
	assert.equal( sameOriginUrl( 'https://evil.example/a.js', origin ), null );
	assert.equal( sameOriginUrl( 'javascript:alert(1)', origin ), null );
	assert.equal( sameOriginUrl( 'data:text/javascript,alert(1)', origin ), null );
	assert.equal( sameOriginUrl( '', origin ), null );
	assert.equal( sameOriginUrl( 42, origin ), null );
} );

test( 'collectControls reads controls as a submitted form would', () => {
	const option = ( value, selected ) => ( { value, selected } );
	const controls = [
		{ tagName: 'INPUT', type: 'text', name: 'acme_text', value: 'Hello' },
		{ tagName: 'INPUT', type: 'checkbox', name: 'acme_on', value: '1', checked: true },
		{ tagName: 'INPUT', type: 'checkbox', name: 'acme_off', value: '1', checked: false },
		{ tagName: 'INPUT', type: 'radio', name: 'acme_radio', value: 'a', checked: false },
		{ tagName: 'INPUT', type: 'radio', name: 'acme_radio', value: 'b', checked: true },
		{ tagName: 'INPUT', type: 'text', name: 'acme_disabled', value: 'x', disabled: true },
		{ tagName: 'INPUT', type: 'text', name: '', value: 'nameless' },
		{ tagName: 'INPUT', type: 'submit', name: 'acme_submit', value: 'Go' },
		{ tagName: 'INPUT', type: 'file', name: 'acme_file', value: '' },
		{ tagName: 'SELECT', type: 'select-multiple', name: 'acme_multi[]', options: [ option( 'r', true ), option( 'g', false ), option( 'b', true ) ] },
		{ tagName: 'SELECT', type: 'select-one', name: 'acme_select', options: [ option( 'x', false ), option( 'y', true ) ] },
		{ tagName: 'TEXTAREA', type: 'textarea', name: 'acme_area', value: 'Line\nLine' },
	];
	assert.deepEqual( collectControls( controls ), [
		{ name: 'acme_text', value: 'Hello' },
		{ name: 'acme_on', value: '1' },
		{ name: 'acme_radio', value: 'b' },
		{ name: 'acme_multi[]', value: 'r' },
		{ name: 'acme_multi[]', value: 'b' },
		{ name: 'acme_select', value: 'y' },
		{ name: 'acme_area', value: 'Line\nLine' },
	] );
} );
