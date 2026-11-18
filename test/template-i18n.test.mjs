import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const Vue = await import( '../site/vendor/vue.esm-browser.prod.js' );
const { installTemplateI18n } = await import( '../site/runtime/template-i18n.js' );
const { localeVersion } = await import( '../site/runtime/text.js' );
const { default: i18n } = await import( '../site/runtime/i18n-instance.js' );
const { default: ErrorScreen } = await import( '../site/pages/ErrorScreen.js' );
const { createNodeOps, flush } = await import( './helpers/dom.mjs' );

function mount( component, props ) {
	const { ops, text } = createNodeOps();
	const { createApp } = Vue.createRenderer( ops );
	const app = createApp( component, props );
	installTemplateI18n( app );
	const container = ops.createElement( 'div' );
	app.mount( container );
	return { text: () => text( container ), unmount: () => app.unmount() };
}

test( 'translation functions resolve by name in templates and follow the locale', async () => {
	const view = mount( {
		template: '<p>{{ $__( "Hello", "wp-admin-site" ) }}|{{ $_x( "Post", "verb", "wp-admin-site" ) }}|{{ $_n( "one", "many", 2, "wp-admin-site" ) }}|{{ $sprintf( "%s!", "x" ) }}</p>',
	} );
	assert.equal( view.text(), 'Hello|Post|many|x!' );

	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => ( {
		ok: true,
		status: 200,
		text: async () => JSON.stringify( { locale_data: { 'wp-admin-site': { '': {}, Hello: [ 'Hallo' ] } } } ),
	} );
	try {
		i18n.setLocale( { code: 'de_DE', dir: 'ltr' } );
		await i18n.load( [ 'wp-admin-site' ], 'de_DE' );
		localeVersion.value++;
		await flush();
		assert.match( view.text(), /^Hallo\|/ );
	} finally {
		globalThis.fetch = realFetch;
		i18n.setLocale( { code: 'en_US', dir: 'ltr' } );
		view.unmount();
	}
} );

test( 'the error screen renders its translated message and Retry button', () => {
	const router = { state: { error: { code: 'admin_upstream_unreachable' } }, refresh: () => {} };
	const view = mount( ErrorScreen, { router, kind: 'error' } );
	assert.match( view.text(), /WordPress cannot be reached right now/ );
	assert.match( view.text(), /Retry/ );
	view.unmount();
} );
