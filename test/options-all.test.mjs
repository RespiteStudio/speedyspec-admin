import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register( './helpers/hooks.mjs', import.meta.url );

const { mount, unmountAll, find, findAll, byTag, byClass, byProp, hasClass, textOf, Vue } = await import( './helpers/render.mjs' );
const { flush: flushOnce } = await import( './helpers/dom.mjs' );
// The page, its table and its rows each resolve their contract: several rounds.
const flush = async () => {
	for ( let i = 0; i < 4; i++ ) {
		await flushOnce();
	}
};
const { default: Contracted } = await import( '../site/runtime/Contracted.js' );
const { contracts, loader } = await import( './helpers/contracts-instance-stub.mjs' );
const api = await import( './helpers/api-stub.mjs' );
const state = await import( '../site/components/core/options-all/state.js' );

const { h, defineComponent } = Vue;

globalThis.__modules = globalThis.__modules ?? {};
const NAMES = [ 'options-all', 'form-table', 'settings-field' ];
const loaded = {};
for ( const name of NAMES ) {
	loaded[ name ] = {
		contract: await import( '../site/contracts/core/' + name + '.js' ),
		component: await import( '../site/components/core/' + name + '.js' ),
	};
	globalThis.__modules[ '/contracts/core/' + name + '.js' ] = loaded[ name ].contract;
	globalThis.__modules[ '/components/core/' + name + '.js' ] = loaded[ name ].component;
}

beforeEach( () => {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
} );
afterEach( unmountAll );

const row = ( name, value, extra = {} ) => ( { name, value, editable: true, multiline: value.includes( '\n' ), reason: null, ...extra } );

/** Settings data as wp-admin/v1/settings/all returns it. */
function settingsData( rows = null ) {
	return {
		rows: rows ?? [
			row( 'admin_email', 'admin@example.org' ),
			row( 'blogname', 'My Site' ),
			row( 'connectors_ai_acme_api_key', '••••••••abcd', { editable: false, reason: 'masked' } ),
			row( 'cron', 'SERIALIZED DATA', { editable: false, reason: 'serialized' } ),
			row( 'home', 'http://example.org', { editable: false, reason: 'constant' } ),
			row( 'site_notes', 'one\ntwo' ),
		],
	};
}

function render( data = settingsData() ) {
	const dirty = [];
	const added = [];
	const events = [];
	const service = { add: ( notice ) => {
		added.push( notice );
		return 'n' + added.length;
	} };
	const view = mount( () => h( Contracted, {
		id: 'core/options-all',
		data,
		page: { path: 'options.php', title: 'All Settings' },
		onSaved: ( value ) => events.push( value ),
	} ), {
		provide: { notices: service, pageState: { setDirty: ( value ) => dirty.push( value ), isDirty: () => dirty.at( -1 ) ?? false } },
	} );
	return { view, dirty, added, events };
}

const byId = ( id ) => byProp( 'id', id );
const rowOf = ( container, name ) => find( container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] === name );
const type = ( view, id, value ) => find( view.container, byId( id ) ).props.onInput( { target: { value } } );
const submit = ( view ) => find( view.container, byTag( 'form' ) ).props.onSubmit( { preventDefault() {} } );

test( 'the contract has the established shape and version 1.0.0', () => {
	const contract = loaded[ 'options-all' ].contract.default;
	assert.equal( contract.id, 'core/options-all' );
	assert.equal( contract.version, '1.0.0' );
	assert.equal( contract.page, true, 'A page contract: its files are gated by role.' );
	assert.deepEqual( Object.keys( contract.props ), [ 'data', 'page' ] );
	assert.deepEqual( Object.keys( contract.slots ), [ 'before-fields', 'after-fields', 'after-submit' ] );
	for ( const slot of Object.values( contract.slots ) ) {
		assert.deepEqual( Object.keys( slot.props ), [ 'values', 'setValue', 'errors' ] );
	}
	assert.deepEqual( contract.emits, [ 'saved' ] );
	assert.deepEqual( Object.keys( contract ).sort(), [ 'emits', 'id', 'page', 'props', 'slots', 'version' ] );
} );

test( 'the page exports no help: the classic screen has none', () => {
	assert.equal( loaded[ 'options-all' ].component.help, undefined );
} );

test( 'renders the classic markup: warning, one row per option in order, and Save Changes', async () => {
	const { view } = render();
	await flush();

	const root = find( view.container, byClass( 'wp-admin-options-all' ) );
	assert.ok( hasClass( root, 'options-php' ), 'The classic body class.' );
	assert.equal( findAll( view.container, byTag( 'h1' ) ).length, 0, 'The page host renders the heading.' );

	const warning = find( view.container, byClass( 'notice' ) );
	assert.ok( hasClass( warning, 'notice-warning' ) );
	assert.ok( ! hasClass( warning, 'is-dismissible' ), 'Not dismissible, as on the classic screen.' );
	assert.equal( textOf( find( warning, byTag( 'strong' ) ) ), 'Warning:' );
	assert.equal( textOf( warning ).replace( /\s+/g, ' ' ).trim(), 'Warning: This page allows direct access to your site settings. You can break things here. Please be cautious!' );

	const form = find( view.container, byTag( 'form' ) );
	assert.equal( form.props.id, 'all-options' );
	assert.equal( form.props.name, 'form' );
	const table = find( view.container, byTag( 'table' ) );
	assert.ok( hasClass( table, 'form-table' ) );
	assert.equal( table.props.role, 'presentation' );

	const rows = findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] );
	assert.deepEqual( rows.map( ( tr ) => tr.props[ 'data-field' ] ), [ 'admin_email', 'blogname', 'connectors_ai_acme_api_key', 'cron', 'home', 'site_notes' ] );
	for ( const tr of rows ) {
		const name = tr.props[ 'data-field' ];
		const label = find( tr, byTag( 'label' ) );
		assert.equal( label.props.for, name, name + ' label' );
		assert.equal( textOf( label ), name );
		assert.equal( find( find( tr, byTag( 'th' ) ), byTag( 'label' ) ), label );
	}

	const input = find( view.container, byId( 'blogname' ) );
	assert.equal( input.tag, 'input' );
	assert.equal( input.props.type, 'text' );
	assert.equal( input.props.name, 'blogname' );
	assert.equal( input.props.class, 'regular-text all-options' );
	assert.equal( input.props.value, 'My Site' );
	assert.equal( input.props.disabled, false );

	const area = find( view.container, byId( 'site_notes' ) );
	assert.equal( area.tag, 'textarea' );
	assert.equal( area.props.class, 'all-options' );
	assert.equal( area.props.cols, '30' );
	assert.equal( area.props.rows, '5' );
	assert.equal( area.props.value, 'one\ntwo' );

	const submitButton = find( view.container, byId( 'Update' ) );
	assert.equal( submitButton.props.name, 'Update' );
	assert.equal( submitButton.props.type, 'submit' );
	assert.ok( hasClass( submitButton, 'button-primary' ) );
	assert.equal( textOf( submitButton ), 'Save Changes' );
} );

test( 'serialized, masked and constant rows are disabled, with the classic disabled class', async () => {
	const { view } = render();
	await flush();
	for ( const [ name, value ] of [ [ 'connectors_ai_acme_api_key', '••••••••abcd' ], [ 'cron', 'SERIALIZED DATA' ], [ 'home', 'http://example.org' ] ] ) {
		const input = find( rowOf( view.container, name ), byTag( 'input' ) );
		assert.equal( input.props.disabled, true, name );
		assert.equal( input.props.class, 'regular-text all-options disabled', name );
		assert.equal( input.props.value, value, name );
	}
} );

test( 'a disabled multi-line row is a disabled textarea', async () => {
	const { view } = render( settingsData( [ row( 'locked_notes', 'a\nb', { editable: false, reason: 'constant' } ) ] ) );
	await flush();
	const area = find( view.container, byId( 'locked_notes' ) );
	assert.equal( area.tag, 'textarea' );
	assert.equal( area.props.disabled, true );
	assert.equal( area.props.class, 'all-options disabled' );
} );

test( 'saves only the changed rows and shows the notices', async () => {
	const next = settingsData();
	next.rows[ 1 ] = row( 'blogname', 'Renamed' );
	api.respondWith( async () => ( { ...next, notices: [ { type: 'success', message: 'Settings saved.' } ] } ) );
	const { view, dirty, added, events } = render();
	await flush();
	assert.equal( dirty.at( -1 ), false );

	type( view, 'blogname', 'Renamed' );
	await flush();
	assert.equal( dirty.at( -1 ), true, 'A changed row is an unsaved change.' );

	await submit( view );
	await flush();

	assert.deepEqual( api.calls, [ { method: 'POST', route: 'wp-admin/v1/settings/all', payload: { changed: { blogname: 'Renamed' } } } ] );
	assert.deepEqual( added.map( ( notice ) => [ notice.type, notice.message ] ), [ [ 'success', 'Settings saved.' ] ] );
	assert.equal( dirty.at( -1 ), false );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'Renamed' );
	assert.equal( events.length, 1 );
	assert.deepEqual( events[ 0 ].rows, next.rows );
} );

test( 'a save with no change sends an empty list, as the classic form saves with no change', async () => {
	api.respondWith( async () => ( { ...settingsData(), notices: [ { type: 'success', message: 'Settings saved.' } ] } ) );
	const { view } = render();
	await flush();
	await submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { changed: {} } );
} );

test( 'a textarea posts its line breaks as the classic form does, and the browser\'s line breaks are no change', async () => {
	const rows = [ row( 'crlf_notes', 'a\r\nb' ), row( 'site_notes', 'one\ntwo' ) ];
	api.respondWith( async () => ( { rows, notices: [] } ) );
	const { view, dirty } = render( settingsData( rows ) );
	await flush();

	// The browser shows a textarea's value with LF line breaks.
	type( view, 'crlf_notes', 'a\nb' );
	await flush();
	assert.equal( dirty.at( -1 ), false );

	type( view, 'site_notes', 'one\ntwo\nthree' );
	await submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { changed: { site_notes: 'one\r\ntwo\r\nthree' } } );
} );

test( 'an invalid value is shown beside its row, keeps what was typed, and takes focus', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	const saved = settingsData();
	saved.rows[ 1 ] = row( 'blogname', 'Saved anyway' );
	api.respondWith( async () => {
		throw new ApiError( {
			status: 400,
			code: 'admin_settings_errors',
			message: 'The email address entered did not appear to be a valid email address. Please enter a valid email address.',
			data: {
				status: 400,
				errors: [ { setting: 'admin_email', code: 'invalid_admin_email', message: 'The email address entered did not appear to be a valid email address. Please enter a valid email address.', type: 'error', field: 'admin_email' } ],
				settings: saved,
			},
		} );
	} );
	const focused = [];
	const previous = globalThis.document;
	globalThis.document = { getElementById: ( id ) => ( { focus: () => focused.push( id ) } ) };
	try {
		const { view, added } = render();
		await flush();
		type( view, 'admin_email', 'not-an-email' );
		type( view, 'blogname', 'Saved anyway' );
		await submit( view );
		await flush();

		assert.deepEqual( api.calls[ 0 ].payload, { changed: { admin_email: 'not-an-email', blogname: 'Saved anyway' } } );
		const input = find( view.container, byId( 'admin_email' ) );
		assert.equal( input.props.value, 'not-an-email' );
		assert.equal( input.props[ 'aria-invalid' ], 'true' );
		assert.equal( input.props[ 'aria-describedby' ], 'admin_email-error' );
		assert.equal( textOf( find( view.container, byId( 'admin_email-error' ) ) ), 'The email address entered did not appear to be a valid email address. Please enter a valid email address.' );
		assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'Saved anyway' );
		assert.equal( added.length, 1 );
		assert.deepEqual( focused, [ 'admin_email' ] );
	} finally {
		globalThis.document = previous;
	}
} );

test( 'a refused row is a notice', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 400, code: 'rest_invalid_param', message: 'Invalid parameter(s): cron', data: { status: 400, params: { cron: 'This setting cannot be changed on this screen.' } } } );
	} );
	const { view, added } = render();
	await flush();
	type( view, 'blogname', 'x' );
	await submit( view );
	await flush();
	assert.deepEqual( added.map( ( notice ) => notice.message ), [ 'Invalid parameter(s): cron' ] );
	assert.equal( find( view.container, byId( 'blogname' ) ).props.value, 'x', 'Nothing was saved: the input stays.' );
} );

test( 'WordPress out of reach is a notice', async () => {
	const { ApiError } = await import( '../site/runtime/api.js' );
	api.respondWith( async () => {
		throw new ApiError( { status: 0, code: 'admin_upstream_unreachable', message: 'admin_upstream_unreachable' } );
	} );
	const { view, added } = render();
	await flush();
	await submit( view );
	await flush();
	assert.deepEqual( added.map( ( notice ) => notice.message ), [ 'WordPress cannot be reached right now. Please try again in a moment.' ] );
} );

test( 'saving twice at once sends one request, and the button is busy meanwhile', async () => {
	let resolve;
	api.respondWith( () => new Promise( ( done ) => ( resolve = done ) ) );
	const { view } = render();
	await flush();
	submit( view );
	submit( view );
	await flush();
	assert.equal( api.calls.length, 1 );
	const button = find( view.container, byId( 'Update' ) );
	assert.equal( button.props.disabled, true );
	assert.equal( button.props[ 'aria-busy' ], 'true' );
	resolve( { ...settingsData(), notices: [] } );
	await flush();
	assert.equal( find( view.container, byId( 'Update' ) ).props.disabled, false );
} );

test( 'slots get the values, setValue and the errors; setValue changes only rows that can be changed', async () => {
	let context = null;
	const Probe = defineComponent( {
		props: [ 'values', 'setValue', 'errors' ],
		setup( props ) {
			context = props;
			return () => h( 'p', { id: 'probe' }, 'probe' );
		},
	} );
	globalThis.__modules[ '/m/oa-slot.js' ] = { default: Probe };
	loader.applyImportMap( { 'oa-slot': '/m/oa-slot.js' } );
	contracts.configure( { replacements: {}, slots: { 'core/options-all': { 'after-fields': [ { module: 'oa-slot' } ] } } } );
	api.respondWith( async () => ( { ...settingsData(), notices: [] } ) );

	const { view } = render();
	await flush();
	assert.ok( find( view.container, byId( 'probe' ) ), 'The slot module is rendered.' );
	assert.equal( context.values.blogname, 'My Site' );
	assert.equal( Object.hasOwn( context.values, 'cron' ), false, 'Rows that cannot be changed have no value.' );

	context.setValue( 'blogname', 'From a module' );
	context.setValue( 'cron', 'forged' );
	await submit( view );
	await flush();
	assert.deepEqual( api.calls[ 0 ].payload, { changed: { blogname: 'From a module' } } );
} );

test( 'a replacement of core/settings-field is used for every row', async () => {
	const Row = defineComponent( {
		props: [ 'id', 'label', 'description', 'locked', 'error', 'group', 'icon' ],
		setup: ( props, { slots } ) => () => h( 'tr', { class: 'replaced-row', 'data-field': props.id }, [ h( 'th', props.label ), h( 'td', slots.default?.() ) ] ),
	} );
	globalThis.__modules[ '/m/oa-row.js' ] = { default: Row, implementsContract: { id: 'core/settings-field', version: '1.0.0' } };
	loader.applyImportMap( { 'oa-row': '/m/oa-row.js' } );
	contracts.configure( { replacements: { 'core/settings-field': { module: 'oa-row', implements: '1.0.0' } }, slots: {} } );
	const { view } = render();
	await flush();
	assert.equal( findAll( view.container, byClass( 'replaced-row' ) ).length, 6 );
	assert.ok( find( view.container, byId( 'blogname' ) ), 'The controls are still rendered in it.' );
} );

test( 'a new page entry shows its rows', async () => {
	const data = Vue.ref( settingsData() );
	const view = mount( () => h( Contracted, { id: 'core/options-all', data: data.value, page: { path: 'options.php', title: 'All Settings' } } ), {
		provide: { notices: { add: () => null }, pageState: { setDirty() {}, isDirty: () => false } },
	} );
	await flush();
	data.value = settingsData( [ row( 'only_one', 'x' ) ] );
	await flush();
	assert.deepEqual( findAll( view.container, ( el ) => el.tag === 'tr' && el.props[ 'data-field' ] ).map( ( tr ) => tr.props[ 'data-field' ] ), [ 'only_one' ] );
} );

test( 'state: the changed rows are compared and sent as posted', () => {
	const rows = [ row( 'a', 'x' ), row( 'b', 'l1\nl2' ), row( 'c', 'SERIALIZED DATA', { editable: false, reason: 'serialized' } ) ];
	const saved = state.valuesOf( rows );
	assert.deepEqual( saved, { a: 'x', b: 'l1\nl2' } );
	assert.deepEqual( state.editableNames( rows ), [ 'a', 'b' ] );
	assert.deepEqual( state.changedRows( rows, { ...saved, c: 'forged' }, saved ), {} );
	assert.deepEqual( state.changedRows( rows, { a: 'y', b: 'l1\r\nl2' }, saved ), { a: 'y' } );
	assert.equal( state.postedValue( rows[ 1 ], 'p\nq\r\nr' ), 'p\r\nq\r\nr' );
	assert.equal( state.postedValue( rows[ 0 ], 'p' ), 'p' );
	assert.deepEqual( state.rowsOf( null ), [] );
} );
