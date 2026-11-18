import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
const flush = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const { mergeHelp } = await import( '../site/components/core/help-tabs.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const loaded = {
	contract: await import( '../site/contracts/core/options-privacy.js' ),
	component: await import( '../site/components/core/options-privacy.js' ),
};
globalThis.__modules[ '/contracts/core/options-privacy.js' ] = loaded.contract;
globalThis.__modules[ '/components/core/options-privacy.js' ] = loaded.component;

beforeEach( () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( unmountAll );

const PAGES = [
	{ value: '0', label: '— Select —' },
	{ value: '12', label: 'Privacy Policy' },
	{ value: '13', label: '   Child' },
];

/** Settings data as wp-admin/v1/settings/privacy returns it. */
function settingsData( overrides = {} ) {
	return {
		page: 12,
		selected: '12',
		pageExists: true,
		pageStatus: 'publish',
		editPath: 'post.php?post=12&action=edit',
		viewUrl: 'http://localhost:8889/privacy-policy/',
		hasPages: true,
		choices: { pages: PAGES },
		notices: [],
		...overrides,
	};
}

function render( data = settingsData(), { router = null } = {} ) {
	const dirty = [];
	const added = [];
	const events = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, {
		id: 'core/options-privacy',
		data,
		page: { path: 'options-privacy.php', title: 'Privacy' },
		onSaved: ( value ) => events.push( [ 'saved', value ] ),
		onCreated: ( value ) => events.push( [ 'created', value ] ),
	} ), {
		provide: { notices: service, router, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added, events };
}

const byId = ( id ) => byProp( 'id', id );
const forms = ( view ) => findAll( view.container, byTag( 'form' ) );
const submit = ( form ) => form.props.onSubmit( { preventDefault() {} } );
const choose = ( view, value ) => find( view.container, byId( 'page_for_privacy_policy' ) ).props.onChange( { target: { value } } );
const links = ( node ) => findAll( node, byTag( 'a' ) ).map( ( a ) => [ textOf( a ).trim(), a.props.href ] );
const normalize = ( text ) => text.replace( /\s+/g, ' ' ).trim();

test( 'the contract has its id, version 1.0.0 and two settings slots', () => {
	const contract = loaded.contract.default;
	assert.equal( contract.id, 'core/options-privacy' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true, 'A page contract: its files are gated by role.' );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-fields', 'after-fields' ] );
	for ( const slot of Object.values( contract.slots ) ) {
		assert.deepEqual( Object.keys( slot.props ), [ 'settings' ] );
	}
	assert.deepEqual( contract.emits, [ 'saved', 'created' ] );
} );

test( 'renders the classic markup: tabs, introduction, links and the two action forms', async () => {
	const { view } = render();
	await flush();
	const root = find( view.container, byClass( 'wp-admin-options-privacy' ) );
	assert.ok( hasClass( root, 'privacy-settings' ), 'The classic body class, for edit.css\'s `.privacy-settings` rules.' );
	assert.equal( find( view.container, byTag( 'h1' ) ), null, 'The page host renders the title.' );

	const nav = find( view.container, byTag( 'nav' ) );
	assert.ok( hasClass( nav, 'privacy-settings-tabs-wrapper' ) );
	assert.equal( nav.props[ 'aria-label' ], 'Secondary menu' );
	assert.deepEqual( links( nav ), [ [ 'Settings', '/wp-admin/options-privacy.php' ], [ 'Policy Guide', '/wp-admin/options-privacy.php?tab=policyguide' ] ] );
	const [ settingsTab, guideTab ] = findAll( nav, byTag( 'a' ) );
	assert.ok( hasClass( settingsTab, 'active' ) );
	assert.equal( settingsTab.props[ 'aria-current' ], 'true' );
	assert.ok( ! hasClass( guideTab, 'active' ) );
	assert.ok( find( view.container, byClass( 'wp-header-end' ) ) );

	const body = find( view.container, byClass( 'privacy-settings-body' ) );
	assert.equal( textOf( find( body, byTag( 'h2' ) ) ), 'Privacy Settings' );
	const paragraphs = findAll( body, byTag( 'p' ) ).map( ( p ) => normalize( textOf( p ) ) );
	assert.deepEqual( paragraphs, [
		'As a website owner, you may need to follow national or international privacy laws. For example, you may need to create and display a privacy policy. If you already have a Privacy Policy page, please select it below. If not, please create one.',
		'The new page will include help and suggestions for your privacy policy. However, it is your responsibility to use those resources correctly, to provide the information that your privacy policy requires, and to keep that information current and accurate.',
		'After your Privacy Policy page is set, you should edit it. You should also review your privacy policy from time to time, especially after installing or updating any themes or plugins. There may be changes or new suggested information for you to consider adding to your policy.',
		'Edit or view your Privacy Policy page content. Need help putting together your new Privacy Policy page? Check out the privacy policy guide for recommendations on what content to include, along with policies suggested by your plugins and theme.',
	] );
	assert.deepEqual( links( findAll( body, byTag( 'p' ) )[ 3 ] ), [
		[ 'Edit', '/wp-admin/post.php?post=12&action=edit' ],
		[ 'view', 'http://localhost:8889/privacy-policy/' ],
		[ 'Check out the privacy policy guide', '/wp-admin/options-privacy.php?tab=policyguide' ],
	] );

	const table = find( view.container, byClass( 'tools-privacy-policy-page' ) );
	assert.ok( hasClass( table, 'form-table' ) );
	assert.equal( table.props.role, 'presentation' );
	const [ createForm, setForm ] = forms( view );
	assert.ok( hasClass( createForm, 'wp-create-privacy-page' ) );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'create-page' ) ), 'Create a new Privacy Policy page' );
	const create = find( createForm, byId( 'create-page' ) );
	assert.equal( textOf( create ), 'Create' );
	assert.ok( hasClass( create, 'button-secondary' ) );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'page_for_privacy_policy' ) ), 'Change your Privacy Policy page' );
	const select = find( setForm, byId( 'page_for_privacy_policy' ) );
	assert.equal( select.props.name, 'page_for_privacy_policy' );
	assert.deepEqual( findAll( select, byTag( 'option' ) ).map( ( option ) => [ option.props.value, textOf( option ), option.props.selected ] ), [
		[ '0', '— Select —', false ],
		[ '12', 'Privacy Policy', true ],
		[ '13', '   Child', false ],
	] );
	const use = find( setForm, byId( 'set-page' ) );
	assert.equal( textOf( use ), 'Use This Page' );
	assert.ok( hasClass( use, 'button-primary' ) );
} );

test( 'a draft page is previewed, not viewed', async () => {
	const { view } = render( settingsData( { pageStatus: 'draft', viewUrl: 'http://localhost:8889/?page_id=12' } ) );
	await flush();
	const strong = find( view.container, byClass( 'wp-admin-privacy-page-links' ) );
	assert.equal( strong.tag, 'strong' );
	assert.deepEqual( links( strong ), [ [ 'Edit', '/wp-admin/post.php?post=12&action=edit' ], [ 'preview', 'http://localhost:8889/?page_id=12' ] ] );
} );

test( 'without a page: no edit links, "Select a Privacy Policy page", "— Select —" chosen', async () => {
	const { view } = render( settingsData( { page: 0, selected: '0', pageExists: false, pageStatus: null, editPath: null, viewUrl: null } ) );
	await flush();
	assert.equal( find( view.container, byClass( 'wp-admin-privacy-page-links' ) ), null );
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'page_for_privacy_policy' ) ), 'Select a Privacy Policy page' );
	assert.equal( find( view.container, byId( 'page_for_privacy_policy' ) ).props.value, '0' );
} );

test( 'without pages: "There are no pages." and no select', async () => {
	const { view } = render( settingsData( { page: 0, selected: '', pageExists: false, pageStatus: null, editPath: null, viewUrl: null, hasPages: false, choices: { pages: [] } } ) );
	await flush();
	assert.equal( textOf( find( view.container, ( el ) => el.tag === 'label' && el.props.for === 'create-page' ) ), 'There are no pages.' );
	assert.equal( find( view.container, byId( 'page_for_privacy_policy' ) ), null );
	assert.equal( forms( view ).length, 1 );
} );

test( 'on a subsite, the admin links keep the site prefix', async () => {
	const previous = globalThis.location;
	globalThis.location = { pathname: '/sites/3/wp-admin/options-privacy.php', search: '', origin: 'http://localhost:8890' };
	try {
		const { view } = render();
		await flush();
		assert.deepEqual( links( find( view.container, byTag( 'nav' ) ) ).map( ( [ , href ] ) => href ), [ '/sites/3/wp-admin/options-privacy.php', '/sites/3/wp-admin/options-privacy.php?tab=policyguide' ] );
		assert.equal( links( find( view.container, byClass( 'wp-admin-privacy-page-links' ) ) )[ 0 ][ 1 ], '/sites/3/wp-admin/post.php?post=12&action=edit' );
	} finally {
		globalThis.location = previous;
	}
} );

test( 'the notices of the page data are shown when the page opens, with their markup', async () => {
	const trash = {
		type: 'error',
		message: 'The currently selected Privacy Policy page is in the Trash. Please create or select a new Privacy Policy page or restore the current page.',
		markup: 'The currently selected Privacy Policy page is in the Trash. Please create or select a new Privacy Policy page or <a href="edit.php?post_status=trash&amp;post_type=page">restore the current page</a>.',
	};
	const missing = { type: 'error', message: 'The currently selected Privacy Policy page does not exist. Please create or select a new page.' };
	const { added } = render( settingsData( { pageExists: false, notices: [ trash ] } ) );
	await flush();
	assert.deepEqual( added, [ { ...trash, dismissible: true } ] );

	unmountAll();
	const other = render( settingsData( { pageExists: false, notices: [ missing ] } ) );
	await flush();
	assert.deepEqual( other.added, [ { ...missing, dismissible: true } ], 'No markup for a message without links.' );
} );

test( '"Use This Page" posts the selected page and shows the answer with its notices, the change first', async () => {
	const answer = settingsData( {
		page: 13,
		selected: '13',
		pageStatus: 'draft',
		editPath: 'post.php?post=13&action=edit',
		notices: [
			{ type: 'success', message: 'Privacy Policy page setting updated successfully. Remember to update your menus!', markup: 'Privacy Policy page setting updated successfully. Remember to <a href="customize.php?autofocus%5Bpanel%5D=nav_menus">update your menus</a>!' },
			{ type: 'error', message: 'In the Trash.' },
		],
	} );
	api.respondWith( async () => answer );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added, dirty, events } = render();
		await flush();
		choose( view, '13' );
		await flush();
		assert.equal( dirty.at( -1 ), true, 'A changed select is an unsaved change.' );
		submit( forms( view )[ 1 ] );
		await flush();
		assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/settings/privacy', payload: { page: 13 } } ] );
		assert.deepEqual( added.map( ( notice ) => [ notice.type, notice.message, notice.markup ?? null ] ), [
			[ 'success', 'Privacy Policy page setting updated successfully. Remember to update your menus!', 'Privacy Policy page setting updated successfully. Remember to <a href="customize.php?autofocus%5Bpanel%5D=nav_menus">update your menus</a>!' ],
			[ 'error', 'In the Trash.', null ],
		] );
		assert.deepEqual( focused, [ 'wp-admin-n1' ], 'Focus moves to the first notice.' );
		assert.equal( dirty.at( -1 ), false );
		assert.equal( find( view.container, byId( 'page_for_privacy_policy' ) ).props.value, '13' );
		assert.equal( links( find( view.container, byClass( 'wp-admin-privacy-page-links' ) ) )[ 1 ][ 0 ], 'preview', 'The answer is shown.' );
		assert.equal( events.length, 1 );
		assert.equal( events[ 0 ][ 0 ], 'saved' );
		assert.equal( events[ 0 ][ 1 ].page, 13 );
	} finally {
		globalThis.document = previous;
	}
} );

test( '"Use This Page" with "— Select —" posts 0', async () => {
	api.respondWith( async () => settingsData( { page: 0, selected: '0', pageExists: false, notices: [ { type: 'success', message: 'Privacy Policy page removed.' } ] } ) );
	const { view, added } = render();
	await flush();
	choose( view, '0' );
	submit( forms( view )[ 1 ] );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { page: 0 } );
	assert.equal( added[ 0 ].message, 'Privacy Policy page removed.' );
} );

test( '"Create" creates the page, then goes to its editor through the router', async () => {
	api.respondWith( async () => ( { page: 44, editPath: 'post.php?post=44&action=edit' } ) );
	const navigated = [];
	const router = { navigate: async ( url ) => navigated.push( url ) };
	const { view, events, dirty } = render( settingsData(), { router } );
	await flush();
	choose( view, '13' );
	submit( forms( view )[ 0 ] );
	await flush();
	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/settings/privacy/page', payload: {} } ] );
	assert.deepEqual( events, [ [ 'created', { page: 44, editPath: 'post.php?post=44&action=edit' } ] ] );
	assert.equal( dirty.at( -1 ), false, 'Leaving is not held back by the select.' );
	assert.deepEqual( navigated, [ '/wp-admin/post.php?post=44&action=edit' ] );
} );

test( 'a failed create shows WordPress\'s message and stays', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 500, code: 'privacy_page_not_created', message: 'Unable to create a Privacy Policy page.', data: { status: 500 } } );
	} );
	const navigated = [];
	const { view, added } = render( settingsData(), { router: { navigate: async ( url ) => navigated.push( url ) } } );
	await flush();
	submit( forms( view )[ 0 ] );
	await flush();
	assert.deepEqual( added.map( ( notice ) => [ notice.type, notice.message ] ), [ [ 'error', 'Unable to create a Privacy Policy page.' ] ] );
	assert.deepEqual( navigated, [] );
	assert.equal( find( view.container, byId( 'create-page' ) ).props.disabled, false, 'The buttons are enabled again.' );
} );

test( 'WordPress unreachable: a notice, and the choice is kept', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added } = render();
	await flush();
	choose( view, '13' );
	submit( forms( view )[ 1 ] );
	await flush();
	assert.equal( added[ 0 ].message, 'WordPress cannot be reached right now. Please try again in a moment.' );
	assert.equal( find( view.container, byId( 'page_for_privacy_policy' ) ).props.value, '13' );
} );

test( 'the buttons are disabled while a request runs', async () => {
	let release;
	api.respondWith( () => new Promise( ( resolve ) => {
		release = () => resolve( settingsData() );
	} ) );
	const { view } = render();
	await flush();
	submit( forms( view )[ 1 ] );
	await flush();
	assert.equal( find( view.container, byId( 'set-page' ) ).props.disabled, true );
	assert.equal( find( view.container, byId( 'create-page' ) ).props.disabled, true );
	submit( forms( view )[ 0 ] );
	assert.equal( api.calls.length, 1, 'No second request.' );
	release();
	await flush();
	assert.equal( find( view.container, byId( 'set-page' ) ).props.disabled, false );
} );

test( 'slot modules get the settings', async () => {
	const Slot = defineComponent( {
		props: [ 'settings' ],
		setup: ( props ) => () => h( 'p', { class: 'slot-module' }, 'Page: ' + props.settings.page ),
	} );
	globalThis.__modules[ '/m/op-slot.js' ] = { default: Slot };
	loader.applyImportMap( { 'op-slot': '/m/op-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-privacy': { 'before-fields': [ { module: 'op-slot' } ], 'after-fields': [ { module: 'op-slot' } ] } } } );
	const { view } = render();
	await flush();
	assert.deepEqual( findAll( view.container, byClass( 'slot-module' ) ).map( textOf ), [ 'Page: 12', 'Page: 12' ] );
} );

// Help -------------------------------------------------------------------------------

const { help } = loaded.component;
const paragraphs = ( view ) => findAll( view.container, byTag( 'p' ) ).map( textOf );

async function renderHelp( component ) {
	const view = mount( () => h( 'div', null, [ h( component ) ] ) );
	await flush();
	return view;
}

test( 'the page exports the classic help: the Overview tab and the sidebar', async () => {
	assert.deepEqual( mergeHelp( help, null, { path: 'options-privacy.php', data: settingsData() } ).tabs.map( ( tab ) => [ tab.id, tab.title ] ), [ [ 'overview', 'Overview' ] ] );
	assert.deepEqual( paragraphs( await renderHelp( help.tabs[ 0 ].component ) ), [
		'The Privacy screen lets you either build a new privacy-policy page or choose one you already have to show.',
		'This screen includes suggestions to help you write your own privacy policy. However, it is your responsibility to use these resources correctly, to provide the information required by your privacy policy, and to keep this information current and accurate.',
	] );
	const sidebar = await renderHelp( help.sidebar );
	assert.deepEqual( paragraphs( sidebar ), [ 'For more information:', 'Documentation on Privacy Settings' ] );
	assert.deepEqual( findAll( sidebar.container, byTag( 'a' ) ).map( ( a ) => a.props.href ), [ 'https://wordpress.org/documentation/article/settings-privacy-screen/' ] );
} );
