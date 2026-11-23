/** @jest-environment jsdom */
// The messages plugins.php prints in its header, from the page's data: the action messages
// (`activate=`, `deleted=`…), the fatal activation error with the classic error output in a frame
// that runs no script, the unexpected output message, an active plugin deactivated because its file
// is gone, and the dependency notices. Their markup runs nothing.
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import * as api from '../../helpers/api-stub.mjs';
import { resetContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { loadContracts, mountPlugins, pluginsData } from './data.mjs';

beforeEach( async () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
	await loadContracts();
} );
afterEach( () => {
	jest.restoreAllMocks();
	resetContracts();
	delete window.__ran;
	document.body.innerHTML = '';
} );

const message = ( markup, type = 'updated', over = {} ) => ( { markup, type, dismissible: type === 'updated', scrape: null, ...over } );

test( 'an action message: #message, updated and dismissible, hidden by its dismiss button', async () => {
	const wrapper = await mountPlugins( pluginsData( { messages: [ message( 'Plugin activated.' ) ] } ) );
	const notice = wrapper.find( '#message' );
	expect( notice.classes() ).toEqual( [ 'notice', 'updated', 'is-dismissible' ] );
	expect( notice.find( 'p' ).text() ).toBe( 'Plugin activated.' );
	await notice.find( 'button.notice-dismiss' ).trigger( 'click' );
	expect( wrapper.find( '#message' ).exists() ).toBe( false );
} );

test( 'scrape frame is sandboxed: the fatal error message with the classic error output in a frame without scripts', async () => {
	const scrape = { path: 'plugins.php?action=error_scrape&plugin=detached-p-1%2Ffatal.php&_wpnonce=abc' };
	const wrapper = await mountPlugins( pluginsData( { messages: [ message( 'Plugin could not be activated because it triggered a <strong>fatal error</strong>.', 'error', { scrape } ) ] } ) );
	const notice = wrapper.find( '#message' );
	expect( notice.classes() ).toEqual( [ 'notice', 'error' ] );
	expect( notice.find( 'button.notice-dismiss' ).exists() ).toBe( false );
	expect( notice.find( 'p strong' ).text() ).toBe( 'fatal error' );
	const frame = notice.find( 'p iframe' );
	expect( frame.attributes( 'sandbox' ) ).toBe( '' );
	expect( frame.attributes( 'src' ) ).toBe( '/wp-admin/plugins.php?action=error_scrape&plugin=detached-p-1%2Ffatal.php&_wpnonce=abc' );
	expect( frame.attributes( 'title' ) ).toBe( 'Plugin error output' );
	expect( frame.attributes( 'height' ) ).toBe( '70px' );
} );

test( 'scrape frame is sandboxed: no frame without the scrape, and none for an address that leaves the admin', async () => {
	const wrapper = await mountPlugins( pluginsData( { messages: [ message( 'Plugin could not be activated because it triggered a <strong>fatal error</strong>.', 'error' ), message( 'x', 'error', { scrape: { path: 'https://evil.example/' } } ) ] } ) );
	expect( wrapper.find( 'iframe' ).exists() ).toBe( false );
} );

test( 'the unexpected output message, and an active plugin deactivated because its file is gone', async () => {
	const wrapper = await mountPlugins( pluginsData( { messages: [
		message( 'The plugin <code>detached-p-1-gone.php</code> has been deactivated due to an error: Plugin file does not exist.', 'error', { dismissible: false } ),
		message( 'The plugin generated 4 characters of <strong>unexpected output</strong> during activation. If you notice “headers already sent” messages, problems with syndication feeds or other issues, try deactivating or removing this plugin.', 'error', { dismissible: false } ),
	] } ) );
	const notices = wrapper.findAll( '.notice.error' );
	expect( notices.map( ( notice ) => notice.find( 'p' ).text() ) ).toEqual( [
		'The plugin detached-p-1-gone.php has been deactivated due to an error: Plugin file does not exist.',
		'The plugin generated 4 characters of unexpected output during activation. If you notice “headers already sent” messages, problems with syndication feeds or other issues, try deactivating or removing this plugin.',
	] );
	expect( notices[ 0 ].find( 'code' ).text() ).toBe( 'detached-p-1-gone.php' );
} );

test( 'the dependency notices: a warning notice, without the message id', async () => {
	const wrapper = await mountPlugins( pluginsData( { messages: [ message( '<strong>There are additional plugin dependencies that must be installed.</strong> Detached P x requires Missing One.', 'warning', { dismissible: false } ) ] } ) );
	const notice = wrapper.find( '.notice.notice-warning' );
	expect( notice.attributes( 'id' ) ).toBeUndefined();
	expect( notice.find( 'p strong' ).text() ).toBe( 'There are additional plugin dependencies that must be installed.' );
} );

test( 'a message\'s markup runs nothing', async () => {
	const wrapper = await mountPlugins( pluginsData( { messages: [ message( 'Plugin activated.<img src=x onerror="window.__ran=1"><script>window.__ran=1</script>' ) ] } ) );
	expect( wrapper.find( '#message img' ).exists() ).toBe( false );
	expect( wrapper.find( '#message script' ).exists() ).toBe( false );
	expect( window.__ran ).toBeUndefined();
} );
