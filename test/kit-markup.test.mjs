import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush } = await import( './helpers/dom.mjs' );
const { default: Interpolate, interpolate, decodeEntities } = await import( '../site/kit/Interpolate.js' );
const { default: LegacyHtml, collectControls, controlNames, sameOriginUrl, loadAssets, activate, FILLED_EVENT } = await import( '../site/kit/LegacyHtml.js' );

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

test( 'a tag whose attributes are a function gets the arguments its own placeholders took, in any order', () => {
	const tags = { a: ( [ url ] ) => ( { href: url } ) };
	const args = [ 'https://example.org/docs/', '/wp-admin/options-reading.php' ];
	const view = render( { text: 'See <a href="%1$s">the docs</a> and <a href="%2$s">your settings</a>.', args, tags } );
	assert.deepEqual( findAll( view.container, byTag( 'a' ) ).map( ( a ) => [ textOf( a ), a.props.href ] ), [ [ 'the docs', 'https://example.org/docs/' ], [ 'your settings', '/wp-admin/options-reading.php' ] ] );
	assert.equal( view.text(), 'See the docs and your settings.' );

	// A translation that swaps the links keeps each target with its text.
	const swapped = render( { text: '<a href="%2$s">Your settings</a>, then <a href="%1$s">the docs</a>.', args, tags } );
	assert.deepEqual( findAll( swapped.container, byTag( 'a' ) ).map( ( a ) => [ textOf( a ), a.props.href ] ), [ [ 'Your settings', '/wp-admin/options-reading.php' ], [ 'the docs', 'https://example.org/docs/' ] ] );

	// The attributes are filtered as always.
	const unsafe = render( { text: '<a href="%s">x</a>', args: [ 'javascript:alert(1)' ], tags: { a: ( [ url ] ) => ( { href: url, onclick: 'x' } ) } } );
	assert.equal( find( unsafe.container, byTag( 'a' ) ).props.href, undefined );
	assert.equal( find( unsafe.container, byTag( 'a' ) ).props.onclick, undefined );
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

test( 'safeUrl allows only http(s) and mailto by the parsed protocol, and nothing with control characters or edge spaces', async () => {
	const { safeUrl } = await import( '../site/kit/url.js' );
	const base = 'http://localhost:8890/wp-admin/options-general.php';
	for ( const bad of [ 'java\tscript:alert(1)', 'java\nscript:x', '\x01javascript:alert(1)', 'JavaScript:alert(1)', 'jAvAsCrIpT:alert(1)', ' javascript:alert(1)', '  https://example.org/', 'https://example.org/ ', 'data:text/html,<b>x</b>', 'vbscript:msgbox(1)', 'java\rscript:x', 'java\x7fscript:x', '', 42 ] ) {
		assert.equal( safeUrl( bad, { base } ), null, JSON.stringify( bad ) );
	}
	assert.equal( safeUrl( 'https://developer.wordpress.org/advanced-administration/', { base } ), 'https://developer.wordpress.org/advanced-administration/' );
	assert.equal( safeUrl( 'HTTPS://example.org/x', { base } ), 'HTTPS://example.org/x' );
	assert.equal( safeUrl( 'mailto:a@example.org', { base } ), 'mailto:a@example.org' );
	assert.equal( safeUrl( 'customize.php?x=1', { base } ), 'customize.php?x=1' );
	assert.equal( safeUrl( '//evil.example/x', { base } ), '//evil.example/x', 'protocol-relative resolves to http(s): allowed as a link' );
	assert.equal( safeUrl( 'mailto:a@example.org', { base, protocols: [ 'http:', 'https:' ] } ), null, 'an image source takes http(s) only' );
} );

test( 'Interpolate renders a link whose translated URL is not safe as text without href', () => {
	for ( const href of [ 'java\tscript:alert(1)', 'java\nscript:x', '\x01javascript:alert(1)', 'vbscript:x', 'data:text/html,x' ] ) {
		const view = render( { text: 'See <a href="%s">this</a>.', tags: { a: { href } } } );
		const link = find( view.container, byTag( 'a' ) );
		assert.equal( link?.props.href, undefined, JSON.stringify( href ) );
		assert.equal( view.text(), 'See this.' );
		unmountAll();
	}
	const ok = render( { text: '<a>docs</a>', tags: { a: { href: 'https://wordpress.org/documentation/' } } } );
	assert.equal( find( ok.container, byTag( 'a' ) ).props.href, 'https://wordpress.org/documentation/' );
} );

/** A small document: logs what runs, in order. Inline scripts run when appended, files load asynchronously. */
function fakeDocument( log ) {
	const element = ( tag ) => {
		const el = {
			tagName: tag.toUpperCase(),
			attributes: [],
			listeners: {},
			textContent: '',
			setAttribute( name, value ) {
				this.attributes.push( { name, value } );
			},
			getAttribute( name ) {
				return this.attributes.find( ( a ) => a.name === name )?.value ?? null;
			},
			addEventListener( type, listener ) {
				this.listeners[ type ] = listener;
			},
			remove() {},
		};
		return el;
	};
	const run = ( el ) => {
		if ( el.tagName === 'SCRIPT' ) {
			if ( el.src ) {
				log.push( 'file:' + el.src );
				setTimeout( () => el.listeners.load?.(), 0 );
			} else {
				log.push( 'inline:' + el.textContent );
			}
		} else if ( el.tagName === 'LINK' ) {
			log.push( 'style:' + el.href );
			setTimeout( () => el.listeners.load?.(), 0 );
		} else if ( el.tagName === 'STYLE' ) {
			log.push( 'css:' + el.textContent );
		}
	};
	return { createElement: element, head: { appendChild: run }, location: { origin: 'http://localhost:8890' }, element, run };
}

/** A container whose HTML holds the given scripts. */
function fakeContainer( doc, log, scripts ) {
	return {
		querySelectorAll: () => scripts.map( ( { text, attributes = [] } ) => {
			const el = doc.element( 'script' );
			el.textContent = text;
			attributes.forEach( ( a ) => el.setAttribute( a.name, a.value ) );
			el.replaceWith = ( fresh ) => doc.run( fresh );
			return el;
		} ),
		dispatchEvent: ( event ) => log.push( 'event:' + event.type + ':' + String( event.bubbles ) ),
	};
}

test( 'assets run as on the classic screen: data, translations, before, file, after; then the HTML scripts and the event', async () => {
	const log = [];
	const doc = fakeDocument( log );
	const win = {};
	const assets = {
		ajaxurl: '/wp-admin/admin-ajax.php',
		styles: [ { handle: 'st-a', src: '/wp-content/plugins/acme/a.css', sameOrigin: true, after: '.a{}' } ],
		scripts: [
			{ handle: 'ord-dep', src: '/wp-includes/js/dep.js', sameOrigin: true, data: '', before: '', after: '', translations: '' },
			{ handle: 'ord-main', src: '/wp-content/plugins/acme/main.js', sameOrigin: true, data: 'var acme = {};', translations: 'var t = 1;', before: 'before();', after: 'after();' },
		],
	};
	await loadAssets( assets, doc, win );
	await activate( fakeContainer( doc, log, [ { text: 'inline1();' }, { text: '{"x":1}', attributes: [ { name: 'type', value: 'application/json' } ] }, { text: 'inline2();' } ] ), doc );
	assert.deepEqual( log, [
		'style:http://localhost:8890/wp-content/plugins/acme/a.css',
		'css:.a{}',
		'file:http://localhost:8890/wp-includes/js/dep.js',
		'inline:var acme = {};',
		'inline:var t = 1;',
		'inline:before();',
		'file:http://localhost:8890/wp-content/plugins/acme/main.js',
		'inline:after();',
		'inline:inline1();',
		'inline:inline2();',
		'event:' + FILLED_EVENT + ':true',
	] );
	assert.equal( win.ajaxurl, '/wp-admin/admin-ajax.php' );
} );

test( 'assets run once per visit while the HTML scripts and the event run on every fill', async () => {
	const log = [];
	const doc = fakeDocument( log );
	const win = { ajaxurl: '/already/set' };
	const assets = { ajaxurl: '/wp-admin/admin-ajax.php', scripts: [ { handle: 'once-a', src: '/wp-content/a.js', sameOrigin: true, data: 'data();', before: '', after: 'after();', translations: '' } ] };
	for ( let i = 0; i < 2; i++ ) {
		await loadAssets( assets, doc, win );
		await activate( fakeContainer( doc, log, [ { text: 'fill();' } ] ), doc );
	}
	assert.deepEqual( log, [ 'inline:data();', 'file:http://localhost:8890/wp-content/a.js', 'inline:after();', 'inline:fill();', 'event:' + FILLED_EVENT + ':true', 'inline:fill();', 'event:' + FILLED_EVENT + ':true' ] );
	assert.equal( win.ajaxurl, '/already/set', 'An ajaxurl already defined is kept.' );
} );

test( 'files of another origin are not loaded, neither listed nor inside the HTML', async ( t ) => {
	t.mock.method( console, 'warn', () => {} );
	const log = [];
	const doc = fakeDocument( log );
	await loadAssets( { scripts: [
		{ handle: 'far-a', src: 'https://evil.example/a.js', sameOrigin: false, data: '', before: '', after: '', translations: '' },
		{ handle: 'far-b', src: 'http://localhost:8889/b.js', sameOrigin: true, data: '', before: '', after: '', translations: '' },
	] }, doc, {} );
	await activate( fakeContainer( doc, log, [ { text: '', attributes: [ { name: 'src', value: 'https://evil.example/c.js' } ] }, { text: '', attributes: [ { name: 'src', value: '/wp-content/ok.js' } ] } ] ), doc );
	assert.deepEqual( log, [ 'file:http://localhost:8890/wp-content/ok.js', 'event:' + FILLED_EVENT + ':true' ] );
} );

test( 'a script file inside the HTML runs before the inline script that follows it', async () => {
	const log = [];
	const doc = fakeDocument( log );
	// The file's code runs when it has loaded, as in a browser.
	const run = doc.run;
	doc.run = ( el ) => {
		run( el );
		if ( el.tagName === 'SCRIPT' && el.src ) {
			const loaded = el.listeners.load;
			el.listeners.load = () => {
				log.push( 'ran:' + el.src );
				loaded?.();
			};
		}
	};
	await activate( fakeContainer( doc, log, [
		{ text: '', attributes: [ { name: 'src', value: '/wp-content/plugins/acme/lib.js' } ] },
		{ text: 'lib.use();' },
	] ), doc );
	assert.deepEqual( log, [
		'file:http://localhost:8890/wp-content/plugins/acme/lib.js',
		'ran:http://localhost:8890/wp-content/plugins/acme/lib.js',
		'inline:lib.use();',
		'event:' + FILLED_EVENT + ':true',
	] );
} );

test( 'a script whose localized data changed gets the new data again, without loading its file twice', async () => {
	const log = [];
	const doc = fakeDocument( log );
	const script = ( nonce ) => ( { scripts: [ { handle: 'data-a', src: '/wp-content/d.js', sameOrigin: true, data: 'var d = { nonce: "' + nonce + '" };', before: '', after: '', translations: '' } ] } );
	await loadAssets( script( 'one' ), doc, {} );
	await loadAssets( script( 'one' ), doc, {} );
	await loadAssets( script( 'two' ), doc, {} );
	assert.deepEqual( log, [
		'inline:var d = { nonce: "one" };',
		'file:http://localhost:8890/wp-content/d.js',
		'inline:var d = { nonce: "two" };',
	] );
} );

test( 'LegacyHtml does not refill on unrelated re-renders, so typed values survive', async () => {
	const other = ref( 0 );
	const view = mount( () => h( 'div', [ h( 'p', String( other.value ) ), h( LegacyHtml, { html: '<input name="acme">' } ) ] ) );
	await flush();
	const el = find( view.container, ( node ) => hasClass( node, 'wp-admin-legacy-html' ) );
	let sets = 0;
	let current = el.innerHTML;
	Object.defineProperty( el, 'innerHTML', { get: () => current, set: ( value ) => { sets++; current = value; } } );
	other.value++;
	await flush();
	assert.equal( view.text(), '1' );
	assert.equal( sets, 0, 'Not filled again.' );
} );

test( 'controls inside a disabled fieldset are not collected; control names include unchecked ones', () => {
	const controls = [
		{ tagName: 'INPUT', type: 'text', name: 'in_fieldset', value: 'x', matches: ( selector ) => selector === ':disabled' },
		{ tagName: 'INPUT', type: 'checkbox', name: 'unchecked', value: '1', checked: false },
		{ tagName: 'INPUT', type: 'text', name: 'kept', value: 'y' },
	];
	assert.deepEqual( collectControls( controls ), [ { name: 'kept', value: 'y' } ] );
	assert.deepEqual( controlNames( controls ), [ 'unchecked', 'kept' ] );
} );
